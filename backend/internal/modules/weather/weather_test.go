package weather

import (
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// captured is the recorded response every shaping case runs against: one real
// answer from the source, for the location below, taken with the request
// BuildURL builds. No case here reaches a network.
const captured = "testdata/open-meteo-forecast.json"

// The location the capture was taken for, and the offset the source reported for
// it. A timestamp in the payload carries that offset rather than the reader's.
const (
	capturedLat    = "40.7128"
	capturedLon    = "-74.006"
	capturedOffset = "-04:00"
)

// response reads the captured response.
func response(t *testing.T) []byte {
	t.Helper()

	body, err := os.ReadFile(filepath.FromSlash(captured))
	if err != nil {
		t.Fatalf("reading the captured response: %v", err)
	}
	return body
}

// point is a request naming a location.
func point(lat, lon string) url.Values {
	return url.Values{paramLat: {lat}, paramLon: {lon}}
}

// TestTST058_ThePatternAdmitsAPointAndRejectsEveryOtherValue reads SRS043
// against the pattern itself. No case reaches a network, and the rejected ones
// build no URL — which is what says nothing goes upstream for a request the
// pattern refuses.
func TestTST058_ThePatternAdmitsAPointAndRejectsEveryOtherValue(t *testing.T) {
	admitted := []struct {
		name     string
		lat, lon string
	}{
		{"the captured location", capturedLat, capturedLon},
		{"the null island", "0", "0"},
		{"the poles and the antimeridian", "-90", "-180"},
		{"the other end of both ranges", "90", "180"},
		{"a whole number of degrees", "51", "-1"},
		// What a JavaScript number formats a near-zero coordinate as. Refusing
		// this refused a legal point for how it was printed.
		{"a near-zero longitude in exponent form", capturedLat, "1e-7"},
		{"a negative near-zero latitude in exponent form", "-1.5e-7", capturedLon},
		{"an exponent standing for a whole coordinate", "4.07128e1", capturedLon},
		{"a signed-positive latitude", "+40.7128", capturedLon},
		{"a latitude with no whole part", ".5", capturedLon},
		{"a latitude with no fractional part after its point", "40.", capturedLon},
	}

	for _, c := range admitted {
		t.Run("admits "+c.name, func(t *testing.T) {
			params := point(c.lat, c.lon)
			if err := Validate(params); err != nil {
				t.Fatalf("Validate: unexpected rejection: %v", err)
			}

			// The pattern admitting a value is worth nothing if the request it
			// then builds does not carry it.
			target, err := BuildURL(params)
			if err != nil {
				t.Fatalf("BuildURL: unexpected error: %v", err)
			}
			built, err := url.Parse(target)
			if err != nil {
				t.Fatalf("BuildURL returned %q, which is not a URL: %v", target, err)
			}
			if got := built.Query().Get("latitude"); got != c.lat {
				t.Errorf("the request's latitude = %q, want %q", got, c.lat)
			}
			if got := built.Query().Get("longitude"); got != c.lon {
				t.Errorf("the request's longitude = %q, want %q", got, c.lon)
			}
		})
	}

	rejected := []struct {
		name   string
		params url.Values
	}{
		{"no parameters at all", url.Values{}},
		{"a latitude and no longitude", url.Values{paramLat: {capturedLat}}},
		{"a longitude and no latitude", url.Values{paramLon: {capturedLon}}},
		{"an empty latitude", point("", capturedLon)},
		{"an empty longitude", point(capturedLat, "")},
		{"a latitude past the pole", point("90.1", capturedLon)},
		{"a longitude past the antimeridian", point(capturedLat, "-180.1")},
		{"a latitude that is not a number", point("here", capturedLon)},
		{"a longitude that is not a number", point(capturedLat, "east")},
		{"a latitude written as not-a-number", point("NaN", capturedLon)},
		{"a longitude written as infinite", point(capturedLat, "Inf")},
		{"a longitude in hexadecimal", point(capturedLat, "0x4a")},
		{"a latitude in hexadecimal float form", point("0x1p4", capturedLon)},
		{"a latitude written as infinity in full", point("Infinity", capturedLon)},
		{"an exponent with no digits", point("40.7e", capturedLon)},
		{"a latitude past the pole in exponent form", point("9.1e1", capturedLon)},
		{"a magnitude too large to hold", point("1e400", capturedLon)},
		{"a place name instead of a point", url.Values{"place": {"the observatory"}}},
		{"a repeated latitude", url.Values{paramLat: {capturedLat, "0"}, paramLon: {capturedLon}}},
		{"a repeated longitude", url.Values{paramLat: {capturedLat}, paramLon: {capturedLon, "0"}}},
		{"a point and a parameter this source does not take", url.Values{
			paramLat: {capturedLat}, paramLon: {capturedLon}, "units": {"metric"},
		}},
		{"a point and an empty parameter this source does not take", url.Values{
			paramLat: {capturedLat}, paramLon: {capturedLon}, "x": {""},
		}},
	}

	for _, c := range rejected {
		t.Run("rejects "+c.name, func(t *testing.T) {
			err := Validate(c.params)
			if err == nil {
				t.Fatal("Validate: admitted, want a rejection")
			}
			if err.Error() == "" {
				t.Error("the rejection carries no text to render")
			}

			// The rejection's text is rendered, so what was sent must not be in it.
			for _, given := range c.params {
				for _, value := range given {
					if value != "" && strings.Contains(err.Error(), value) {
						t.Errorf("the rejection %q echoes what was sent: %q", err, value)
					}
				}
			}

			// Nothing goes upstream for a request the pattern refuses, and the URL
			// builder is the only thing here that names an upstream.
			if target, err := BuildURL(c.params); err == nil {
				t.Errorf("BuildURL built %q for a location the pattern refuses", target)
			}
		})
	}
}

// TestTheRequestAsksTheSourceForWhatThePayloadCarries reads the other half of
// BuildURL: the units the boundary schema declares, and both forward ranges in
// the one call this module's route can make.
func TestTheRequestAsksTheSourceForWhatThePayloadCarries(t *testing.T) {
	target, err := BuildURL(point(capturedLat, capturedLon))
	if err != nil {
		t.Fatalf("BuildURL: unexpected error: %v", err)
	}
	built, err := url.Parse(target)
	if err != nil {
		t.Fatalf("BuildURL returned %q, which is not a URL: %v", target, err)
	}

	if built.Scheme != "https" {
		t.Errorf("the request's scheme = %q, want https", built.Scheme)
	}
	// The units the boundary schema declares the payload in, and the source's own
	// local time so a timestamp can be given the offset it belongs to.
	for name, want := range map[string]string{
		"temperature_unit": "fahrenheit",
		"wind_speed_unit":  "mph",
		"timezone":         "auto",
	} {
		if got := built.Query().Get(name); got != want {
			t.Errorf("the request's %s = %q, want %q", name, got, want)
		}
	}

	// One call carries all three parts, which is what lets this module read its
	// source through the one URL the framework gives it.
	for _, part := range []string{"current", "hourly", "daily"} {
		if built.Query().Get(part) == "" {
			t.Errorf("the request asks for no %s measurements", part)
		}
	}

	// One hour more than the payload carries, because the source's range opens
	// with the hour in progress and the payload drops it.
	if hours := horizon(t, built, "forecast_hours"); hours != hoursShown+1 {
		t.Errorf("the request asks for %d hours and the payload carries %d, want one more than it carries", hours, hoursShown)
	}
	if days := horizon(t, built, "forecast_days"); days != daysShown {
		t.Errorf("the request asks for %d days and the payload carries %d", days, daysShown)
	}
}

// horizon reads one of the request's forward-range lengths.
func horizon(t *testing.T, built *url.URL, name string) int {
	t.Helper()

	steps, err := strconv.Atoi(built.Query().Get(name))
	if err != nil {
		t.Fatalf("the request's %s = %q, which is not a count: %v", name, built.Query().Get(name), err)
	}
	return steps
}

// TestTST059_ShapingTheCapturedResponseCarriesEverythingAViewerIsOwed reads
// SRS044 against the captured response, with no network: the present weather in
// each of the four respects, and both forward ranges.
func TestTST059_ShapingTheCapturedResponseCarriesEverythingAViewerIsOwed(t *testing.T) {
	payload, err := Shape(response(t))
	if err != nil {
		t.Fatalf("Shape: unexpected error: %v", err)
	}

	// Each of the four respects SRS044 names, read as a value the source
	// reported rather than a zero shaped from a value it did not.
	if payload.Current.Temp == 0 {
		t.Error("the present temperature is nought, want the captured response's")
	}
	if payload.Current.ApparentTemp == 0 {
		t.Error("the present apparent temperature is nought, want the captured response's")
	}
	if payload.Current.ApparentTemp == payload.Current.Temp {
		t.Error("the apparent temperature is the temperature, want the separate value the capture carries")
	}
	if payload.Current.WindSpeed == 0 {
		t.Error("the present wind speed is nought, want the captured response's")
	}
	if payload.Current.Humidity <= 0 || payload.Current.Humidity > 100 {
		t.Errorf("the present humidity = %v, want a percentage", payload.Current.Humidity)
	}
	if !payload.Current.IsDay {
		t.Error("the capture was taken in daylight, and the payload says otherwise")
	}

	if len(payload.Hourly) != hoursShown {
		t.Errorf("the payload carries %d hours, want %d", len(payload.Hourly), hoursShown)
	}
	if len(payload.Daily) != daysShown {
		t.Errorf("the payload carries %d days, want %d", len(payload.Daily), daysShown)
	}

	// The hour in progress is what the source's range opens with, so the first
	// hour the payload carries is the one after it.
	var raw forecast
	if err := json.Unmarshal(response(t), &raw); err != nil {
		t.Fatalf("reading the captured response: %v", err)
	}
	if strings.HasPrefix(payload.Hourly[0].Time, raw.Hourly.Time[0]) {
		t.Errorf("the first hour shown is %q, which is the hour the source opened with", payload.Hourly[0].Time)
	}

	for index, hour := range payload.Hourly {
		at := readTime(t, hour.Time)
		if !strings.HasSuffix(hour.Time, capturedOffset) {
			t.Errorf("hour %d is stamped %q, want the location's %s offset", index, hour.Time, capturedOffset)
		}
		if index > 0 && !at.After(readTime(t, payload.Hourly[index-1].Time)) {
			t.Errorf("hour %d is not after hour %d: %q then %q", index, index-1, payload.Hourly[index-1].Time, hour.Time)
		}
		if hour.PrecipProbability < 0 || hour.PrecipProbability > 100 {
			t.Errorf("hour %d carries a precipitation probability of %v", index, hour.PrecipProbability)
		}
	}

	for index, day := range payload.Daily {
		at := readTime(t, day.Time)
		if !strings.HasSuffix(day.Time, capturedOffset) {
			t.Errorf("day %d is stamped %q, want the location's %s offset", index, day.Time, capturedOffset)
		}
		if at.Hour() != 0 || at.Minute() != 0 {
			t.Errorf("day %d is stamped %q, want that day's start", index, day.Time)
		}
		if index > 0 && !at.After(readTime(t, payload.Daily[index-1].Time)) {
			t.Errorf("day %d is not after day %d: %q then %q", index, index-1, payload.Daily[index-1].Time, day.Time)
		}
		if day.Max < day.Min {
			t.Errorf("day %d is warmest at %v and coldest at %v", index, day.Max, day.Min)
		}
	}
}

// TestTST059_AResponseMissingAValueThePayloadNeedsIsNotShaped is the other half
// of the shaping obligation: a source that answers with a value missing is a
// payload this module cannot build, rather than one carrying a zero nobody
// reported. Each case removes exactly one thing from the captured response.
func TestTST059_AResponseMissingAValueThePayloadNeedsIsNotShaped(t *testing.T) {
	cases := map[string]func(read map[string]any){
		"no present conditions":      func(read map[string]any) { delete(read, "current") },
		"no hourly range":            func(read map[string]any) { delete(read, "hourly") },
		"no daily range":             func(read map[string]any) { delete(read, "daily") },
		"no offset for the location": func(read map[string]any) { delete(read, "utc_offset_seconds") },
		"no present apparent temperature": func(read map[string]any) {
			delete(read["current"].(map[string]any), "apparent_temperature")
		},
		"no present wind speed": func(read map[string]any) {
			delete(read["current"].(map[string]any), "wind_speed_10m")
		},
		"a present temperature the source did not report": func(read map[string]any) {
			read["current"].(map[string]any)["temperature_2m"] = nil
		},
		"an hourly temperature the source did not report": func(read map[string]any) {
			read["hourly"].(map[string]any)["temperature_2m"].([]any)[1] = nil
		},
		"a daily maximum the source did not report": func(read map[string]any) {
			read["daily"].(map[string]any)["temperature_2m_max"].([]any)[0] = nil
		},
		"an hourly range one measurement short": func(read map[string]any) {
			hourly := read["hourly"].(map[string]any)
			hourly["weather_code"] = hourly["weather_code"].([]any)[1:]
		},
		"an hourly range holding only the hour in progress": func(read map[string]any) {
			hourly := read["hourly"].(map[string]any)
			for _, measurement := range []string{"time", "temperature_2m", "weather_code", "precipitation_probability"} {
				hourly[measurement] = hourly[measurement].([]any)[:1]
			}
		},
		"a temperature in a unit the request did not ask for": func(read map[string]any) {
			read["current_units"].(map[string]any)["temperature_2m"] = "°C"
		},
		"a wind speed in a unit the request did not ask for": func(read map[string]any) {
			read["current_units"].(map[string]any)["wind_speed_10m"] = "km/h"
		},
		"an hourly time the source wrote another way": func(read map[string]any) {
			read["hourly"].(map[string]any)["time"].([]any)[1] = "31/08/2026 15:00"
		},
	}

	for name, break_ := range cases {
		t.Run(name, func(t *testing.T) {
			var read map[string]any
			if err := json.Unmarshal(response(t), &read); err != nil {
				t.Fatalf("reading the captured response: %v", err)
			}
			break_(read)

			broken, err := json.Marshal(read)
			if err != nil {
				t.Fatalf("writing the broken response: %v", err)
			}

			payload, err := Shape(broken)
			if err == nil {
				t.Fatalf("Shape: shaped %+v, want an error", payload)
			}
			if err.Error() == "" {
				t.Error("the error says nothing about what could not be read")
			}
		})
	}
}

// TestShapeReadsTheBodyWithoutWritingToIt covers the framework's own condition
// on a shaping function: the body is the cached response every caller it is
// served to holds.
func TestShapeReadsTheBodyWithoutWritingToIt(t *testing.T) {
	body := response(t)
	held := string(body)

	if _, err := Shape(body); err != nil {
		t.Fatalf("Shape: unexpected error: %v", err)
	}
	if string(body) != held {
		t.Error("Shape wrote to the body it was given")
	}
}

// TestTST062_ThePolicyComesToFourRequestsAnHourForOneLocation reads this
// module's half of SRS047: the figures it registers, against what obliged them
// rather than against themselves. What the framework then does with a cache
// interval — one upstream
// call per interval for one location, and never a second in flight while a first
// has not answered — is the router package's to read, against a fixture rather
// than against these numbers.
//
// The second clause reaches no value here. Single flight is the framework's for
// every entry alike, so there is nothing this module could set that would meet
// or miss it.
func TestTST062_ThePolicyComesToFourRequestsAnHourForOneLocation(t *testing.T) {
	policy := Config()

	// The interval is what holds the rate: the route answers from cache until it
	// lapses, so one location costs one upstream call per interval.
	if perHour := time.Hour / policy.SuccessTTL; perHour > 4 {
		t.Errorf("a %s cache interval comes to %d requests an hour for one location, want no more than 4",
			policy.SuccessTTL, perHour)
	}

	// The bucket cannot express the bound — its rate is per minute and it is
	// keyed on the source rather than the location — so it is a backstop over the
	// route as a whole, and it must be loose enough not to refuse the polling the
	// interval above already answers from cache.
	if policy.RequestsPerMinute < 1 || policy.Burst < policy.RequestsPerMinute {
		t.Errorf("the bucket refills at %d a minute and holds %d, want a backstop that does not bind first",
			policy.RequestsPerMinute, policy.Burst)
	}
}

// TestThePolicyIsCompleteAndItsFailureRetryIsSooner reads what an entry requires
// of any policy, and the one relation between two of this module's figures that
// no requirement states.
func TestThePolicyIsCompleteAndItsFailureRetryIsSooner(t *testing.T) {
	policy := Config()

	// SRS046: an answer held longer than the bound is one a viewer could be shown
	// past it.
	if policy.SuccessTTL > 15*time.Minute {
		t.Errorf("SuccessTTL = %s, want no more than 15m", policy.SuccessTTL)
	}

	// Every value is required of an entry, and a zero one panics at construction
	// rather than at a request.
	if policy.NegativeTTL <= 0 || policy.RequestsPerMinute <= 0 ||
		policy.Burst <= 0 || policy.Timeout <= 0 || policy.MaxBytes <= 0 {
		t.Errorf("the policy leaves a value unset: %+v", policy)
	}
	if policy.NegativeTTL >= policy.SuccessTTL {
		t.Errorf("NegativeTTL = %s and SuccessTTL = %s, want a source that is down retried sooner",
			policy.NegativeTTL, policy.SuccessTTL)
	}
}

// readTime reads a timestamp the payload carries.
func readTime(t *testing.T, written string) time.Time {
	t.Helper()

	at, err := time.Parse(time.RFC3339, written)
	if err != nil {
		t.Fatalf("the payload's timestamp %q is not one a reader can parse: %v", written, err)
	}
	return at
}
