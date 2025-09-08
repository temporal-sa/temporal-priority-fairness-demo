package com.demo.priority.service.model;

import lombok.Data;

@Data
public class FairnessWorkflowData {
    private String fairnessKey;
    private int fairnessWeight;
    private boolean disableFairness;
}
