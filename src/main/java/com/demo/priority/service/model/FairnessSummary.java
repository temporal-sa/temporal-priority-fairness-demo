package com.demo.priority.service.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.Collection;

@Data
public class FairnessSummary {
    private String fairnessKey;
    private int fairnessWeight;
    private long numberOfWorkflows = 0;
    private Collection<ActivitySummary> activities = new ArrayList<ActivitySummary>();
}

