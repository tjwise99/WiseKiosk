package main

import (
	"flag"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

// memoryGrowthLimit is what the resident-memory predicate judges against,
// tunable so a longer observation can be judged on a tighter figure.
var memoryGrowthLimit = flag.Float64("footprint-memory-growth", 0.10,
	"the fractional rise in resident memory the footprint run fails past")

const (
	// handleMargin is how far above the idle baseline the descriptor count may
	// peak. It covers the outbound client's pooled sockets and the secret file
	// each cache miss opens and closes.
	handleMargin = 16
	// warmupSamples is how many samples are dropped from the head of the
	// series, covering the load pool's start and the outbound connection pool
	// filling.
	warmupSamples = 3
	// minJudgedSamples is the shortest post-warmup series the predicates are
	// read from; a shorter run fails rather than passing on too few points.
	minJudgedSamples = 8
)

// sample is one instant's reading of the three sampled resources.
type sample struct {
	at         time.Duration
	rssKB      int
	fds        int
	goroutines int
}

// memoryGrew reports the fractional change from the median resident memory of
// the series' first quartile to that of its last, and whether it exceeds limit.
// A quartile median moves on a sustained rise and not on a single spike. A
// series too short to hold a quartile, or one starting at zero, reports no
// growth.
//
// The comparison is between quartile middles rather than endpoints, so a linear
// ramp of a given size end to end reports about three quarters of it.
func memoryGrew(judged []sample, limit float64) (float64, bool) {
	quartile := len(judged) / 4
	if quartile == 0 {
		return 0, false
	}

	first := medianRSS(judged[:quartile])
	if first == 0 {
		return 0, false
	}

	growth := (medianRSS(judged[len(judged)-quartile:]) - first) / first
	return growth, growth > limit
}

// medianRSS is the median resident memory of part, averaging the middle pair
// where part holds an even number of samples.
func medianRSS(part []sample) float64 {
	values := make([]int, len(part))
	for i, s := range part {
		values[i] = s.rssKB
	}
	sort.Ints(values)

	middle := len(values) / 2
	if len(values)%2 == 1 {
		return float64(values[middle])
	}
	return float64(values[middle-1]+values[middle]) / 2
}

// handlesGrew reports the highest descriptor count the series holds, and
// whether it sits more than handleMargin above the idle baseline. The peak
// rather than a median, because a descriptor leak is what the highest reading
// shows first.
func handlesGrew(judged []sample, baseline int) (int, bool) {
	peak := 0
	for _, s := range judged {
		if s.fds > peak {
			peak = s.fds
		}
	}
	return peak, peak > baseline+handleMargin
}

// tasksGrew reports the goroutine count at the series' first and last sample,
// and whether the run ended above where it started. The comparison is absolute:
// both readings are taken with the load pool running, so the pool cancels and
// what is left is growth.
func tasksGrew(judged []sample) (int, int, bool) {
	if len(judged) == 0 {
		return 0, 0, false
	}

	first, last := judged[0].goroutines, judged[len(judged)-1].goroutines
	return first, last, last > first
}

// render lays the series out a row per sample, so a failure shows the trend
// rather than the verdict.
func render(series []sample) string {
	var out strings.Builder
	out.WriteString("  elapsed\trss kB\tfds\tgoroutines\n")
	for _, s := range series {
		out.WriteString("  " + s.at.String())
		out.WriteString("\t" + strconv.Itoa(s.rssKB))
		out.WriteString("\t" + strconv.Itoa(s.fds))
		out.WriteString("\t" + strconv.Itoa(s.goroutines) + "\n")
	}
	return out.String()
}

// synthesise builds a series of n samples from a function per resource.
func synthesise(n int, heapKB, fds, goroutines func(int) int) []sample {
	series := make([]sample, n)
	for i := range series {
		series[i] = sample{
			at:         time.Duration(i) * time.Second,
			heapKB:     heapKB(i),
			fds:        fds(i),
			goroutines: goroutines(i),
		}
	}
	return series
}

// flat is a resource holding value at every sample.
func flat(value int) func(int) int {
	return func(int) int { return value }
}

// TestFootprintPredicatesJudgeSyntheticSeries drives each predicate over a
// series carrying the growth it looks for and over one carrying noise it must
// tolerate. Without the first the predicates are only known to run, and without
// the second a predicate that fails on everything would pass for working.
// TST004, TST043, TST044
func TestFootprintPredicatesJudgeSyntheticSeries(t *testing.T) {
	const (
		samples     = 40
		steadyHeap  = 16000
		steadyFDs   = 10
		steadyTasks = 14
	)

	steady := synthesise(samples, flat(steadyHeap), flat(steadyFDs), flat(steadyTasks))

	// A fifth of steadyHeap added linearly across the series, which the
	// quartile comparison reads as about three quarters of that.
	ramping := synthesise(samples, func(i int) int {
		return steadyHeap + i*steadyHeap/5/(samples-1)
	}, flat(steadyFDs), flat(steadyTasks))

	spiking := synthesise(samples, func(i int) int {
		if i == samples/2 {
			return steadyHeap * 3
		}
		return steadyHeap
	}, flat(steadyFDs), flat(steadyTasks))

	climbingFDs := synthesise(samples, flat(steadyHeap), func(i int) int {
		return steadyFDs + i
	}, flat(steadyTasks))

	churningFDs := synthesise(samples, flat(steadyHeap), func(i int) int {
		return steadyFDs + i%3
	}, flat(steadyTasks))

	climbingTasks := synthesise(samples, flat(steadyHeap), flat(steadyFDs), func(i int) int {
		return steadyTasks + i/10
	})

	dippingTasks := synthesise(samples, flat(steadyHeap), flat(steadyFDs), func(i int) int {
		if i == samples/2 {
			return steadyTasks + 6
		}
		return steadyTasks
	})

	judgeMemory := func(series []sample) bool {
		_, grew := memoryGrew(series, *memoryGrowthLimit)
		return grew
	}
	judgeHandles := func(series []sample) bool {
		_, grew := handlesGrew(series, steadyFDs)
		return grew
	}
	judgeTasks := func(series []sample) bool {
		_, _, grew := tasksGrew(series)
		return grew
	}

	cases := []struct {
		name   string
		series []sample
		judge  func([]sample) bool
		want   bool
	}{
		{"heap holding steady", steady, judgeMemory, false},
		{"heap ramping", ramping, judgeMemory, true},
		{"heap spiking once", spiking, judgeMemory, false},
		{"heap over too short a series", steady[:3], judgeMemory, false},
		{"descriptors holding steady", steady, judgeHandles, false},
		{"descriptors climbing", climbingFDs, judgeHandles, true},
		{"descriptors churning inside the margin", churningFDs, judgeHandles, false},
		{"goroutines holding steady", steady, judgeTasks, false},
		{"goroutines climbing", climbingTasks, judgeTasks, true},
		{"goroutines dipping and returning", dippingTasks, judgeTasks, false},
	}

	for _, judged := range cases {
		t.Run(judged.name, func(t *testing.T) {
			if grew := judged.judge(judged.series); grew != judged.want {
				t.Errorf("the predicate reported growth = %t, want %t, over:\n%s", grew, judged.want, render(judged.series))
			}
		})
	}
}
