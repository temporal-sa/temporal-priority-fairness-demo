package com.demo.priority.service.model;

import io.temporal.client.WorkflowExecutionMetadata;
import io.temporal.common.SearchAttributeKey;
import lombok.Data;

import java.util.*;

@Data
public class FairnessTestRunResults {
    Collection<FairnessSummary> workflowsByFairness = new ArrayList<>();
    int totalWorkflowsInTest;

    public FairnessTestRunResults(List<WorkflowExecutionMetadata> wfExecutionMetadata) {
        totalWorkflowsInTest = wfExecutionMetadata.size();
        SearchAttributeKey<String> fairnessKeyAttr = SearchAttributeKey.forKeyword("FairnessKey");
        SearchAttributeKey<Long> fairnessWeightAttr = SearchAttributeKey.forLong("FairnessWeight");
        SearchAttributeKey<Long> activitiesCompletedKey = SearchAttributeKey.forLong("ActivitiesCompleted");

        Map<String, FairnessSummary> groups = new LinkedHashMap<>();

        for (WorkflowExecutionMetadata meta : wfExecutionMetadata) {
            String fairnessKey = (String) meta.getTypedSearchAttributes().get(fairnessKeyAttr);
            if (fairnessKey == null) fairnessKey = "";
            long weightLong = 0L;
            Long weightValue = (Long) meta.getTypedSearchAttributes().get(fairnessWeightAttr);
            if (weightValue != null) weightLong = weightValue;

            String groupKey = fairnessKey + "|" + weightLong;
            FairnessSummary summary = groups.get(groupKey);
            if (summary == null) {
                summary = new FairnessSummary();
                summary.setFairnessKey(fairnessKey);
                summary.setFairnessWeight((int) weightLong);
                summary.setNumberOfWorkflows(0);
                groups.put(groupKey, summary);
            }

            summary.setNumberOfWorkflows(summary.getNumberOfWorkflows() + 1);

            long activitiesCompleted = 0L;
            Long ac = (Long) meta.getTypedSearchAttributes().get(activitiesCompletedKey);
            if (ac != null) activitiesCompleted = ac;
            for (int actComplete = 1; actComplete <= activitiesCompleted; actComplete++) {
                incrementActivityCompleted(actComplete, summary);
            }
        }

        java.util.List<FairnessSummary> sorted = new java.util.ArrayList<>(groups.values());
        sorted.sort(java.util.Comparator
                .comparingInt(FairnessSummary::getFairnessWeight)
                .reversed()
                .thenComparing(FairnessSummary::getFairnessKey));
        workflowsByFairness.addAll(sorted);
    }

    private void incrementActivityCompleted(int actComplete, FairnessSummary summary) {
        ActivitySummary actSummary = null;
        try {
            actSummary = ((ArrayList<ActivitySummary>) summary.getActivities()).get(actComplete - 1);
        } catch (Exception ignored) { }
        if (actSummary == null) {
            ActivitySummary activitySummary = new ActivitySummary();
            activitySummary.setActivityNumber(actComplete);
            activitySummary.setNumberCompleted(1);
            ((ArrayList<ActivitySummary>) summary.getActivities()).add(activitySummary);
        } else {
            actSummary.setNumberCompleted(actSummary.getNumberCompleted() + 1);
        }
    }
}
