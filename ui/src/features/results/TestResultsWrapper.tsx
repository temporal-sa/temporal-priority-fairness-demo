import React from 'react';
import { useParams } from 'react-router-dom';
import TestResultsPage from './TestResultsPage';

export default function TestResultsWrapper() {
    const { runPrefix } = useParams<{ runPrefix: string }>();
    
    return <TestResultsPage runPrefix={runPrefix || ''} />;
} 