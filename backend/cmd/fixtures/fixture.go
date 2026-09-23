package main

import (
	_ "embed"
	"encoding/json"
	"strings"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
)

//go:embed full_open_demo.json
var fixtureJSON []byte

// fixtureParks is the parsed fixture in file order; fixtureByKey indexes it by
// fixtureKey of each park's name.
var fixtureParks, fixtureByKey = func() ([]boundary.ParkWaitTimesPark, map[string]boundary.ParkWaitTimesPark) {
	var payload boundary.ParkWaitTimesPayload
	if err := json.Unmarshal(fixtureJSON, &payload); err != nil {
		panic("fixtures: full_open_demo.json is not a ParkWaitTimesPayload: " + err.Error())
	}
	if len(payload.Parks) == 0 {
		panic("fixtures: full_open_demo.json names no park")
	}
	byKey := make(map[string]boundary.ParkWaitTimesPark, len(payload.Parks))
	for _, park := range payload.Parks {
		byKey[fixtureKey(park.Name)] = park
	}
	return payload.Parks, byKey
}()

// fixtureKey folds a requested park string to its lookup key: lowercase letters
// and digits only, so a slug (`magic-kingdom`) and a pretty name
// (`Magic Kingdom`) reach the same entry.
func fixtureKey(name string) string {
	var key strings.Builder
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			key.WriteRune(r)
		}
	}
	return key.String()
}

// fixturePayload answers from the fixture: one entry per park named, in the
// order named. A park the fixture does not carry takes the first entry's roster
// under the name the request used, so no park named reads closed. The entry is
// copied before its name is written, leaving the fixture itself unchanged.
func fixturePayload(requestedParks []string) boundary.ParkWaitTimesPayload {
	payload := boundary.ParkWaitTimesPayload{Parks: make([]boundary.ParkWaitTimesPark, 0, len(requestedParks))}
	for _, requested := range requestedParks {
		park, found := fixtureByKey[fixtureKey(requested)]
		if !found {
			park = fixtureParks[0]
			park.Name = strings.TrimSpace(requested)
		}
		payload.Parks = append(payload.Parks, park)
	}
	return payload
}
