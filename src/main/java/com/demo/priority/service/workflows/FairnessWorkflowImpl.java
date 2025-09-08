package com.demo.priority.service.workflows;

import com.demo.priority.service.activities.FairnessActivity;
import com.demo.priority.service.model.FairnessActivityData;
import com.demo.priority.service.model.FairnessWorkflowData;
import io.temporal.activity.ActivityOptions;
import io.temporal.common.SearchAttributeKey;
import io.temporal.common.Priority;
import io.temporal.spring.boot.WorkflowImpl;
import io.temporal.workflow.Workflow;
import io.temporal.workflow.WorkflowMethod;

import java.time.Duration;

@WorkflowImpl
public class FairnessWorkflowImpl implements FairnessWorkflow {

    @Override
    @WorkflowMethod
    public String fairnessWorkflow(FairnessWorkflowData data) {
        ActivityOptions.Builder opts = ActivityOptions.newBuilder()
                .setStartToCloseTimeout(Duration.ofSeconds(5))
                .setTaskQueue("fairness-queue");
        if (!data.isDisableFairness()) {
            opts.setPriority(Priority.newBuilder()
                    .setFairnessKey(data.getFairnessKey())
                    .setFairnessWeight((float) data.getFairnessWeight())
                    .build());
        }
        FairnessActivity activity = Workflow.newActivityStub(FairnessActivity.class, opts.build());

        FairnessActivityData activityData = new FairnessActivityData();
        activityData.setFairnessKey(data.getFairnessKey());
        activityData.setFairnessWeight(data.getFairnessWeight());

        for (int counter = 1; counter <= 5; counter++) {
            activityData.setStepNumber(counter);
            activityData = activity.runActivity(activityData);
            Workflow.upsertTypedSearchAttributes(SearchAttributeKey.forLong("ActivitiesCompleted").valueSet((long) counter));
        }
        return "Complete";
    }
}
