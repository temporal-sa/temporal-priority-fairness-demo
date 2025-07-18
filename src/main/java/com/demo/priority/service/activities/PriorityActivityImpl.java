package com.demo.priority.service.activities;

import com.demo.priority.service.model.PriorityActivityData;
import com.demo.priority.service.model.PriorityWorkflowData;
import io.temporal.spring.boot.ActivityImpl;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
@ActivityImpl
public class PriorityActivityImpl implements PriorityActivity {

    @Override
    public PriorityActivityData runActivity(PriorityActivityData pActivityData) {
        this.pause(300);
        pActivityData.getResults().add(LocalDateTime.now().toString()
                                       + "- Activity step ["
                                       + pActivityData.getStepNumber()
                                       + "] completed");
        return pActivityData;
    }

    private void pause(int duration){

        if (duration < 1)
            duration = 200;

        try {
            Thread.sleep(duration);  //Brief snooze to
        } catch (InterruptedException e) {
            // TODO Auto-generated catch block
            e.printStackTrace();
        }
    }

}
