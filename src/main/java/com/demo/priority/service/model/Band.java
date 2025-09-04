package com.demo.priority.service.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class Band {
    private String key;
    private int weight;
    // Optional: number of workflows to start for this band (fairness mode)
    private Integer count;
}
