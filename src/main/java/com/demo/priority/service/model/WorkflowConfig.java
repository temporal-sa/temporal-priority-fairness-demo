package com.demo.priority.service.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
@NoArgsConstructor
public class WorkflowConfig {
    private String workflowIdPrefix;
    private int numberOfWorkflows = 100;
    private String mode; // "priority" or "fairness"; null/empty -> priority
    private java.util.List<Band> bands; // Optional fairness bands
    private boolean disableFairness; // When true, do not set fairness priority
}
