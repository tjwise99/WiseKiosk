package headers

import (
	"slices"
	"strings"
)

// universe is the Permissions-Policy directive names Chromium 153.0.8010.12
// (the "Chrome for Testing" build Playwright 1.63.0 drives — chromium/chromium
// tag 153.0.8010.12, commit 971a7443b0c9b0a9b2860529b33331b76077ec62) both
// declares in
// https://github.com/chromium/chromium/blob/971a7443b0c9b0a9b2860529b33331b76077ec62/services/network/public/cpp/permissions_policy/permissions_policy_features.json5
// and actually parses under a stock launch. That file also declares directive
// names gated behind an origin trial or an unshipped runtime flag, which this
// browser logs as "Unrecognized feature" or "Origin trial controlled feature
// not enabled" — headers_test.go and the render tier's policy project
// (frontend/playwright.policy.config.ts) both fail on either, which is how the
// excluded names were found; a name is added back only once that check passes
// clean with it present. Snapshotted 2026-09-18; a Chromium bump is a resync
// of this slice against the render tier's own bundled browser.
var universe = []string{
	"accelerometer",
	"aria-notify",
	"autoplay",
	"browsing-topics",
	"interest-cohort",
	"camera",
	"captured-surface-control",
	"ch-dpr",
	"ch-device-memory",
	"ch-downlink",
	"ch-ect",
	"ch-prefers-color-scheme",
	"ch-prefers-reduced-motion",
	"ch-prefers-reduced-transparency",
	"ch-rtt",
	"ch-save-data",
	"ch-ua",
	"ch-ua-arch",
	"ch-ua-bitness",
	"ch-ua-form-factors",
	"ch-ua-high-entropy-values",
	"ch-ua-platform",
	"ch-ua-model",
	"ch-ua-mobile",
	"ch-ua-full-version",
	"ch-ua-full-version-list",
	"ch-ua-platform-version",
	"ch-ua-wow64",
	"ch-viewport-height",
	"ch-viewport-width",
	"ch-width",
	"clipboard-read",
	"clipboard-write",
	"compute-pressure",
	"cross-origin-isolated",
	"deferred-fetch",
	"deferred-fetch-minimal",
	"digital-credentials-get",
	"display-capture",
	"encrypted-media",
	"fullscreen",
	"gamepad",
	"geolocation",
	"gyroscope",
	"hid",
	"identity-credentials-get",
	"idle-detection",
	"keyboard-map",
	"language-detector",
	"language-model",
	"local-fonts",
	"local-network",
	"local-network-access",
	"loopback-network",
	"magnetometer",
	"microphone",
	"midi",
	"on-device-speech-recognition",
	"otp-credentials",
	"payment",
	"picture-in-picture",
	"private-state-token-issuance",
	"publickey-credentials-create",
	"publickey-credentials-get",
	"screen-wake-lock",
	"serial",
	"storage-access",
	"summarizer",
	"sync-xhr",
	"translator",
	"private-state-token-redemption",
	"usb",
	"unload",
	"xr-spatial-tracking",
	"window-management",
}

// allowlist is the subset of universe this page is granted, empty until a
// module needs one (SRS027<!-- The display page holds no device capability it does not use -->).
var allowlist = []string{}

// generatePermissionsPolicy renders one directive per feature in universe,
// sorted, granting every feature named in allowlist to the page's own origin
// and denying every other feature outright.
func generatePermissionsPolicy(universe, allowlist []string) string {
	granted := make(map[string]bool, len(allowlist))
	for _, feature := range allowlist {
		granted[feature] = true
	}

	sorted := slices.Clone(universe)
	slices.Sort(sorted)

	directives := make([]string, len(sorted))
	for i, feature := range sorted {
		if granted[feature] {
			directives[i] = feature + "=(self)"
		} else {
			directives[i] = feature + "=()"
		}
	}
	return strings.Join(directives, ", ")
}
