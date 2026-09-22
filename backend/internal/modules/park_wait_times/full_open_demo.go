package park_wait_times

// TEMPORARY — owner-requested demonstration mode. The route answers from
// full_open_demo.json instead of the source, so every configured park reads
// open with a full roster.
//
// ONE-STEP REVERT: set fullOpenDemo to false and rebuild. The route then takes
// the upstream path again and this file is inert; deleting full_open_demo.go
// and full_open_demo.json with it removes the mode entirely.

import (
	_ "embed"
	"encoding/json"
	"strings"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
)

// fullOpenDemo is the switch. True: PostApiParkWaitTimes serves the demo
// payload and makes no upstream request.
const fullOpenDemo = true

//go:embed full_open_demo.json
var fullOpenDemoJSON []byte

// fullOpenDemoFixture is the parsed fixture in file order; fullOpenDemoByKey
// indexes it by demoKey of each park's name.
var fullOpenDemoFixture, fullOpenDemoByKey = func() ([]boundary.ParkWaitTimesPark, map[string]boundary.ParkWaitTimesPark) {
	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(fullOpenDemoJSON, &payload); err != nil {
		panic("park_wait_times: full_open_demo.json is not a ParkWaitTimesPayload: " + err.Error())
	}
	if len(payload.Parks) == 0 {
		panic("park_wait_times: full_open_demo.json names no park")
	}
	byKey := make(map[string]boundary.ParkWaitTimesPark, len(payload.Parks))
	for _, park := range payload.Parks {
		byKey[demoKey(park.Name)] = park
	}
	return payload.Parks, byKey
}()

// demoKey folds a configured park string to its lookup key: lowercase letters
// and digits only, so a slug (`magic-kingdom`) and a pretty name
// (`Magic Kingdom`) reach the same fixture entry.
func demoKey(name string) string {
	var key strings.Builder
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			key.WriteRune(r)
		}
	}
	return key.String()
}

// fullOpenDemoPayload answers the request from the fixture: one entry per park
// named, in the order named. A park the fixture does not carry still reads
// open — under the name the request used, over the first fixture park's
// roster — because the mode's whole point is that nothing reads closed.
func fullOpenDemoPayload(configuredParks []string) boundary.ParkWaitTimesPayload {
	payload := boundary.ParkWaitTimesPayload{Parks: make([]boundary.ParkWaitTimesPark, 0, len(configuredParks))}
	for _, configured := range configuredParks {
		park, found := fullOpenDemoByKey[demoKey(configured)]
		if !found {
			park = fullOpenDemoFixture[0]
			park.Name = strings.TrimSpace(configured)
		}
		payload.Parks = append(payload.Parks, park)
	}
	return payload
}
