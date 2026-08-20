package ratelimit

import (
	"sync"
	"testing"
	"time"
)

// The rate the tests are written against: one token every ten seconds, three in
// the bucket. tokenInterval is what a sub-interval advance is measured against.
const (
	perMinute     = 6
	burst         = 3
	tokenInterval = time.Minute / perMinute
)

// fakeClock is the clock the Limiter reads, advanced by a test rather than
// waited on: no test here sleeps for a refill.
type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func newFakeClock() *fakeClock {
	return &fakeClock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
}

func (c *fakeClock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *fakeClock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

// drain spends source's bucket down to empty, failing the test if the bucket
// did not hold exactly burst tokens.
func drain(t *testing.T, l *Limiter, source string) {
	t.Helper()
	takeExactly(t, l, source, burst)
}

// takeExactly asserts source yields want consecutive grants and is refused on
// the one after, which is what pins a bucket's depth from the outside.
func takeExactly(t *testing.T, l *Limiter, source string, want int) {
	t.Helper()
	for i := range want {
		if !l.Allow(source) {
			t.Fatalf("%s: Allow #%d refused, want %d in a row", source, i+1, want)
		}
	}
	if l.Allow(source) {
		t.Fatalf("%s: Allow #%d granted, want the bucket empty after %d", source, want+1, want)
	}
}

// An idle bucket does not bank the tokens it did not spend: the refill is
// clamped to burst however long the source has been quiet.
func TestAnIdleBucketRefillsNoFurtherThanBurst(t *testing.T) {
	clock := newFakeClock()
	l := New(perMinute, burst, clock.now)

	drain(t, l, "openmeteo")

	// An hour is 360 tokens at this rate, two orders of magnitude past burst.
	clock.advance(time.Hour)

	takeExactly(t, l, "openmeteo", burst)
}

func TestASourceNotSeenBeforeStartsFull(t *testing.T) {
	clock := newFakeClock()
	l := New(perMinute, burst, clock.now)

	takeExactly(t, l, "openmeteo", burst)
}

// A refusal must not deepen the debt: an empty bucket refused many times still
// grants on the first token that refills, not after the refusals are repaid.
func TestARefusedCallTakesNothing(t *testing.T) {
	clock := newFakeClock()
	l := New(perMinute, burst, clock.now)

	drain(t, l, "openmeteo")
	for i := range 5 {
		if l.Allow("openmeteo") {
			t.Fatalf("refusal %d on an empty bucket was granted", i+1)
		}
	}

	clock.advance(tokenInterval)
	takeExactly(t, l, "openmeteo", 1)
}

// Refills accumulate across advances shorter than one token's interval: the
// fraction each one contributes is kept, and the grant lands only once they sum
// past a whole token.
func TestSubIntervalAdvancesAccumulateToOneToken(t *testing.T) {
	clock := newFakeClock()
	l := New(perMinute, burst, clock.now)

	drain(t, l, "openmeteo")

	// Two fifths of a token apiece, so the third advance is the first to cross.
	const step = tokenInterval * 2 / 5
	for i := range 2 {
		clock.advance(step)
		if l.Allow("openmeteo") {
			t.Fatalf("advance %d totals %v, under one token's %v, yet was granted", i+1, step*time.Duration(i+1), tokenInterval)
		}
	}

	clock.advance(step)
	takeExactly(t, l, "openmeteo", 1)
}

func TestOneSourcesTrafficDoesNotSpendAnothers(t *testing.T) {
	clock := newFakeClock()
	l := New(perMinute, burst, clock.now)

	drain(t, l, "openmeteo")
	if l.Allow("openmeteo") {
		t.Fatalf("openmeteo was granted on a spent bucket")
	}

	takeExactly(t, l, "checkwx", burst)
}

// A clock that does not move forward leaves a bucket exactly as it was, neither
// refilling it nor charging it the negative span it has elapsed by. Every
// takeExactly above also spends at one frozen instant, reaching the same branch
// from the empty side.
func TestAClockNotMovingForwardChangesNoBucket(t *testing.T) {
	clock := newFakeClock()
	l := New(perMinute, burst, clock.now)

	// A bucket the limiter has already recorded an instant for, so the step back
	// is measured against that instant rather than against a first sighting.
	if !l.Allow("openmeteo") {
		t.Fatalf("first Allow on a fresh bucket refused")
	}

	// Neither the token spent above returned, nor the remainder taken away.
	clock.advance(-time.Hour)
	takeExactly(t, l, "openmeteo", burst-1)

	// Forward of the instant the bucket was last refilled at, not of the instant
	// the step back left the clock on: one token, no more.
	clock.advance(time.Hour + tokenInterval)
	takeExactly(t, l, "openmeteo", 1)
}

// Concurrent callers on one source share the one bucket rather than each
// reading a stale copy of it: the grants across all of them total burst.
func TestConcurrentCallersShareOneBucket(t *testing.T) {
	clock := newFakeClock()
	l := New(perMinute, burst, clock.now)

	const callers = 200
	var (
		start   sync.WaitGroup
		done    sync.WaitGroup
		mu      sync.Mutex
		grants  int
		release = make(chan struct{})
	)
	start.Add(callers)
	done.Add(callers)
	for range callers {
		go func() {
			defer done.Done()
			start.Done()
			<-release
			if l.Allow("openmeteo") {
				mu.Lock()
				grants++
				mu.Unlock()
			}
		}()
	}

	start.Wait()
	close(release)
	done.Wait()

	if grants != burst {
		t.Errorf("%d concurrent callers took %d tokens, want %d", callers, grants, burst)
	}
}
