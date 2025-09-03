import React, { useState, useEffect, useRef } from 'react';
import {
    Container,
    Typography,
    Card,
    CardContent,
    LinearProgress,
    Box,
    Chip,
    Alert,
    CircularProgress,
    IconButton,
    Tooltip
} from '@mui/material';
import { Refresh } from '@mui/icons-material';
import axios from 'axios';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';
import type { FairnessTestResults, WorkflowByFairness, Activity } from '../../lib/types/test-config';

interface FairnessResultsPageProps {
    runPrefix: string;
}

export default function FairnessResultsPage({ runPrefix }: FairnessResultsPageProps) {
    const [testResults, setTestResults] = useState<FairnessTestResults | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    // Rolling metrics (client-only) to visualize fairness over time
    const prevStepsRef = useRef<Record<string, number>>({});
    const rateSamplesRef = useRef<Record<string, number[]>>({});
    const t0Ref = useRef<number | null>(null);
    const lastTsRef = useRef<number | null>(null);
    const historyRef = useRef<Array<{ t: number; bands: Record<string, number> }>>([]);
    const eventStreamRef = useRef<string[]>([]);

    const [summary, setSummary] = useState<{
        chartData: Array<Record<string, number>>;
        etaSecondsById: Record<string, number | null>;
        rateById: Record<string, number>;
        labelsById: Record<string, string>;
        idsInOrder: string[];
        eventStream: string[];
        progressPctById: Record<string, number>;
    }>({ chartData: [], etaSecondsById: {}, rateById: {}, labelsById: {}, idsInOrder: [], eventStream: [], progressPctById: {} });

    const checkAllWorkflowsComplete = (results: FairnessTestResults) => {
        return results.workflowsByFairness.every(workflow => 
            calculateOverallProgress(workflow) === 100
        );
    };

    const fetchResults = async () => {
        if (!runPrefix) return;
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`/api/run-status-fairness?runPrefix=${encodeURIComponent(runPrefix)}`);
            setTestResults(response.data);
            updateSummaryFromResults(response.data);
            if (autoRefresh && checkAllWorkflowsComplete(response.data)) {
                setAutoRefresh(false);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch results');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchResults(); }, [runPrefix]);
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchResults, 3000);
        return () => clearInterval(interval);
    }, [autoRefresh, runPrefix]);

    const calculateActivityProgress = (activity: Activity, totalWorkflows: number) => {
        return (activity.numberCompleted / totalWorkflows) * 100;
    };

    const calculateOverallProgress = (workflow: WorkflowByFairness) => {
        if (workflow.activities.length === 0) return 0;
        const totalActivities = workflow.activities.length;
        const completedActivities = workflow.activities.filter(
            activity => activity.numberCompleted === workflow.numberOfWorkflows
        ).length;
        return (completedActivities / totalActivities) * 100;
    };

    const getKeyColor = (key: string) => {
        const palette: Record<string, string> = {
            'first-class': '#6a1b9a',
            'business-class': '#1976d2',
            'economy-class': '#2e7d32'
        };
        return palette[key] || '#9e9e9e';
    };

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const bandId = (wf: WorkflowByFairness) => `${wf.fairnessKey}|${wf.fairnessWeight}`;
    const bandLabel = (wf: WorkflowByFairness) => `${wf.fairnessKey} (w=${wf.fairnessWeight})`;
    const totalStepsFor = (wf: WorkflowByFairness) => wf.numberOfWorkflows * 5;
    const completedStepsFor = (wf: WorkflowByFairness) => wf.activities.reduce((s, a) => s + a.numberCompleted, 0);

    const updateSummaryFromResults = (results: FairnessTestResults) => {
        const now = Date.now();
        if (t0Ref.current == null) t0Ref.current = now;
        const deltaSec = lastTsRef.current ? Math.max(0.5, (now - lastTsRef.current) / 1000) : 3; // fallback to ~refresh interval
        lastTsRef.current = now;

        const etaSecondsById: Record<string, number | null> = {};
        const rateById: Record<string, number> = {};
        const labelsById: Record<string, string> = {};
        const progressPctById: Record<string, number> = {};
        const idsInOrder: string[] = [...results.workflowsByFairness]
            .sort((a, b) => b.fairnessWeight - a.fairnessWeight || a.fairnessKey.localeCompare(b.fairnessKey))
            .map(b => bandId(b));

        // Update per-band rates, ETAs, progress, and event stream
        for (const wf of results.workflowsByFairness) {
            const id = bandId(wf);
            const stepsTotal = totalStepsFor(wf);
            const stepsCompleted = completedStepsFor(wf);
            const prev = prevStepsRef.current[id] ?? 0;
            const delta = Math.max(0, stepsCompleted - prev);
            prevStepsRef.current[id] = stepsCompleted;

            // Update rolling rate samples (steps/sec)
            const samples = rateSamplesRef.current[id] ?? [];
            samples.push(delta / deltaSec);
            if (samples.length > 5) samples.shift();
            rateSamplesRef.current[id] = samples;
            const rate = avg(samples);
            rateById[id] = rate;

            const remaining = Math.max(0, stepsTotal - stepsCompleted);
            etaSecondsById[id] = rate > 0 ? remaining / rate : null;
            labelsById[id] = bandLabel(wf);
            progressPctById[id] = stepsTotal > 0 ? (stepsCompleted / stepsTotal) * 100 : 0;

            // Event stream ticks (cap total to 100)
            const ticksToAdd = Math.min(delta, 50); // avoid flooding UI in one refresh
            for (let i = 0; i < ticksToAdd; i++) eventStreamRef.current.push(id);
        }
        if (eventStreamRef.current.length > 100) {
            eventStreamRef.current.splice(0, eventStreamRef.current.length - 100);
        }

        // Append history point for chart
        const t = (now - (t0Ref.current ?? now)) / 1000;
        const bandsPoint: Record<string, number> = {};
        for (const wf of results.workflowsByFairness) {
            const id = bandId(wf);
            bandsPoint[id] = progressPctById[id] ?? 0;
        }
        historyRef.current.push({ t, bands: bandsPoint });
        if (historyRef.current.length > 40) historyRef.current.shift();

        // Recharts data shape: { t, [id1]: pct, [id2]: pct, ... }
        const chartData = historyRef.current.map(p => ({
            t: p.t,
            ...p.bands
        }));

        setSummary({
            chartData,
            etaSecondsById,
            rateById,
            labelsById,
            idsInOrder,
            eventStream: [...eventStreamRef.current],
            progressPctById,
        });
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
                        Fairness Results: {runPrefix}
                    </Typography>
                    <Chip label={`Mode: Fairness`} size="small" sx={{ mt: 0.5 }} />
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

            {/* Fairness summary visuals */}
            {summary.chartData.length > 0 && (
                <Card sx={{ mb: 3 }}>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>Cumulative Progress by Band</Typography>
                        <Box sx={{ width: '100%', height: 220 }}>
                            <ResponsiveContainer>
                                <LineChart data={summary.chartData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="t" tickFormatter={(s) => `${Math.round(Number(s))}s`} />
                                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                                    <RechartsTooltip formatter={(v: any) => `${(Number(v) || 0).toFixed(1)}%`} labelFormatter={(l) => `${Math.round(Number(l))}s`} />
                                    <Legend />
                                    {summary.idsInOrder.map((id) => {
                                        const key = id.split('|')[0];
                                        return (
                                            <Line key={id} type="monotone" dataKey={id} stroke={getKeyColor(key)} dot={false} strokeWidth={2} />
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        </Box>

                        {/* Event stream: last ~100 activity completions */}
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Recent activity completions</Typography>
                            {/* Full-width, larger tick strip */}
                            <Box sx={{ width: '100%' }}>
                                <Box sx={{
                                    display: 'flex',
                                    flexWrap: 'nowrap',
                                    overflow: 'hidden',
                                    border: '1px solid #e0e0e0',
                                    borderRadius: 1,
                                    p: 0.75,
                                    width: '100%'
                                }}>
                                    {summary.eventStream.map((id, i) => {
                                        const key = id.split('|')[0];
                                        return (
                                            <Box
                                                key={`${i}-${id}`}
                                                sx={{
                                                    width: 10,
                                                    height: 18,
                                                    backgroundColor: getKeyColor(key),
                                                    mr: 1,
                                                    borderRadius: 0.75
                                                }}
                                            />
                                        );
                                    })}
                                </Box>
                            </Box>
                            {/* ETA chips on a new line below the strip */}
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
                                {summary.idsInOrder.map((id) => {
                                    const key = id.split('|')[0];
                                    const label = summary.labelsById[id] || key;
                                    const eta = summary.etaSecondsById[id];
                                    const pct = summary.progressPctById[id] || 0;
                                    return (
                                        <Chip
                                            key={`eta-${id}`}
                                            label={`${label} ~${eta != null ? Math.max(0, Math.round(eta)) : '—'}s`}
                                            sx={{ backgroundColor: '#f5f5f5' }}
                                            icon={
                                                <Box sx={{ display: 'flex', alignItems: 'center', pl: 0.5 }}>
                                                    <CircularProgress
                                                        variant="determinate"
                                                        value={Math.min(100, Math.max(0, pct))}
                                                        size={18}
                                                        sx={{ color: getKeyColor(key) }}
                                                    />
                                                </Box>
                                            }
                                        />
                                    );
                                })}
                            </Box>
                        </Box>
                    </CardContent>
                </Card>
            )}

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
                    {[...testResults.workflowsByFairness]
                      .sort((a, b) => b.fairnessWeight - a.fairnessWeight || a.fairnessKey.localeCompare(b.fairnessKey))
                      .map((workflow: WorkflowByFairness) => (
                        <Box key={`${workflow.fairnessKey}-${workflow.fairnessWeight}`}>
                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                        <Chip
                                            label={`${workflow.fairnessKey} (w=${workflow.fairnessWeight})`}
                                            sx={{
                                                backgroundColor: getKeyColor(workflow.fairnessKey),
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
                                        {/* Throughput hint */}
                                        <Typography variant="body2" color="text.secondary">
                                            ~{(summary.rateById[bandId(workflow)] ?? 0).toFixed(2)} steps/s
                                        </Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={calculateOverallProgress(workflow)}
                                            color={getProgressColor(calculateOverallProgress(workflow))}
                                            sx={{ height: 8, borderRadius: 4, flex: 1, ml: 2 }}
                                        />
                                    </Box>

                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', pb: 1 }}>
                                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 'fit-content' }}>
                                            Activities
                                        </Typography>
                                        {[1, 2, 3, 4, 5].map((activityNum) => {
                                            const activity = workflow.activities.find(a => a.activityNumber === activityNum) || 
                                                { activityNumber: activityNum, numberCompleted: 0 };
                                            const progress = calculateActivityProgress(activity, workflow.numberOfWorkflows);
                                            return (
                                                <Box key={activityNum} sx={{ minWidth: 200, flex: '1' }}>
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
