// Resident memory and open descriptors are read from /proc, so the sampling
// half of the harness is constrained to Linux by this file's name. The
// predicates it judges with carry no such constraint and sit beside it.
package main

import (
	"flag"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/tjwise99/WiseKiosk/backend/internal/staticserve"
)

// The run's shape, tunable from the command line so a longer observation is a
// flag rather than an edit.
var (
	loadDuration = flag.Duration("footprint-duration", 2*time.Minute,
		"how long the footprint run drives load before judging the samples")
	sampleInterval = flag.Duration("footprint-interval", 2*time.Second,
		"how often the footprint run samples memory, descriptors and goroutines")
)

const (
	// loadWorkers is the size of the request-issuing pool. It is fixed for the
	// whole run, so it contributes the same goroutines to the first and last
	// sample alike.
	loadWorkers = 8
	// requestPause is how long a worker waits between its requests.
	requestPause = time.Millisecond
	// minRequests is the traffic below which the run is treated as not having
	// exercised the server.
	minRequests = 1000
	// floorReadings and floorSpacing are how a sample's goroutine count is
	// taken: the lowest of several readings, spaced apart. A goroutine serving
	// a request in flight at one reading has returned by another, while one
	// that leaked is present in all of them, so the lowest reading is the count
	// held between requests rather than during one.
	floorReadings = 8
	floorSpacing  = 5 * time.Millisecond
)

// requests is the mix each worker rotates through: liveness, the served index,
// a served file, a served miss, a cached API answer, an API answer whose
// station varies so it misses the cache, and two rejections. want is the status
// the preflight pass asserts, so the mix is known to reach those paths before
// any of it is driven at volume.
var requests = []struct {
	method string
	target string
	want   int
	vary   bool
}{
	{method: http.MethodGet, target: healthPath, want: http.StatusOK},
	{method: http.MethodGet, target: "/", want: http.StatusOK},
	{method: http.MethodGet, target: "/config.json", want: http.StatusOK},
	{method: http.MethodGet, target: "/no-such-asset.js", want: http.StatusNotFound},
	{method: http.MethodPost, target: "/api/keyed?station=cached", want: http.StatusOK},
	{method: http.MethodPost, target: "/api/keyed?station=varied-", want: http.StatusOK, vary: true},
	{method: http.MethodPost, target: "/api/unknown?station=one", want: http.StatusNotFound},
	{method: http.MethodPost, target: "/api/keyed", want: http.StatusBadRequest},
}

// TestRunningFootprintStaysBounded drives the assembled server under sustained
// load, samples resident memory, open descriptors and the goroutine count at a
// fixed interval, and judges the post-warmup series with the three predicates
// beside it. An idle sample taken before anything has issued a request is what
// the descriptor margin is measured against.
// TST004, TST043, TST044
func TestRunningFootprintStaysBounded(t *testing.T) {
	plant(t)
	source := newKeyedSource(t)
	server := newServer(staticserve.New(http.Dir(servedTree(t))), keyedSeam(source))

	// Before preflight, not after: preflight's two upstream calls leave pooled
	// sockets behind, and a baseline holding them counts them into itself
	// rather than against the descriptor margin.
	baseline := takeSample(t, 0)
	preflight(t, server)

	var issued atomic.Int64
	stop := make(chan struct{})
	var workers sync.WaitGroup
	for worker := 0; worker < loadWorkers; worker++ {
		workers.Add(1)
		go func(worker int) {
			defer workers.Done()
			drive(server, worker, stop, &issued)
		}(worker)
	}

	series := collect(t, *loadDuration, *sampleInterval)
	close(stop)
	workers.Wait()

	if count := issued.Load(); count < minRequests {
		t.Fatalf("the load pool issued %d requests, too few to accumulate a per-request leak (want at least %d)", count, minRequests)
	}
	if len(series) < warmupSamples+minJudgedSamples {
		t.Fatalf("the run produced %d samples, want at least %d: raise -footprint-duration or lower -footprint-interval",
			len(series), warmupSamples+minJudgedSamples)
	}
	judged := series[warmupSamples:]

	failed := false
	if growth, grew := memoryGrew(judged, *memoryGrowthLimit); grew {
		failed = true
		t.Errorf("resident memory rose %.1f%% across the run, past the %.1f%% the run allows",
			growth*100, *memoryGrowthLimit*100)
	}
	if peak, grew := handlesGrew(judged, baseline.fds); grew {
		failed = true
		t.Errorf("open descriptors peaked at %d, more than %d above the idle baseline of %d",
			peak, handleMargin, baseline.fds)
	}
	if first, last, grew := tasksGrew(judged); grew {
		failed = true
		t.Errorf("goroutines ended the run at %d, above the %d the first judged sample held", last, first)
	}

	t.Logf("idle baseline: rss %d kB, descriptors %d, goroutines %d", baseline.rssKB, baseline.fds, baseline.goroutines)
	t.Logf("%d requests over %s, %d samples at %s, %d judged after warmup",
		issued.Load(), *loadDuration, len(series), *sampleInterval, len(judged))
	if failed {
		t.Log("sample series:\n" + render(series))
	}
}

// preflight issues one of every request in the mix and asserts the status it
// declares, so a mix that stopped reaching the paths it names fails here rather
// than passing the whole run against a server answering nothing.
func preflight(t *testing.T, server http.Handler) {
	t.Helper()

	for _, spec := range requests {
		target := spec.target
		if spec.vary {
			target += "preflight"
		}
		if recorder := send(server, spec.method, target); recorder.Code != spec.want {
			t.Fatalf("%s %s: status = %d, want %d (%s)", spec.method, target, recorder.Code, spec.want, recorder.Body)
		}
	}
}

// drive issues the request mix in rotation until stop closes, counting what it
// issued. A varying station is a fresh cache key, so those requests reach the
// pipeline's miss path rather than its cache.
func drive(server http.Handler, worker int, stop <-chan struct{}, issued *atomic.Int64) {
	for n := worker; ; n++ {
		select {
		case <-stop:
			return
		default:
		}

		spec := requests[n%len(requests)]
		target := spec.target
		if spec.vary {
			target += strconv.Itoa(n)
		}
		send(server, spec.method, target)
		issued.Add(1)
		time.Sleep(requestPause)
	}
}

// collect samples every interval for the whole duration, on the test's own
// goroutine so a sampling failure can end the test.
func collect(t *testing.T, duration, interval time.Duration) []sample {
	t.Helper()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	started := time.Now()
	deadline := time.After(duration)

	var series []sample
	for {
		select {
		case <-ticker.C:
			series = append(series, takeSample(t, time.Since(started).Round(time.Millisecond)))
		case <-deadline:
			return series
		}
	}
}

// takeSample reads the three resources at one instant.
func takeSample(t *testing.T, at time.Duration) sample {
	t.Helper()
	return sample{at: at, rssKB: residentKB(t), fds: openDescriptors(t), goroutines: goroutineFloor()}
}

// residentKB reads the VmRSS line of /proc/self/status, in kilobytes.
func residentKB(t *testing.T) int {
	t.Helper()

	status, err := os.ReadFile("/proc/self/status")
	if err != nil {
		t.Fatalf("reading /proc/self/status: %v", err)
	}
	for _, line := range strings.Split(string(status), "\n") {
		rest, found := strings.CutPrefix(line, "VmRSS:")
		if !found {
			continue
		}
		fields := strings.Fields(rest)
		if len(fields) == 0 {
			break
		}
		kb, err := strconv.Atoi(fields[0])
		if err != nil {
			t.Fatalf("reading VmRSS from %q: %v", line, err)
		}
		return kb
	}

	t.Fatal("/proc/self/status carries no VmRSS line")
	return 0
}

// openDescriptors counts the entries of /proc/self/fd. The handle the read
// itself holds is one of them, in every sample alike.
func openDescriptors(t *testing.T) int {
	t.Helper()

	entries, err := os.ReadDir("/proc/self/fd")
	if err != nil {
		t.Fatalf("reading /proc/self/fd: %v", err)
	}
	return len(entries)
}

// goroutineFloor is the lowest of floorReadings goroutine counts taken
// floorSpacing apart.
func goroutineFloor() int {
	floor := runtime.NumGoroutine()
	for reading := 1; reading < floorReadings; reading++ {
		time.Sleep(floorSpacing)
		if count := runtime.NumGoroutine(); count < floor {
			floor = count
		}
	}
	return floor
}
