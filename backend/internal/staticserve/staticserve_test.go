package staticserve

import (
	"errors"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const indexBody = "<!doctype html><div id=\"app\"></div>"

// treeFile writes contents to name under dir, creating the directories name
// needs.
func treeFile(t *testing.T, dir, name, contents string) {
	t.Helper()
	full := filepath.Join(dir, filepath.FromSlash(name))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatalf("creating %s: %v", filepath.Dir(full), err)
	}
	if err := os.WriteFile(full, []byte(contents), 0o644); err != nil {
		t.Fatalf("writing %s: %v", full, err)
	}
}

// serve runs one GET against a Handler rooted at dir.
func serve(t *testing.T, dir, target string) *http.Response {
	t.Helper()
	recorder := httptest.NewRecorder()
	New(http.Dir(dir)).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, target, nil))
	return recorder.Result()
}

func TestServesAnAssetsExactBytes(t *testing.T) {
	dir := t.TempDir()
	const want = "\x00\x01binary\xffbytes\n"
	treeFile(t, dir, "assets/app.js", want)

	response := serve(t, dir, "/assets/app.js")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if got := bodyOf(t, response); got != want {
		t.Errorf("body = %q, want %q", got, want)
	}
}

func TestRootServesIndex(t *testing.T) {
	dir := t.TempDir()
	treeFile(t, dir, "index.html", indexBody)

	response := serve(t, dir, "/")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if got := bodyOf(t, response); got != indexBody {
		t.Errorf("body = %q, want the index %q", got, indexBody)
	}
}

func TestUnknownPathIsNotFoundRatherThanTheIndex(t *testing.T) {
	dir := t.TempDir()
	treeFile(t, dir, "index.html", indexBody)

	response := serve(t, dir, "/no/such/path")
	if response.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusNotFound)
	}
	if got := bodyOf(t, response); strings.Contains(got, indexBody) {
		t.Errorf("body = %q, want no fallback to the index", got)
	}
}

func TestConfigFileIsServedByteForByte(t *testing.T) {
	dir := t.TempDir()
	// Bytes that no configuration schema accepts.
	const want = "{\n  \"regions\": [], \"trailing\": \"\\u00e9\"  }\n\n"
	treeFile(t, dir, "config.json", want)

	response := serve(t, dir, "/config.json")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if got := bodyOf(t, response); got != want {
		t.Errorf("body = %q, want %q", got, want)
	}
}

func TestDirectoryWithoutIndexIsNotFoundAndNotListed(t *testing.T) {
	dir := t.TempDir()
	treeFile(t, dir, "assets/app.js", "console.log(1)")

	for _, target := range []string{"/assets", "/assets/"} {
		response := serve(t, dir, target)
		if response.StatusCode != http.StatusNotFound {
			t.Errorf("GET %s: status = %d, want %d", target, response.StatusCode, http.StatusNotFound)
		}
		if got := bodyOf(t, response); strings.Contains(got, "app.js") {
			t.Errorf("GET %s: body = %q, want no listing", target, got)
		}
	}
}

func TestMissingIndexAtRootIsNotFound(t *testing.T) {
	response := serve(t, t.TempDir(), "/")
	if response.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want %d", response.StatusCode, http.StatusNotFound)
	}
}

// TestIndexThatIsItselfADirectoryIsNotFound covers a directory whose index.html
// is not a file but another directory — neither the directory nor its
// impostor index is served.
func TestIndexThatIsItselfADirectoryIsNotFound(t *testing.T) {
	dir := t.TempDir()
	treeFile(t, dir, "sub/index.html/nested.txt", "unreachable")

	response := serve(t, dir, "/sub/")
	if response.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want %d", response.StatusCode, http.StatusNotFound)
	}
}

// statFailingFile wraps an http.File whose Stat always fails, the shape open
// cannot reach through http.Dir (a real filesystem entry that opens but
// cannot be stat'd is not producible with treeFile).
type statFailingFile struct {
	http.File
}

func (statFailingFile) Stat() (fs.FileInfo, error) {
	return nil, errors.New("stat failing file: synthetic failure")
}

// statFailingFS is an http.FileSystem whose every Open succeeds but whose
// returned File's Stat always fails.
type statFailingFS struct {
	http.FileSystem
}

func (fsys statFailingFS) Open(name string) (http.File, error) {
	file, err := fsys.FileSystem.Open(name)
	if err != nil {
		return nil, err
	}
	return statFailingFile{file}, nil
}

func TestAFileThatCannotBeStattedIsNotFound(t *testing.T) {
	dir := t.TempDir()
	treeFile(t, dir, "assets/app.js", "console.log(1)")

	recorder := httptest.NewRecorder()
	New(statFailingFS{http.Dir(dir)}).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/assets/app.js", nil))

	if recorder.Result().StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want %d", recorder.Result().StatusCode, http.StatusNotFound)
	}
}

// bodyOf reads a recorded response body.
func bodyOf(t *testing.T, response *http.Response) string {
	t.Helper()
	defer func() { _ = response.Body.Close() }()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("reading body: %v", err)
	}
	return string(body)
}
