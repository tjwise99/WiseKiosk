package main

import "testing"

// TestFixtureKeyFoldsASlugAndAPrettyNameTogether reads the fold the lookup
// rests on: the two spellings a configuration may carry reach one entry.
func TestFixtureKeyFoldsASlugAndAPrettyNameTogether(t *testing.T) {
	for _, spelling := range []string{"Magic Kingdom", "magic-kingdom", "  MAGIC_KINGDOM  ", "Magic Kingdom!"} {
		if got := fixtureKey(spelling); got != "magickingdom" {
			t.Errorf("fixtureKey(%q) = %q, want %q", spelling, got, "magickingdom")
		}
	}
}

func TestFixtureKeyKeepsDigits(t *testing.T) {
	if got := fixtureKey("Park 9"); got != "park9" {
		t.Errorf("fixtureKey(%q) = %q, want %q", "Park 9", got, "park9")
	}
}

// TestFixtureCarriesEveryParkItIndexes reads that the parsed fixture and its
// index agree, which the panic in the loader only half guarantees.
func TestFixtureCarriesEveryParkItIndexes(t *testing.T) {
	if len(fixtureParks) == 0 {
		t.Fatal("the fixture names no park")
	}
	if len(fixtureByKey) != len(fixtureParks) {
		t.Errorf("index = %d entries, fixture = %d parks", len(fixtureByKey), len(fixtureParks))
	}
	for _, park := range fixtureParks {
		if _, found := fixtureByKey[fixtureKey(park.Name)]; !found {
			t.Errorf("park %q is not reachable by its own key", park.Name)
		}
		if !park.Available {
			t.Errorf("park %q reads unavailable; the fixture exists so nothing reads closed", park.Name)
		}
	}
}

func TestFixturePayloadAnswersNoParkForAnEmptyRequest(t *testing.T) {
	payload := fixturePayload(nil)

	if len(payload.Parks) != 0 {
		t.Errorf("parks = %d, want 0", len(payload.Parks))
	}
	if payload.Parks == nil {
		t.Error("parks is nil, want an empty slice so the payload encodes as [] rather than null")
	}
}

// TestFixturePayloadDoesNotMutateTheFixture pins the substitution branch's one
// hazard: it writes a name onto a copy, and a second request must not see it.
func TestFixturePayloadDoesNotMutateTheFixture(t *testing.T) {
	original := fixtureParks[0].Name

	fixturePayload([]string{"A Park No Fixture Carries"})

	if fixtureParks[0].Name != original {
		t.Errorf("the fixture's first park is now named %q, want %q — substitution wrote through to the fixture",
			fixtureParks[0].Name, original)
	}
}
