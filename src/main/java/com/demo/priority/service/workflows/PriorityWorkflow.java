package com.demo.priority.service.workflows;

import com.demo.priority.service.model.PriorityWorkflowData;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;

@WorkflowInterface
public interface PriorityWorkflow {
    @WorkflowMethod
    String priorityWorkflow(PriorityWorkflowData pData);
}
