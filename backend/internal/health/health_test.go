package health

import (
	"net/http"
	"net/http/httptest"
	"testing"
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

func TestCheckRefusesAnUnreachableInstance(t *testing.T) {
	server := httptest.NewServer(Handler())
	url := server.URL + "/healthz"
	server.Close()

	if err := Check(url); err == nil {
		t.Error("Check: no error against a closed listener")
	}
}
