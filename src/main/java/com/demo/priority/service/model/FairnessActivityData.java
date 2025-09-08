package com.demo.priority.service.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.Collection;

@Data
public class FairnessActivityData {
    private int stepNumber;
    private String fairnessKey;
    private int fairnessWeight;
    private Collection<String> results = new ArrayList<>();
}

