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
    const t0Ref = useRef<number | null>(null);            // first data fetch
    const firstProgressT0Ref = useRef<number | null>(null); // first time any progress > 0
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

    // Original band order from the submit form (if available via localStorage)
    const originalOrderRef = useRef<string[] | null>(null);
    const getOriginalOrder = () => {
        if (originalOrderRef.current != null) return originalOrderRef.current;
        try {
            const raw = localStorage.getItem('demo-bands');
            if (raw) {
                const arr = JSON.parse(raw) as Array<{ key: string }>;
                if (Array.isArray(arr)) {
                    originalOrderRef.current = arr.map(b => b.key);
                }
            }
        } catch {}
        if (!originalOrderRef.current) originalOrderRef.current = [];
        return originalOrderRef.current;
    };

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

    // Choose a readable text color for a hex background
    const textColorForBg = (hex: string) => {
        const c = hex.replace('#', '');
        const r = parseInt(c.substring(0, 2), 16);
        const g = parseInt(c.substring(2, 4), 16);
        const b = parseInt(c.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.6 ? '#000' : '#fff';
    };

    const getKeyColor = (key: string, index?: number) => {
        // Order-based palette: assign colors by position; 8+ -> grey
        const orderedPalette = [
            '#e53935', // 1: red
            '#6a1b9a', // 2: purple
            '#1976d2', // 3: blue
            '#2e7d32', // 4: green
            '#fbc02d', // 5: yellow/amber (so a 5th band is yellow)
            '#ef6c00', // 6: orange
            '#00897b', // 7: teal
        ];
        if (typeof index === 'number' && index >= 0) {
            return index < orderedPalette.length ? orderedPalette[index] : '#9e9e9e';
        }
        // Fallback when no index provided: hash key into palette for stability
        let h = 0;
        for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
        return orderedPalette[h % orderedPalette.length];
    };

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const bandId = (wf: WorkflowByFairness) => `${wf.fairnessKey}|${wf.fairnessWeight}`;
    const bandLabel = (wf: WorkflowByFairness) => {
        const disabled = (testResults?.workflowsByFairness || []).every(b => (b.fairnessWeight || 0) === 0);
        const wLabel = disabled ? 'n/a' : String(wf.fairnessWeight);
        return `${wf.fairnessKey} (weight=${wLabel}) · ${wf.numberOfWorkflows} workflows`;
    };
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
        // Determine display order: prefer the original input list order if available
        const order = getOriginalOrder();
        const orderIndex = (key: string) => {
            const i = order.indexOf(key);
            return i === -1 ? Number.MAX_SAFE_INTEGER : i;
        };
        const idsInOrder: string[] = results.workflowsByFairness
            .map((b, i) => ({ b, i }))
            .sort((x, y) => {
                const ax = orderIndex(x.b.fairnessKey);
                const ay = orderIndex(y.b.fairnessKey);
                if (ax !== ay) return ax - ay; // original order first
                return x.i - y.i; // stable fallback to server order
            })
            .map(({ b }) => bandId(b));

        // Update per-band rates, ETAs, progress, and event stream
        for (const wf of results.workflowsByFairness) {
            const id = bandId(wf);
            const stepsTotal = totalStepsFor(wf);
            const stepsCompleted = completedStepsFor(wf);
            const prev = prevStepsRef.current[id] ?? 0;
            const delta = Math.max(0, stepsCompleted - prev);
            prevStepsRef.current[id] = stepsCompleted;

            // Detect the first moment any progress occurs to shift chart start
            if (firstProgressT0Ref.current == null && delta > 0) {
                firstProgressT0Ref.current = now;
                // Reset history so initial idle period is excluded
                historyRef.current = [];
                finishTimesRef.current = {};
            }

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
                const base = firstProgressT0Ref.current ?? t0Ref.current ?? now;
                const t = (now - base) / 1000;
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
        const base = firstProgressT0Ref.current ?? t0Ref.current ?? now;
        const t = (now - base) / 1000;
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

        // Compute a simple padded X domain: ceil(rawMax * 1.1)
        const tNow = (now - base) / 1000;
        const maxFinish = Object.values(finishTimesRef.current).reduce((m, v) => Math.max(m, v ?? 0), 0);
        const rawMax = Math.max(tNow, maxFinish);
        let chartMaxX = Math.ceil(rawMax * 1.1);

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
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        <Chip label={`Mode: Fairness`} size="small" />
                        {(testResults?.workflowsByFairness || []).every(b => (b.fairnessWeight || 0) === 0)
                          ? <Chip label="Fairness disabled" color="warning" size="small" />
                          : <Chip label="Fairness enabled" color="success" size="small" />}
                    </Box>
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

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, gap: 3, alignItems: 'start' }}>
                <Box>
                    {/* Fairness summary visuals (left column) */}
                    {summary.chartData.length > 0 && (
                        <Card sx={{ mb: 3, position: 'sticky', top: 8 }}>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 2 }}>Cumulative Progress by Band</Typography>
                                <Box sx={{ width: '100%', height: 360 }}>
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
                                            {summary.idsInOrder.map((id, idx) => {
                                                const key = id.split('|')[0];
                                                const name = summary.labelsById[id] || key;
                                                return (
                                                    <Line
                                                        key={id}
                                                        type="linear"
                                                        dataKey={id}
                                                        stroke={getKeyColor(key, idx)}
                                                        dot={false}
                                                        strokeWidth={2}
                                                        name={name}
                                                        isAnimationActive={false}
                                                    />
                                                );
                                            })}
                                            {/* Current value dots and finish reference lines (ETA removed) */}
                                            {summary.idsInOrder.map((id, idx) => {
                                                const key = id.split('|')[0];
                                                const color = getKeyColor(key, idx);
                                                const lastPoint = summary.chartData[summary.chartData.length - 1];
                                                const curT = lastPoint ? Number(lastPoint.t) : 0;
                                                const curY = lastPoint ? Number(lastPoint[id] || 0) : 0;
                                                const finishedAt = (finishTimesRef.current[id]);
                                                // ETA intentionally not shown in chart per simplification
                                                return (
                                                    <React.Fragment key={`refs-${id}`}>
                                                        {lastPoint && (
                                                            <ReferenceDot x={curT} y={curY} r={3} fill={color} stroke={color} label={{ value: `${curY.toFixed(0)}%`, position: 'right', fill: '#666', fontSize: 12 }} />
                                                        )}
                                                        {finishedAt != null ? (
                                                            <ReferenceLine x={finishedAt} stroke={color} strokeDasharray="4 4" label={{ value: `Finished ${Math.round(finishedAt)}s`, position: 'top', fill: '#666', fontSize: 12 }} />
                                                        ) : null}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </Box>

                                {/* Summary chips removed per simplification */}
                            </CardContent>
                        </Card>
                    )}
                    {loading && !testResults && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                            <CircularProgress />
                        </Box>
                    )}
                </Box>

                <Box>
                    {/* Activity step view (right column) */}
                    {testResults && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            {[...testResults.workflowsByFairness]
                              .sort((a, b) => summary.idsInOrder.indexOf(bandId(a)) - summary.idsInOrder.indexOf(bandId(b)))
                              .map((workflow: WorkflowByFairness) => (
                                <Box key={`${workflow.fairnessKey}-${workflow.fairnessWeight}`}>
                                    <Card>
                                        <CardContent>
                                            {/* Header and overall progress only */}
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                                <Chip
                                                    label={`${workflow.fairnessKey} (weight=${(testResults?.workflowsByFairness || []).every(b => (b.fairnessWeight || 0) === 0) ? 'n/a' : workflow.fairnessWeight})`}
                                                    sx={() => {
                                                        const idx = summary.idsInOrder.indexOf(bandId(workflow));
                                                        const bg = getKeyColor(workflow.fairnessKey, idx);
                                                        return { backgroundColor: bg, color: textColorForBg(bg), fontWeight: 'bold' };
                                                    }}
                                                />
                                                <Typography variant="body2" color="text.secondary">{workflow.numberOfWorkflows} workflows</Typography>
                                                <Typography variant="body2" color="text.secondary">{(summary.progressPctById[bandId(workflow)] ?? (completedStepsFor(workflow) / Math.max(1, totalStepsFor(workflow)) * 100)).toFixed(1)}% complete</Typography>
                                                <Typography variant="body2" color="text.secondary">~{(summary.rateById[bandId(workflow)] ?? 0).toFixed(2)} steps/s</Typography>
                                            </Box>
                                            <LinearProgress
                                                variant="determinate"
                                                value={summary.progressPctById[bandId(workflow)] ?? (completedStepsFor(workflow) / Math.max(1, totalStepsFor(workflow)) * 100)}
                                                color={getProgressColor(summary.progressPctById[bandId(workflow)] ?? (completedStepsFor(workflow) / Math.max(1, totalStepsFor(workflow)) * 100))}
                                                sx={{ height: 10, borderRadius: 5 }}
                                            />
                                        </CardContent>
                                    </Card>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>
            </Box>
        </Container>
    );
}
