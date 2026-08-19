// Package cache holds a value per key against an injected clock, each entry
// expiring on its own terms.
package cache

import (
	"sync"
	"time"
)

// Cache holds a value per key, safe for concurrent use. An expired entry is
// dropped when a lookup finds it, and nothing else evicts: the key space a
// caller admits is the only bound on what a Cache holds.
type Cache[V any] struct {
	now func() time.Time

	mu      sync.Mutex
	entries map[string]entry[V]
}

type entry[V any] struct {
	value     V
	expiresAt time.Time
}

// New returns an empty Cache reading time from now, which must be non-nil.
func New[V any](now func() time.Time) *Cache[V] {
	return &Cache[V]{now: now, entries: make(map[string]entry[V])}
}

// Get returns the value held under key. An entry is expired once the clock
// reaches its expiry instant, so one set with a ttl is no longer served exactly
// ttl later.
func (c *Cache[V]) Get(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	e, held := c.entries[key]
	if !held || !c.now().Before(e.expiresAt) {
		if held {
			delete(c.entries, key)
		}
		var zero V
		return zero, false
	}
	return e.value, true
}

// Set holds value under key for ttl, replacing whatever was held there.
func (c *Cache[V]) Set(key string, value V, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[key] = entry[V]{value: value, expiresAt: c.now().Add(ttl)}
}
