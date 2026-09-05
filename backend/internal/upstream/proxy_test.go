package upstream

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeClock is the clock the Proxy reads, advanced by a test rather than waited
// on: no test here sleeps for a TTL or for a refill.
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

// upstreamFake counts the calls made to every Fetcher it hands out, which is
// how a test tells an answer that reached upstream from one that did not.
type upstreamFake struct {
	mu    sync.Mutex
	calls int
}

func (u *upstreamFake) fetcher(respond func(ctx context.Context) (*Response, error)) Fetcher {
	return func(ctx context.Context) (*Response, error) {
		u.mu.Lock()
		u.calls++
		u.mu.Unlock()
		return respond(ctx)
	}
}

func (u *upstreamFake) count() int {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.calls
}

// serves answers every call with status and body.
func serves(status int, body string) func(context.Context) (*Response, error) {
	return func(context.Context) (*Response, error) {
		return &Response{Status: status, Body: io.NopCloser(strings.NewReader(body))}, nil
	}
}

// fails answers every call with an exchange that never produced a response.
func fails(err error) func(context.Context) (*Response, error) {
	return func(context.Context) (*Response, error) {
		return nil, err
	}
}

// testConfig is the policy these tests run against. The three values carrying a
// package default take it, so a test asserting behaviour at the default moves
// with the default; the burst, the timeout and the size bound are fixtures.
func testConfig() Config {
	return Config{
		SuccessTTL:        DefaultSuccessTTL,
		NegativeTTL:       DefaultNegativeTTL,
		RequestsPerMinute: DefaultRequestsPerMinute,
		Burst:             10,
		Timeout:           5 * time.Second,
		MaxBytes:          1 << 20,
	}
}

// do runs one request from a caller that stays, failing the test where the
// caller's own context ended instead.
func do(t *testing.T, p *Proxy, source, key string, fetch Fetcher) Result {
	t.Helper()
	result, err := p.Do(context.Background(), source, key, fetch)
	if err != nil {
		t.Fatalf("Do(%q, %q) returned error %v, want a result", source, key, err)
	}
	return result
}

// The standing liveness canary: an identical request inside the TTL costs
// nothing upstream, and the first one after it costs exactly one call.
// TST025
func TestCachedResultIsServedWithoutAnUpstreamCallAndRefetchesAfterTheTTL(t *testing.T) {
	clock := newFakeClock()
	fake := &upstreamFake{}
	fetch := fake.fetcher(serves(200, "payload"))
	cfg := testConfig()
	p := New(cfg, clock.now)

	first := do(t, p, "openmeteo", "q", fetch)
	if first.Kind != Success || string(first.Body) != "payload" {
		t.Fatalf("first request: got %v %q, want success \"payload\"", first.Kind, first.Body)
	}
	if fake.count() != 1 {
		t.Fatalf("first request made %d upstream calls, want 1", fake.count())
	}

	clock.advance(cfg.SuccessTTL - time.Nanosecond)
	within := do(t, p, "openmeteo", "q", fetch)
	if within.Kind != Success || string(within.Body) != "payload" {
		t.Errorf("request within the TTL: got %v %q, want success \"payload\"", within.Kind, within.Body)
	}
	if fake.count() != 1 {
		t.Errorf("request within the TTL brought the total to %d upstream calls, want 1", fake.count())
	}

	clock.advance(time.Nanosecond)
	after := do(t, p, "openmeteo", "q", fetch)
	if after.Kind != Success || string(after.Body) != "payload" {
		t.Errorf("request after the TTL: got %v %q, want success \"payload\"", after.Kind, after.Body)
	}
	if fake.count() != 2 {
		t.Errorf("request after the TTL brought the total to %d upstream calls, want 2", fake.count())
	}
}

// A sustained outage costs one upstream call per negative TTL rather than one
// per incoming request.
// TST031
func TestFailureIsServedFromCacheForTheNegativeTTL(t *testing.T) {
	clock := newFakeClock()
	fake := &upstreamFake{}
	fetch := fake.fetcher(fails(errors.New("dial: no route to host")))
	cfg := testConfig()
	p := New(cfg, clock.now)

	first := do(t, p, "openmeteo", "q", fetch)
	if first.Kind != Unreachable {
		t.Fatalf("failed request: got %v, want unreachable", first.Kind)
	}
	if fake.count() != 1 {
		t.Fatalf("failed request made %d upstream calls, want 1", fake.count())
	}

	clock.advance(cfg.NegativeTTL - time.Nanosecond)
	within := do(t, p, "openmeteo", "q", fetch)
	if within.Kind != Unreachable {
		t.Errorf("request within the negative TTL: got %v, want unreachable", within.Kind)
	}
	if fake.count() != 1 {
		t.Errorf("request within the negative TTL brought the total to %d upstream calls, want 1", fake.count())
	}

	clock.advance(time.Nanosecond)
	after := do(t, p, "openmeteo", "q", fetch)
	if after.Kind != Unreachable {
		t.Errorf("request after the negative TTL: got %v, want unreachable", after.Kind)
	}
	if fake.count() != 2 {
		t.Errorf("request after the negative TTL brought the total to %d upstream calls, want 2", fake.count())
	}
}

// A refused status is an outcome of its own, and carries the code a caller
// needs to tell it from a source that could not be reached at all.
func TestNonSuccessStatusIsItsOwnOutcomeAndCarriesTheCode(t *testing.T) {
	clock := newFakeClock()
	fake := &upstreamFake{}
	fetch := fake.fetcher(serves(503, "upstream is down"))
	p := New(testConfig(), clock.now)

	result := do(t, p, "openmeteo", "q", fetch)
	if result.Kind != UpstreamStatus {
		t.Fatalf("non-success response: got %v, want upstream-status", result.Kind)
	}
	if result.Status != 503 {
		t.Errorf("non-success response carried status %d, want 503", result.Status)
	}

	again := do(t, p, "openmeteo", "q", fetch)
	if again.Kind != UpstreamStatus || fake.count() != 1 {
		t.Errorf("repeat request: got %v after %d upstream calls, want upstream-status after 1", again.Kind, fake.count())
	}
}

// Callers that miss together are one upstream call, not one each, and every one
// of them gets that call's answer.
func TestConcurrentIdenticalMissesShareOneUpstreamCall(t *testing.T) {
	clock := newFakeClock()
	fake := &upstreamFake{}
	release := make(chan struct{})
	fetch := fake.fetcher(func(ctx context.Context) (*Response, error) {
		<-release
		return &Response{Status: 200, Body: io.NopCloser(strings.NewReader("payload"))}, nil
	})
	p := New(testConfig(), clock.now)

	// Deliberately more callers than the bucket holds: the one flight spends
	// one token, so no caller here is refused for want of budget.
	const callers = 20
	results := make([]Result, callers)
	errs := make([]error, callers)
	var calling, finished sync.WaitGroup
	calling.Add(callers)
	finished.Add(callers)
	for i := range callers {
		go func() {
			defer finished.Done()
			calling.Done()
			results[i], errs[i] = p.Do(context.Background(), "openmeteo", "q", fetch)
		}()
	}
	calling.Wait()
	close(release)
	finished.Wait()

	if fake.count() != 1 {
		t.Errorf("%d concurrent identical misses made %d upstream calls, want 1", callers, fake.count())
	}
	for i := range callers {
		if errs[i] != nil {
			t.Errorf("caller %d returned error %v, want a result", i, errs[i])
			continue
		}
		if results[i].Kind != Success || string(results[i].Body) != "payload" {
			t.Errorf("caller %d: got %v %q, want success \"payload\"", i, results[i].Kind, results[i].Body)
		}
	}
}

// The bound is per source and is spent only by what reaches upstream.
// TST027
func TestEachSourceHasItsOwnBudget(t *testing.T) {
	clock := newFakeClock()
	fake := &upstreamFake{}
	fetch := fake.fetcher(serves(200, "payload"))
	cfg := testConfig()
	p := New(cfg, clock.now)

	// A distinct key each time, so every one of these reaches upstream.
	for i := range cfg.Burst {
		result := do(t, p, "openmeteo", fmt.Sprintf("q%d", i), fetch)
		if result.Kind != Success {
			t.Fatalf("request %d of the bucket: got %v, want success", i, result.Kind)
		}
	}
	if fake.count() != cfg.Burst {
		t.Fatalf("spending the bucket made %d upstream calls, want %d", fake.count(), cfg.Burst)
	}

	over := do(t, p, "openmeteo", "spent", fetch)
	if over.Kind != RateLimited {
		t.Errorf("request past the bucket: got %v, want rate-limited", over.Kind)
	}
	if fake.count() != cfg.Burst {
		t.Errorf("request past the bucket made an upstream call: %d in total, want %d", fake.count(), cfg.Burst)
	}

	// A cache hit is neither counted against the bucket nor refused by it.
	cached := do(t, p, "openmeteo", "q0", fetch)
	if cached.Kind != Success {
		t.Errorf("cache hit on a spent bucket: got %v, want success", cached.Kind)
	}
	if fake.count() != cfg.Burst {
		t.Errorf("cache hit on a spent bucket made an upstream call: %d in total, want %d", fake.count(), cfg.Burst)
	}

	// Another source's bucket is untouched by the first source's traffic.
	other := do(t, p, "checkwx", "q0", fetch)
	if other.Kind != Success {
		t.Errorf("second source on a spent first bucket: got %v, want success", other.Kind)
	}
	if fake.count() != cfg.Burst+1 {
		t.Errorf("second source brought the total to %d upstream calls, want %d", fake.count(), cfg.Burst+1)
	}

	clock.advance(time.Minute / time.Duration(cfg.RequestsPerMinute))
	refilled := do(t, p, "openmeteo", "refilled", fetch)
	if refilled.Kind != Success {
		t.Errorf("request after one token refilled: got %v, want success", refilled.Kind)
	}
	if fake.count() != cfg.Burst+2 {
		t.Errorf("request after one token refilled brought the total to %d upstream calls, want %d", fake.count(), cfg.Burst+2)
	}
}

// The outbound deadline is a real one, so this test's Timeout is a small
// fixture: the fake clock governs TTL and refill, never a context.
// TST030
func TestHangingFetchEndsAtTheDeadline(t *testing.T) {
	clock := newFakeClock()
	fake := &upstreamFake{}
	fetch := fake.fetcher(func(ctx context.Context) (*Response, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	})
	cfg := testConfig()
	cfg.Timeout = 50 * time.Millisecond
	p := New(cfg, clock.now)

	// Waited on under a bound of its own, generous against a loaded machine but
	// far inside a deadline that is not being applied: an unbounded exchange
	// fails this test rather than wedging the suite until the binary's timeout.
	answered := make(chan Result, 1)
	go func() {
		result, err := p.Do(context.Background(), "openmeteo", "q", fetch)
		if err == nil {
			answered <- result
		}
	}()

	var result Result
	select {
	case result = <-answered:
	case <-time.After(100 * cfg.Timeout):
		t.Fatalf("hanging fetch had not returned after %v, want its %v deadline to end it", 100*cfg.Timeout, cfg.Timeout)
	}

	if result.Kind != Timeout {
		t.Fatalf("hanging fetch: got %v, want timeout", result.Kind)
	}
	if !errors.Is(result.Err, context.DeadlineExceeded) {
		t.Errorf("hanging fetch carried %v, want the deadline", result.Err)
	}

	again := do(t, p, "openmeteo", "q", fetch)
	if again.Kind != Timeout || fake.count() != 1 {
		t.Errorf("repeat request: got %v after %d upstream calls, want timeout after 1", again.Kind, fake.count())
	}
}

// A stalled exchange holds up its own request and nothing else: the healthy
// source is served while the first exchange is still hanging, not after it.
// TST030
func TestOneHangingSourceDoesNotStallAnother(t *testing.T) {
	clock := newFakeClock()
	hanging := &upstreamFake{}
	healthy := &upstreamFake{}
	entered := make(chan struct{})
	release := make(chan struct{})
	hangingFetch := hanging.fetcher(func(ctx context.Context) (*Response, error) {
		close(entered)
		select {
		case <-release:
			return nil, errors.New("released")
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	})
	healthyFetch := healthy.fetcher(serves(200, "payload"))
	cfg := testConfig()
	// Long enough that the hanging exchange is still hanging rather than timing
	// out while the healthy one is served.
	cfg.Timeout = time.Hour
	p := New(cfg, clock.now)

	stalled := make(chan struct{})
	go func() {
		defer close(stalled)
		_, _ = p.Do(context.Background(), "hanging", "q", hangingFetch)
	}()
	<-entered

	result := do(t, p, "healthy", "q", healthyFetch)
	if result.Kind != Success || string(result.Body) != "payload" {
		t.Errorf("healthy source while another hangs: got %v %q, want success \"payload\"", result.Kind, result.Body)
	}

	close(release)
	<-stalled
}

// A body over the bound is a failure rather than a truncation, and a body at
// the bound is not.
// TST030
func TestBodyOverTheSizeBoundFails(t *testing.T) {
	clock := newFakeClock()
	cfg := testConfig()
	cfg.MaxBytes = 16
	p := New(cfg, clock.now)

	atBound := &upstreamFake{}
	within := do(t, p, "atbound", "q", atBound.fetcher(serves(200, strings.Repeat("a", int(cfg.MaxBytes)))))
	if within.Kind != Success || int64(len(within.Body)) != cfg.MaxBytes {
		t.Errorf("body at the bound: got %v of %d bytes, want success of %d", within.Kind, len(within.Body), cfg.MaxBytes)
	}

	over := &upstreamFake{}
	overFetch := over.fetcher(serves(200, strings.Repeat("a", int(cfg.MaxBytes)+1)))
	oversize := do(t, p, "oversize", "q", overFetch)
	if oversize.Kind != Oversize {
		t.Fatalf("body over the bound: got %v, want oversize", oversize.Kind)
	}
	if len(oversize.Body) != 0 {
		t.Errorf("body over the bound was truncated to %d bytes, want none carried", len(oversize.Body))
	}

	again := do(t, p, "oversize", "q", overFetch)
	if again.Kind != Oversize || over.count() != 1 {
		t.Errorf("repeat request: got %v after %d upstream calls, want oversize after 1", again.Kind, over.count())
	}
}
