// Package staticserve answers a request with the bytes of the file its path
// names under one filesystem root. It holds no name it treats specially beyond
// a directory's index, so the configuration file in the tree takes the same
// path through it as any asset (ADR 0007 rev 2, ADR 0019 rev 7).
package staticserve

import (
	"io/fs"
	"net/http"
	"path"
)

// indexName is the file a directory is served through, and the only mapping
// this package makes from a request path to a different name.
const indexName = "index.html"

// Handler serves one filesystem root. Files are opened on each request rather
// than embedded, so a file mounted into the tree after start is served like
// any other and a tree missing one serves what is present.
type Handler struct {
	root http.FileSystem
}

// New returns a Handler serving root.
func New(root http.FileSystem) *Handler {
	return &Handler{root: root}
}

// ServeHTTP serves the file the request path names, or a directory's index,
// and 404 for everything else: no fallback to the index for an unknown path,
// no directory listing, no redirect (ADR 0018 rev 1).
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := path.Clean("/" + r.URL.Path)

	file, info, found := h.open(name)
	if found && info.IsDir() {
		_ = file.Close()
		file, info, found = h.open(path.Join(name, indexName))
		if found && info.IsDir() {
			_ = file.Close()
			found = false
		}
	}
	if !found {
		http.NotFound(w, r)
		return
	}
	defer func() { _ = file.Close() }()

	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

// open opens name under the root, reporting whether it resolved to something
// that could also be described.
func (h *Handler) open(name string) (http.File, fs.FileInfo, bool) {
	file, err := h.root.Open(name)
	if err != nil {
		return nil, nil, false
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, nil, false
	}
	return file, info, true
}
