import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Card,
    CardContent,
    LinearProgress,
    Box,
    Chip,
    Grid,
    Alert,
    CircularProgress,
    IconButton,
    Tooltip
} from '@mui/material';
import { Refresh } from '@mui/icons-material';
import axios from 'axios';
import type { TestResults, WorkflowByPriority, Activity } from '../../lib/types/test-config';
import { useSearchParams } from 'react-router-dom';

interface TestResultsPageProps {
    runPrefix: string;
}

export default function TestResultsPage({ runPrefix }: TestResultsPageProps) {
    const [searchParams] = useSearchParams();
    const mode = (searchParams.get('mode') || 'priority').toLowerCase();
    const [testResults, setTestResults] = useState<TestResults | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const checkAllWorkflowsComplete = (results: TestResults) => {
        return results.workflowsByPriority.every(workflow => 
            calculateOverallProgress(workflow) === 100
        );
    };

    const fetchResults = async () => {
        if (!runPrefix) return;
        
        setLoading(true);
        setError(null);
        
        try {
            const response = await axios.get(`/api/run-status?runPrefix=${encodeURIComponent(runPrefix)}`);
            setTestResults(response.data);
            
            // Auto-switch to manual refresh when all workflows are complete
            if (autoRefresh && checkAllWorkflowsComplete(response.data)) {
                setAutoRefresh(false);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch results');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchResults();
    }, [runPrefix]);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchResults, 1500); // Refresh every 1.5s while in progress
        return () => clearInterval(interval);
    }, [autoRefresh, runPrefix]);

    const calculateActivityProgress = (activity: Activity, totalWorkflows: number) => {
        return (activity.numberCompleted / totalWorkflows) * 100;
    };

    const calculateOverallProgress = (workflow: WorkflowByPriority) => {
        if (workflow.activities.length === 0) return 0;
        const totalActivities = workflow.activities.length;
        const completedActivities = workflow.activities.filter(
            activity => activity.numberCompleted === workflow.numberOfWorkflows
        ).length;
        return (completedActivities / totalActivities) * 100;
    };

    const getPriorityColor = (priority: number) => {
        const colors = ['#f44336', '#ff9800', '#ffc107', '#4caf50', '#2196f3'];
        return colors[priority - 1] || '#9e9e9e';
    };

    const getProgressColor = (progress: number) => {
        if (progress === 100) return 'success';
        if (progress >= 50) return 'primary';
        if (progress >= 25) return 'warning';
        return 'error';
    };

    if (!runPrefix) {
        return (
            <Container sx={{ mt: 3 }}>
                <Alert severity="info">Please provide a run prefix to view results.</Alert>
            </Container>
        );
    }

    return (
        <Container sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" component="h1">
                        Test Results: {runPrefix}
                    </Typography>
                    <Chip label={`Mode: ${mode === 'fairness' ? 'Fairness' : 'Priority'}`} size="small" sx={{ mt: 0.5 }} />
                    {testResults && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {testResults.totalWorkflowsInTest} workflows in test
                        </Typography>
                    )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Tooltip title="Refresh Results">
                        <IconButton onClick={fetchResults} disabled={loading}>
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                    <Chip 
                        label={autoRefresh ? "Auto-refreshing" : "Manual refresh"} 
                        color={autoRefresh ? "success" : "default"}
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        clickable
                    />
                </Box>
            </Box>

            {loading && !testResults && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                    <CircularProgress />
                </Box>
            )}

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {testResults && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {testResults.workflowsByPriority.map((workflow: WorkflowByPriority) => (
                            <Box key={workflow.workflowPriority}>
                                <Card>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                            <Chip
                                                label={`Priority ${workflow.workflowPriority}`}
                                                sx={{
                                                    backgroundColor: getPriorityColor(workflow.workflowPriority),
                                                    color: 'white',
                                                    fontWeight: 'bold'
                                                }}
                                            />
                                            <Typography variant="body2" color="text.secondary">
                                                {workflow.numberOfWorkflows} workflows
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {calculateOverallProgress(workflow).toFixed(1)}% complete
                                            </Typography>
                                            <LinearProgress
                                                variant="determinate"
                                                value={calculateOverallProgress(workflow)}
                                                color={getProgressColor(calculateOverallProgress(workflow))}
                                                sx={{ height: 8, borderRadius: 4, flex: 1, ml: 2 }}
                                            />
                                        </Box>

                                        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 2, flexWrap: 'wrap', pb: 1 }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ flex: '0 0 80px' }}>
                                                Activities
                                            </Typography>
                                            {[1, 2, 3, 4, 5].map((activityNum) => {
                                                const activity = workflow.activities.find(a => a.activityNumber === activityNum) || 
                                                    { activityNumber: activityNum, numberCompleted: 0 };
                                                const progress = calculateActivityProgress(activity, workflow.numberOfWorkflows);
                                                return (
                                                    <Box key={activityNum} sx={{ flex: '1 1 160px', minWidth: 160 }}>
                                                        <Box sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <Typography variant="body2" fontWeight="medium" sx={{ minWidth: 'fit-content' }}>
                                                                    {activityNum}
                                                                </Typography>
                                                                <LinearProgress
                                                                    variant="determinate"
                                                                    value={progress}
                                                                    color={getProgressColor(progress)}
                                                                    sx={{ height: 6, borderRadius: 3, flex: 1, ml: 1 }}
                                                                />
                                                            </Box>
                                                        </Box>
                                                    </Box>
                                                );
                                            })}
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Box>
                        ))}
                </Box>
            )}
        </Container>
    );
} 
