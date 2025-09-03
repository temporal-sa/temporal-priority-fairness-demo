import React, { useEffect, useState } from "react";
import { Box, Button, TextField, Paper, Typography, Alert, CircularProgress } from "@mui/material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import type { WorkflowTestConfig, Mode, Band } from "../../lib/types/test-config";
import { RadioGroup, FormControlLabel, Radio, Stack, IconButton } from "@mui/material";
import { Add, Delete } from "@mui/icons-material";


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
        numberOfWorkflows: 100,
        mode: 'priority',
        bands: [
            { key: 'first-class', weight: 6 },
            { key: 'business-class', weight: 3 },
            { key: 'economy-class', weight: 1 },
        ]
    });
    const [bandErrors, setBandErrors] = useState<Array<{ key?: string; weight?: string }>>([]);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'numberOfWorkflows' ? parseInt(value) || 0 : value
        }));
    };

    const handleModeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const mode = (event.target as HTMLInputElement).value as Mode;
        setFormData(prev => ({ ...prev, mode }));
    };

    const updateBand = (index: number, field: keyof Band, value: string | number) => {
        setFormData(prev => {
            const bands = [...(prev.bands || [])];
            const band = { ...bands[index] };
            (band as any)[field] = field === 'weight' ? Number(value) : value;
            bands[index] = band;
            return { ...prev, bands };
        });
        // Revalidate after change
        setTimeout(() => validateAndSetBands(), 0);
    };

    const addBand = () => {
        setFormData(prev => ({
            ...prev,
            bands: [...(prev.bands || []), { key: '', weight: 1 }]
        }));
        setTimeout(() => validateAndSetBands(), 0);
    };

    const removeBand = (index: number) => {
        setFormData(prev => ({
            ...prev,
            bands: (prev.bands || []).filter((_, i) => i !== index)
        }));
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
            } else if (Number(b.weight) < 1) {
                e.weight = 'Weight must be >= 1';
            }
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
                ...(formData.mode === 'fairness' ? { bands: formData.bands } : {})
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
                    inputProps={{ min: 1 }}
                    placeholder="e.g., 100"
                />

                {formData.mode === 'fairness' && (
                    <Box>
                        <Typography variant="subtitle1" sx={{mb: 1}}>Fairness Bands</Typography>
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
                                    />
                                    <TextField
                                        label="Weight"
                                        type="number"
                                        value={band.weight}
                                        onChange={(e) => updateBand(idx, 'weight', e.target.value)}
                                        inputProps={{ min: 1 }}
                                        error={!!bandErrors[idx]?.weight}
                                        helperText={bandErrors[idx]?.weight || ''}
                                        sx={{ width: 140 }}
                                    />
                                    <IconButton aria-label="remove band" onClick={() => removeBand(idx)}>
                                        <Delete />
                                    </IconButton>
                                </Box>
                            ))}
                            <Box>
                                <Button startIcon={<Add />} variant="outlined" onClick={addBand}>Add Band</Button>
                            </Box>
                        </Stack>
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
