// Package park_wait_times is the park-wait-times module's shaping library: the
// policy its route runs under, the constraint the parks a request names must
// satisfy, the upstream requests it builds and the boundary values it reads
// each answer into. Every function here is pure — no I/O, no clock read of its
// own, no secret — so the whole of it is exercisable against a captured
// response (the module contract, part 4).
package park_wait_times

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
	"github.com/tjwise99/WiseKiosk/backend/internal/upstream"
)

// Source names this module's cache namespace and its rate bucket. It is the
// same word the boundary schema's path ends in.
const Source = "park_wait_times"

// Config is the policy this route runs under, carried here so the
// registration entry assembles it from the module rather than restating it.
//
// SuccessTTL and NegativeTTL are both read from the same figure
// (SRS062<!-- The wait a viewer sees is no more than five minutes behind its
// source -->, SRS064<!-- The park-wait-times module asks a failing source no
// more often than once every five minutes -->), which is what a source that
// is failing and a source that is fresh have in common here — an
// arrangement this module's own, not general. RequestsPerMinute, Burst,
// Timeout and MaxBytes are this module's free choices, recorded in
// docs/contracts/module-contract.md § Writing the module's requirements.
func Config() upstream.Config {
	return upstream.Config{
		SuccessTTL:        5 * time.Minute,
		NegativeTTL:       5 * time.Minute,
		RequestsPerMinute: 10,
		Burst:             20,
		Timeout:           5 * time.Second,
		MaxBytes:          256 << 10,
	}
}

// supportedPark is one park this module is built to serve: its upstream
// identity and the name it renders with. Held offline, which is what makes
// SRS055<!-- The park-wait-times module declares the known-good constraint
// the park it is asked about must satisfy --> a real constraint rather than a
// restatement of the framework's own obligation to validate.
type supportedPark struct {
	entityID string
	name     string
}

// supported is the module's whole supported set: a request naming a slug
// outside it is refused before anything goes upstream
// (SRS055<!-- The park-wait-times module declares the known-good constraint
// the park it is asked about must satisfy -->). The slug is what an
// operator's configuration names the park by; the entity id is
// themeparks.wiki's own, matched against the slug by the #309 spike; the
// name is the short form this module renders with, the same one the park's
// icon carries in the UI design spec's own icon set
// (frontend/src/modules/park_wait_times/README.md § The park icon set).
var supported = map[string]supportedPark{
	"magic-kingdom":        {entityID: "75ea578a-adc8-4116-a54d-dccb60765ef9", name: "Magic Kingdom"},
	"epcot":                {entityID: "47f90d2c-e191-4239-a466-5892ef59a88b", name: "Epcot"},
	"hollywood-studios":    {entityID: "288747d1-8b4f-4a64-867e-ea7c9b27bad8", name: "Hollywood Studios"},
	"animal-kingdom":       {entityID: "1c84a229-8862-4648-9c71-378ddd2c7693", name: "Animal Kingdom"},
	"universal-studios":    {entityID: "eb3f4560-2383-4a36-9152-6b3e5ed6bc57", name: "Universal Studios"},
	"islands-of-adventure": {entityID: "267615cc-8943-4c2a-ae2c-5da728ca591f", name: "Islands of Adventure"},
}

// validate judges one park slug against the constraint this module declares
// (SRS055<!-- The park-wait-times module declares the known-good constraint
// the park it is asked about must satisfy -->). The returned error's text is
// what the rejection renders, so it says what is accepted and never echoes
// what was sent.
func validate(slug string) (supportedPark, error) {
	park, ok := supported[slug]
	if !ok {
		return supportedPark{}, fmt.Errorf("%q is not a park this module supports", slug)
	}
	return park, nil
}

// The upstream requests. Two calls per park — this module's requests carry
// no credential (SRS065<!-- The park-wait-times module takes what it shows
// from one external wait-times source -->).
const (
	// entityBaseURL is the source's per-entity endpoint root.
	entityBaseURL = "https://api.themeparks.wiki/v1/entity/"
)

// liveURL is the upstream request for a park's rides and their current
// waits.
func liveURL(entityID string) string {
	return entityBaseURL + entityID + "/live"
}

// scheduleURL is the upstream request for a park's operating hours.
func scheduleURL(entityID string) string {
	return entityBaseURL + entityID + "/schedule"
}

// The three non-numeric states a ride's wait collapses to, out of the
// source's four-value status enum
// (SRS061<!-- The park-wait-times module draws a wait as the time or the
// not-operating state it is handed -->). Spelled exactly as the payload
// draws them (the park-wait-times UI design spec's state list).
const (
	waitDown          = "Down"
	waitClosed        = "Closed"
	waitRefurbishment = "Refurbishment"
)

// liveResponse is the source's /live response, read no further than this
// package.
type liveResponse struct {
	LiveData []liveRow `json:"liveData"`
}

// liveRow is one entity the response reports live data for — a ride, a
// show, a restaurant or the park itself. Every value is a pointer so an
// absent one is told from a zero the source meant.
type liveRow struct {
	Name       *string     `json:"name"`
	EntityType *string     `json:"entityType"`
	Status     *string     `json:"status"`
	Queue      *queueBlock `json:"queue"`
}

type queueBlock struct {
	Standby *standbyBlock `json:"STANDBY"`
}

type standbyBlock struct {
	WaitTime *int `json:"waitTime"`
}

// shapeRides reads the source's live-data response into the park's ride
// list, attractions only and in the order the source gives them
// (SRS056<!-- The park-wait-times module puts each park's ride waits across
// the boundary -->). A response missing a value a kept row needs is an
// error rather than a payload carrying a zero nobody reported, except an
// attraction reporting OPERATING with no posted wait, which is left out of
// the list rather than failing the whole park's shaping. The body is the
// cached response every caller it is served to holds, and nothing here
// writes to it.
func shapeRides(body []byte) ([]boundary.ParkWaitTimesRide, error) {
	var read liveResponse
	if err := json.Unmarshal(body, &read); err != nil {
		return nil, fmt.Errorf("reading the source's response: %w", err)
	}

	rides := make([]boundary.ParkWaitTimesRide, 0, len(read.LiveData))
	for _, row := range read.LiveData {
		// Only a ride is a ride: a show, a restaurant or the park's own row
		// answers a different question and is not carried
		// (SRS056<!-- The park-wait-times module puts each park's ride waits
		// across the boundary -->, "the ride's name").
		if row.EntityType == nil || *row.EntityType != "ATTRACTION" {
			continue
		}
		if row.Name == nil {
			return nil, errors.New("an attraction's response carries no name")
		}
		if row.Status == nil {
			return nil, fmt.Errorf("%q's response carries no status", *row.Name)
		}

		wait, err := shapeWait(*row.Status, row.Queue)
		if errors.Is(err, errNoPostedWait) {
			// Left out of the rides list rather than failing this park's
			// whole shaping.
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("%q %w", *row.Name, err)
		}
		rides = append(rides, boundary.ParkWaitTimesRide{Name: *row.Name, Wait: wait})
	}
	return rides, nil
}

// errNoPostedWait is shapeWait's sentinel for an OPERATING row with nothing
// to draw a wait from: shapeRides reads it apart from every other shaping
// failure so that one such row is left out of the park's rides rather than
// failing the park's whole shaping.
var errNoPostedWait = errors.New("is operating but the response reports no wait")

// shapeWait reads one ride's wait — a length of time in minutes, or one of
// the three not-operating states — into the boundary's untyped slot
// (SRS061<!-- The park-wait-times module draws a wait as the time or the
// not-operating state it is handed -->; boundary/openapi.yaml's
// ParkWaitTimesWait). An operating ride the source reports no wait for
// returns errNoPostedWait rather than a zero nobody reported; a status
// outside the four the source declares is refused the same way.
func shapeWait(status string, queue *queueBlock) (any, error) {
	switch status {
	case "OPERATING":
		if queue == nil || queue.Standby == nil || queue.Standby.WaitTime == nil {
			return nil, errNoPostedWait
		}
		return *queue.Standby.WaitTime, nil
	case "DOWN":
		return waitDown, nil
	case "CLOSED":
		return waitClosed, nil
	case "REFURBISHMENT":
		return waitRefurbishment, nil
	default:
		return nil, fmt.Errorf("reports a status this module does not recognise: %q", status)
	}
}

// scheduleResponse is the source's /schedule response, read no further than
// this package.
type scheduleResponse struct {
	Schedule []scheduleEntry `json:"schedule"`
}

type scheduleEntry struct {
	Type        *string `json:"type"`
	OpeningTime *string `json:"openingTime"`
	ClosingTime *string `json:"closingTime"`
}

// shapeHours reads the park's operating hours for today out of the source's
// schedule response, today being read against now — driven in tests rather
// than the wall clock — so that this function stays pure. The schedule
// carries more than one entry for a date (early entry, a ticketed evening
// event); the one this module reads is the `OPERATING`-typed entry, which is
// the park's own regular hours
// (SRS056<!-- The park-wait-times module puts each park's ride waits across
// the boundary -->, "operating hours"). Which entry is "today's" is judged
// in the offset that entry's own timestamp reports, the same technique the
// weather module reads its source's local time with — never against an IANA
// timezone database, which the deployed image does not carry. A day the
// source reports no `OPERATING` entry for returns nil rather than an error:
// the park may simply be closed that day (boundary/openapi.yaml's
// ParkWaitTimesHours, "absent where the source reports none").
func shapeHours(body []byte, now time.Time) (*boundary.ParkWaitTimesHours, error) {
	var read scheduleResponse
	if err := json.Unmarshal(body, &read); err != nil {
		return nil, fmt.Errorf("reading the source's response: %w", err)
	}

	for _, entry := range read.Schedule {
		if entry.Type == nil || *entry.Type != "OPERATING" {
			continue
		}
		if entry.OpeningTime == nil || entry.ClosingTime == nil {
			return nil, errors.New("an operating schedule entry carries no opening or closing time")
		}
		opens, err := time.Parse(time.RFC3339, *entry.OpeningTime)
		if err != nil {
			return nil, fmt.Errorf("the schedule's opening time is not one this module can read: %w", err)
		}
		closes, err := time.Parse(time.RFC3339, *entry.ClosingTime)
		if err != nil {
			return nil, fmt.Errorf("the schedule's closing time is not one this module can read: %w", err)
		}
		if !sameDay(now.In(opens.Location()), opens) {
			continue
		}
		return &boundary.ParkWaitTimesHours{
			Open:  opens.Format(time.RFC3339),
			Close: closes.Format(time.RFC3339),
		}, nil
	}
	return nil, nil
}

// sameDay reports whether a and b fall on the same calendar day, each read
// in its own location.
func sameDay(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return ay == by && am == bm && ad == bd
}
