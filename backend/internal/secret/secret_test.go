package secret

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const testName = "CHECKWX_API_KEY"

// writeSecretFile writes contents to a file in t.TempDir and points
// <testName>_FILE at it, returning the path.
func writeSecretFile(t *testing.T, contents string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "api-key")
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatalf("writing secret file: %v", err)
	}
	t.Setenv(testName+"_FILE", path)
	return path
}

// TST014
func TestResolveStripsTrailingWhitespaceOnly(t *testing.T) {
	const want = "  leading-space-kept\tand-inner"
	writeSecretFile(t, want+" \t\r\n\n")

	got, err := Resolve(testName)
	if err != nil {
		t.Fatalf("Resolve: unexpected error: %v", err)
	}
	if got.Reveal() != want {
		t.Errorf("Reveal() = %q, want %q", got.Reveal(), want)
	}
}

// TST014
func TestResolveIgnoresBareEnvironmentVariable(t *testing.T) {
	const value = "value-from-bare-env-var"
	t.Setenv(testName, value)

	got, err := Resolve(testName)
	if err == nil {
		t.Fatalf("Resolve: expected an error, got secret %v", got)
	}
	if !errors.Is(err, ErrPathUnset) {
		t.Errorf("Resolve: error = %v, want cause ErrPathUnset", err)
	}
	if strings.Contains(err.Error(), value) {
		t.Errorf("error message leaks the bare environment variable's value: %q", err.Error())
	}
}

// TST028
func TestResolveRotationIsNotCached(t *testing.T) {
	const first, second = "first-value", "second-value"
	path := writeSecretFile(t, first+"\n")

	before, err := Resolve(testName)
	if err != nil {
		t.Fatalf("first Resolve: unexpected error: %v", err)
	}
	if before.Reveal() != first {
		t.Fatalf("first Reveal() = %q, want %q", before.Reveal(), first)
	}

	if err := os.WriteFile(path, []byte(second+"\n"), 0o600); err != nil {
		t.Fatalf("rewriting secret file: %v", err)
	}

	after, err := Resolve(testName)
	if err != nil {
		t.Fatalf("second Resolve: unexpected error: %v", err)
	}
	if after.Reveal() != second {
		t.Errorf("second Reveal() = %q, want %q — the value was cached", after.Reveal(), second)
	}
}

// TST014
func TestResolveUnresolvableCauses(t *testing.T) {
	const unreadableContents = "unresolvable-case-file-contents"

	// setUp returns the raw bytes the case left on disk, which the error
	// message must not carry. It is empty where the case writes no file.
	cases := []struct {
		name  string
		setUp func(t *testing.T) string
		cause error
	}{
		{
			name:  "path unset",
			setUp: func(t *testing.T) string { return "" },
			cause: ErrPathUnset,
		},
		{
			name: "file missing",
			setUp: func(t *testing.T) string {
				t.Setenv(testName+"_FILE", filepath.Join(t.TempDir(), "absent"))
				return ""
			},
			cause: ErrFileMissing,
		},
		{
			name: "file unreadable",
			setUp: func(t *testing.T) string {
				if os.Geteuid() == 0 {
					t.Skip("running as root: mode bits do not deny a read")
				}
				path := writeSecretFile(t, unreadableContents)
				if err := os.Chmod(path, 0o000); err != nil {
					t.Fatalf("chmod: %v", err)
				}
				return unreadableContents
			},
			cause: ErrFileUnreadable,
		},
		{
			name: "empty after trailing-whitespace stripping",
			setUp: func(t *testing.T) string {
				const raw = " \t\r\n\n"
				writeSecretFile(t, raw)
				return raw
			},
			cause: ErrValueEmpty,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			raw := tc.setUp(t)

			got, err := Resolve(testName)
			if err == nil {
				t.Fatalf("Resolve: expected an error, got secret %v", got)
			}
			if !errors.Is(err, tc.cause) {
				t.Errorf("Resolve: error = %v, want cause %v", err, tc.cause)
			}

			var unresolvable *UnresolvableError
			if !errors.As(err, &unresolvable) {
				t.Fatalf("Resolve: error %v is not an *UnresolvableError", err)
			}
			if unresolvable.Name != testName {
				t.Errorf("UnresolvableError.Name = %q, want %q", unresolvable.Name, testName)
			}

			message := err.Error()
			if !strings.Contains(message, testName) {
				t.Errorf("error message %q does not name the secret %q", message, testName)
			}
			if raw != "" && strings.Contains(message, raw) {
				t.Errorf("error message %q carries the file contents %q", message, raw)
			}
		})
	}
}

func TestSecretDoesNotLeakThroughFormatting(t *testing.T) {
	const value = "value-that-must-not-appear"
	s := newSecret(value)

	formatted := fmt.Sprintf("%s/%v/%#v/%q", s, s, s, s)
	if strings.Contains(formatted, value) {
		t.Errorf("formatting leaked the value: %q", formatted)
	}

	rendered := map[string]string{
		"%s":     s.String(),
		"%v":     fmt.Sprintf("%v", s),
		"%#v":    fmt.Sprintf("%#v", s),
		"%q":     fmt.Sprintf("%q", s),
		"Sprint": fmt.Sprint(s),
	}
	for verb, got := range rendered {
		if !strings.Contains(got, redaction) {
			t.Errorf("%s of a Secret = %q, want it to contain %q", verb, got, redaction)
		}
		if strings.Contains(got, value) {
			t.Errorf("%s of a Secret leaked the value: %q", verb, got)
		}
	}
}

func TestSecretDoesNotLeakThroughJSON(t *testing.T) {
	const value = "value-that-must-not-appear"
	s := newSecret(value)

	encoded, err := json.Marshal(s) //nolint:staticcheck // SA9005: the no-op is what this test asserts
	if err != nil {
		t.Fatalf("json.Marshal: unexpected error: %v", err)
	}
	if strings.Contains(string(encoded), value) {
		t.Errorf("json.Marshal(Secret) = %s, which carries the value", encoded)
	}

	encoded, err = json.Marshal(struct{ Key Secret }{Key: s})
	if err != nil {
		t.Fatalf("json.Marshal of an embedding struct: unexpected error: %v", err)
	}
	if strings.Contains(string(encoded), value) {
		t.Errorf("json.Marshal(struct{Key Secret}) = %s, which carries the value", encoded)
	}
}

func TestRevealReturnsTheValue(t *testing.T) {
	const value = "the-exact-value"
	if got := newSecret(value).Reveal(); got != value {
		t.Errorf("Reveal() = %q, want %q", got, value)
	}
}
