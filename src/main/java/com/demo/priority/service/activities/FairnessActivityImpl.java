package com.demo.priority.service.activities;

import com.demo.priority.service.model.FairnessActivityData;
import io.temporal.spring.boot.ActivityImpl;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
@ActivityImpl
public class FairnessActivityImpl implements FairnessActivity {

    @Override
    public FairnessActivityData runActivity(FairnessActivityData data) {
        this.pause(300);
        data.getResults().add(LocalDateTime.now() + " - Activity step [" + data.getStepNumber() + "] completed");
        return data;
    }

    private void pause(int duration) {
        if (duration < 1) duration = 200;
        try {
            Thread.sleep(duration);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}

