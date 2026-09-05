// Package seed exists only on the throwaway seed/codeql-2026-09-05 branch, to prove CodeQL's
// go/path-injection query fires against the production analysis. Never merged.
package seed

import (
	"net/http"
	"os"
)

func handler(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	data, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Write(data)
}
