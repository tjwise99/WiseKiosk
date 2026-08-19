package cache

import (
	"strconv"
	"sync"
	"testing"
	"time"
)

// fakeClock is the clock a Cache reads, advanced by a test rather than waited
// on: no test here sleeps for a TTL.
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

// resident is how many entries a Cache is holding, which is the quantity the
// bound is stated over and has no accessor on the type.
func resident[V any](c *Cache[V]) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

func TestAnEntryIsServedUntilItsExpiryAndNotAfter(t *testing.T) {
	const ttl = time.Minute

	clock := newFakeClock()
	c := New[string](clock.now)
	c.Set("key", "value", ttl)

	if held, ok := c.Get("key"); !ok || held != "value" {
		t.Fatalf("Get within the ttl = %q, %t, want %q, true", held, ok, "value")
	}

	clock.advance(ttl)
	if held, ok := c.Get("key"); ok {
		t.Errorf("Get at the expiry instant = %q, true, want it no longer served", held)
	}
}

// TestKeysWrittenOnceDoNotAccumulate drives the shape a wide parameter space
// produces: every write is a distinct key nothing ever looks up again. Without
// the sweep on write, every one of them stays resident for the process's life,
// because the lookup that would drop it never comes.
func TestKeysWrittenOnceDoNotAccumulate(t *testing.T) {
	const (
		ttl    = time.Minute
		writes = 1000
		// bound is what the sweep leaves behind: the entry this write just made,
		// plus the one before it whose expiry the clock has not yet passed.
		bound = 2
	)

	clock := newFakeClock()
	c := New[string](clock.now)

	for n := 0; n < writes; n++ {
		c.Set("station-"+strconv.Itoa(n), "body", ttl)
		clock.advance(ttl)

		if held := resident(c); held > bound {
			t.Fatalf("after %d writes of a fresh key the cache holds %d entries, want at most %d",
				n+1, held, bound)
		}
	}
}

// TestTheSweepSparesTheEntriesStillWithinTheirTTL is the other direction: a
// sweep that dropped everything would pass the bound above while destroying the
// cache.
func TestTheSweepSparesTheEntriesStillWithinTheirTTL(t *testing.T) {
	const ttl = time.Minute

	clock := newFakeClock()
	c := New[string](clock.now)

	c.Set("first", "one", ttl)
	clock.advance(ttl / 2)
	c.Set("second", "two", ttl)

	if held, ok := c.Get("first"); !ok || held != "one" {
		t.Errorf("the first entry = %q, %t after a later write, want %q, true", held, ok, "one")
	}
	if held := resident(c); held != 2 {
		t.Errorf("the cache holds %d entries, want the 2 still inside their ttl", held)
	}
}
