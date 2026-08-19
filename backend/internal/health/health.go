// Package health answers process liveness over HTTP, and asks the same of a
// running instance from inside the image (ADR 0020 rev 1).
package health

import (
	"fmt"
	"io"
	"net/http"
	"time"
)

// body is what a serving process answers with.
const body = "ok"

// checkTimeout bounds one probe end to end. The probe is a loopback request to
// a handler that consults nothing, so it answers in microseconds or not at all.
const checkTimeout = 2 * time.Second

// checker is the client Check probes with, bounded where http.DefaultClient is
// not.
var checker = &http.Client{Timeout: checkTimeout}

// Handler reports that the process is serving and nothing else: it reads no
// configuration and consults no dependency (ADR 0007 rev 2).
func Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, body)
	})
}

// Check asks the instance at url whether it is serving, returning nil for a
// 200 and an error for anything else — no response, a response carrying another
// status, or no answer within checkTimeout. The last is a process alive but
// wedged, which Check reports itself rather than leaving to a deployment
// artifact to bound.
func Check(url string) error {
	response, err := checker.Get(url)
	if err != nil {
		return fmt.Errorf("health check %s: %w", url, err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("health check %s: answered %s", url, response.Status)
	}
	return nil
}
