import React from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import TestResultsPage from './TestResultsPage';
import FairnessResultsPage from './FairnessResultsPage';

export default function TestResultsWrapper() {
    const { runPrefix } = useParams<{ runPrefix: string }>();
    const [searchParams] = useSearchParams();
    const mode = (searchParams.get('mode') || 'priority').toLowerCase();

    if (mode === 'fairness') {
        return <FairnessResultsPage runPrefix={runPrefix || ''} />;
    }
    return <TestResultsPage runPrefix={runPrefix || ''} />;
} 
