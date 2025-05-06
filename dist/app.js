// js/app.js

import * as tf from '@tensorflow/tfjs'; // Use consistent TFJS import
import * as THREE from 'three'; // Use consistent THREE import
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import 'chartjs-adapter-luxon'; // Import adapter
import ChartStreaming from 'chartjs-plugin-streaming'; // Import plugin

import { Config, emotionKeywords, emotionNames, HEAD_MOVEMENT_LABELS } from './config.js'; // HEAD_MOVEMENT_LABELS added
import { displayError, appendChatMessage, zeros, clamp, inspectTensor, logToTimeline, norm as calculateArrayNorm } from './utils.js'; // Renamed norm
import { SyntrometricAgent } from './agent.js';
import { EmotionalSpace } from './environment.js';
import { safeDispose, tensorToArray, tensorToArrayAsync, containsNaNOrInf } from './tensorUtils.js'; // Import tensor utils

// Import visualization modules
import {
    initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel,
    threeInitialized, calculateGraphFeatures
    // Removed rihNode export - not needed externally
} from './viz-syntrometry.js';
import {
    initConceptVisualization, updateAgentSimulationVisuals, animateConceptNodes,
    updateInfoPanel as updateConceptInfoPanel, cleanupConceptVisualization, conceptInitialized,
    conceptRenderer, conceptLabelRenderer, conceptScene, conceptCamera, conceptControls
} from './viz-concepts.js';
import {
    initLive2D, updateLive2DEmotions, updateLive2DHeadMovement,
    live2dInitialized, cleanupLive2D, updateLive2D // Added updateLive2D import
} from './viz-live2d.js';
import { initializeDraggablePanels } from './draggablePanels.js';

// --- Global State ---
let criticalError = false;
let agent = null; // SyntrometricAgent | null
let environment = null; // EmotionalSpace | null
let animationFrameId = null; // number | null
let lastFrameTime = null; // Add this line to define lastFrameTime
let simulationPaused = false; // Add this to track pause state

// Grouped Simulation State Metrics
const simulationMetrics = {
    currentStateVector: zeros(Config.Agent.BASE_STATE_DIM), // number[]
    currentAgentEmotions: null, // Holds the kept TF.js Tensor2D [1, EMOTION_DIM]
    currentRIHScore: 0.0,
    currentAvgAffinity: 0.0,
    currentTrustScore: 1.0,
    currentBeliefNorm: 0.0,
    currentSelfStateNorm: 0.0,
    currentHmLabel: "idle", // HeadMovementLabel
    currentContext: "Initializing...",
    currentCascadeHistory: [], // Array<number[]>
    currentIntegrationParam: Config.Agent.INTEGRATION_INIT,
    currentReflexivityParam: Config.Agent.REFLEXIVITY_INIT,
};

const appClock = new THREE.Clock();
const SAVED_STATE_KEY = `syntrometrySimulationState_v${Config.VERSION}`; // Use version from Config

// Timestamps for Input Feedback Viz
let lastIntegrationInputTime = -1;
let lastReflexivityInputTime = -1;
let lastChatImpactTime = -1;
const inputFeedbackDuration = 0.5; // seconds

// Chart.js Instance & Config
let metricsChart = null; // Chart | null
const MAX_CHART_POINTS = 150; // Limit history points for performance

// Register Chart.js streaming plugin
Chart.register(ChartStreaming);

// --- Helper Functions ---

/** Checks if required global libraries (THREE, Chart) are loaded. */
function checkDependencies() {
    const dependencies = [
        { name: 'TensorFlow.js', check: () => typeof tf !== 'undefined' && tf.layers && tf.train },
        { name: 'Three.js', check: () => typeof THREE !== 'undefined' },
        { name: 'OrbitControls', check: () => typeof OrbitControls !== 'undefined' },
        { name: 'CSS2DRenderer', check: () => typeof CSS2DRenderer !== 'undefined' },
        { name: 'Chart.js', check: () => typeof Chart !== 'undefined' },
        // Add Pixi/Live2D checks if needed, though they are checked in their init functions
    ];
    const missing = dependencies.filter(dep => !dep.check());
    if (missing.length > 0) {
        const errorMsg = `Missing critical dependencies: ${missing.map(d => d.name).join(', ')}. Application cannot start.`;
        displayError(errorMsg, true, 'error-message');
        console.error(errorMsg);
        return false;
    }
    console.log("All critical dependencies verified.");
    return true;
}

/** Resize handler for Concept Graph Visualization */
function resizeConceptGraphRenderer() {
    if (!conceptInitialized || !conceptRenderer || !conceptLabelRenderer || !conceptCamera) return;
    try {
        const container = document.getElementById('concept-panel');
        if (!container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width <= 0 || height <= 0) return;

        conceptRenderer.setSize(width, height);
        // conceptRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Already set?
        conceptLabelRenderer.setSize(width, height);
        conceptCamera.aspect = width / height;
        conceptCamera.updateProjectionMatrix();
    } catch (e) {
        console.error("Error during concept graph resize:", e);
    }
}


/** Updates the heatmap display */
function updateHeatmap(stateVector, targetElementId) {
    try {
        const heatmapContainer = document.getElementById(targetElementId);
        if (!heatmapContainer) return;

        const vector = (Array.isArray(stateVector) && stateVector.length > 0)
            ? stateVector
            : zeros(Config.Agent.SELF_STATE_DIM); // Default to self-state dim if invalid/empty

        const vectorLength = vector.length;
        if (vectorLength === 0) {
            heatmapContainer.innerHTML = '<p class="heatmap-placeholder">No State Data</p>';
            return;
        }

        const gridDim = Math.ceil(Math.sqrt(vectorLength));
        const containerWidth = heatmapContainer.clientWidth;
        // Calculate cell size dynamically, ensure minimum size
        const cellSize = Math.max(4, Math.floor(containerWidth / gridDim) - 1); // Min 4px, includes gap

        heatmapContainer.style.gridTemplateColumns = `repeat(${gridDim}, ${cellSize}px)`;
        heatmapContainer.style.gridTemplateRows = `repeat(${gridDim}, ${cellSize}px)`;
        heatmapContainer.style.gap = `1px`; // Explicit gap

        let htmlContent = '';
        for (let i = 0; i < vectorLength; i++) {
            const value = vector[i] ?? 0; // Default to 0 if value is missing
            const absValue = Math.abs(value);
            let r = 30, g = 30, b = 30; // Dark base color
            const intensity = clamp(absValue * 1.5, 0, 1); // Scale intensity more aggressively

            if (value > 0.01) { // Positive: Red -> Yellow scale
                r = 30 + Math.round(210 * intensity);
                g = 30 + Math.round(180 * intensity); // More green for yellow
                b = 30;
            } else if (value < -0.01) { // Negative: Blue -> Cyan scale
                r = 30;
                g = 30 + Math.round(100 * intensity); // Some green for cyan
                b = 30 + Math.round(210 * intensity);
            }

            r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
            const color = `rgb(${r}, ${g}, ${b})`;
            const tooltip = `Idx ${i}: ${value.toFixed(4)}`;
            htmlContent += `<div class="heatmap-cell" style="background-color: ${color}; width:${cellSize}px; height:${cellSize}px;" title="${tooltip}"></div>`;
        }

        // Fill remaining grid cells if not a perfect square
        const totalCells = gridDim * gridDim;
        for (let i = vectorLength; i < totalCells; i++) {
            htmlContent += `<div class="heatmap-cell filler" style="width:${cellSize}px; height:${cellSize}px;"></div>`;
        }

        heatmapContainer.innerHTML = htmlContent;
    } catch (e) {
        console.error("Error updating heatmap:", e);
    }
}


/** Updates the metrics chart with latest data */
function updateMetricsChart() {
    if (!metricsChart || criticalError) return;
    try {
        const now = Date.now();
        // Add new data points using the streaming plugin's expected format
        metricsChart.data.datasets[0].data.push({ x: now, y: simulationMetrics.currentRIHScore });
        metricsChart.data.datasets[1].data.push({ x: now, y: simulationMetrics.currentAvgAffinity });
        metricsChart.data.datasets[2].data.push({ x: now, y: simulationMetrics.currentTrustScore });
        metricsChart.data.datasets[3].data.push({ x: now, y: simulationMetrics.currentBeliefNorm });
        metricsChart.data.datasets[4].data.push({ x: now, y: simulationMetrics.currentSelfStateNorm });

        // Let the streaming plugin handle data limiting via TTL
        metricsChart.update('quiet'); // Use quiet update for performance
    } catch (e) {
        console.error("Error updating metrics chart:", e);
    }
}

/** Updates dashboard values and progress bars */
function updateDashboardDisplay() {
    try {
        const updateElement = (id, value, text = null, range = [0, 1]) => {
            const element = document.getElementById(id);
            if (element) {
                const displayValue = text !== null ? text : (typeof value === 'number' ? value.toFixed(3) : 'N/A');
                if (element.tagName === 'PROGRESS') {
                    const [min, max] = range;
                    const scaledValue = (typeof value === 'number' && isFinite(value) && (max - min) !== 0)
                        ? ((value - min) / (max - min)) * 100
                        : (min < 0 ? 50 : 0); // Default to middle for bipolar, 0 otherwise
                    element.value = clamp(scaledValue, 0, 100);
                } else {
                    element.textContent = displayValue;
                }
            }
        };
        updateElement('metric-rih-value', simulationMetrics.currentRIHScore * 100, `${(simulationMetrics.currentRIHScore * 100).toFixed(1)}%`);
        updateElement('metric-rih-progress', simulationMetrics.currentRIHScore);
        updateElement('metric-affinity-value', simulationMetrics.currentAvgAffinity, simulationMetrics.currentAvgAffinity.toFixed(2));
        updateElement('metric-affinity-progress', simulationMetrics.currentAvgAffinity, null, [-1, 1]);
        updateElement('metric-trust-value', simulationMetrics.currentTrustScore * 100, `${(simulationMetrics.currentTrustScore * 100).toFixed(1)}%`);
        updateElement('metric-trust-progress', simulationMetrics.currentTrustScore);
        updateElement('metric-belief-norm', simulationMetrics.currentBeliefNorm);
        updateElement('metric-self-norm', simulationMetrics.currentSelfStateNorm);
        updateElement('metric-context', 0, simulationMetrics.currentContext); // Use text override for context
    } catch (e) {
        console.error("Error updating dashboard:", e);
    }
}


/** Updates the emotion intensity bars UI */
function updateEmotionBars(emotionsTensor) { // Expects the frame's kept clone
    const container = document.getElementById('emotion-intensities');
    if (!container) return;

    let emotions = null;
    if (emotionsTensor && !emotionsTensor.isDisposed) {
        emotions = tensorToArray(emotionsTensor?.[0]); // Use safe util, get first row if 2D
    }

    if (!emotions || emotions.length !== Config.Agent.EMOTION_DIM) {
        container.style.opacity = '0.5'; // Dim if no valid data
        emotionNames.forEach(name => {
            const barFill = container.querySelector(`.${name.toLowerCase().replace(/[^a-z0-9]/g, '-')} .bar-fill`);
            if (barFill) barFill.style.width = `0%`;
        });
        return;
    }

    container.style.opacity = '1';
    emotionNames.forEach((name, index) => {
        const barFill = container.querySelector(`.${name.toLowerCase().replace(/[^a-z0-9]/g, '-')} .bar-fill`);
        if (barFill) {
            const intensity = clamp((emotions[index] ?? 0) * 100, 0, 100); // Default to 0 if undefined
            barFill.style.width = `${intensity}%`;
        }
    });
}

/** Updates the cascade viewer UI */
function updateCascadeViewer() {
    const contentDiv = document.getElementById('cascade-viewer-content');
    if (!contentDiv) return;

    const history = simulationMetrics.currentCascadeHistory; // This is Array<number[]>

    if (!Array.isArray(history) || history.length === 0) {
        contentDiv.innerHTML = '<div class="cascade-placeholder">No cascade data.</div>';
        return;
    }

    const containerBaseHeight = 50;
    const maxBarHeight = containerBaseHeight - 4; // Max height for bars

    let html = '';
    history.forEach((levelArray, index) => {
        if (!Array.isArray(levelArray)) {
            html += `<div class="cv-level"><div class="cv-level-title">Level ${index} (Invalid Data)</div></div>`;
            return;
        }
        html += `<div class="cv-level">`;
        html += `<div class="cv-level-title">Level ${index} (${levelArray.length} syndromes)</div>`;
        html += `<div class="cv-syndrome-container" style="height: ${containerBaseHeight}px;">`;

        if (levelArray.length > 0) {
            levelArray.forEach((value, sIndex) => {
                const val = (typeof value === 'number' && isFinite(value)) ? value : 0; // Sanitize
                const absValue = Math.abs(val);
                const colorIntensity = clamp(absValue * 1.2, 0, 1);
                const barHeightPx = clamp(absValue * maxBarHeight * 1.5, 2, maxBarHeight);

                let r = 50, g = 50, b = 50;
                if (val > 0.01) { r = 50 + Math.round(180 * colorIntensity); g = 50 + Math.round(30 * colorIntensity); }
                else if (val < -0.01) { g = 50 + Math.round(80 * colorIntensity); b = 50 + Math.round(180 * colorIntensity); }
                r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
                const color = `rgb(${r},${g},${b})`;
                html += `<div class="cv-syndrome-bar" style="background-color: ${color}; height: ${barHeightPx}px;" title="Lvl ${index}, Idx ${sIndex}: ${val.toFixed(4)}"></div>`;
            });
        } else { html += '<span class="cascade-placeholder">[Empty Level]</span>'; }
        html += `</div></div>`;
    });
    contentDiv.innerHTML = html;
    contentDiv.scrollTop = contentDiv.scrollHeight; // Scroll to bottom (latest level)
}

// --- Initialization ---
async function initialize() {
    console.log(`Initializing application (Agent V${Config.VERSION})...`);
    let initSuccess = false;
    try {
        // 1. Check Dependencies
        if (!checkDependencies()) {
            throw new Error("Critical dependencies missing. Cannot initialize.");
        }

        // 2. Initialize Core Agent & Environment
        if (!initAgentAndEnvironment()) { // This now performs validation
            throw new Error("Agent or Environment failed initialization/validation.");
        }

        // 3. Initialize Visualizations (Order matters less now)
        const vizPromises = [
            // These return booleans, wrap them for Promise.allSettled
            Promise.resolve(initThreeJS()).catch(e => { console.error("Syntrometry Viz Init Error:", e); return false; }),
            Promise.resolve(initConceptVisualization(appClock)).catch(e => { console.error("Concept Viz Init Error:", e); return false; }),
            // Live2D is async
            initLive2D().catch(e => { console.error("Live2D Init Error:", e); return false; })
        ];

        const vizResults = await Promise.allSettled(vizPromises);
        vizResults.forEach((result, i) => {
            if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value)) {
                 const vizName = ['Syntrometry', 'Concept Graph', 'Live2D'][i];
                 displayError(`${vizName} visualization failed to initialize.`, false, 'error-message');
            }
        });

        // 4. Setup UI & Event Listeners
        initMetricsChart(); // Requires Chart.js
        setupEventListeners(); // Setup controls, chat, panels etc.

        // 5. Load Initial State or Start Fresh
        let initialStateLoaded = false;
        if (agent && environment) { // Only load if core components are ok
            initialStateLoaded = await loadState(false); // Attempt load, don't show messages yet
        }

        // 6. If core is ok but no state loaded, run initial step
        if (agent && environment && !initialStateLoaded) {
             console.log("No valid saved state found or load skipped, running initial simulation step...");
             await runInitialStep();
        } else if (agent && environment && initialStateLoaded) {
             console.log("Initial state loaded successfully.");
        } else if (!agent || !environment) {
            // This case should have been caught earlier, but double-check
             throw new Error("Agent/Environment null after initialization attempt.");
        }

        // 7. Start Animation Loop if no critical errors occurred
        if (!criticalError) {
             console.log("Initialization complete. Starting animation loop.");
             requestAnimationFrame(animate); // Start the loop
             initSuccess = true;
        } else {
             console.error("Initialization encountered critical errors. Animation loop will not start.");
             disableControls();
        }

    } catch (error) {
        criticalError = true;
        console.error("Application Initialization Failed:", error);
        displayError(`Initialization Failed: ${error.message}`, true, 'error-message');
        disableControls();
        initSuccess = false;
    }
    return initSuccess;
}


/** Performs the first simulation step to get initial data */
async function runInitialStep() {
    try {
        // Create initial state vector
        const initialStateVector = zeros(Config.Agent.BASE_STATE_DIM);
        
        // Process initial state with default context
        const agentResponse = await agent.process(initialStateVector, calculateGraphFeatures());
        
        if (!agentResponse || !agentResponse.valid) {
            throw new Error("Initial agent process returned invalid response.");
        }
        
        // --- Update Metrics with Initial State ---
        simulationMetrics.currentStateVector = [...initialStateVector]; // Store a copy
        
        // Convert emotions to tensor if it's not already a tensor
        if (agentResponse.emotions) {
            // Dispose previous tensor if it exists
            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
                try { simulationMetrics.currentAgentEmotions.dispose(); } catch (e) { /* Ignore */ }
            }
            
            // Check if emotions is already a tensor or an array
            if (agentResponse.emotions.dataSync && typeof agentResponse.emotions.clone === 'function') {
                // It's a tensor, keep it
                simulationMetrics.currentAgentEmotions = tf.keep(agentResponse.emotions);
            } else if (Array.isArray(agentResponse.emotions)) {
                // It's an array, convert to tensor
                const emotionsArray = agentResponse.emotions;
                simulationMetrics.currentAgentEmotions = tf.keep(tf.tensor(
                    [emotionsArray], 
                    [1, emotionsArray.length]
                ));
            } else {
                // Unknown format, create zeros tensor
                simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            }
        } else {
            // No emotions in response, create zeros tensor
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }
        
        // Update other metrics
        simulationMetrics.currentRIHScore = agentResponse.rih || 0;
        simulationMetrics.currentAvgAffinity = agentResponse.avgAffinity || 0;
        simulationMetrics.currentTrustScore = agentResponse.trustScore || 1.0;
        simulationMetrics.currentHmLabel = agentResponse.headMovement || "idle";
        simulationMetrics.currentContext = "Simulation initialized";
        
        // Create a clone for this frame's rendering
        let initialFrameEmotions = tf.keep(simulationMetrics.currentAgentEmotions.clone());
        
        // Update UI with initial state
        updateDashboardDisplay();
        updateEmotionBars(initialFrameEmotions);
        updateCascadeViewer();
        
        // Update visualizations with initial state
        if (threeInitialized) {
            updateThreeJS(0, simulationMetrics.currentStateVector, simulationMetrics.currentRIHScore, 
                         agent.latestAffinities || [], simulationMetrics.currentIntegrationParam, 
                         simulationMetrics.currentReflexivityParam, [], simulationMetrics.currentContext);
            updateSyntrometryInfoPanel();
        }
        
        if (conceptInitialized) {
            updateAgentSimulationVisuals(initialFrameEmotions, simulationMetrics.currentRIHScore, 
                                        simulationMetrics.currentAvgAffinity, simulationMetrics.currentHmLabel, 
                                        simulationMetrics.currentTrustScore);
            animateConceptNodes(0, simulationMetrics.currentIntegrationParam, 
                               simulationMetrics.currentReflexivityParam, -1, -1, -1);
        }
        
        // Update Live2D - but don't throw errors if it fails
        try {
            if (live2dInitialized) {
                updateLive2DEmotions(initialFrameEmotions);
                updateLive2DHeadMovement(simulationMetrics.currentHmLabel, 0);
                updateLive2D(0);
            }
        } catch (e) {
            console.warn("Live2D update during initialization failed:", e);
            // Don't let Live2D errors stop initialization
        }
        
        // Dispose the frame clone
        if (initialFrameEmotions && !initialFrameEmotions.isDisposed) {
            try { initialFrameEmotions.dispose(); } catch (e) { /* Ignore */ }
        }
        
        return true;
    } catch (error) {
        console.error("Error during initial agent/environment processing:", error);
        displayError(`Error initializing agent state: ${error.message}. Simulation may be unstable.`, true);
        
        // Set default metrics on error
        simulationMetrics.currentStateVector = zeros(Config.Agent.BASE_STATE_DIM);
        
        // Dispose previous tensor if it exists
        if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
            try { simulationMetrics.currentAgentEmotions.dispose(); } catch (e) { /* Ignore */ }
        }
        
        // Create default emotions tensor
        simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        
        simulationMetrics.currentRIHScore = 0;
        simulationMetrics.currentAvgAffinity = 0;
        simulationMetrics.currentTrustScore = 1.0;
        simulationMetrics.currentHmLabel = "idle";
        simulationMetrics.currentContext = "Initialization Error";
        
        return false;
    }
}

/** Initializes the core Agent and Environment components */
function initAgentAndEnvironment() {
    if (typeof tf === 'undefined') {
        console.error("CRITICAL: TensorFlow.js is required but not loaded.");
        return false;
    }
    try {
        console.log("Attempting to create SyntrometricAgent...");
        agent = new SyntrometricAgent(); // Constructor now handles internal validation
        console.log("Agent instance created.");

        console.log("Attempting to create EmotionalSpace...");
        environment = new EmotionalSpace(); // Constructor handles internal validation
        console.log("Environment instance created.");

        // Agent constructor throws if validation fails, so agent should be valid if we reach here.
        console.log("Agent (V2.3.1) and Environment initialized successfully.");
        return true;
    } catch (e) {
        console.error('[Init] Agent/Environment creation/validation error:', e);
        displayError(`Initialization Error: ${e.message}. Simulation logic disabled.`, true, 'error-message');
        // Cleanup potentially partially created instances
        agent?.cleanup(); agent = null;
        environment?.cleanup(); environment = null;
        return false;
    }
}

/** Initializes the Chart.js metrics chart */
function initMetricsChart() {
    const canvas = document.getElementById('metrics-chart');
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
        console.error("Metrics chart canvas not found or is not a canvas element!");
        return;
    }
    if (metricsChart) {
        try { metricsChart.destroy(); } catch (e) { /* Ignore */ }
        metricsChart = null;
    }

    const computedStyle = getComputedStyle(document.documentElement);
    const chartGridColor = computedStyle.getPropertyValue('--chart-grid-color').trim() || 'rgba(200, 200, 220, 0.15)';
    const chartTickColor = 'rgba(238, 238, 238, 0.7)';
    const chartLegendLabelColor = 'rgba(238, 238, 238, 0.8)';
    const chartTooltipBg = computedStyle.getPropertyValue('--overlay-bg').trim() || 'rgba(18, 18, 34, 0.85)';
    const chartAccentColor = computedStyle.getPropertyValue('--primary-color').trim() || '#00aaff';
    const chartTextColor = computedStyle.getPropertyValue('--text-color').trim() || '#eeeeee';

    const colorRIHBorder = 'rgb(102, 255, 102)';
    const colorAffinityBorder = 'rgb(255, 170, 102)';
    const colorTrustBorder = 'rgb(102, 170, 255)';
    const colorBeliefNormBorder = 'rgb(255, 255, 102)';
    const colorSelfNormBorder = 'rgb(200, 150, 255)';

    try {
        metricsChart = new Chart(canvas, {
            type: 'line',
            data: { /* Dataset definitions - unchanged */
                datasets: [
                    { label: 'RIH', data: [], borderColor: colorRIHBorder, backgroundColor: colorRIHBorder.replace('rgb', 'rgba').replace(')', ', 0.1)'), borderWidth: 1.5, pointRadius: 0, yAxisID: 'yPercentage', tension: 0.1 },
                    { label: 'Affinity', data: [], borderColor: colorAffinityBorder, backgroundColor: colorAffinityBorder.replace('rgb', 'rgba').replace(')', ', 0.1)'), borderWidth: 1.5, pointRadius: 0, yAxisID: 'yBipolar', tension: 0.1 },
                    { label: 'Trust', data: [], borderColor: colorTrustBorder, backgroundColor: colorTrustBorder.replace('rgb', 'rgba').replace(')', ', 0.1)'), borderWidth: 1.5, pointRadius: 0, yAxisID: 'yPercentage', tension: 0.1 },
                    { label: 'Belief Norm', data: [], borderColor: colorBeliefNormBorder, backgroundColor: colorBeliefNormBorder.replace('rgb', 'rgba').replace(')', ', 0.1)'), borderWidth: 1, pointRadius: 0, yAxisID: 'yNorm', tension: 0.1, hidden: true },
                    { label: 'Self Norm', data: [], borderColor: colorSelfNormBorder, backgroundColor: colorSelfNormBorder.replace('rgb', 'rgba').replace(')', ', 0.1)'), borderWidth: 1, pointRadius: 0, yAxisID: 'yNorm', tension: 0.1, hidden: true }
                ]
             },
            options: { /* Options - mostly unchanged, ensure colors use variables */
                responsive: true, maintainAspectRatio: false, animation: false, // Disable animation for performance
                scales: {
                    x: { type: 'realtime', realtime: { duration: 30000, refresh: 1000, delay: 500, ttl: 60000 }, ticks: { display: false }, grid: { color: chartGridColor } },
                    yPercentage: { beginAtZero: true, max: 1.0, position: 'left', ticks: { color: chartTickColor, font: { size: 10 }, stepSize: 0.25, callback: value => (value * 100).toFixed(0) + '%' }, grid: { color: chartGridColor } },
                    yBipolar: { min: -1.0, max: 1.0, position: 'right', ticks: { color: chartTickColor, font: { size: 10 }, stepSize: 0.5 }, grid: { display: false } },
                    yNorm: { beginAtZero: true, position: 'right', display: false, ticks: { color: chartTickColor, font: { size: 10 } }, grid: { display: false } }
                },
                plugins: {
                    legend: { position: 'bottom', align: 'start', labels: { color: chartLegendLabelColor, font: { size: 10 }, boxWidth: 12, padding: 10 },
                        onClick: (e, legendItem, legend) => { /* ... unchanged legend click logic ... */
                            const index = legendItem.datasetIndex;
                            const ci = legend.chart;
                            const meta = ci.getDatasetMeta(index);
                            meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
                            if (ci.options.scales.yNorm && (index === 3 || index === 4)) {
                                const normVisible = !ci.getDatasetMeta(3).hidden || !ci.getDatasetMeta(4).hidden;
                                ci.options.scales.yNorm.display = normVisible;
                            }
                            ci.update();
                        }
                    },
                    tooltip: { enabled: true, mode: 'index', intersect: false, backgroundColor: chartTooltipBg, titleColor: chartAccentColor, bodyColor: chartTextColor, boxPadding: 5,
                        callbacks: { /* ... unchanged tooltip callbacks ... */
                            title: (tooltipItems) => tooltipItems[0]?.label ? new Date(tooltipItems[0].parsed.x).toLocaleTimeString() : '',
                            label: (context) => { /* ... unchanged label logic ... */
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    const value = context.parsed.y;
                                    label += (context.dataset.yAxisID === 'yPercentage')
                                        ? (value * 100).toFixed(1) + '%'
                                        : value.toFixed(3);
                                }
                                return label;
                            }
                         }
                    }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
        console.log("Metrics chart initialized.");
    } catch (chartError) {
        console.error("Error initializing Chart.js:", chartError);
        displayError(`Chart initialization failed: ${chartError.message}`, false, 'error-message');
    }
}

/** Updates read-only slider displays */
function updateSliderDisplays(integration, reflexivity) {
    const integrationValue = document.getElementById('integration-value');
    const reflexivityValue = document.getElementById('reflexivity-value');
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');

    if (integrationValue) integrationValue.textContent = (typeof integration === 'number' && isFinite(integration)) ? integration.toFixed(2) : 'N/A';
    if (reflexivityValue) reflexivityValue.textContent = (typeof reflexivity === 'number' && isFinite(reflexivity)) ? reflexivity.toFixed(2) : 'N/A';

    // Sliders are disabled, but update their visual state
    if (integrationSlider && typeof integration === 'number' && isFinite(integration)) {
        integrationSlider.value = String(integration);
    }
    if (reflexivitySlider && typeof reflexivity === 'number' && isFinite(reflexivity)) {
        reflexivitySlider.value = String(reflexivity);
    }
}

/** Sets up UI controls (sliders, buttons) */
function setupControls() {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const saveButton = document.getElementById('save-state-button');
    const loadButton = document.getElementById('load-state-button');
    const labelToggle = document.getElementById('labels-toggle'); // Moved to concept graph section in HTML

    // Sliders are read-only displays of agent state
    if (integrationSlider) { integrationSlider.disabled = true; integrationSlider.classList.add('read-only-slider'); }
    if (reflexivitySlider) { reflexivitySlider.disabled = true; reflexivitySlider.classList.add('read-only-slider'); }

    // State buttons
    if (saveButton) { saveButton.addEventListener('click', saveState); saveButton.disabled = criticalError; }
    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true)); // Pass true to show messages
        loadButton.disabled = criticalError;
        if (localStorage.getItem(SAVED_STATE_KEY)) loadButton.classList.add('has-saved-state');
    }

    // Label Toggle (Concept Graph Specific)
     if (labelToggle) {
         const toggleLabels = (show) => {
             if (!conceptScene) return; // Check if scene is initialized
             conceptScene.traverse((object) => {
                 // Check if it's a CSS2DObject and has the 'label' class
                 if (object instanceof CSS2DObject && object.element?.classList.contains('label')) {
                     object.visible = show;
                 }
             });
         };
         labelToggle.addEventListener('change', (e) => toggleLabels(e.target.checked));
         // Set initial state based on checkbox default
         if (conceptScene) toggleLabels(labelToggle.checked);
     } else { console.warn("Labels toggle checkbox not found."); }
}

/** Disables interactive controls when critical error occurs */
function disableControls() {
    const selectors = ['#integration-slider', '#reflexivity-slider', '#save-state-button', '#load-state-button', '#chat-input', '#labels-toggle'];
    selectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
            el.disabled = true;
            if (el.id === 'chat-input') el.placeholder = "Simulation disabled.";
            if (el.id === 'labels-toggle') el.parentElement.style.opacity = '0.5'; // Dim label too
        }
    });
}

/** Sets up the chat input listener */
function setupChat() {
    const chatInput = document.getElementById('chat-input');
    const chatOutput = document.getElementById('chat-output');
    if (!chatInput || !chatOutput) return;

    chatInput.disabled = criticalError;
    chatInput.placeholder = criticalError ? "Simulation disabled." : "Interact with the simulation...";

    chatInput.addEventListener('keypress', async (e) => {
        if (e.key !== 'Enter' || !chatInput.value.trim() || criticalError) return;

        const userInput = chatInput.value.trim();
        appendChatMessage('You', userInput);
        chatInput.value = ''; // Clear input

        if (!agent || !environment) {
            appendChatMessage('System', 'Environment/Agent not ready.');
            return;
        }

        chatInput.disabled = true; // Disable during processing
        try {
            // Let environment process text and potentially update base emotions
            const impactTensor = await environment.getEmotionalImpactFromText(userInput);
            // Log interaction
            logToTimeline(`Chat: "${userInput.substring(0, 25)}..."`, 'expressions-list');
            appendChatMessage('System', 'Input processed.');
            lastChatImpactTime = appClock.getElapsedTime(); // Trigger feedback viz
            safeDispose(impactTensor); // Dispose tensor returned by env

        } catch (chatError) {
            console.error("Error processing chat input:", chatError);
            appendChatMessage('System', 'Error processing input.');
        } finally {
            chatInput.disabled = criticalError; // Re-enable (or keep disabled if critical)
        }
    });
}

/** Sets up the toggle for the tensor inspector panel */
function setupInspectorToggle() {
    const toggleButton = document.getElementById('toggle-inspector');
    const inspectorPanel = document.getElementById('tensor-inspector-panel');
    if (!toggleButton || !inspectorPanel) return;

    toggleButton.addEventListener('click', async () => {
        const isVisible = inspectorPanel.classList.toggle('visible');
        toggleButton.setAttribute('aria-expanded', String(isVisible));
        if (isVisible && agent) {
            let beliefEmbeddingTensor = null;
            try {
                beliefEmbeddingTensor = agent.getLatestBeliefEmbedding(); // Returns a kept clone or null
                await inspectTensor(beliefEmbeddingTensor, 'tensor-inspector-content');
            } catch (e) {
                await inspectTensor(`[Error getting tensor: ${e.message}]`, 'tensor-inspector-content');
            } finally {
                safeDispose(beliefEmbeddingTensor); // Dispose the clone after inspection
            }
        } else if (isVisible && !agent) {
             await inspectTensor(null, 'tensor-inspector-content'); // Show null if agent unavailable
        }
    });
    toggleButton.setAttribute('aria-expanded', inspectorPanel.classList.contains('visible'));
}

// --- State Management ---

/** Saves the current simulation state to localStorage */
function saveState() {
    if (criticalError || !agent || !environment) {
        console.warn("Cannot save state: Simulation not ready or critical error.");
        appendChatMessage('System', 'Save failed: Simulation not ready.');
        return;
    }
    try {
        const envState = environment.getState();
        const agentState = agent.getState(); // Agent state includes weight arrays etc.

        if (!envState || !agentState || agentState.error) {
            throw new Error(`Failed to retrieve state: ${agentState?.error || 'Agent/Env state missing'}`);
        }

        const stateToSave = {
            version: Config.VERSION,
            timestamp: new Date().toISOString(),
            environment: envState,
            agent: agentState,
            metrics: { // Save key metrics for quick preview info
                rih: simulationMetrics.currentRIHScore,
                affinity: simulationMetrics.currentAvgAffinity,
                trust: simulationMetrics.currentTrustScore,
                integration: simulationMetrics.currentIntegrationParam,
                reflexivity: simulationMetrics.currentReflexivityParam,
            }
        };

        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave));
        console.log(`Simulation state (V${stateToSave.version}) saved.`);
        appendChatMessage('System', 'Simulation state saved.');
        logToTimeline('State Saved', 'expressions-list');
        const loadButton = document.getElementById('load-state-button');
        if (loadButton) loadButton.classList.add('has-saved-state');

    } catch (e) {
        console.error("Error saving state:", e);
        appendChatMessage('System', `Save failed: ${e.message}`);
        displayError(`Error saving state: ${e.message}`, false, 'error-message');
    }
}

/** Loads simulation state from localStorage */
async function loadState(showMessages = false) {
    // Halt simulation loop during load
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    const wasCritical = criticalError; // Store previous error state
    criticalError = true; // Halt simulation activity

    if (!agent || !environment) {
        console.warn("Agent/Environment not initialized, cannot load state.");
        if (showMessages) appendChatMessage('System', 'Load failed: Simulation components not ready.');
        criticalError = wasCritical; // Restore previous error state
        return false;
    }

    const stateString = localStorage.getItem(SAVED_STATE_KEY);
    if (!stateString) {
        console.log("No saved state found.");
        if (showMessages) appendChatMessage('System', 'No saved state found.');
        criticalError = wasCritical;
        return false;
    }

    let stateLoadedSuccessfully = false;
    try {
        const stateToLoad = JSON.parse(stateString);
        if (!stateToLoad || stateToLoad.version !== Config.VERSION) {
            throw new Error(`Incompatible state version: ${stateToLoad?.version}. Expected ${Config.VERSION}`);
        }
        if (!stateToLoad.environment || !stateToLoad.agent || stateToLoad.agent.error) {
            throw new Error(`Saved state invalid or contains error: ${stateToLoad?.agent?.error || 'Missing agent/env data'}`);
        }

        console.log(`Loading state V${stateToLoad.version} saved at ${stateToLoad.timestamp}...`);

        // Load state into components (agent load handles internal cleanup/reinit)
        environment.loadState(stateToLoad.environment);
        const agentLoadSuccess = await agent.loadState(stateToLoad.agent); // loadState now returns boolean

        if (!agentLoadSuccess) {
            throw new Error("Agent failed to load state internally. Check agent logs.");
        }

        // --- Restore Simulation Metrics from Loaded Agent/Env State ---
        simulationMetrics.currentStateVector = environment.currentStateVector;

        safeDispose(simulationMetrics.currentAgentEmotions); // Dispose old tensor
        if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
            simulationMetrics.currentAgentEmotions = tf.keep(agent.prevEmotions.clone());
        } else {
            console.warn("Agent prevEmotions tensor invalid after load. Resetting to zeros.");
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        simulationMetrics.currentRIHScore = agent.lastRIH ?? 0;
        simulationMetrics.currentTrustScore = agent.latestTrustScore ?? 1.0;
        simulationMetrics.currentIntegrationParam = safeGetScalar(agent.integrationParam, Config.Agent.INTEGRATION_INIT);
        simulationMetrics.currentReflexivityParam = safeGetScalar(agent.reflexivityParam, Config.Agent.REFLEXIVITY_INIT);
        simulationMetrics.currentAvgAffinity = stateToLoad.metrics?.affinity ?? 0;
        simulationMetrics.currentContext = "State loaded.";
        simulationMetrics.currentHmLabel = "idle";
        simulationMetrics.currentCascadeHistory = [];
        simulationMetrics.currentBeliefNorm = 0.0; // Recalculated on next step
        simulationMetrics.currentSelfStateNorm = calculateArrayNorm(tensorToArray(agent.selfState));

        // --- Reset / Update UI ---
        if (metricsChart) {
            metricsChart.data.datasets.forEach((dataset) => dataset.data = []);
            metricsChart.update('quiet');
        }
        const timelineList = document.getElementById('expressions-list');
        if (timelineList) timelineList.innerHTML = ''; // Clear timeline
        logToTimeline('State Loaded', 'expressions-list');
        updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);
        updateDashboardDisplay();
        updateEmotionBars(simulationMetrics.currentAgentEmotions);
        updateCascadeViewer();
        updateHeatmap(tensorToArray(agent.selfState), 'heatmap-content');

        // --- Update Visualizations with Loaded State ---
        let loadFrameEmotions = tf.keep(simulationMetrics.currentAgentEmotions.clone()); // Keep clone for this frame

        if (threeInitialized) { /* ... Update ThreeJS ... */
            updateThreeJS(0, simulationMetrics.currentStateVector, simulationMetrics.currentRIHScore, agent.latestAffinities || [], simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, [], simulationMetrics.currentContext);
            updateSyntrometryInfoPanel();
         }
        if (conceptInitialized) { /* ... Update Concept Graph ... */
            updateAgentSimulationVisuals(loadFrameEmotions, simulationMetrics.currentRIHScore, simulationMetrics.currentAvgAffinity, simulationMetrics.currentHmLabel, simulationMetrics.currentTrustScore);
            animateConceptNodes(0, simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, -1, -1, -1);
        }
        if (live2dInitialized) { /* ... Update Live2D ... */
            updateLive2DEmotions(loadFrameEmotions);
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, 0);
            updateLive2D(0); // Render update
        }
        safeDispose(loadFrameEmotions); // Dispose frame clone

        if (showMessages) appendChatMessage('System', 'Simulation state loaded successfully.');
        console.log(`Simulation state loaded successfully.`);
        criticalError = false; // Load successful, allow animation restart
        stateLoadedSuccessfully = true;

    } catch (e) {
        console.error("Error loading state:", e);
        if (showMessages) appendChatMessage('System', `Load failed: ${e.message}`);
        displayError(`Load failed: ${e.message}. Check console.`, false, 'error-message');
        criticalError = wasCritical; // Restore original error state if load fails
        stateLoadedSuccessfully = false;
    } finally {
        // Restart animation loop ONLY if load was successful
        if (stateLoadedSuccessfully && !criticalError) {
             requestAnimationFrame(animate);
        } else if (!criticalError) {
             // If load failed but system wasn't critically broken before, maybe restart?
             // Or require manual start/refresh. Let's keep it stopped on failure for safety.
             console.warn("Load failed. Animation loop not restarted.");
        }
    }
    return stateLoadedSuccessfully;
}

// --- Main Animation Loop ---
function animate(timestamp) {
    // Calculate delta time
    const now = timestamp || performance.now();
    const deltaTime = lastFrameTime ? (now - lastFrameTime) / 1000 : 0.016; // Convert to seconds
    lastFrameTime = now;
    
    // Skip if critical error or paused
    if (criticalError || simulationPaused) {
        animationFrameId = requestAnimationFrame(animate);
        return;
    }
    
    // --- Run Simulation Step ---
    let currentFrameEmotions = null;
    
    if (agent && environment && !criticalError) {
        try {
            // Get current state and context
            const currentState = [...simulationMetrics.currentStateVector];
            const graphFeatures = calculateGraphFeatures();
            
            // Process agent step
            const agentResponse = agent.process(currentState, graphFeatures);
            
            if (!agentResponse || !agentResponse.valid) {
                throw new Error("Agent returned invalid response");
            }
            
            // --- Update Metrics ---
            // Update emotions tensor
            if (agentResponse.emotions) {
                // Dispose previous tensor if it exists
                if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
                    try { simulationMetrics.currentAgentEmotions.dispose(); } catch (e) { /* Ignore */ }
                }
                
                // Check if emotions is already a tensor or an array
                if (agentResponse.emotions.dataSync && typeof agentResponse.emotions.clone === 'function') {
                    // It's a tensor, keep it
                    simulationMetrics.currentAgentEmotions = tf.keep(agentResponse.emotions);
                } else if (Array.isArray(agentResponse.emotions)) {
                    // It's an array, convert to tensor
                    const emotionsArray = agentResponse.emotions;
                    simulationMetrics.currentAgentEmotions = tf.keep(tf.tensor(
                        [emotionsArray], 
                        [1, emotionsArray.length]
                    ));
                } else {
                    // Unknown format, create zeros tensor
                    simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
                }
            }
            
            // Create a clone for this frame's rendering
            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
                currentFrameEmotions = tf.keep(simulationMetrics.currentAgentEmotions.clone());
            }
            
            // Update other metrics
            simulationMetrics.currentRIHScore = agentResponse.rih ?? simulationMetrics.currentRIHScore;
            simulationMetrics.currentAvgAffinity = agentResponse.avgAffinity ?? simulationMetrics.currentAvgAffinity;
            simulationMetrics.currentTrustScore = agentResponse.trustScore ?? simulationMetrics.currentTrustScore;
            simulationMetrics.currentHmLabel = agentResponse.headMovement ?? simulationMetrics.currentHmLabel;
            simulationMetrics.currentBeliefNorm = agentResponse.beliefNorm ?? 0.0;
            simulationMetrics.currentSelfStateNorm = agentResponse.selfStateNorm ?? 0.0;
            
            // Update UI elements reflecting agent parameters
            updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);
            
        } catch (e) {
            // Handle errors during the simulation step
            console.error("Error during simulation step:", e);
            displayError(`Simulation Step Error: ${e.message}. Attempting recovery.`, false);
            
            // Ensure any potentially invalid cloned tensor from this failed step is disposed
            if (currentFrameEmotions && !currentFrameEmotions.isDisposed) {
                try { currentFrameEmotions.dispose(); } catch (e) { /* Ignore */ }
            }
            currentFrameEmotions = null; // Reset the frame's tensor
            
            // Attempt to recover the main simulation emotion tensor
            if (!simulationMetrics.currentAgentEmotions || simulationMetrics.currentAgentEmotions.isDisposed) {
                console.warn("Agent emotions tensor became invalid during error, resetting to zeros.");
                // Dispose just in case it exists but is disposed
                if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
                    try { simulationMetrics.currentAgentEmotions.dispose(); } catch (e) { /* Ignore */ }
                }
                // Create and keep a new zero tensor as the main state
                simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            }
            
            // Make sure currentFrameEmotions is valid for rendering this frame
            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
                currentFrameEmotions = tf.keep(simulationMetrics.currentAgentEmotions.clone());
            }
            
            // Update context to reflect the error
            simulationMetrics.currentContext = "Simulation error occurred.";
        }
    } else {
        // Handle cases where simulation prerequisites aren't met
        if (!simulationMetrics.currentAgentEmotions || simulationMetrics.currentAgentEmotions.isDisposed) {
            console.warn("Initializing/Resetting simulation emotions in animation loop.");
            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
                try { simulationMetrics.currentAgentEmotions.dispose(); } catch (e) { /* Ignore */ }
            }
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }
        
        // Ensure we have a valid tensor for this frame's rendering
        if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
            currentFrameEmotions = tf.keep(simulationMetrics.currentAgentEmotions.clone());
        }
        
        // Update context message if components are missing
        if (!agent || !environment) {
            simulationMetrics.currentContext = "Simulation components missing.";
        }
    }
    
    // --- Update UI and Visualizations ---
    try {
        updateDashboardDisplay();
        updateMetricsChart();
        
        if (currentFrameEmotions) {
            updateEmotionBars(currentFrameEmotions);
        }
        
        updateCascadeViewer();
        
        // Update Syntrometry Viz
        if (threeInitialized) {
            updateThreeJS(deltaTime, simulationMetrics.currentStateVector, simulationMetrics.currentRIHScore, 
                         agent?.latestAffinities || [], simulationMetrics.currentIntegrationParam, 
                         simulationMetrics.currentReflexivityParam, simulationMetrics.currentCascadeHistory, 
                         simulationMetrics.currentContext);
            updateSyntrometryInfoPanel();
        }
        
        // Update Concept Viz
        if (conceptInitialized && currentFrameEmotions) {
            updateAgentSimulationVisuals(currentFrameEmotions, simulationMetrics.currentRIHScore, 
                                        simulationMetrics.currentAvgAffinity, simulationMetrics.currentHmLabel, 
                                        simulationMetrics.currentTrustScore);
            animateConceptNodes(deltaTime, simulationMetrics.currentIntegrationParam, 
                               simulationMetrics.currentReflexivityParam, -1, -1, -1);
            
            if (conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
                conceptRenderer.render(conceptScene, conceptCamera);
                conceptLabelRenderer.render(conceptScene, conceptCamera);
            }
            
            if (conceptControls) conceptControls.update();
        }
        
        // Update Live2D Avatar - with error handling
        try {
            if (live2dInitialized && currentFrameEmotions) {
                // Convert tensor to array for Live2D
                const emotionsArray = Array.from(currentFrameEmotions.dataSync());
                updateLive2DEmotions(emotionsArray);
                updateLive2DHeadMovement(simulationMetrics.currentHmLabel, deltaTime);
                updateLive2D(deltaTime);
            }
        } catch (e) {
            console.warn("Error during Live2D update in animation loop:", e);
            // Don't let Live2D errors stop the animation loop
        }
    } catch (e) {
        console.error("Error during UI update:", e);
    }
    
    // Dispose the frame clone
    if (currentFrameEmotions && !currentFrameEmotions.isDisposed) {
        try { currentFrameEmotions.dispose(); } catch (e) { /* Ignore */ }
    }
    
    // Request next frame
    animationFrameId = requestAnimationFrame(animate);
}

// --- Cleanup ---
function cleanup() {
    console.log("Cleaning up application resources...");
    criticalError = true; // Prevent animation loop restarts
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Remove global listeners
    window.removeEventListener('resize', resizeConceptGraphRenderer);
    window.removeEventListener('resize', handleWindowResize); // Remove general resize handler if added
    window.removeEventListener('beforeunload', cleanup);

    // Destroy chart
    if (metricsChart) { try { metricsChart.destroy(); metricsChart = null; } catch (e) { console.error("Chart destroy error:", e); }}

    // Cleanup visualizations and core components
    try { cleanupLive2D(); } catch (e) { console.error("Live2D cleanup error:", e); }
    try { cleanupConceptVisualization(); } catch (e) { console.error("ConceptViz cleanup error:", e); }
    try { cleanupThreeJS(); } catch (e) { console.error("ThreeJS (Syntrometry) cleanup error:", e); }
    try { agent?.cleanup(); } catch (e) { console.error("Agent cleanup error:", e); }
    try { environment?.cleanup(); } catch (e) { console.error("Environment cleanup error:", e); }

    // Dispose global simulation state tensor
    safeDispose(simulationMetrics.currentAgentEmotions);

    // Nullify references
    agent = null;
    environment = null;
    simulationMetrics.currentAgentEmotions = null;
    simulationMetrics.currentStateVector = null; // Or reset to zeros

    console.log("Application cleanup complete.");
}

// --- Setup and Event Listeners ---

/** Sets up UI event listeners */
function setupEventListeners() {
    window.addEventListener('resize', handleWindowResize);
    // Setup UI components
    setupControls();
    setupChat();
    setupInspectorToggle();
    // Initialize Draggable Panels
    initializeDraggablePanels(
        '.overlay-panel',
        '.visualization-container', // Use the main viz container as bounds
        ['input', 'button', 'textarea', 'select', 'progress', 'canvas', '.no-drag', '[role="button"]', 'a', 'pre', '.chart-container', '.cv-syndrome-container', '.label', '#chat-output', '#tensor-inspector-content'], // Ignore more elements
        ['heatmap-cell', 'cv-syndrome-bar', 'bar-fill', 'metric-value', 'metric-label', 'label'] // Ignore specific interaction classes
    );
    console.log("UI Event listeners initialized.");
}

/** General window resize handler */
function handleWindowResize() {
    // Call specific resize handlers if needed
    resizeConceptGraphRenderer(); // Concept graph needs explicit resize
    // Syntrometry viz handles resize internally via listener added in its init
    // Live2D viz handles resize internally via resizeTo option in Pixi App
    if (metricsChart) metricsChart.resize(); // Resize chart
}

// --- Start Application ---
window.addEventListener('load', initialize);
window.addEventListener('beforeunload', cleanup);





