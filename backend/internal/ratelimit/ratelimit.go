// Package ratelimit bounds how often a named source may proceed, against an
// injected clock.
package ratelimit

import (
	"sync"
	"time"
)

// Limiter holds one token bucket per source name, safe for concurrent use. The
// buckets are independent: one source's traffic never consumes another's
// budget.
type Limiter struct {
	perMinute float64
	burst     float64
	now       func() time.Time

	mu      sync.Mutex
	buckets map[string]*bucket
}

type bucket struct {
	tokens float64
	last   time.Time
}

// New returns a Limiter whose every bucket starts full at burst tokens and
// refills continuously at requestsPerMinute tokens a minute. Both must be
// positive, and now must be non-nil.
func New(requestsPerMinute, burst int, now func() time.Time) *Limiter {
	return &Limiter{
		perMinute: float64(requestsPerMinute),
		burst:     float64(burst),
		now:       now,
		buckets:   make(map[string]*bucket),
	}
}

// Allow takes one token from source's bucket, reporting whether there was one
// to take. A refused call takes nothing.
func (l *Limiter) Allow(source string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	b, held := l.buckets[source]
	switch {
	case !held:
		b = &bucket{tokens: l.burst, last: now}
		l.buckets[source] = b
	case now.After(b.last):
		b.tokens = min(l.burst, b.tokens+now.Sub(b.last).Minutes()*l.perMinute)
		b.last = now
	}

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}
