// Package cache holds a value per key against an injected clock, each entry
// expiring on its own terms.
package cache

import (
	"sync"
	"time"
)

// Cache holds a value per key, safe for concurrent use. An expired entry is
// dropped when a lookup finds it, and every Set first drops every entry whose
// expiry has passed. What a Cache holds is therefore the entries written
// within one ttl of the last write, rather than every key a caller has ever
// admitted.
type Cache[V any] struct {
	now func() time.Time

	mu      sync.Mutex
	entries map[string]entry[V]
}

type entry[V any] struct {
	value     V
	expiresAt time.Time
}

// expired reports whether the entry has reached its expiry instant at now, so
// one set with a ttl is no longer served exactly ttl later. Both the lookup and
// the sweep judge with this, rather than each spelling the comparison.
func (e entry[V]) expired(now time.Time) bool {
	return !now.Before(e.expiresAt)
}

// New returns an empty Cache reading time from now, which must be non-nil.
func New[V any](now func() time.Time) *Cache[V] {
	return &Cache[V]{now: now, entries: make(map[string]entry[V])}
}

// Get returns the value held under key, dropping it where it has expired.
func (c *Cache[V]) Get(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, held := c.entries[key]
	if !held || e.expired(c.now()) {
		if held {
			delete(c.entries, key)
		}
		var zero V
		return zero, false
	}
	return e.value, true
}

// Set holds value under key for ttl, replacing whatever was held there. It
// sweeps the expired entries first, so a key written once and never looked up
// again is freed by the next write rather than held for the process's life.
func (c *Cache[V]) Set(key string, value V, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()
	for swept, e := range c.entries {
		if e.expired(now) {
			delete(c.entries, swept)
		}
	}
	c.entries[key] = entry[V]{value: value, expiresAt: now.Add(ttl)}
}
