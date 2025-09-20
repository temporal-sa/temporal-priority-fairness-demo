package temporalpriorityfairnessdemo

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

type FairnessWorkflowData struct {
	FairnessKey     string  `json:"fairnessKey"`
	FairnessWeight  float32 `json:"fairnessWeight"`
	DisableFairness bool    `json:"disableFairness"`
}

type PriorityWorkflowData struct {
	Priority int `json:"priority"`
}

var activitiesCompleted = temporal.NewSearchAttributeKeyInt64("ActivitiesCompleted")

func FairnessWorkflow(ctx workflow.Context, data FairnessWorkflowData) (string, error) {
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Second,
	}

	if !data.DisableFairness {
		ao.Priority.FairnessKey = data.FairnessKey
		ao.Priority.FairnessWeight = data.FairnessWeight
	}

	ctx = workflow.WithActivityOptions(ctx, ao)

	activityData := ActivityData{
		FairnessKey:    data.FairnessKey,
		FairnessWeight: data.FairnessWeight,
	}

	for counter := 1; counter <= 5; counter++ {
		activityData.StepNumber = counter
		workflow.ExecuteActivity(ctx, RunActivity, activityData).Get(ctx, &activityData)

		workflow.UpsertTypedSearchAttributes(ctx, activitiesCompleted.ValueSet(int64(counter)))
	}

	return "Complete", nil
}

func PriorityWorkflow(ctx workflow.Context, data PriorityWorkflowData) (string, error) {
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Second,
		Priority: temporal.Priority{
			PriorityKey: data.Priority,
		},
	}

	activityData := ActivityData{
		Priority: data.Priority,
	}

	ctx = workflow.WithActivityOptions(ctx, ao)

	for counter := 1; counter <= 5; counter++ {
		activityData.StepNumber = counter
		workflow.ExecuteActivity(ctx, RunActivity, activityData).Get(ctx, &activityData)

		workflow.UpsertTypedSearchAttributes(ctx, activitiesCompleted.ValueSet(int64(counter)))
	}

	return "Complete", nil
}
