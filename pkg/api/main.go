package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand/v2"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"

	demo "github.com/temporal-sa/temporal-priority-fairness-demo/pkg"
)

type WorkflowSummary struct {
	WorkflowPriority  int               `json:"workflowPriority"`
	NumberOfWorkflows int               `json:"numberOfWorkflows"`
	Activities        []ActivitySummary `json:"activities"`
}

type ActivitySummary struct {
	ActivityNumber  int `json:"activityNumber"`
	NumberCompleted int `json:"numberCompleted"`
}

type PriorityTestRunResults struct {
	Workflows      []WorkflowSummary `json:"workflowsByPriority"`
	TotalWorkflows int               `json:"totalWorkflowsInTest"`
}

type FairnessSummary struct {
	FairnessKey    string            `json:"fairnessKey"`
	FairnessWeight int               `json:"fairnessWeight"`
	TotalWorkflows int               `json:"numberOfWorkflows"`
	Activities     []ActivitySummary `json:"activities"`
}

type FairnessTestRunResults struct {
	Workflows      []FairnessSummary `json:"workflowsByFairness"`
	TotalWorkflows int               `json:"totalWorkflowsInTest"`
}

type Band struct {
	Key    string `json:"key"`
	Weight int    `json:"weight"`
	Count  int    `json:"count"`
}

type WorkflowConfig struct {
	IdPrefix        string `json:"workflowIdPrefix"`
	TotalWorkflows  int    `json:"numberOfWorkflows"`
	Mode            string `json:"mode"`
	Bands           []Band `json:"bands"`
	DisableFairness bool   `json:"disableFairness"`
}

func startWorkflowsHandler(temporalClient client.Client) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Printf("startWorkflowsHandler error: %v", err)
			return
		}

		var workflowConfig WorkflowConfig
		if err := json.Unmarshal(body, &workflowConfig); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Printf("startWorkflowsHandler error: %v", err)
			return
		}

		startTime := getTargetWorkflowStartTime(workflowConfig.TotalWorkflows)

		switch {
		case workflowConfig.Mode == "priority":
			for workflowNum := 1; workflowNum <= workflowConfig.TotalWorkflows; workflowNum++ {
				fmt.Printf("Starting priority workflow %s-%d\n", workflowConfig.IdPrefix, workflowNum)

				workflowInput := demo.PriorityWorkflowData{
					Priority: ((workflowNum - 1) % 5) + 1,
				}

				saPriority := temporal.NewSearchAttributeKeyInt64("Priority")
				saActivitiesCompleted := temporal.NewSearchAttributeKeyInt64("ActivitiesCompleted")

				searchAttributes := temporal.NewSearchAttributes(
					saPriority.ValueSet(int64(workflowInput.Priority)),
					saActivitiesCompleted.ValueSet(0),
				)

				options := client.StartWorkflowOptions{
					ID:                    fmt.Sprintf("%s-%d", workflowConfig.IdPrefix, workflowNum),
					TaskQueue:             demo.GetTaskQueue(),
					TypedSearchAttributes: searchAttributes,
					StartDelay:            getStartDelay(startTime),
				}

				temporalClient.ExecuteWorkflow(r.Context(), options, demo.PriorityWorkflow, workflowInput)
			}

		case workflowConfig.Mode == "fairness":
			fallthrough
		default:
			if len(workflowConfig.Bands) == 0 {
				workflowConfig.Bands = []Band{
					{Key: "first-class", Weight: 15},
					{Key: "business-class", Weight: 5},
					{Key: "economy-class", Weight: 1},
				}
			}

			totalWorkflows := 0
			hasCounts := true
			for _, band := range workflowConfig.Bands {
				totalWorkflows += band.Count
			}
			if totalWorkflows == 0 {
				totalWorkflows = workflowConfig.TotalWorkflows
				hasCounts = false
			}

			startTime := getTargetFairnessWorkflowStartTime(totalWorkflows)

			if hasCounts {
				submissionOrder := make([]Band, totalWorkflows)

				n := 0
				for _, band := range workflowConfig.Bands {
					for i := 0; i < band.Count; i++ {
						submissionOrder[n] = band
						n++
					}
				}

				rand.Shuffle(len(submissionOrder), func(i int, j int) {
					submissionOrder[i], submissionOrder[j] = submissionOrder[j], submissionOrder[i]
				})

				for workflowNum := 1; workflowNum <= totalWorkflows; workflowNum++ {
					startFairnessWorkflow(r.Context(), temporalClient, workflowConfig, workflowNum, submissionOrder[workflowNum-1], startTime)
				}
			} else {
				for workflowNum := 1; workflowNum <= totalWorkflows; workflowNum++ {
					band := workflowConfig.Bands[(workflowNum-1)%len(workflowConfig.Bands)]

					startFairnessWorkflow(r.Context(), temporalClient, workflowConfig, workflowNum, band, startTime)
				}
			}

		}

		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Done"))
	}
}

func startFairnessWorkflow(ctx context.Context, temporalClient client.Client, workflowConfig WorkflowConfig, workflowNum int, band Band, startTime time.Time) {
	fmt.Printf("Starting fairness workflow %s-%d [%s:%d]\n", workflowConfig.IdPrefix, workflowNum, band.Key, band.Weight)

	workflowInput := demo.FairnessWorkflowData{
		FairnessKey:     band.Key,
		FairnessWeight:  float32(band.Weight),
		DisableFairness: workflowConfig.DisableFairness,
	}

	saFairnessKey := temporal.NewSearchAttributeKeyKeyword("FairnessKey")
	saFairnessWeight := temporal.NewSearchAttributeKeyInt64("FairnessWeight")
	saActivitiesCompleted := temporal.NewSearchAttributeKeyInt64("ActivitiesCompleted")

	weight := band.Weight
	if workflowConfig.DisableFairness {
		weight = 0
	}
	searchAttributes := temporal.NewSearchAttributes(
		saFairnessKey.ValueSet(band.Key),
		saFairnessWeight.ValueSet(int64(weight)),
		saActivitiesCompleted.ValueSet(0),
	)

	options := client.StartWorkflowOptions{
		ID:                    fmt.Sprintf("%s-%d", workflowConfig.IdPrefix, workflowNum),
		TaskQueue:             demo.GetTaskQueue(),
		TypedSearchAttributes: searchAttributes,
		StartDelay:            getStartDelay(startTime),
	}

	temporalClient.ExecuteWorkflow(ctx, options, demo.FairnessWorkflow, workflowInput)
}

func getTargetWorkflowStartTime(numberOfWorkflows int) time.Time {
	// Lowered: assume ~50ms to start each WF instance + 5s buffer.
	// Examples: 100 WFs -> ~10s, 300 WFs -> ~20s, 570 WFs -> ~33.5s
	secondsToStartAll := (float64(numberOfWorkflows) * 0.05) + 5
	return time.Now().Add(time.Second * time.Duration(secondsToStartAll))
}

func getTargetFairnessWorkflowStartTime(numberOfWorkflows int) time.Time {
	// Fairness runs: 7s floor, 30s cap. Scale so 200 -> ~15s and 300 -> ~30s.
	// Linear core: ceil(0.15 * N - 15), then clamp to [7, 30].
	// Examples: 100 -> 7s (floor), 200 -> 15s, 300 -> 30s, 440 -> 30s (cap).
	scaled := math.Ceil((0.15*float64(numberOfWorkflows) - 15))
	secondsToStartAll := math.Min(30, math.Max(7, scaled))
	return time.Now().Add(time.Second * time.Duration(secondsToStartAll))
}

func getStartDelay(targetStartTime time.Time) time.Duration {
	delay := time.Until(targetStartTime)
	if delay < 0 {
		return 0
	}
	return delay
}

func runStatusHandler(temporalClient client.Client) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		// runPrefix must be supplied
		runPrefix := r.URL.Query().Get("runPrefix")
		if runPrefix == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		workflowsByPriority := make([]WorkflowSummary, 0)

		for priority := 1; priority <= 5; priority++ {
			activities := make([]ActivitySummary, 5)
			for i := range activities {
				activities[i].ActivityNumber = i + 1
			}

			workflowsByPriority = append(workflowsByPriority, WorkflowSummary{
				WorkflowPriority: priority,
				Activities:       activities,
			})
		}

		workflows, err := temporalClient.ListWorkflow(r.Context(), &workflowservice.ListWorkflowExecutionsRequest{
			Query: fmt.Sprintf("WorkflowId STARTS_WITH \"%s\"", runPrefix),
		})
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Printf("runStatusHandler error: %v", err)
			return
		}

		for _, execution := range workflows.GetExecutions() {
			priorityRaw := string(execution.GetSearchAttributes().GetIndexedFields()["Priority"].GetData())
			priorityRaw = strings.Trim(priorityRaw, "\"")
			priority, err := strconv.Atoi(priorityRaw)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Printf("runStatusHandler error: %v", err)
				return
			}

			workflowsByPriority[priority-1].NumberOfWorkflows++

			activitiesCompletedRaw := string(execution.GetSearchAttributes().GetIndexedFields()["ActivitiesCompleted"].GetData())
			activitiesCompletedRaw = strings.Trim(activitiesCompletedRaw, "\"")
			activitiesCompleted, err := strconv.Atoi(activitiesCompletedRaw)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Printf("runStatusHandler error: %v", err)
				return
			}

			for actComplete := 1; actComplete <= activitiesCompleted; actComplete++ {
				workflowsByPriority[priority-1].Activities[actComplete-1].NumberCompleted++
			}
		}

		totalWorkflows := len(workflows.GetExecutions())

		w.Header().Set("Content-Type", "application/json")
		enc := json.NewEncoder(w)
		if err := enc.Encode(PriorityTestRunResults{Workflows: workflowsByPriority, TotalWorkflows: totalWorkflows}); err != nil {
			return
		}
	}
}

func runStatusFairnessHandler(temporalClient client.Client) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		// runPrefix must be supplied
		runPrefix := r.URL.Query().Get("runPrefix")
		if runPrefix == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		groups := make(map[string]*FairnessSummary)

		workflows, err := temporalClient.ListWorkflow(r.Context(), &workflowservice.ListWorkflowExecutionsRequest{
			Query: fmt.Sprintf("WorkflowId STARTS_WITH \"%s\"", runPrefix),
		})
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Printf("runStatusFairnessHandler error: %v", err)
			return
		}

		for _, execution := range workflows.GetExecutions() {
			fairnessKeyRaw := string(execution.GetSearchAttributes().GetIndexedFields()["FairnessKey"].GetData())
			fairnessKey := strings.Trim(fairnessKeyRaw, "\"")

			fairnessWeightRaw := string(execution.GetSearchAttributes().GetIndexedFields()["FairnessWeight"].GetData())
			fairnessWeightRaw = strings.Trim(fairnessWeightRaw, "\"")
			fairnessWeight, err := strconv.Atoi(fairnessWeightRaw)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Printf("runStatusHandler error: %v", err)
				return
			}

			groupKey := fmt.Sprintf("%s|%d", fairnessKey, fairnessWeight)
			if _, ok := groups[groupKey]; !ok {
				activities := make([]ActivitySummary, 5)
				for i := range activities {
					activities[i].ActivityNumber = i + 1
				}

				groups[groupKey] = &FairnessSummary{
					FairnessKey:    fairnessKey,
					FairnessWeight: fairnessWeight,
					TotalWorkflows: 0,
					Activities:     activities,
				}
			}

			groups[groupKey].TotalWorkflows++

			activitiesCompletedRaw := string(execution.GetSearchAttributes().GetIndexedFields()["ActivitiesCompleted"].GetData())
			activitiesCompletedRaw = strings.Trim(activitiesCompletedRaw, "\"")
			activitiesCompleted, err := strconv.Atoi(activitiesCompletedRaw)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Printf("runStatusHandler error: %v", err)
				return
			}

			for actComplete := 1; actComplete <= activitiesCompleted; actComplete++ {
				groups[groupKey].Activities[actComplete-1].NumberCompleted++
			}
		}

		var sortedSummaries []FairnessSummary
		for _, summary := range groups {
			sortedSummaries = append(sortedSummaries, *summary)
		}
		sort.Slice(sortedSummaries, func(i int, j int) bool {
			// high weight to low weight
			return sortedSummaries[i].FairnessWeight > sortedSummaries[j].FairnessWeight
		})

		totalWorkflows := len(workflows.GetExecutions())

		w.Header().Set("Content-Type", "application/json")
		enc := json.NewEncoder(w)
		if err := enc.Encode(FairnessTestRunResults{Workflows: sortedSummaries, TotalWorkflows: totalWorkflows}); err != nil {
			return
		}
	}
}

func main() {
	temporalClient, err := client.Dial(demo.GetClientOptions())
	if err != nil {
		log.Fatalln("Unable to create Temporal Client", err)
	}
	defer temporalClient.Close()

	http.HandleFunc("/start-workflows", startWorkflowsHandler(temporalClient))
	http.HandleFunc("/run-status", runStatusHandler(temporalClient))
	http.HandleFunc("/run-status-fairness", runStatusFairnessHandler(temporalClient))

	fmt.Println("Starting server on :7080")
	if err := http.ListenAndServe(":7080", nil); err != nil {
		log.Fatal(err)
	}
}
