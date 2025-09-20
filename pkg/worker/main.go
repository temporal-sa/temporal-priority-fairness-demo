package main

import (
	"log"

	"go.temporal.io/sdk/client"

	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"

	demo "github.com/temporal-sa/temporal-priority-fairness-demo/pkg"
)

func main() {
	c, err := client.Dial(demo.GetClientOptions())
	if err != nil {
		log.Fatalln("Unable to create client", err)
	}
	defer c.Close()

	w := worker.New(c, demo.GetTaskQueue(), worker.Options{
		MaxConcurrentActivityExecutionSize: 5,
	})

	w.RegisterWorkflowWithOptions(demo.PriorityWorkflow, workflow.RegisterOptions{
		Name: "priorityWorkflow",
	})
	w.RegisterWorkflowWithOptions(demo.FairnessWorkflow, workflow.RegisterOptions{
		Name: "fairnessWorkflow",
	})

	w.RegisterActivity(demo.RunActivity)

	err = w.Run(worker.InterruptCh())
	if err != nil {
		log.Fatalln("Unable to start worker", err)
	}
}
