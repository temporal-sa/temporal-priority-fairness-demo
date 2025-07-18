package com.demo.priority.service.model;

import lombok.Data;

import java.util.ArrayList;
import java.util.Collection;

@Data
public class PriorityActivityData {
    private int stepNumber;
    private int priority;
    private Collection<String> results = new ArrayList<>();
}
