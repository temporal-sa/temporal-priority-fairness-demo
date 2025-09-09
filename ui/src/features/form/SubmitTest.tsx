import React, { useEffect, useState } from "react";
import { Box, Button, TextField, Paper, Typography, Alert, CircularProgress, InputAdornment, Checkbox, Link } from "@mui/material";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import axios from "axios";
import type { WorkflowTestConfig, Mode, Band } from "../../lib/types/test-config";
import { RadioGroup, FormControlLabel, Radio, Stack, IconButton } from "@mui/material";
import { Add, Delete, Lock } from "@mui/icons-material";


export default function SubmitTest() {
    const navigate = useNavigate();
    
    const generateDefaultPrefix = () => {
        const now = new Date();
        const dd = now.getDate().toString().padStart(2, '0');
        const mm = (now.getMonth() + 1).toString().padStart(2, '0');
        const yy = now.getFullYear().toString().slice(-2);
        const hh = now.getHours().toString().padStart(2, '0');
        const min = now.getMinutes().toString().padStart(2, '0');
        const prefix = `Test-${dd}${mm}${yy}-${hh}${min}`;
        console.log('Generated prefix:', prefix);
        return prefix;
    };

    const [formData, setFormData] = useState<WorkflowTestConfig>({
        workflowIdPrefix: generateDefaultPrefix(),
        numberOfWorkflows: 100, // default 100 for Priority
        mode: 'priority',
        disableFairness: false,
        // Defaults for Fairness mode
        bands: [
            { key: 'vip',            weight: 20, count: 10 },
            { key: 'first-class',    weight: 10, count: 20 },
            { key: 'business-class', weight: 5,  count: 40 },
            { key: 'economy-class',  weight: 2,  count: 75 },
            { key: 'standby-list',   weight: 1,  count: 75 },
        ]
    });
    const [bandErrors, setBandErrors] = useState<Array<{ key?: string; weight?: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Preset scenario state (used for curated one-click demos)
    const [presetLocked, setPresetLocked] = useState<boolean>(false);
    const [presetName, setPresetName] = useState<string | null>(null);
    const [presetBlurb, setPresetBlurb] = useState<string | null>(null);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        if (name === 'numberOfWorkflows') {
            const nextTotal = parseInt(value) || 0;
            setFormData(prev => {
                if (prev.mode === 'fairness') {
                    const bands = [...(prev.bands || [])];
                    if (bands.length > 0) {
                        const per = Math.floor(nextTotal / bands.length);
                        const remainder = nextTotal % bands.length;
                        const nextBands = bands.map((b, i) => ({ ...b, count: per + (i < remainder ? 1 : 0) }));
                        return { ...prev, numberOfWorkflows: nextTotal, bands: nextBands };
                    }
                }
                return { ...prev, numberOfWorkflows: nextTotal } as any;
            });
            return;
        }
        setFormData(prev => ({ ...prev, [name]: value } as any));
    };

    const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const mode = (event.target as HTMLInputElement).value as Mode;
        if (mode === 'fairness') {
            // Auto-apply airline preset as the default for Fairness mode
            applyAirlinePreset();
            return;
        }
        // Switching to Priority: clear preset UI and restore defaults
        setFormData(prev => ({ ...prev, mode: 'priority', numberOfWorkflows: 100, disableFairness: false }));
        setPresetLocked(false);
        setPresetName(null);
        setPresetBlurb(null);
    };

    const updateBand = (index: number, field: keyof Band, value: string | number) => {
        setFormData(prev => {
            const bands = [...(prev.bands || [])];
            const band = { ...bands[index] } as any;
            band[field] = field === 'weight' || field === 'count' ? Number(value) : value;
            bands[index] = band as Band;
            const nextTotal = prev.mode === 'fairness' && field === 'count'
                ? bands.reduce((s, b) => s + (b.count || 0), 0)
                : prev.numberOfWorkflows;
            return { ...prev, bands, numberOfWorkflows: nextTotal };
        });
        // Revalidate after change
        setTimeout(() => validateAndSetBands(), 0);
    };

    const applyAirlinePreset = () => {
        const airlineBands: Band[] = [
            { key: 'vip',            weight: 20, count: 10 },
            { key: 'first-class',    weight: 10, count: 20 },
            { key: 'business-class', weight: 5,  count: 40 },
            { key: 'economy-class',  weight: 2,  count: 75 },
            { key: 'standby-list',   weight: 1,  count: 75 },
        ];
        const total = airlineBands.reduce((s, b) => s + (b.count || 0), 0);
        setFormData(prev => ({
            ...prev,
            mode: 'fairness',
            bands: airlineBands,
            numberOfWorkflows: total,
        }));
        setPresetLocked(true);
        setPresetName('Airline Boarding');
        setPresetBlurb('This setup models how airlines balance different passenger categories during boarding and standby allocation. The “virtual queues” created by fairness are like boarding groups');
        // Reset any existing validation errors for a clean preset view
        setBandErrors([]);
    };

    const applyInvoiceProcessorPreset = () => {
        const invoiceBands: Band[] = [
            { key: 'small-law-firm',       weight: 1, count: 10 },
            { key: 'local-gym',            weight: 1, count: 8 },
            { key: 'mega-insurance',         weight: 1, count: 250 },
            { key: 'lemonade-stand',       weight: 1, count: 2 },
            { key: 'tiny-consulting',      weight: 1, count: 15 },
            { key: 'smol-florist',         weight: 1, count: 21 },
            { key: 'diagon-alley-potions', weight: 1, count: 12 },
        ];
        const total = invoiceBands.reduce((s, b) => s + (b.count || 0), 0);
        setFormData(prev => ({
            ...prev,
            mode: 'fairness',
            bands: invoiceBands,
            numberOfWorkflows: total,
        }));
        setPresetLocked(true);
        setPresetName('Invoice Processor');
        setPresetBlurb('This setup models how a payment processor balances different businesses submitting invoices at the same time. Assigning equal weights to all businesses ensures that high-volume senders such as large insurers or utilities don’t block progress for smaller firms like local gyms, law offices, or consultants.');
        setBandErrors([]);
    };

    const startNewUseCase = () => {
        // Unlock editing and remove preset meta; keep current values so the user can tweak them
        setPresetLocked(false);
        setPresetName(null);
        setPresetBlurb(null);
    };

    const addBand = () => {
        const defaultCount = 60;
        setFormData(prev => {
            const nextBands = [...(prev.bands || []), { key: '', weight: 1, count: defaultCount } as Band];
            return {
                ...prev,
                bands: nextBands,
                numberOfWorkflows: prev.mode === 'fairness' ? (prev.numberOfWorkflows || 0) + defaultCount : prev.numberOfWorkflows,
            };
        });
        setTimeout(() => validateAndSetBands(), 0);
    };

    const removeBand = (index: number) => {
        setFormData(prev => {
            const bands = prev.bands || [];
            const removed = bands[index]?.count || 0;
            const nextBands = bands.filter((_, i) => i !== index);
            const nextTotal = prev.mode === 'fairness' ? Math.max(0, (prev.numberOfWorkflows || 0) - removed) : prev.numberOfWorkflows;
            return { ...prev, bands: nextBands, numberOfWorkflows: nextTotal };
        });
        setTimeout(() => validateAndSetBands(), 0);
    };

    const validateAndSetBands = () => {
        const bands = formData.bands || [];
        const errors = bands.map(b => {
            const e: { key?: string; weight?: string } = {};
            if (!b.key || !String(b.key).trim()) {
                e.key = 'Key is required';
            }
            if (b.weight === undefined || b.weight === null || isNaN(Number(b.weight))) {
                e.weight = 'Weight is required';
            } // allow 0 or any numeric weight; no min constraint
            return e;
        });
        setBandErrors(errors);
        const isValid = errors.every(e => !e.key && !e.weight) && bands.length > 0;
        return isValid;
    };

    // Load saved mode and bands from localStorage
    useEffect(() => {
        try {
            const savedMode = localStorage.getItem('demo-mode') as Mode | null;
            const savedBandsRaw = localStorage.getItem('demo-bands');
            const savedBands = savedBandsRaw ? JSON.parse(savedBandsRaw) as Band[] : null;
            setFormData(prev => ({
                ...prev,
                mode: savedMode || prev.mode,
                bands: savedBands && Array.isArray(savedBands) && savedBands.length > 0 ? savedBands : prev.bands
            }));
        } catch (e) {
            // Ignore storage errors
        }
    }, []);

    // Persist mode and bands to localStorage
    useEffect(() => {
        if (formData.mode) {
            try { localStorage.setItem('demo-mode', formData.mode as string); } catch {}
        }
        if (formData.mode === 'fairness') {
            try { localStorage.setItem('demo-bands', JSON.stringify(formData.bands || [])); } catch {}
        }
    }, [formData.mode, formData.bands]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            console.log('Submitting form data:', formData);
            // Use proxy endpoint - Vite will forward to localhost:7080
            const payload: WorkflowTestConfig = {
                workflowIdPrefix: formData.workflowIdPrefix,
                numberOfWorkflows: formData.numberOfWorkflows,
                mode: formData.mode,
                // Only send bands in fairness mode
                ...(formData.mode === 'fairness' ? { bands: formData.bands, disableFairness: formData.disableFairness } : {})
            };
            if (payload.mode === 'fairness') {
                const valid = validateAndSetBands();
                if (!valid) {
                    setError('Please fix fairness bands (non-empty keys and weight >= 1).');
                    return;
                }
            }
            const response = await axios.post('/api/start-workflows', payload);
            
            setSuccess(`Test submitted successfully! Redirecting to results page...`);
            
            // Navigate to results page after a short delay
            setTimeout(() => {
                const mode = formData.mode || 'priority';
                navigate(`/results/${encodeURIComponent(formData.workflowIdPrefix)}?mode=${encodeURIComponent(mode)}`);
            }, 2000);
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Failed to submit test');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Paper sx={{ borderRadius: 3, padding: 3, maxWidth: 600, margin: 'auto' }}>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Typography variant="h5">Submit Workflow Test</Typography>
                
                {error && <Alert severity="error">{error}</Alert>}
                {loading && <Alert severity="info">Submitting workflows, please wait…</Alert>}
                {success && <Alert severity="success">{success}</Alert>}
                
                <TextField 
                    label="Workflow ID Prefix" 
                    name="workflowIdPrefix"
                    value={formData.workflowIdPrefix}
                    onChange={handleInputChange}
                    required 
                    fullWidth
                    placeholder="e.g., test-workflow"
                />

                <Box>
                    <Typography variant="subtitle1">Mode</Typography>
                    <RadioGroup row name="mode" value={formData.mode} onChange={handleModeChange}>
                        <FormControlLabel value="priority" control={<Radio />} label="Priority" />
                        <FormControlLabel value="fairness" control={<Radio />} label="Fairness" />
                    </RadioGroup>
                </Box>
                
                <TextField 
                    label="Number of Workflows" 
                    name="numberOfWorkflows"
                    type="number"
                    value={formData.numberOfWorkflows}
                    onChange={handleInputChange}
                    required 
                    fullWidth
                    inputProps={{ min: 1, readOnly: formData.mode === 'fairness' && presetLocked }}
                    InputProps={{
                        readOnly: formData.mode === 'fairness' && presetLocked,
                        endAdornment: formData.mode === 'fairness' && presetLocked ? (
                            <InputAdornment position="end"><Lock fontSize="small" /></InputAdornment>
                        ) : undefined
                    }}
                    placeholder="e.g., 100"
                />

                {formData.mode === 'fairness' && (
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
                            <Typography variant="subtitle1">Fairness Bands</Typography>
                            <Link component={RouterLink} to="/what-is-fairness" sx={{ fontSize: 12 }}>
                                What is fairness?
                            </Link>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                            <Button
                                variant={presetLocked && presetName === 'Airline Boarding' ? 'contained' : 'outlined'}
                                color="primary"
                                onClick={applyAirlinePreset}
                            >
                                Airline Boarding
                            </Button>
                            <Button
                                variant={presetLocked && presetName === 'Invoice Processor' ? 'contained' : 'outlined'}
                                color="primary"
                                onClick={applyInvoiceProcessorPreset}
                            >
                                Invoice Processor
                            </Button>
                            <Button
                                variant={!presetLocked ? 'contained' : 'outlined'}
                                color="primary"
                                onClick={startNewUseCase}
                            >
                                Modify
                            </Button>
                        </Box>
                        {presetName && (
                            <Alert severity="info" sx={{ mb: 1.5 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{presetName}</Typography>
                                <Typography variant="body2">{presetBlurb}</Typography>
                            </Alert>
                        )}
                        <Stack spacing={1.5}>
                            {(formData.bands || []).map((band, idx) => (
                                <Box key={idx} sx={{ display: 'flex', gap: 1 }}>
                                    <TextField
                                        label="Key"
                                        value={band.key}
                                        onChange={(e) => updateBand(idx, 'key', e.target.value)}
                                        error={!!bandErrors[idx]?.key}
                                        helperText={bandErrors[idx]?.key || ''}
                                        sx={{ flex: 2 }}
                                        inputProps={{ readOnly: presetLocked }}
                                        InputProps={{
                                            readOnly: presetLocked,
                                            endAdornment: presetLocked ? (
                                                <InputAdornment position="end"><Lock fontSize="small" /></InputAdornment>
                                            ) : undefined
                                        }}
                                    />
                                    <TextField
                                        label="Weight"
                                        type="number"
                                        value={band.weight}
                                        onChange={(e) => updateBand(idx, 'weight', e.target.value)}
                                        inputProps={{ min: 0, readOnly: presetLocked && !formData.disableFairness }}
                                        disabled={!!formData.disableFairness}
                                        error={!!bandErrors[idx]?.weight}
                                        helperText={bandErrors[idx]?.weight || ''}
                                        sx={{
                                            width: 120,
                                            '& .MuiInputBase-root.Mui-disabled': {
                                                backgroundColor: (theme) => theme.palette.action.disabledBackground,
                                            },
                                            '& .MuiInputBase-input.Mui-disabled': {
                                                WebkitTextFillColor: (theme) => theme.palette.text.disabled,
                                            },
                                        }}
                                        InputProps={{
                                            readOnly: presetLocked && !formData.disableFairness,
                                            endAdornment: presetLocked && !formData.disableFairness ? (
                                                <InputAdornment position="end"><Lock fontSize="small" /></InputAdornment>
                                            ) : undefined
                                        }}
                                    />
                                    <TextField
                                        label="Workflows"
                                        type="number"
                                        value={band.count ?? ''}
                                        onChange={(e) => updateBand(idx, 'count', e.target.value)}
                                        inputProps={{ min: 0, readOnly: presetLocked }}
                                        InputProps={{
                                            readOnly: presetLocked,
                                            endAdornment: presetLocked ? (
                                                <InputAdornment position="end"><Lock fontSize="small" /></InputAdornment>
                                            ) : undefined
                                        }}
                                        sx={{ width: 120 }}
                                    />
                                    <IconButton aria-label="remove band" onClick={() => removeBand(idx)} disabled={presetLocked}>
                                        <Delete />
                                    </IconButton>
                                </Box>
                            ))}
                            <Box>
                                <Button startIcon={<Add />} variant="outlined" onClick={addBand} disabled={presetLocked}>Add Band</Button>
                            </Box>
                        </Stack>
                        {/* Disable fairness toggle for this run */}
                        <Box sx={{ mt: 2 }}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={!!formData.disableFairness}
                                        onChange={(e) => setFormData(prev => ({ ...prev, disableFairness: e.target.checked }))}
                                    />
                                }
                                label="Disable fairness for this run"
                            />
                        </Box>
                    </Box>
                )}
                
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button 
                        type="submit" 
                        variant="contained" 
                        color="primary"
                        disabled={loading}
                        startIcon={loading ? <CircularProgress size={20} /> : null}
                        sx={{ flex: 1 }}
                    >
                        {loading ? 'Submitting...' : 'Submit Test'}
                    </Button>
                    
                    <Button 
                        variant="outlined" 
                        color="secondary"
                        onClick={() => navigate(`/results/${encodeURIComponent(formData.workflowIdPrefix)}?mode=${encodeURIComponent(formData.mode || 'priority')}`)}
                        disabled={!formData.workflowIdPrefix}
                        sx={{ flex: 1 }}
                    >
                        View Results
                    </Button>
                </Box>
            </Box>
        </Paper>
    )
}
