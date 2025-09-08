package com.demo.priority.service.workflows;

import com.demo.priority.service.model.FairnessWorkflowData;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;

@WorkflowInterface
public interface FairnessWorkflow {
    @WorkflowMethod
    String fairnessWorkflow(FairnessWorkflowData data);
}

