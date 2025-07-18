package com.demo.priority.service.activities;

import com.demo.priority.service.model.PriorityActivityData;
import io.temporal.activity.ActivityInterface;

@ActivityInterface
public interface PriorityActivity {
    PriorityActivityData runActivity(PriorityActivityData pActivityData);
}
