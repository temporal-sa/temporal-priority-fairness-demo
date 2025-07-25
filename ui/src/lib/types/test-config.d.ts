export type WorkflowTestConfig = {
    workflowIdPrefix: string;
    numberOfWorkflows: number;
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