import React, { useState } from "react";
import { Box, Button, TextField, Paper, Typography, Alert, CircularProgress } from "@mui/material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import type { WorkflowTestConfig } from "../../lib/types/test-config";


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
        numberOfWorkflows: 100
    });
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

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            console.log('Submitting form data:', formData);
            // Use proxy endpoint - Vite will forward to localhost:6080
            const response = await axios.post('/api/start-workflows', formData);
            
            setSuccess(`Test submitted successfully! Redirecting to results page...`);
            
            // Navigate to results page after a short delay
            setTimeout(() => {
                navigate(`/results/${encodeURIComponent(formData.workflowIdPrefix)}`);
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
                        onClick={() => navigate(`/results/${encodeURIComponent(formData.workflowIdPrefix)}`)}
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