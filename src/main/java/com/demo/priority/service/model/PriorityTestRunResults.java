package com.demo.priority.service.model;

import io.temporal.client.WorkflowExecutionMetadata;
import io.temporal.common.SearchAttributeKey;
import lombok.Data;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Iterator;
import java.util.List;

@Data
public class PriorityTestRunResults {
    Collection<WorkflowSummary> workflowsByPriority = new ArrayList<WorkflowSummary>();
    int totalWorkflowsInTest;

    public PriorityTestRunResults(List<WorkflowExecutionMetadata> wfExecutionMetadata)
    {
        totalWorkflowsInTest = wfExecutionMetadata.size();
        SearchAttributeKey priorityKey = SearchAttributeKey.forLong("Priority");
        SearchAttributeKey activitiesCompletedKey = SearchAttributeKey.forLong("ActivitiesCompleted");


        // initialise all counters to 0
        for (int priority = 1; priority <= 5; priority++) {
            WorkflowSummary workflowSummary = new WorkflowSummary();
            workflowSummary.setWorkflowPriority(priority);
            workflowSummary.setNumberOfWorkflows(0);
            workflowsByPriority.add(workflowSummary);
        }
// TODO - Add in the activity setting to 0

        Iterator<WorkflowExecutionMetadata> iterator = wfExecutionMetadata.iterator();
        while (iterator.hasNext())
        {
         WorkflowExecutionMetadata workflowExecutionMetadata = iterator.next();
         long wfPriority = (long)workflowExecutionMetadata.getTypedSearchAttributes().get(priorityKey);
         WorkflowSummary wfSummary = ((ArrayList<WorkflowSummary>)workflowsByPriority).get((int)wfPriority - 1);
         wfSummary.setNumberOfWorkflows(wfSummary.getNumberOfWorkflows() + 1);

         // For each workflow add the activity progress counts up.
         long activitiesCompleted = (long)workflowExecutionMetadata.getTypedSearchAttributes().get(activitiesCompletedKey);
         for (int actComplete = 1; actComplete <= activitiesCompleted; actComplete++) {
             incrementActivityCompleted(actComplete, wfSummary);
         }
        }
    } // End PriorityTestRunResults
    private void incrementActivityCompleted(int actComplete, WorkflowSummary wfSummary) {
        System.out.println("Summary priority we are looking at [" + wfSummary.getWorkflowPriority() + "]");
        ActivitySummary actSummary = null;
        try {
             actSummary = ((ArrayList<ActivitySummary>) wfSummary.getActivities()).get(actComplete - 1);
        } catch (Exception ex)
        {
            // Swallowing the exception as it should only happen if not found then we will create....
        }
        if ( actSummary == null ) {
            ActivitySummary activitySummary = new ActivitySummary();
            activitySummary.setActivityNumber(actComplete);
            activitySummary.setNumberCompleted(1);
            ((ArrayList<ActivitySummary>) wfSummary.getActivities()).add(activitySummary);
        }
        else
        {
            actSummary.setNumberCompleted(actSummary.getNumberCompleted() + 1);
        }
    } // End incrementActivityCompleted
}
