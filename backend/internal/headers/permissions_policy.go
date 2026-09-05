package headers

import (
	"slices"
	"strings"
)

// universe is every directive name Chromium's Permissions-Policy parser
// recognises: the "permissions_policy_name" field of each entry in
// https://github.com/chromium/chromium/blob/64f5988c49eb66b6a2a5037dd5d15ff4a757608e/services/network/public/cpp/permissions_policy/permissions_policy_features.json5,
// in that file's own order. Snapshotted 2026-09-05; a Chromium release adding
// or removing a directive is a resync of this slice.
var universe = []string{
	"accelerometer",
	"all-screens-capture",
	"ambient-light-sensor",
	"aria-notify",
	"autofill",
	"autoplay",
	"bluetooth",
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
	"controlled-frame",
	"cross-origin-isolated",
	"deferred-fetch",
	"deferred-fetch-minimal",
	"device-attributes",
	"digital-credentials-create",
	"digital-credentials-get",
	"direct-sockets",
	"display-capture",
	"encrypted-media",
	"execution-while-out-of-viewport",
	"execution-while-not-rendered",
	"focus-without-user-activation",
	"fullscreen",
	"frobulate",
	"gamepad",
	"geolocation",
	"gyroscope",
	"haptics",
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
	"manual-text",
	"media-playback-while-not-visible",
	"microphone",
	"midi",
	"direct-sockets-multicast",
	"on-device-speech-recognition",
	"otp-credentials",
	"payment",
	"picture-in-picture",
	"private-state-token-issuance",
	"publickey-credentials-create",
	"publickey-credentials-get",
	"rewriter",
	"screen-wake-lock",
	"serial",
	"shared-storage",
	"shared-storage-select-url",
	"smart-card",
	"speaker-selection",
	"storage-access",
	"sub-apps",
	"summarizer",
	"sync-xhr",
	"translator",
	"private-state-token-redemption",
	"usb",
	"usb-unrestricted",
	"unload",
	"vertical-scroll",
	"web-app-installation",
	"tools",
	"webnn",
	"web-printing",
	"web-share",
	"xr-spatial-tracking",
	"window-management",
	"writer",
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
