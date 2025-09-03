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
  Legend,
  ReferenceLine,
  ReferenceDot,
  BarChart,
  Bar,
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
    const finishTimesRef = useRef<Record<string, number>>({}); // seconds since t0 when band first hit 100%
    const eventStreamRef = useRef<Array<{ id: string; ts: number }>>([]);

    const [summary, setSummary] = useState<{
        chartData: Array<Record<string, number>>;
        etaSecondsById: Record<string, number | null>;
        rateById: Record<string, number>;
        labelsById: Record<string, string>;
        idsInOrder: string[];
        progressPctById: Record<string, number>;
        chartMaxX: number; // seconds domain max for X axis
        binnedStream: Array<Record<string, number>>; // kept for potential future use
        eventStream: Array<{ id: string; ts: number }>; // for tick strip rendering
    }>({ chartData: [], etaSecondsById: {}, rateById: {}, labelsById: {}, idsInOrder: [], progressPctById: {}, chartMaxX: 60, binnedStream: [], eventStream: [] });

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
        const interval = setInterval(fetchResults, 1500); // Refresh every 1.5s while in progress
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
        // Reserved colors for standard demo bands
        const reserved: Record<string, string> = {
            'first-class': '#6a1b9a', // purple
            'business-class': '#1976d2', // blue
            'economy-class': '#2e7d32', // green
        };
        if (reserved[key]) return reserved[key];

        // Interesting palette for additional bands (avoid duplicates with reserved)
        const extra = [
            '#ff6f00', // deep orange
            '#00acc1', // cyan
            '#d81b60', // pink
            '#8e24aa', // violet
            '#5e35b1', // indigo
            '#00897b', // teal
            '#c0ca33', // lime
            '#ef6c00', // orange
            '#455a64', // blue grey
        ];
        // Deterministic pick based on key hash
        let h = 0;
        for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
        return extra[h % extra.length];
    };

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const bandId = (wf: WorkflowByFairness) => `${wf.fairnessKey}|${wf.fairnessWeight}`;
    const bandLabel = (wf: WorkflowByFairness) => `${wf.fairnessKey} (w=${wf.fairnessWeight})`;
    const totalStepsFor = (wf: WorkflowByFairness) => wf.numberOfWorkflows * 5;
    const completedStepsFor = (wf: WorkflowByFairness) => wf.activities.reduce((s, a) => s + a.numberCompleted, 0);

    const updateSummaryFromResults = (results: FairnessTestResults) => {
        const now = Date.now();
        if (t0Ref.current == null) t0Ref.current = now;
        const deltaSec = lastTsRef.current ? Math.max(0.25, (now - lastTsRef.current) / 1000) : 1.5; // fallback aligned with 1.5s refresh
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

            // Track finish times (first time reaching 100%)
            if ((progressPctById[id] ?? 0) >= 100 && finishTimesRef.current[id] == null) {
                const t = (now - (t0Ref.current ?? now)) / 1000;
                finishTimesRef.current[id] = t;
            }

            // Event stream ticks with timestamp (cap total size later)
            const ticksToAdd = Math.min(delta, 50); // avoid flooding UI in one refresh
            for (let i = 0; i < ticksToAdd; i++) eventStreamRef.current.push({ id, ts: now });
        }
        // Keep only a bounded number of recent events (count-based window)
        const maxEvents = 200;
        if (eventStreamRef.current.length > maxEvents) {
            eventStreamRef.current.splice(0, eventStreamRef.current.length - maxEvents);
        }

        // Append history point for chart
        const t = (now - (t0Ref.current ?? now)) / 1000;
        const bandsPoint: Record<string, number> = {};
        for (const wf of results.workflowsByFairness) {
            const id = bandId(wf);
            bandsPoint[id] = progressPctById[id] ?? 0;
        }
        historyRef.current.push({ t, bands: bandsPoint });
        // Keep a longer history so curves don't appear to "start late" at faster refresh intervals.
        const maxSamples = 240; // ~120s at 500ms interval
        if (historyRef.current.length > maxSamples) historyRef.current.shift();

        // Recharts data shape: { t, [id1]: pct, [id2]: pct, ... }
        const chartData = historyRef.current.map(p => ({
            t: p.t,
            ...p.bands
        }));

        // Compute a more static X domain: step up to 30s, 60s, 90s, 120s, etc., based on elapsed/finish times only
        const tNow = (now - (t0Ref.current ?? now)) / 1000;
        const maxFinish = Object.values(finishTimesRef.current).reduce((m, v) => Math.max(m, v ?? 0), 0);
        const rawMax = Math.max(tNow, maxFinish);
        // Non-linear step bounds for a more intuitive axis: 10s, 25s, 60s, 120s, 240s, then 60s steps
        const stepBounds = [10, 25, 60, 120, 240];
        let chartMaxX = stepBounds.find(b => rawMax <= b) ?? Math.ceil(rawMax / 60) * 60;

        // Build 10-bin stacked data from recent event stream (last 30s)
        const bins = 10;
        const binSizeSec = 3;
        const binned: Array<Record<string, number>> = [];
        for (let i = 0; i < bins; i++) {
            const bin: Record<string, number> = { bin: (i * binSizeSec) as unknown as number };
            for (const id of idsInOrder) bin[id] = 0;
            binned.push(bin);
        }
        // (Optional) binned data retained for future stacked view; left empty by default.

        setSummary({
            chartData,
            etaSecondsById,
            rateById,
            labelsById,
            idsInOrder,
            progressPctById,
            chartMaxX,
            binnedStream: binned,
            eventStream: [...eventStreamRef.current],
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
                        <Box sx={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer>
                                <LineChart data={summary.chartData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="t"
                                        type="number"
                                        domain={[0, Math.ceil(summary.chartMaxX)]}
                                        tickFormatter={(s) => `${Math.round(Number(s))}s`}
                                    />
                                    <YAxis domain={[0, 100]} ticks={[0,10,20,30,40,50,60,70,80,90,100]} tickFormatter={(v) => `${v}%`} />
                                    <RechartsTooltip formatter={(v: any) => `${(Number(v) || 0).toFixed(1)}%`} labelFormatter={(l) => `${Math.round(Number(l))}s`} />
                                    <Legend />
                                    {summary.idsInOrder.map((id) => {
                                        const key = id.split('|')[0];
                                        const name = summary.labelsById[id] || key;
                                        return (
                                            <Line key={id} type="monotone" dataKey={id} stroke={getKeyColor(key)} dot={false} strokeWidth={2} name={name} />
                                        );
                                    })}
                                    {/* Current value dots and ETA/Finish reference lines */}
                                    {summary.idsInOrder.map((id) => {
                                        const key = id.split('|')[0];
                                        const color = getKeyColor(key);
                                        const lastPoint = summary.chartData[summary.chartData.length - 1];
                                        const curT = lastPoint ? Number(lastPoint.t) : 0;
                                        const curY = lastPoint ? Number(lastPoint[id] || 0) : 0;
                                        const finishedAt = (finishTimesRef.current[id]);
                                        const eta = summary.etaSecondsById[id];
                                        return (
                                            <React.Fragment key={`refs-${id}`}>
                                                {lastPoint && (
                                                    <ReferenceDot x={curT} y={curY} r={3} fill={color} stroke={color} label={{ value: `${curY.toFixed(0)}%`, position: 'right', fill: '#666', fontSize: 12 }} />
                                                )}
                                                {finishedAt != null ? (
                                                    <ReferenceLine x={finishedAt} stroke={color} strokeDasharray="4 4" label={{ value: `Finished ${Math.round(finishedAt)}s`, position: 'top', fill: '#666', fontSize: 12 }} />
                                                ) : eta != null ? (
                                                    <ReferenceLine x={curT + eta} stroke={color} strokeDasharray="4 4" label={{ value: `ETA ~${Math.max(0, Math.round(eta))}s`, position: 'top', fill: '#666', fontSize: 12 }} />
                                                ) : null}
                                            </React.Fragment>
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        </Box>

                        {/* Event stream: last ~100 activity completions */}
                        {/* Centered, prominent ETA/progress chips */}
                        <Box sx={{ mt: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                                {summary.idsInOrder
                                  .map((id, idx) => {
                                    const key = id.split('|')[0];
                                    const label = summary.labelsById[id] || key;
                                    const eta = summary.etaSecondsById[id];
                                    const pct = summary.progressPctById[id] || 0;
                                    const orderBadge = `${idx + 1}.`;
                                    const suffix = finishTimesRef.current[id] != null
                                        ? ` Finished`
                                        : ` · ~${eta != null ? Math.max(0, Math.round(eta)) : '—'}s`;
                                    return (
                                        <Chip
                                            key={`eta-${id}`}
                                            label={`${orderBadge} ${label} ${Math.round(pct)}%${suffix}`}
                                            sx={{
                                                backgroundColor: '#f5f5f5',
                                                px: 1.5,
                                                py: 1,
                                                '& .MuiChip-label': { fontSize: '1rem', fontWeight: 600 }
                                            }}
                                            icon={
                                                <Box sx={{ display: 'flex', alignItems: 'center', pl: 0.5 }}>
                                                    <CircularProgress
                                                        variant="determinate"
                                                        value={Math.min(100, Math.max(0, pct))}
                                                        size={24}
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
                                            {(summary.progressPctById[bandId(workflow)] ?? (completedStepsFor(workflow) / Math.max(1, totalStepsFor(workflow)) * 100)).toFixed(1)}% complete
                                        </Typography>
                                        {/* Throughput hint */}
                                        <Typography variant="body2" color="text.secondary">
                                            ~{(summary.rateById[bandId(workflow)] ?? 0).toFixed(2)} steps/s
                                        </Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={summary.progressPctById[bandId(workflow)] ?? (completedStepsFor(workflow) / Math.max(1, totalStepsFor(workflow)) * 100)}
                                            color={getProgressColor(summary.progressPctById[bandId(workflow)] ?? (completedStepsFor(workflow) / Math.max(1, totalStepsFor(workflow)) * 100))}
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
