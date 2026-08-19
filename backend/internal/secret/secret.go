// Package secret confines a secret value to a type that cannot be emitted
// (ADR 0023 rev 1) and resolves one from the file named by <NAME>_FILE
// (ADR 0024 rev 1).
package secret

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"
	"unicode"
)

// redaction is what a Secret renders as through every formatting path.
const redaction = "[REDACTED SECRET]"

// Secret holds a secret value so that formatting or serialising it yields a
// fixed redaction rather than the value. It has no exported field and
// implements neither json.Marshaler nor encoding.TextMarshaler, so
// encoding/json marshals it to {} and the text-encoding path cannot reach the
// value.
type Secret struct {
	value string
}

// newSecret wraps a raw value. It is the only way a Secret acquires a value.
func newSecret(value string) Secret {
	return Secret{value: value}
}

// String satisfies fmt.Stringer with the redaction, covering %s, %v and %q.
func (s Secret) String() string {
	return redaction
}

// GoString satisfies fmt.GoStringer with the redaction, covering %#v.
func (s Secret) GoString() string {
	return redaction
}

// Reveal returns the raw secret value, and is the only method that does. The
// check-secret-unwrap gate counts the references to it in the non-test backend
// tree and fails on anything but one, so a second call site is a red gate
// rather than a review someone has to catch (docs/CI.md).
func (s Secret) Reveal() string {
	return s.value
}

// The four causes an unresolvable secret can have, distinguishable with
// errors.Is on the error Resolve returns.
var (
	// ErrPathUnset reports that <NAME>_FILE is unset or empty.
	ErrPathUnset = errors.New("<NAME>_FILE is unset")
	// ErrFileMissing reports that the file <NAME>_FILE names does not exist.
	ErrFileMissing = errors.New("secret file does not exist")
	// ErrFileUnreadable reports that the file exists but could not be read.
	ErrFileUnreadable = errors.New("secret file is unreadable")
	// ErrValueEmpty reports that the file is empty after trailing-whitespace
	// stripping.
	ErrValueEmpty = errors.New("secret file is empty")
)

// UnresolvableError identifies an unresolvable secret by name, and by the path
// that was tried where there was one. It never carries file contents.
type UnresolvableError struct {
	// Name is the logical secret name, as passed to Resolve.
	Name string
	// Path is the value of <NAME>_FILE, empty when that variable was unset.
	Path string
	// Cause is one of ErrPathUnset, ErrFileMissing, ErrFileUnreadable or
	// ErrValueEmpty.
	Cause error
}

func (e *UnresolvableError) Error() string {
	if e.Path == "" {
		return fmt.Sprintf("secret %s is unresolvable: %v", e.Name, e.Cause)
	}
	return fmt.Sprintf("secret %s is unresolvable: %v (path %s)", e.Name, e.Cause, e.Path)
}

// Unwrap exposes the cause to errors.Is.
func (e *UnresolvableError) Unwrap() error {
	return e.Cause
}

// Resolve reads the secret named by name from the file whose path is the value
// of the <NAME>_FILE environment variable, returning the file's contents with
// trailing whitespace stripped. A bare <NAME> environment variable is never
// consulted. Resolution reads the file on every call and caches nothing, so a
// rotated file takes effect on the next call. The error on failure is an
// *UnresolvableError.
func Resolve(name string) (Secret, error) {
	path := os.Getenv(name + "_FILE")
	if path == "" {
		return Secret{}, &UnresolvableError{Name: name, Cause: ErrPathUnset}
	}

	contents, err := os.ReadFile(path)
	if err != nil {
		cause := ErrFileUnreadable
		if errors.Is(err, fs.ErrNotExist) {
			cause = ErrFileMissing
		}
		return Secret{}, &UnresolvableError{Name: name, Path: path, Cause: cause}
	}

	value := strings.TrimRightFunc(string(contents), unicode.IsSpace)
	if value == "" {
		return Secret{}, &UnresolvableError{Name: name, Path: path, Cause: ErrValueEmpty}
	}

	return newSecret(value), nil
}
