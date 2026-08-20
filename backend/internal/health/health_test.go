package health

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHandlerReportsServing(t *testing.T) {
	recorder := httptest.NewRecorder()
	Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if recorder.Body.Len() == 0 {
		t.Error("body is empty, want a liveness answer")
	}
}

func TestCheckAcceptsA200(t *testing.T) {
	server := httptest.NewServer(Handler())
	defer server.Close()

	if err := Check(server.URL + "/healthz"); err != nil {
		t.Errorf("Check: unexpected error: %v", err)
	}
}

func TestCheckRefusesAnotherStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	if err := Check(server.URL + "/healthz"); err == nil {
		t.Error("Check: no error for a 503")
	}
}

// TestCheckRefusesAWedgedInstance is the case a connection-refused test cannot
// reach: the listener accepts and the handler never answers, which is a process
// alive but wedged.
func TestCheckRefusesAWedgedInstance(t *testing.T) {
	wedged := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-wedged
	}))
	t.Cleanup(func() {
		close(wedged)
		server.Close()
	})

	// Off the test's own goroutine, so a Check with no bound fails here rather
	// than hanging until the whole package times out. The wait is twice the
	// bound, which asserts Check has one at all rather than measuring a loaded
	// machine's scheduling.
	returned := make(chan error, 1)
	go func() { returned <- Check(server.URL + "/healthz") }()

	select {
	case err := <-returned:
		if err == nil {
			t.Error("Check: no error against a server that never answers")
		}
	case <-time.After(2 * checkTimeout):
		t.Errorf("Check did not return within %s, want it bounded by the %s timeout", 2*checkTimeout, checkTimeout)
	}
}

func TestCheckRefusesAnUnreachableInstance(t *testing.T) {
	server := httptest.NewServer(Handler())
	url := server.URL + "/healthz"
	server.Close()

	if err := Check(url); err == nil {
		t.Error("Check: no error against a closed listener")
	}
}
