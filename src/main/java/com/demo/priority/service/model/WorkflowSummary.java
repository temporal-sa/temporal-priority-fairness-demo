package com.demo.priority.service.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.Collection;

@Data
public class WorkflowSummary {
    private int workflowPriority;
    private long numberOfWorkflows = 0;
    private Collection<ActivitySummary> activities = new ArrayList<ActivitySummary>();
}
