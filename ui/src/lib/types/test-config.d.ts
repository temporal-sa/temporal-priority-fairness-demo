export type Mode = 'priority' | 'fairness';

export type Band = {
    key: string;
    weight: number;
    count?: number; // optional per-band workflow count (fairness)
}

export type WorkflowTestConfig = {
    workflowIdPrefix: string;
    numberOfWorkflows: number;
    mode?: Mode;
    bands?: Band[];
    disableFairness?: boolean; // when true, do not set fairness priority
}

export type Activity = {
    activityNumber: number;
    numberCompleted: number;
}

export type WorkflowByPriority = {
    workflowPriority: number;
    numberOfWorkflows: number;
    activities: Activity[];
}

export type TestResults = {
    workflowsByPriority: WorkflowByPriority[];
    totalWorkflowsInTest: number;
}

export type WorkflowByFairness = {
    fairnessKey: string;
    fairnessWeight: number;
    numberOfWorkflows: number;
    activities: Activity[];
}

export type FairnessTestResults = {
    workflowsByFairness: WorkflowByFairness[];
    totalWorkflowsInTest: number;
}
