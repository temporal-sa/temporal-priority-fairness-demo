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
         //workflowExecutionMetadata.getTypedSearchAttributes(priorityKey);
// TODO - Analyse results of query and look to populate the object we return, accumulating results according.
        }
    }
}
