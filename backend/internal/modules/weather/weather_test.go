package weather

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/tjwise99/WiseKiosk/backend/internal/boundary"
)

// captured is the recorded response every shaping case runs against: one real
// answer from the source, for the location below, taken with the request
// buildURL builds. No case here reaches a network.
//
// It carries more of each range than the payload holds — eight hours and seven
// days against five and five — because a shaping that truncates and one that
// passes the source's own length straight through are told apart only by a
// response longer than the figure. It also spans the location's sunset, so the
// hours it carries are not all of one kind: a shaping answering the same
// day-or-night flag whatever it read would pass against a capture taken wholly
// in daylight.
const captured = "testdata/open-meteo-forecast.json"

// The location the capture was taken for, and the offset the source reported for
// it. A timestamp in the payload carries that offset rather than the reader's.
const (
	capturedLat    = 25.2048
	capturedLon    = 55.2708
	capturedOffset = "+04:00"
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
func point(lat, lon float64) boundary.WeatherRequest {
	return boundary.WeatherRequest{Lat: lat, Lon: lon}
}

// serve runs one request against this module's own schema handler, which is what
// judges a body and what answers a rejection.
func serve(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/weather", strings.NewReader(body))
	WeatherRoute{}.PostApiWeather(recorder, request)
	return recorder
}

// TestTST058_ThePatternAdmitsAPointAndRejectsEveryOtherValue reads
// SRS043<!-- The weather module declares the known-good constraint the location it is asked about must satisfy -->
// against the constraint itself. No case reaches a network: the admitted ones
// are read against the constraint and the request built from them, and the
// rejected ones are read through the module's own handler, which answers before
// any upstream call is reachable.
//
// The rejected cases are values rather than spellings. What a coordinate may be
// written as is the boundary schema's, refused by the generated body's own
// decoding, so the two rows below that are not numbers at all stand for that
// half arriving as a rejection rather than for anything this module judges.
func TestTST058_ThePatternAdmitsAPointAndRejectsEveryOtherValue(t *testing.T) {
	admitted := []struct {
		name     string
		lat, lon float64
	}{
		{"the captured location", capturedLat, capturedLon},
		{"the null island", 0, 0},
		{"the poles and the antimeridian", -90, -180},
		{"the other end of both ranges", 90, 180},
		{"a whole number of degrees", 51, -1},
		{"a near-zero longitude", capturedLat, 1e-7},
		{"a negative near-zero latitude", -1.5e-7, capturedLon},
	}

	for _, c := range admitted {
		t.Run("admits "+c.name, func(t *testing.T) {
			request := point(c.lat, c.lon)
			if err := validate(request); err != nil {
				t.Fatalf("validate: unexpected rejection: %v", err)
			}

			// The constraint admitting a value is worth nothing if the request it
			// then builds does not carry it.
			built, err := url.Parse(buildURL(request))
			if err != nil {
				t.Fatalf("buildURL returned a value that is not a URL: %v", err)
			}
			if got := built.Query().Get("latitude"); got != degrees(c.lat) {
				t.Errorf("the request's latitude = %q, want %q", got, degrees(c.lat))
			}
			if got := built.Query().Get("longitude"); got != degrees(c.lon) {
				t.Errorf("the request's longitude = %q, want %q", got, degrees(c.lon))
			}
		})
	}

	rejected := []struct {
		name string
		body string
	}{
		{"a latitude past the pole", `{"lat":90.1,"lon":55.2708}`},
		{"a longitude past the antimeridian", `{"lat":25.2048,"lon":-180.1}`},
		{"a latitude past the pole by the smallest step there is", `{"lat":90.00000000000001,"lon":0}`},
		{"a magnitude too large to hold", `{"lat":1e400,"lon":0}`},
		{"a latitude that is not a number", `{"lat":"here","lon":55.2708}`},
		{"a longitude written as not-a-number", `{"lat":25.2048,"lon":NaN}`},
		{"a point and a parameter this source does not take", `{"lat":25.2048,"lon":55.2708,"units":"metric"}`},
		{"a point and an empty parameter this source does not take", `{"lat":25.2048,"lon":55.2708,"x":""}`},
		{"a place name instead of a point", `{"place":"the observatory"}`},
		{"no body at all", ``},
		{"a body that is not an object", `[25.2048,55.2708]`},
	}

	for _, c := range rejected {
		t.Run("rejects "+c.name, func(t *testing.T) {
			recorder := serve(t, c.body)

			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want the rejection %d (%s)", recorder.Code, http.StatusBadRequest, recorder.Body)
			}

			var rejection boundary.ClientRejection
			if err := json.Unmarshal(recorder.Body.Bytes(), &rejection); err != nil {
				t.Fatalf("reading the rejection %q: %v", recorder.Body, err)
			}
			if rejection.Message == "" {
				t.Error("the rejection carries no text to render")
			}
			// The rejection's text is rendered, so what was sent must not be in it.
			if strings.Contains(rejection.Message, c.body) && c.body != "" {
				t.Errorf("the rejection %q echoes what was sent", rejection.Message)
			}
		})
	}
}

// TestTheRequestAsksTheSourceForWhatThePayloadCarries reads the other half of
// buildURL: the units the boundary schema declares, and both forward ranges in
// the one call this module's route can make.
func TestTheRequestAsksTheSourceForWhatThePayloadCarries(t *testing.T) {
	built, err := url.Parse(buildURL(point(capturedLat, capturedLon)))
	if err != nil {
		t.Fatalf("buildURL returned a value that is not a URL: %v", err)
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

	// One more of each than the payload carries, because the source's ranges open
	// with the hour in progress and with today, both of which the payload drops.
	if hours := horizon(t, built, "forecast_hours"); hours != hoursShown+1 {
		t.Errorf("the request asks for %d hours and the payload carries %d, want one more than it carries", hours, hoursShown)
	}
	if days := horizon(t, built, "forecast_days"); days != daysShown+1 {
		t.Errorf("the request asks for %d days and the payload carries %d, want one more than it carries", days, daysShown)
	}

	// The day-or-night flag is asked for per hour as well as for the present
	// reading: the payload requires it on each hour, so a request that did not
	// ask for it makes every hour unshapeable.
	if fields := built.Query().Get("hourly"); !strings.Contains(fields, "is_day") {
		t.Errorf("the request asks for hourly %q, want the day-or-night flag among them", fields)
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
// SRS044<!-- The weather module puts the present conditions and the near-term outlook across the boundary -->
// against the captured response, with no network: the present weather in each of
// the five respects, and both forward ranges.
func TestTST059_ShapingTheCapturedResponseCarriesEverythingAViewerIsOwed(t *testing.T) {
	payload, err := Shape(response(t))
	if err != nil {
		t.Fatalf("Shape: unexpected error: %v", err)
	}

	// Each of the respects the item names, read as a value the source reported
	// rather than a zero shaped from a value it did not.
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

	// The hour in progress and today are what the source's ranges open with, so
	// the first of each the payload carries is the one after it.
	var raw forecast
	if err := json.Unmarshal(response(t), &raw); err != nil {
		t.Fatalf("reading the captured response: %v", err)
	}
	if strings.HasPrefix(payload.Hourly[0].Time, raw.Hourly.Time[0]) {
		t.Errorf("the first hour shown is %q, which is the hour the source opened with", payload.Hourly[0].Time)
	}
	if strings.HasPrefix(payload.Daily[0].Time, raw.Daily.Time[0]) {
		t.Errorf("the first day shown is %q, which is today", payload.Daily[0].Time)
	}

	// The fifth respect, carried on each hour as well as on the present reading.
	// The capture spans the location's sunset, so the hours are not all of one
	// kind and a shaping answering the same flag throughout fails here.
	daylit := 0
	for index, hour := range payload.Hourly {
		if hour.IsDay != (*raw.Hourly.IsDay[index+1] == 1) {
			t.Errorf("hour %d is drawn as daylight=%v, want the capture's", index, hour.IsDay)
		}
		if hour.IsDay {
			daylit++
		}
	}
	if daylit == 0 || daylit == len(payload.Hourly) {
		t.Errorf("all %d hours are daylight=%v, so the capture cannot tell a carried flag from a constant one",
			len(payload.Hourly), daylit != 0)
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

// TestTheOutlooksAreAsLongAsTheRequirementStates reads the horizon against a
// capture carrying more of each range than the payload is to hold: a shaping
// that truncates and one that passes the source's own length straight through
// are told apart only by a response longer than the figure.
//
// The expected lengths are written here rather than read from the module's own
// constants. A check reading the constant asserts that the module agrees with
// itself, which is equally true of a module that shows one hour.
func TestTheOutlooksAreAsLongAsTheRequirementStates(t *testing.T) {
	const (
		wantHours = 5
		wantDays  = 5
	)

	var raw forecast
	if err := json.Unmarshal(response(t), &raw); err != nil {
		t.Fatalf("reading the captured response: %v", err)
	}
	// Without this the lengths below are asserted against a capture that never
	// had more to give, which passes whether or not anything truncates.
	if len(raw.Hourly.Time) <= wantHours || len(raw.Daily.Time) <= wantDays {
		t.Fatalf("the capture carries %d hours and %d days, want more than the %d and %d the payload holds",
			len(raw.Hourly.Time), len(raw.Daily.Time), wantHours, wantDays)
	}

	payload, err := Shape(response(t))
	if err != nil {
		t.Fatalf("Shape: unexpected error: %v", err)
	}

	if len(payload.Hourly) != wantHours {
		t.Errorf("the payload carries %d hours, want %d", len(payload.Hourly), wantHours)
	}
	if len(payload.Daily) != wantDays {
		t.Errorf("the payload carries %d days, want %d", len(payload.Daily), wantDays)
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
		// Index one in both ranges: index nought is the hour in progress and today,
		// which the payload drops, so a value missing there is one nothing reads.
		"a daily maximum the source did not report": func(read map[string]any) {
			read["daily"].(map[string]any)["temperature_2m_max"].([]any)[1] = nil
		},
		"an hour the source did not say was in daylight": func(read map[string]any) {
			read["hourly"].(map[string]any)["is_day"].([]any)[1] = nil
		},
		"no hourly day-or-night flag at all": func(read map[string]any) {
			delete(read["hourly"].(map[string]any), "is_day")
		},
		"a daily range holding only today": func(read map[string]any) {
			daily := read["daily"].(map[string]any)
			for _, measurement := range []string{
				"time", "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max",
			} {
				daily[measurement] = daily[measurement].([]any)[:1]
			}
		},
		"an hourly range one measurement short": func(read map[string]any) {
			hourly := read["hourly"].(map[string]any)
			hourly["weather_code"] = hourly["weather_code"].([]any)[1:]
		},
		"an hourly range holding only the hour in progress": func(read map[string]any) {
			hourly := read["hourly"].(map[string]any)
			for _, measurement := range []string{"time", "temperature_2m", "weather_code", "precipitation_probability", "is_day"} {
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
// module's half of
// SRS047<!-- The weather module asks an answering source at most four times an hour for a location -->:
// the figures it registers, against what obliged them rather than against
// themselves. What the framework then does with a cache interval — one upstream
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
	// lapses, so one location costs one upstream call per interval. It is read
	// against the interval four an hour implies rather than against a quotient of
	// the two, which truncates.
	const bound = time.Hour / 4
	if policy.SuccessTTL < bound {
		t.Errorf("a %s cache interval asks for one location oftener than %d times an hour, want no oftener than that",
			policy.SuccessTTL, time.Hour/bound)
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

// TestTST066_ThePolicyComesToOneRequestEveryFiveMinutesForOneLocation reads this
// module's half of
// SRS049<!-- The weather module asks a failing source no more often than once every five minutes -->:
// the interval it registers, against what obliged it rather than against itself.
// What the framework then does with that interval — one upstream call per
// interval for one location while the source is down — is the router package's
// to read, against a fixture rather than against this number.
func TestTST066_ThePolicyComesToOneRequestEveryFiveMinutesForOneLocation(t *testing.T) {
	policy := Config()

	// The interval is what holds the rate on this path: the route answers from
	// the held failure until it lapses, so one location costs one upstream call
	// per interval for as long as the source is failing.
	const bound = 5 * time.Minute
	if policy.NegativeTTL < bound {
		t.Errorf("a %s failure interval asks for one location oftener than once every %s, want no oftener than that",
			policy.NegativeTTL, bound)
	}
}

// TestThePolicyIsCompleteAndItsFailureRetryIsSooner reads what an entry requires
// of any policy, and the one relation between two of this module's figures that
// no requirement states.
func TestThePolicyIsCompleteAndItsFailureRetryIsSooner(t *testing.T) {
	policy := Config()

	// SRS046<!-- The weather a viewer sees is no more than fifteen minutes behind its source -->:
	// an answer held longer than the bound is one a viewer could be shown past it.
	if policy.SuccessTTL > 15*time.Minute {
		t.Errorf("SuccessTTL = %s, want no more than 15m", policy.SuccessTTL)
	}

	// Every value is required of an entry, and nothing in the framework supplies
	// one or checks that an entry declared it
	// (docs/ARCHITECTURE.md § Backend), so this is where a zero one is caught.
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
