package com.demo.priority.service.activities;

import com.demo.priority.service.model.FairnessActivityData;
import io.temporal.activity.ActivityInterface;

@ActivityInterface
public interface FairnessActivity {
    FairnessActivityData runActivity(FairnessActivityData data);
}

