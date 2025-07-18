package com.demo.priority.service.workflows;

import com.demo.priority.service.activities.PriorityActivity;
import com.demo.priority.service.model.PriorityActivityData;
import com.demo.priority.service.model.PriorityWorkflowData;
import io.temporal.activity.ActivityOptions;
import io.temporal.common.Priority;
import io.temporal.common.SearchAttributeKey;
import io.temporal.spring.boot.WorkflowImpl;
import io.temporal.spring.boot.autoconfigure.properties.TemporalProperties;
import io.temporal.spring.boot.autoconfigure.properties.WorkerProperties;
import io.temporal.workflow.Workflow;
import io.temporal.workflow.WorkflowMethod;
import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;

import java.time.Duration;
import java.util.Optional;

@WorkflowImpl
public class PriorityWorkflowImpl implements PriorityWorkflow, ApplicationContextAware {
    private static ApplicationContext ctx;

    @Override
    @WorkflowMethod
    public String priorityWorkflow(PriorityWorkflowData pData) {

        PriorityActivity activity = Workflow.newActivityStub(
                PriorityActivity.class,
                ActivityOptions.newBuilder()
                        .setStartToCloseTimeout(Duration.ofSeconds(5))
                        .setTaskQueue(this.getActivityTaskQueueName())
                        .setPriority(Priority.newBuilder().setPriorityKey(pData.getPriority()).build())
                        .build()
        );

        PriorityActivityData activityData = new PriorityActivityData();
        activityData.setPriority(pData.getPriority());

        for (int counter = 1; counter <= 5; counter++)
        {
            activityData.setStepNumber(counter);
            activityData = activity.runActivity(activityData);

            Workflow.upsertTypedSearchAttributes(SearchAttributeKey.forLong("ActivitiesCompleted").valueSet((long)counter) );
        }
        return "Complete";
    }
    private String getActivityTaskQueueName()
    {
        // Parse the config to pick out the task queue for the activity. (Will be simpler once issue #1647 implemented)
        TemporalProperties props = ctx.getBean(TemporalProperties.class);
        Optional<WorkerProperties> wp =
                props.getWorkers().stream().filter(w -> w.getName().equals("PriorityActivity")).findFirst();
        return wp.get().getTaskQueue();
    }
    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        ctx = applicationContext;
    }
}
