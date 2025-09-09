import React from "react";
import { createBrowserRouter } from "react-router-dom";
import App from "../layout/App";
import HomePage from "../../features/home/HomePage";
import TestResultsWrapper from "../../features/results/TestResultsWrapper";
import WhatIsFairnessPage from "../../features/info/WhatIsFairnessPage";


export const router = createBrowserRouter([
    {
        path: '/',
        element: <App />,
        children: [
            {path: '', element: <HomePage />},
            {path: 'results/:runPrefix', element: <TestResultsWrapper />},
            {path: 'what-is-fairness', element: <WhatIsFairnessPage />}
        ] 
    }
])
