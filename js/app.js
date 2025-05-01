// --- Imports ---
import { Config, emotionKeywords, emotionNames } from './config.js';
import { displayError, appendChatMessage, zeros, tensor, clamp, inspectTensor, logToTimeline } from './utils.js';
import { SyntrometricAgent } from './agent.js';
import { EmotionalSpace } from './environment.js';
import {
    initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel,
    threeInitialized, calculateGraphFeatures,
    rihNode // Keep rihNode export if still needed externally, though less likely now
} from './viz-syntrometry.js';
import {
    initConceptVisualization, updateAgentSimulationVisuals, animateConceptNodes,
    updateInfoPanel, cleanupConceptVisualization, conceptInitialized,
    conceptRenderer, conceptLabelRenderer, conceptScene, conceptCamera, conceptControls
} from './viz-concepts.js';
import { initLive2D, updateLive2DEmotions, updateLive2DHeadMovement, live2dInitialized, cleanupLive2D, updateLive2D } from './viz-live2d.js';
// CORRECT: updateLive2D is now included
// --- Global State ---
let criticalError = false;
let agent = null;
let environment = null;
let animationFrameId = null;

// Grouped Simulation State Metrics
const simulationMetrics = {
    currentStateVector: null,
    currentAgentEmotions: null, // Holds the TF.js Tensor
    currentRIHScore: 0,
    currentAvgAffinity: 0,
    currentTrustScore: 1.0,
    currentBeliefNorm: 0.0,
    currentSelfStateNorm: 0.0,
    currentHmLabel: "idle",
    currentContext: "Initializing...",
    currentCascadeHistory: [],
    currentIntegrationParam: 0.5,
    currentReflexivityParam: 0.5,
};

const appClock = new THREE.Clock();
const SAVED_STATE_KEY = 'syntrometrySimulationState_v2_3_1'; // Updated key for version

// Timestamps for Input Feedback
let lastIntegrationInputTime = -1;
let lastReflexivityInputTime = -1;
let lastChatImpactTime = -1;
const inputFeedbackDuration = 0.5;

// Chart.js Instance
let metricsChart = null;
const MAX_CHART_POINTS = 150; // Limit points displayed for performance

// Resize Handler for Concept Graph Visualization
function resizeConceptGraphRenderer() {
    if (!conceptInitialized || !conceptRenderer || !conceptLabelRenderer || !conceptCamera) {
        return;
    }
    const container = document.getElementById('concept-panel');
    if (!container) {
        console.error('Concept panel container not found for resize.');
        return;
    }
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return; // Prevent errors on hidden containers

    conceptRenderer.setSize(width, height);
    conceptRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    conceptLabelRenderer.setSize(width, height);
    conceptCamera.aspect = width / height;
    conceptCamera.updateProjectionMatrix();
}

// --- Helper Functions ---
function calculateArrayNorm(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return 0.0;
    let sumSq = 0;
    for (const val of arr) {
        if (typeof val === 'number' && isFinite(val)) {
            sumSq += val * val;
        }
    }
    return Math.sqrt(sumSq);
}

function updateHeatmap(stateVector, targetElementId) {
    const heatmapContainer = document.getElementById(targetElementId);
    if (!heatmapContainer || !Array.isArray(stateVector)) {
        return;
    }

    const vectorLength = stateVector.length;
    if (vectorLength === 0) {
        heatmapContainer.innerHTML = '<p class="heatmap-placeholder">No State Data</p>';
        return;
    }

    // Optimized grid calculation
    const gridDim = Math.ceil(Math.sqrt(vectorLength));
    const containerWidth = heatmapContainer.clientWidth;
    const cellSize = Math.max(2, Math.floor(containerWidth / gridDim) - 1);

    heatmapContainer.style.gridTemplateColumns = `repeat(${gridDim}, ${cellSize}px)`;
    heatmapContainer.style.gridTemplateRows = `repeat(${gridDim}, ${cellSize}px)`;

    let htmlContent = '';
    for (let i = 0; i < vectorLength; i++) {
        const value = stateVector[i] ?? 0;
        const absValue = Math.abs(value);
        let r = 30, g = 30, b = 30;
        const intensity = Math.min(1.0, absValue * 1.5);

        if (value > 0.01) { // Positive: Red/Orange scale
            r = 30 + Math.round(200 * intensity);
            g = 30 + Math.round(50 * intensity); // Added slight green for orange tint
            b = 30;
        } else if (value < -0.01) { // Negative: Blue/Cyan scale
            r = 30;
            g = 30 + Math.round(50 * intensity);
            b = 30 + Math.round(200 * intensity);
        } // Else: Near-zero remains dark grey (30,30,30)

        r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
        const color = `rgb(${r}, ${g}, ${b})`;
        const tooltip = `Idx ${i}: ${value.toFixed(4)}`;
        htmlContent += `<div class="heatmap-cell" style="background-color: ${color};" title="${tooltip}"></div>`;
    }

    // Fill remaining grid cells if not a perfect square
    const totalCells = gridDim * gridDim;
    for (let i = vectorLength; i < totalCells; i++) {
        htmlContent += `<div class="heatmap-cell filler" style="width:${cellSize}px; height:${cellSize}px;"></div>`;
    }

    heatmapContainer.innerHTML = htmlContent;
}

function updateMetricsChart() {
    if (!metricsChart || criticalError || agent === null) return;

    const now = Date.now(); // Use Chart.js built-in time handling

    try {
        // Add new data points
        metricsChart.data.datasets[0].data.push({ x: now, y: simulationMetrics.currentRIHScore });
        metricsChart.data.datasets[1].data.push({ x: now, y: simulationMetrics.currentAvgAffinity });
        metricsChart.data.datasets[2].data.push({ x: now, y: simulationMetrics.currentTrustScore });
        metricsChart.data.datasets[3].data.push({ x: now, y: simulationMetrics.currentBeliefNorm });
        metricsChart.data.datasets[4].data.push({ x: now, y: simulationMetrics.currentSelfStateNorm });

        // Limit data points for performance (Chart.js streaming plugin handles this mostly via `ttl`)
        metricsChart.data.datasets.forEach(dataset => {
            while (dataset.data.length > MAX_CHART_POINTS * 1.2) { // Keep slightly more than max for smoother look
                dataset.data.shift();
            }
        });

        metricsChart.update('quiet'); // Use quiet update for less animation overhead
    } catch (e) {
        console.error("Error updating metrics chart:", e);
        // Consider disabling chart updates temporarily if errors persist
    }
}

function updateDashboardDisplay() {
    const updateElement = (id, value, text = null, progress = false, range = [0, 1], invert = false) => {
        const element = document.getElementById(id);
        if (element) {
            const displayValue = text !== null ? text : (typeof value === 'number' ? value.toFixed(3) : 'N/A');
            if (element.tagName === 'PROGRESS') {
                const [min, max] = range;
                const scaledValue = (typeof value === 'number' && (max - min) !== 0)
                    ? ((value - min) / (max - min)) * 100
                    : 50; // Default to middle if value invalid or range zero
                element.value = clamp(invert ? 100 - scaledValue : scaledValue, 0, 100);
            } else {
                element.textContent = displayValue;
            }
        } else {
            // console.warn(`Dashboard element not found: ${id}`); // Reduce noise
        }
    };

    updateElement('metric-rih-value', simulationMetrics.currentRIHScore * 100, `${(simulationMetrics.currentRIHScore * 100).toFixed(1)}%`);
    updateElement('metric-rih-progress', simulationMetrics.currentRIHScore, null, true);
    updateElement('metric-affinity-value', simulationMetrics.currentAvgAffinity, simulationMetrics.currentAvgAffinity.toFixed(2));
    updateElement('metric-affinity-progress', simulationMetrics.currentAvgAffinity, null, true, [-1, 1]);
    updateElement('metric-trust-value', simulationMetrics.currentTrustScore * 100, `${(simulationMetrics.currentTrustScore * 100).toFixed(1)}%`);
    updateElement('metric-trust-progress', simulationMetrics.currentTrustScore, null, true);
    updateElement('metric-belief-norm', simulationMetrics.currentBeliefNorm);
    updateElement('metric-self-norm', simulationMetrics.currentSelfStateNorm);
    updateElement('metric-context', 0, simulationMetrics.currentContext);
}

function updateEmotionBars(emotionsTensor) {
    const container = document.getElementById('emotion-intensities');
    if (!container) return; // Element not found

    // Check if tensor is valid and usable
    const isValidTensor = emotionsTensor && typeof emotionsTensor.arraySync === 'function' && !emotionsTensor.isDisposed;

    if (!isValidTensor) {
        container.style.opacity = '0.5'; // Dim if no valid data
        // Optionally clear bars or set to zero
        emotionNames.forEach(name => {
            const barFill = container.querySelector(`.${name.toLowerCase()} .bar-fill`);
            if (barFill) barFill.style.width = `0%`;
        });
        return;
    }

    container.style.opacity = '1'; // Ensure visible if data is valid

    try {
        const emotions = emotionsTensor.arraySync()[0]; // Get the actual array data
        if (!Array.isArray(emotions)) throw new Error("arraySync did not return an array.");

        emotionNames.forEach((name, index) => {
            const barFill = container.querySelector(`.${name.toLowerCase()} .bar-fill`);
            if (barFill) {
                if (index < emotions.length && typeof emotions[index] === 'number') {
                    const intensity = clamp(emotions[index] * 100, 0, 100);
                    barFill.style.width = `${intensity}%`;
                } else {
                    barFill.style.width = '0%'; // Handle missing/invalid data for specific emotion index
                }
            }
        });
    } catch (e) {
        console.error("Error updating emotion bars:", e);
        // Potentially dispose the problematic tensor if it caused the error
        if (emotionsTensor && !emotionsTensor.isDisposed) {
            try { tf.dispose(emotionsTensor); } catch (disposeError) { /* Ignore */ }
        }
        // Make currentAgentEmotions null to prevent repeated errors (will be reset in animate loop)
        simulationMetrics.currentAgentEmotions = null;
        container.style.opacity = '0.5'; // Dim on error
    }
}

function updateCascadeViewer() {
    const contentDiv = document.getElementById('cascade-viewer-content');
    if (!contentDiv) return;

    const history = simulationMetrics.currentCascadeHistory;

    if (!Array.isArray(history) || history.length === 0) {
        contentDiv.innerHTML = '<span class="cascade-placeholder">No cascade data.</span>';
        return;
    }

    const containerBaseHeight = 50; // Increased height for better visibility
    const maxBarHeight = containerBaseHeight - 4; // 46px usable height

    let html = '';
    history.forEach((levelArray, index) => {
        if (!Array.isArray(levelArray)) {
             html += `<div class="cv-level"><div class="cv-level-title">Level ${index} (Invalid Data)</div></div>`;
             return; // Skip invalid levels
        }

        html += `<div class="cv-level">`;
        html += `<div class="cv-level-title">Level ${index} (${levelArray.length} syndromes)</div>`;
        html += `<div class="cv-syndrome-container" style="height: ${containerBaseHeight}px;">`;

        if (levelArray.length > 0) {
            levelArray.forEach((value, sIndex) => {
                 if (typeof value !== 'number' || !isFinite(value)) value = 0; // Sanitize value

                const absValue = Math.abs(value);
                const colorIntensity = clamp(absValue * 1.2, 0, 1);
                const barHeightPx = clamp(absValue * maxBarHeight * 1.5, 2, maxBarHeight); // Min height 2px

                let r = 50, g = 50, b = 50;
                if (value > 0.01) {
                    r = 50 + Math.round(180 * colorIntensity); g = 50 + Math.round(30 * colorIntensity); b = 50;
                } else if (value < -0.01) {
                    r = 50; g = 50 + Math.round(80 * colorIntensity); b = 50 + Math.round(180 * colorIntensity);
                }
                r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
                const color = `rgb(${r},${g},${b})`;

                html += `<div class="cv-syndrome-bar" style="background-color: ${color}; height: ${barHeightPx}px;" title="Lvl ${index}, Idx ${sIndex}: ${value.toFixed(4)}"></div>`;
            });
        } else {
            html += '<span class="cascade-placeholder">[Empty Level]</span>';
        }
        html += `</div></div>`;
    });
    contentDiv.innerHTML = html;
     // Scroll to bottom (newest level) after updating
     contentDiv.scrollTop = contentDiv.scrollHeight;
}

// --- Initialization ---
async function initialize() {
    console.log("Initializing application (Agent V2.3)...");
    const coreInitSuccess = initAgentAndEnvironment();
    const threeSuccess = initThreeJS(); // Syntrometry Viz
    const conceptSuccess = initConceptVisualization(appClock); // Concept Viz
    const live2dSuccess = await initLive2D(); // Live2D Avatar

    // Handle core failures early
    if (!coreInitSuccess) {
        criticalError = true;
        displayError("Core simulation components (Agent/Environment/TF) failed to initialize. Simulation disabled. Check console.", true, 'error-message');
    }

    // Report non-critical visualization failures
    if (!threeSuccess) displayError("Syntrometry visualization failed to initialize.", false, 'syntrometry-error-message');
    if (!conceptSuccess) displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
    if (!live2dSuccess) displayError("Live2D avatar failed to initialize.", false, 'error-message'); // Display in main error area

    // Initialize UI elements that don't depend on core/viz
    initMetricsChart();
    setupControls(); // Enable/disable based on criticalError later
    setupChat(); // Enable/disable based on criticalError later
    setupInspectorToggle();

    // Attempt to load saved state or initialize new state
    let initialStateLoaded = false;
    if (coreInitSuccess) {
        initialStateLoaded = loadState(false); // Load state silently first
    }

    // If not loaded and core is ready, initialize a new state
    if (!initialStateLoaded && coreInitSuccess && agent && environment) {
        console.log("No valid saved state found or load skipped, initializing new simulation state...");
        const initialState = environment.reset(); // Reset environment
        const initialStateArray = initialState.state && !initialState.state.isDisposed
            ? initialState.state.arraySync()[0]
            : zeros([Config.Agent.BASE_STATE_DIM]);

        // Initialize currentStateVector correctly
        simulationMetrics.currentStateVector = initialStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
        while (simulationMetrics.currentStateVector.length < Config.Agent.BASE_STATE_DIM) simulationMetrics.currentStateVector.push(0);

        // Ensure clean initial emotions tensor
        if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
        simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Start with zero emotions

        // Perform an initial agent process step to get baseline metrics
        try {
            const initialGraphFeatures = calculateGraphFeatures();
            const initialAgentResponse = await agent.process(
                simulationMetrics.currentStateVector,
                initialGraphFeatures,
                { eventType: null, reward: 0 } // Initial neutral context
            );

            // Update simulation metrics from the initial response
            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
            simulationMetrics.currentAgentEmotions = initialAgentResponse.emotions; // Keep the tensor returned by agent
            simulationMetrics.currentRIHScore = initialAgentResponse.rihScore;
            simulationMetrics.currentAvgAffinity = (initialAgentResponse.affinities?.length > 0) ? initialAgentResponse.affinities.reduce((a, b) => a + b, 0) / initialAgentResponse.affinities.length : 0;
            simulationMetrics.currentHmLabel = initialAgentResponse.hmLabel;
            simulationMetrics.currentContext = "Simulation initialized (New State).";
            simulationMetrics.currentCascadeHistory = initialAgentResponse.cascadeHistory;
            simulationMetrics.currentIntegrationParam = initialAgentResponse.integration;
            simulationMetrics.currentReflexivityParam = initialAgentResponse.reflexivity;
            simulationMetrics.currentTrustScore = initialAgentResponse.trustScore;
            simulationMetrics.currentBeliefNorm = initialAgentResponse.beliefNorm ?? 0.0;
            simulationMetrics.currentSelfStateNorm = initialAgentResponse.selfStateNorm ?? 0.0;

            console.log("Initialized V2.3 with fresh agent state.");

        } catch (initialProcessError) {
             console.error("Error during initial agent processing:", initialProcessError);
             displayError(`Error initializing agent state: ${initialProcessError.message}. Simulation may be unstable.`, true, 'error-message');
             criticalError = true; // Treat this as critical
             // Reset metrics to default on error
             if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
             simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
             // Reset other metrics... (handled below in the !coreInitSuccess block)
        }

    } else if (!coreInitSuccess || !agent || !environment) {
        // Handle case where core failed or state wasn't loaded and couldn't be initialized
        console.warn("Core components not available or initial state failed. Setting default metrics.");
        simulationMetrics.currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);
        if (typeof tf !== 'undefined') {
            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        } else {
            simulationMetrics.currentAgentEmotions = null; // No TF available
        }
        simulationMetrics.currentRIHScore = 0;
        simulationMetrics.currentAvgAffinity = 0;
        simulationMetrics.currentHmLabel = "idle";
        simulationMetrics.currentContext = criticalError ? "Simulation core failed." : "Simulation state error.";
        simulationMetrics.currentCascadeHistory = [];
        simulationMetrics.currentIntegrationParam = 0.5;
        simulationMetrics.currentReflexivityParam = 0.5;
        simulationMetrics.currentTrustScore = 1.0;
        simulationMetrics.currentBeliefNorm = 0.0;
        simulationMetrics.currentSelfStateNorm = 0.0;
    }

    // Update UI based on the final initial state (loaded or new or default)
    updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);

    // --- Initialize Visualizations with Initial State ---
    if (threeInitialized) {
        updateThreeJS(
            0, // deltaTime
            simulationMetrics.currentStateVector,
            simulationMetrics.currentRIHScore,
            agent?.latestAffinities || [], // Use agent's internal cache if available
            simulationMetrics.currentIntegrationParam,
            simulationMetrics.currentReflexivityParam,
            simulationMetrics.currentCascadeHistory,
            simulationMetrics.currentContext
        );
        updateSyntrometryInfoPanel(); // Update info panel based on initial state
    }

    if (conceptInitialized) {
        try {
            updateAgentSimulationVisuals(
                simulationMetrics.currentAgentEmotions, // Pass the current tensor
                simulationMetrics.currentRIHScore,
                simulationMetrics.currentAvgAffinity,
                simulationMetrics.currentHmLabel,
                simulationMetrics.currentTrustScore
            );
            animateConceptNodes(0, simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, -1, -1, -1); // Initial animation state
        } catch (e) {
            console.error("Error during initial concept visualization update:", e);
        }
        resizeConceptGraphRenderer(); // Ensure correct size after setup
    }

    if (live2dInitialized) {
        try {
            updateLive2DEmotions(simulationMetrics.currentAgentEmotions); // Pass the current tensor
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, 0); // Initial head position
        } catch (e) {
            console.error("Error during initial Live2D update:", e);
        }
    }

    // Update remaining UI elements
    updateDashboardDisplay();
    updateEmotionBars(simulationMetrics.currentAgentEmotions);
    updateCascadeViewer();
    logToTimeline("System Initialized", 'expressions-list');

    // Update heatmap with initial self-state if available
    if (agent?.selfState && !agent.selfState.isDisposed) {
        try {
            updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
        } catch (e) {
            console.error("Initial heatmap update failed:", e);
            updateHeatmap([], 'heatmap-content'); // Clear heatmap on error
        }
    } else {
        updateHeatmap([], 'heatmap-content'); // No self-state available
    }

    // Enable/disable controls based on critical error status
    if (criticalError) {
        disableControls();
    }

    // Add resize listener for Concept Graph
    window.addEventListener('resize', resizeConceptGraphRenderer);

    // Start the main animation loop if no critical errors
    if (!criticalError) {
        console.log("Initialization complete (V2.3). Starting animation loop.");
        animate();
    } else {
        console.error("Initialization encountered critical errors. Animation loop will not start.");
    }
}


function initAgentAndEnvironment() {
    if (typeof tf === 'undefined') {
        console.error("CRITICAL: TensorFlow.js is required for Agent/Environment but not loaded.");
        // criticalError is set in initialize() based on this function's return
        agent = null;
        environment = null;
        return false;
    }
    try {
        // console.log("Attempting to create SyntrometricAgent..."); // Reduce noise
        agent = new SyntrometricAgent();
        // console.log("SyntrometricAgent instance created. Agent object:", agent); // Reduce noise

        environment = new EmotionalSpace();

        // Validate core components AFTER construction attempts
        if (!agent || !agent.optimizer || !agent.beliefNetwork || !agent.enyphansyntrix) { // Added enyphansyntrix check
            console.error("Agent validation failed post-constructor.", {
                agentExists: !!agent,
                optimizerExists: !!agent?.optimizer,
                beliefNetExists: !!agent?.beliefNetwork,
                enyphansyntrixExists: !!agent?.enyphansyntrix // Check core module too
            });
            throw new Error("Agent core components failed validation immediately after initialization.");
        }
        if (!environment || !environment.baseEmotions) {
             console.error("Environment validation failed post-constructor.", { environmentExists: !!environment, baseEmotionsExist: !!environment?.baseEmotions });
             throw new Error("Environment components failed validation.");
        }

        console.log("Agent (V2.3) and Environment initialized and validated successfully.");
        return true;
    } catch (e) {
        console.error('[Init] Agent/Environment creation/validation error:', e);
        displayError(`Initialization Error: ${e.message}. Simulation logic disabled.`, true, 'error-message');
        // criticalError is set in initialize() based on this function's return
        if (agent && typeof agent.cleanup === 'function') {
            try { agent.cleanup(); } catch (cleanupErr) { console.error("Error during agent cleanup after init failure:", cleanupErr); }
        }
        if (environment && typeof environment.cleanup === 'function') {
            try { environment.cleanup(); } catch (cleanupErr) { console.error("Error during environment cleanup after init failure:", cleanupErr); }
        }
        agent = null;
        environment = null;
        return false;
    }
}

function initMetricsChart() {
    const ctx = document.getElementById('metrics-chart');
    if (!ctx) {
        console.error("Metrics chart canvas not found!");
        return;
    }
    if (metricsChart) {
        try { metricsChart.destroy(); } catch(e) { console.error("Error destroying previous chart:", e); }
        metricsChart = null;
    }

    // Get CSS variables for styling
    const computedStyle = getComputedStyle(document.documentElement);
    const chartGridColor = computedStyle.getPropertyValue('--chart-grid-color').trim() || 'rgba(200, 200, 220, 0.15)';
    const chartTickColor = 'rgba(238, 238, 238, 0.7)';
    const chartLegendLabelColor = 'rgba(238, 238, 238, 0.8)';
    const chartTooltipBg = computedStyle.getPropertyValue('--chart-tooltip-bg').trim() || 'rgba(18, 18, 34, 0.85)';
    const chartAccentColor = computedStyle.getPropertyValue('--primary-color').trim() || '#00aaff'; // Use primary as accent
    const chartTextColor = computedStyle.getPropertyValue('--text-color').trim() || '#eeeeee';
    const colorRIHBorder = 'rgb(102, 255, 102)';
    const colorAffinityBorder = 'rgb(255, 170, 102)';
    const colorTrustBorder = 'rgb(102, 170, 255)';
    const colorBeliefNormBorder = 'rgb(255, 255, 102)';
    const colorSelfNormBorder = 'rgb(200, 150, 255)';

    try {
        metricsChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    { label: 'RIH', data: [], borderColor: colorRIHBorder, backgroundColor: colorRIHBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), borderWidth: 1.5, pointRadius: 0, yAxisID: 'yPercentage', tension: 0.1 },
                    { label: 'Affinity', data: [], borderColor: colorAffinityBorder, backgroundColor: colorAffinityBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), borderWidth: 1.5, pointRadius: 0, yAxisID: 'yBipolar', tension: 0.1 },
                    { label: 'Trust', data: [], borderColor: colorTrustBorder, backgroundColor: colorTrustBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), borderWidth: 1.5, pointRadius: 0, yAxisID: 'yPercentage', tension: 0.1 },
                    { label: 'Belief Norm', data: [], borderColor: colorBeliefNormBorder, backgroundColor: colorBeliefNormBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), borderWidth: 1, pointRadius: 0, yAxisID: 'yNorm', tension: 0.1, hidden: true }, // Hidden by default
                    { label: 'Self Norm', data: [], borderColor: colorSelfNormBorder, backgroundColor: colorSelfNormBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), borderWidth: 1, pointRadius: 0, yAxisID: 'yNorm', tension: 0.1, hidden: true } // Hidden by default
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false, // Disable animation for performance in real-time updates
                scales: {
                    x: {
                        type: 'realtime', // Use the streaming plugin
                        realtime: {
                            duration: 30000, // Show last 30 seconds
                            refresh: 1000, // Update interval (ms) - adjust based on desired smoothness vs performance
                            delay: 500, // Delay before showing data
                            pause: false,
                            ttl: 60000 // Time-to-live for data points (ms)
                        },
                        ticks: { display: false }, // Hide X-axis labels
                        grid: { color: chartGridColor }
                    },
                    yPercentage: {
                        beginAtZero: true, max: 1.0, position: 'left',
                        ticks: { color: chartTickColor, font: { size: 10 }, stepSize: 0.25, callback: value => (value * 100).toFixed(0) + '%' },
                        grid: { color: chartGridColor }
                    },
                    yBipolar: {
                        min: -1.0, max: 1.0, position: 'right',
                        ticks: { color: chartTickColor, font: { size: 10 }, stepSize: 0.5 },
                        grid: { display: false } // Hide grid for this axis
                    },
                    yNorm: { // Scale for Norm values
                        beginAtZero: true, position: 'right', display: false, // Keep hidden unless toggled
                        ticks: { color: chartTickColor, font: { size: 10 } },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom', align: 'start',
                        labels: { color: chartLegendLabelColor, font: { size: 10 }, boxWidth: 12, padding: 10,
                            // Allow hiding/showing datasets by clicking legend items
                            filter: function(legendItem, chartData) { return chartData.datasets[legendItem.datasetIndex]; }
                        },
                        onClick: (e, legendItem, legend) => {
                            const index = legendItem.datasetIndex;
                            const ci = legend.chart;
                            const meta = ci.getDatasetMeta(index);
                            meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
                            // Toggle visibility of the corresponding axis if needed (e.g., yNorm)
                            if (ci.options.scales.yNorm && (index === 3 || index === 4)) {
                                const normVisible = !ci.getDatasetMeta(3).hidden || !ci.getDatasetMeta(4).hidden;
                                ci.options.scales.yNorm.display = normVisible;
                            }
                            ci.update();
                        }
                    },
                    tooltip: {
                        enabled: true, mode: 'index', intersect: false, backgroundColor: chartTooltipBg, titleColor: chartAccentColor, bodyColor: chartTextColor, boxPadding: 5,
                        callbacks: {
                            title: (tooltipItems) => tooltipItems[0]?.label ? new Date(tooltipItems[0].parsed.x).toLocaleTimeString() : '',
                            label: (context) => {
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

function updateSliderDisplays(integration, reflexivity) {
    const integrationValue = document.getElementById('integration-value');
    const reflexivityValue = document.getElementById('reflexivity-value');
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');

    if (integrationValue) integrationValue.textContent = (typeof integration === 'number') ? integration.toFixed(2) : 'N/A';
    if (reflexivityValue) reflexivityValue.textContent = (typeof reflexivity === 'number') ? reflexivity.toFixed(2) : 'N/A';

    // Only update slider visually if the user is NOT actively dragging it
    if (integrationSlider && typeof integration === 'number' && !integrationSlider.matches(':active')) {
        integrationSlider.value = integration;
    }
    if (reflexivitySlider && typeof reflexivity === 'number' && !reflexivitySlider.matches(':active')) {
        reflexivitySlider.value = reflexivity;
    }
}

function setupControls() {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const integrationValue = document.getElementById('integration-value');
    const reflexivityValue = document.getElementById('reflexivity-value');
    const saveButton = document.getElementById('save-state-button');
    const loadButton = document.getElementById('load-state-button');

    // Slider listeners: Update text and trigger visual feedback timestamp.
    // NOTE: These sliders DO NOT directly control the agent's internal parameters.
    // They reflect the agent's learned values, and interaction only triggers visual feedback.
    if (integrationSlider && integrationValue) {
        integrationSlider.addEventListener('input', () => {
            // Update display value while dragging
            integrationValue.textContent = parseFloat(integrationSlider.value).toFixed(2);
            // Record time for visual feedback pulse in concept graph
            lastIntegrationInputTime = appClock.getElapsedTime();
        });
         // Disable direct control - these are read-only reflecting agent state
         integrationSlider.disabled = true;
         integrationSlider.classList.add('read-only-slider');
    } else { console.warn("Integration slider/value elements not found."); }

    if (reflexivitySlider && reflexivityValue) {
        reflexivitySlider.addEventListener('input', () => {
            reflexivityValue.textContent = parseFloat(reflexivitySlider.value).toFixed(2);
            lastReflexivityInputTime = appClock.getElapsedTime();
        });
         // Disable direct control
         reflexivitySlider.disabled = true;
         reflexivitySlider.classList.add('read-only-slider');
    } else { console.warn("Reflexivity slider/value elements not found."); }

    // State buttons
    if (saveButton) {
        saveButton.addEventListener('click', saveState);
        saveButton.disabled = criticalError; // Initial state
    } else { console.warn("Save button not found."); }

    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true)); // Pass true to show messages
        loadButton.disabled = criticalError; // Initial state
        // Check if saved state exists and style button accordingly
        if (localStorage.getItem(SAVED_STATE_KEY)) {
            loadButton.classList.add('has-saved-state');
        }
    } else { console.warn("Load button not found."); }
}

function disableControls() {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const saveButton = document.getElementById('save-state-button');
    const loadButton = document.getElementById('load-state-button');
    const chatInput = document.getElementById('chat-input');

    if (integrationSlider) integrationSlider.disabled = true;
    if (reflexivitySlider) reflexivitySlider.disabled = true;
    if (saveButton) saveButton.disabled = true;
    if (loadButton) loadButton.disabled = true;
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = "Simulation disabled.";
    }
}

function setupChat() {
    const chatInput = document.getElementById('chat-input');
    const chatOutput = document.getElementById('chat-output');
    if (!chatInput || !chatOutput) {
        console.warn("Chat elements not found.");
        return;
    }

    if (criticalError) {
        chatInput.disabled = true;
        chatInput.placeholder = "Simulation disabled.";
        return;
    } else {
         chatInput.disabled = false;
         chatInput.placeholder = "Interact with the simulation...";
    }

    chatInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && chatInput.value.trim() && !criticalError) {
            const userInput = chatInput.value.trim();
            appendChatMessage('You', userInput);
            chatInput.value = ''; // Clear input field

            if (environment && agent) {
                try {
                    // Get emotional impact from environment (may modify base emotions)
                    const impactTensor = environment.getEmotionalImpactFromText(userInput);

                    // Log the interaction
                    logToTimeline(`Chat Input: "${userInput.substring(0, 25)}..."`, 'expressions-list');
                    appendChatMessage('System', 'Input processed, influencing environment state.');
                    lastChatImpactTime = appClock.getElapsedTime(); // Trigger visual feedback

                    // Optional: Directly provide feedback to agent? (Currently environment handles it)
                    // Example: agent.process(...) with specific chat event type

                    // Dispose the temporary impact tensor if it was created and not null
                    if (impactTensor && typeof impactTensor.dispose === 'function' && !impactTensor.isDisposed) {
                        tf.dispose(impactTensor);
                    }

                } catch (chatError) {
                    console.error("Error processing chat input:", chatError);
                    appendChatMessage('System', 'Error processing input.');
                }
            } else {
                appendChatMessage('System', 'Environment/Agent not ready for interaction.');
            }
        }
    });
}

function setupInspectorToggle() {
    const toggleButton = document.getElementById('toggle-inspector');
    const inspectorPanel = document.getElementById('tensor-inspector-panel');
    if (toggleButton && inspectorPanel) {
        toggleButton.addEventListener('click', () => {
            const isVisible = inspectorPanel.classList.toggle('visible');
            toggleButton.setAttribute('aria-expanded', isVisible);
            // Update content only when becoming visible
            if (isVisible && agent?.beliefNetwork?.outputs[0]) {
                 try {
                     // Assuming the belief embedding is the output of the belief network
                     // This might need adjustment depending on the exact agent structure
                     // Note: This requires the tensor to be available. In practice, update might need to happen in animate loop.
                     const beliefEmbeddingTensor = agent.getLatestBeliefEmbedding(); // Need a method in agent to expose this safely
                     if(beliefEmbeddingTensor && !beliefEmbeddingTensor.isDisposed) {
                         inspectTensor(beliefEmbeddingTensor, 'tensor-inspector-content');
                     } else {
                         inspectTensor(null, 'tensor-inspector-content'); // Show null if unavailable
                     }
                 } catch (e) {
                     console.error("Error getting tensor for inspector:", e);
                     inspectTensor("[Error retrieving tensor]", 'tensor-inspector-content');
                 }
            }
        });
        // Initial state
        toggleButton.setAttribute('aria-expanded', inspectorPanel.classList.contains('visible'));
    } else {
        console.warn("Tensor inspector toggle/panel elements not found.");
    }
}

// --- State Management ---
function saveState() {
    if (criticalError || !agent || !environment) {
        console.warn("Cannot save state: Simulation not ready or critical error detected.");
        appendChatMessage('System', 'Save failed: Simulation not ready or error detected.');
        return;
    }
    try {
        const envState = environment.getState();
        const agentState = agent.getState();

        if (!envState || !agentState) {
             throw new Error("Failed to retrieve state from environment or agent.");
        }

        const stateToSave = {
            version: "2.3.1",
            timestamp: new Date().toISOString(),
            environment: envState,
            agent: agentState,
            // Save key simulation metrics for potential quick restore preview (optional)
            metrics: {
                rih: simulationMetrics.currentRIHScore,
                affinity: simulationMetrics.currentAvgAffinity,
                trust: simulationMetrics.currentTrustScore,
                context: simulationMetrics.currentContext,
                // Note: Don't save tensors (emotions, stateVector) directly here
            }
        };

        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave));
        console.log(`Simulation state (V${stateToSave.version}) saved to localStorage (Key: ${SAVED_STATE_KEY}).`);
        appendChatMessage('System', 'Simulation state saved.');
        logToTimeline('State Saved', 'expressions-list');

        // Update button style
        const loadButton = document.getElementById('load-state-button');
        if (loadButton) loadButton.classList.add('has-saved-state');

    } catch (e) {
        console.error("Error saving state:", e);
        appendChatMessage('System', `Save failed: ${e.message}`);
        displayError(`Error saving state: ${e.message}`, false, 'error-message');
    }
}

function loadState(showMessages = false) {
    // Stop animation loop during load
    criticalError = true; // Temporarily halt simulation loop

    if (!agent || !environment) {
        console.warn("Agent/Environment not initialized, cannot load state.");
        if (showMessages) appendChatMessage('System', 'Load failed: Simulation components not ready.');
        criticalError = false; // Re-enable loop potential if it was running
        return false;
    }

    const stateString = localStorage.getItem(SAVED_STATE_KEY);
    if (!stateString) {
        console.log("No saved state found in localStorage.");
        if (showMessages) appendChatMessage('System', 'No saved state found.');
        criticalError = false; // Re-enable loop
        return false;
    }

    try {
        const stateToLoad = JSON.parse(stateString);

        // Version check
        if (!stateToLoad || stateToLoad.version !== "2.3.1") {
            console.error(`Incompatible saved state version found (Version: ${stateToLoad?.version}, Expected: 2.3.1). Aborting load.`);
            if (showMessages) appendChatMessage('System', `Load failed: Incompatible state version (${stateToLoad?.version}). Expected 2.3.1.`);
            displayError(`Load failed: Incompatible state format (Version: ${stateToLoad?.version}). Requires 2.3.1.`, false, 'error-message');
            criticalError = false; // Re-enable loop
            return false;
        }
        if (!stateToLoad.environment || !stateToLoad.agent) {
             throw new Error("Saved state is missing critical environment or agent data.");
        }

        console.log(`Loading state V${stateToLoad.version} saved at ${stateToLoad.timestamp}...`);

        // Load state into components
        environment.loadState(stateToLoad.environment);
        agent.loadState(stateToLoad.agent); // Agent loadState handles internal cleanup/reinit

        // --- Restore Simulation Metrics from Loaded Agent/Env State ---
        // Restore state vector from environment state
        simulationMetrics.currentStateVector = Array.isArray(stateToLoad.environment.currentStateVector)
            ? stateToLoad.environment.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM)
            : zeros([Config.Agent.BASE_STATE_DIM]);
        while (simulationMetrics.currentStateVector.length < Config.Agent.BASE_STATE_DIM) simulationMetrics.currentStateVector.push(0);

        // Restore emotions from agent's loaded previous state
        if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
        if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
            simulationMetrics.currentAgentEmotions = tf.keep(agent.prevEmotions.clone()); // Keep the loaded tensor
        } else {
            console.warn("Agent prevEmotions tensor invalid after load. Resetting to zeros.");
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        // Restore metrics directly from loaded agent state where available
        simulationMetrics.currentRIHScore = agent.lastRIH ?? stateToLoad.metrics?.rih ?? 0;
        simulationMetrics.currentTrustScore = agent.latestTrustScore ?? stateToLoad.metrics?.trust ?? 1.0;
        simulationMetrics.currentIntegrationParam = agent.integrationParam?.dataSync()[0] ?? 0.5;
        simulationMetrics.currentReflexivityParam = agent.reflexivityParam?.dataSync()[0] ?? 0.5;
        simulationMetrics.currentAvgAffinity = stateToLoad.metrics?.affinity ?? 0; // Get from saved metrics or default
        simulationMetrics.currentContext = "State loaded."; // Set context
        simulationMetrics.currentHmLabel = "idle"; // Reset head movement label
        simulationMetrics.currentCascadeHistory = []; // Reset cascade history (will regenerate on next step)
        simulationMetrics.currentBeliefNorm = 0.0; // Will be calculated on next step

        // Calculate self-state norm from loaded agent state
        if (agent.selfState && !agent.selfState.isDisposed) {
            try { simulationMetrics.currentSelfStateNorm = calculateArrayNorm(agent.selfState.dataSync()); }
            catch (e) { console.error("Error calculating self-norm after load:", e); simulationMetrics.currentSelfStateNorm = 0.0; }
        } else { simulationMetrics.currentSelfStateNorm = 0.0; }


        // --- Reset / Update UI ---
        // Reset chart data
        if (metricsChart) {
            metricsChart.data.datasets.forEach(dataset => dataset.data = []);
            metricsChart.update('quiet'); // Update without animation
        }

        // Clear timeline
        const timelineList = document.getElementById('expressions-list');
        if (timelineList) timelineList.innerHTML = '';
        logToTimeline('State Loaded', 'expressions-list');

        // Update UI elements with loaded state
        updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);
        updateDashboardDisplay();
        updateEmotionBars(simulationMetrics.currentAgentEmotions);
        updateCascadeViewer(); // Show empty initially
        updateHeatmap(agent.selfState?.dataSync() ?? [], 'heatmap-content'); // Update heatmap

        // Update visualizations (if initialized)
        if (threeInitialized) {
            updateThreeJS(0, simulationMetrics.currentStateVector, simulationMetrics.currentRIHScore, agent.latestAffinities || [], simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, [], simulationMetrics.currentContext);
            updateSyntrometryInfoPanel();
        }
        if (conceptInitialized) {
            updateAgentSimulationVisuals(simulationMetrics.currentAgentEmotions, simulationMetrics.currentRIHScore, simulationMetrics.currentAvgAffinity, simulationMetrics.currentHmLabel, simulationMetrics.currentTrustScore);
            animateConceptNodes(0, simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, -1, -1, -1);
        }
        if (live2dInitialized) {
            updateLive2DEmotions(simulationMetrics.currentAgentEmotions);
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, 0);
        }

        if (showMessages) appendChatMessage('System', 'Simulation state loaded successfully.');
        console.log(`Simulation state loaded successfully (Key: ${SAVED_STATE_KEY}).`);

        criticalError = false; // Load successful, re-enable simulation
        requestAnimationFrame(animate); // Resume animation loop if it was stopped

        return true;

    } catch (e) {
        console.error("Error loading state:", e);
        if (showMessages) appendChatMessage('System', `Load failed: ${e.message}`);
        displayError(`Load failed: ${e.message}. Check console for details.`, false, 'error-message');
        criticalError = false; // Allow simulation to potentially continue with old state or reset
        // Consider resetting the simulation here if loading fails critically
        return false;
    }
}

// --- Main Animation Loop ---
// js/app.js

// ... (Keep all imports and other global variables/functions as they are) ...

// --- Main Animation Loop ---
async function animate() {
    // Check for critical errors at the beginning
    if (criticalError) {
        console.warn("Animation loop stopped due to critical error.");
        // Ensure any pending frame is cancelled if we stop
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        return; // Stop the loop
    }

    // Schedule the next frame immediately
    animationFrameId = requestAnimationFrame(animate); // Store the ID

    const deltaTime = appClock.getDelta();
    const elapsedTime = appClock.getElapsedTime();

    let agentResponse = null;
    let envStepResult = null;
    let currentFrameEmotions = null; // Temporary variable for this frame's emotion tensor

    // --- Simulation Step ---
    // Check if simulation can run (agent/env exist and previous emotions are valid)
    if (agent && environment && simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
        try {
            // 1. Environment Step
            envStepResult = await environment.step(
                simulationMetrics.currentAgentEmotions, // Use the state from the previous frame
                simulationMetrics.currentRIHScore,
                simulationMetrics.currentAvgAffinity
            );

            // Get the new environment state tensor and validate it
            const envStateTensor = envStepResult.state;
            if (!envStateTensor || envStateTensor.isDisposed) {
                 throw new Error("Environment returned invalid state tensor in step.");
            }

            // Safely extract the state array
            const envStateArray = envStateTensor.arraySync(); // Expected shape [1, BASE_STATE_DIM]
            if (!Array.isArray(envStateArray) || envStateArray.length === 0 || !Array.isArray(envStateArray[0])) {
                 throw new Error(`Unexpected state tensor shape from environment: ${envStateTensor.shape}`);
            }
            simulationMetrics.currentStateVector = envStateArray[0].slice(0, Config.Agent.BASE_STATE_DIM);
            while (simulationMetrics.currentStateVector.length < Config.Agent.BASE_STATE_DIM) simulationMetrics.currentStateVector.push(0);


            // 2. Agent Processing Step
            const graphFeatures = calculateGraphFeatures();
            agentResponse = await agent.process(
                simulationMetrics.currentStateVector,
                graphFeatures,
                { eventType: envStepResult.eventType, reward: envStepResult.reward }
            );

             // Validate the agent's response, especially the emotions tensor
             if (!agentResponse || !agentResponse.emotions || agentResponse.emotions.isDisposed) {
                  throw new Error("Agent process returned invalid or disposed emotions tensor.");
             }

            // 3. Manage Emotion Tensors for Update Cycle
            // Keep a clone of the *new* emotions tensor for this frame's updates
            currentFrameEmotions = tf.keep(agentResponse.emotions.clone());

            // Dispose the *previous* frame's main emotion tensor AFTER cloning the new one
            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
                tf.dispose(simulationMetrics.currentAgentEmotions);
            }
            // Update the main simulation state metric with the *original new* tensor from the agent
            // This original tensor will be disposed in the *next* frame's cycle
            simulationMetrics.currentAgentEmotions = agentResponse.emotions;


            // 4. Update Other Simulation Metrics
            simulationMetrics.currentRIHScore = agentResponse.rihScore;
            simulationMetrics.currentAvgAffinity = (agentResponse.affinities?.length > 0)
                ? agentResponse.affinities.reduce((a, b) => a + b, 0) / agentResponse.affinities.length
                : 0;
            simulationMetrics.currentHmLabel = agentResponse.hmLabel;
            simulationMetrics.currentContext = envStepResult.context;
            simulationMetrics.currentCascadeHistory = agentResponse.cascadeHistory;
            simulationMetrics.currentIntegrationParam = agentResponse.integration;
            simulationMetrics.currentReflexivityParam = agentResponse.reflexivity;
            simulationMetrics.currentTrustScore = agentResponse.trustScore;
            simulationMetrics.currentBeliefNorm = agentResponse.beliefNorm ?? 0.0;
            simulationMetrics.currentSelfStateNorm = agentResponse.selfStateNorm ?? 0.0;

            // Update UI elements reflecting agent parameters
            updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);

        } catch (e) {
            // Handle errors during the simulation step
            console.error("Error during simulation step:", e);
            displayError(`Simulation Step Error: ${e.message}. Attempting recovery.`, false, 'error-message');

            // Ensure any potentially invalid cloned tensor from this failed step is disposed
            if (currentFrameEmotions && !currentFrameEmotions.isDisposed) tf.dispose(currentFrameEmotions);
            currentFrameEmotions = null; // Reset the frame's tensor

            // Attempt to recover the main simulation emotion tensor
            if (!simulationMetrics.currentAgentEmotions || simulationMetrics.currentAgentEmotions.isDisposed) {
                if (typeof tf !== 'undefined') {
                    console.warn("Agent emotions tensor became invalid during error, resetting to zeros.");
                    // Dispose just in case it exists but is disposed
                    if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
                    // Create and keep a new zero tensor as the main state
                    simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
                } else {
                    // If TF is gone, it's critical
                    simulationMetrics.currentAgentEmotions = null;
                    criticalError = true;
                    displayError("TensorFlow unavailable during error recovery. Stopping simulation.", true, 'error-message');
                    if (animationFrameId) cancelAnimationFrame(animationFrameId); animationFrameId = null;
                    return; // Stop loop immediately
                }
            }
            // Make sure currentFrameEmotions is valid for rendering this frame (clone the potentially recovered main tensor)
            currentFrameEmotions = tf.keep(simulationMetrics.currentAgentEmotions.clone());

            // Update context to reflect the error
            simulationMetrics.currentContext = "Simulation error occurred.";
            // Avoid updating other metrics as they might be inconsistent

        } finally {
            // Always dispose the environment state tensor from the step result
            if (envStepResult?.state && !envStepResult.state.isDisposed) {
                 tf.dispose(envStepResult.state);
            }
        }
    } else {
        // Handle cases where simulation prerequisites aren't met at the start of the frame
        // (e.g., agent missing, initial emotions invalid)
        if (!simulationMetrics.currentAgentEmotions || simulationMetrics.currentAgentEmotions.isDisposed) {
            // Attempt to initialize/reset emotions if possible
            if (typeof tf !== 'undefined') {
                console.warn("Initializing/Resetting simulation emotions in animation loop.");
                if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
                simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            } else {
                 // Critical TensorFlow issue
                 simulationMetrics.currentAgentEmotions = null;
                 criticalError = true;
                 displayError("TensorFlow unavailable. Stopping simulation.", true, 'error-message');
                 if (animationFrameId) cancelAnimationFrame(animationFrameId); animationFrameId = null;
                 return; // Stop loop
            }
        }

        // Ensure we have a valid tensor for this frame's rendering, even if simulation didn't run
        if (!currentFrameEmotions || currentFrameEmotions.isDisposed) {
            currentFrameEmotions = tf.keep(simulationMetrics.currentAgentEmotions.clone());
        }

        // Update context message if components are missing
        if (!agent || !environment) {
             simulationMetrics.currentContext = "Simulation components missing.";
             // Optionally set criticalError = true if agent/env are essential
             // criticalError = true;
        }
    }

    // --- Update UI and Visualizations ---
    // Ensure we pass the valid tensor clone created for this frame
    if (!currentFrameEmotions || currentFrameEmotions.isDisposed) {
        // If something went wrong creating the frame clone, fallback to zeros safely
        console.error("currentFrameEmotions tensor is invalid before UI update! Using zeros.");
        if (currentFrameEmotions && !currentFrameEmotions.isDisposed) tf.dispose(currentFrameEmotions); // Dispose if invalid but not disposed
        currentFrameEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
    }

    updateDashboardDisplay();
    updateMetricsChart();
    updateEmotionBars(currentFrameEmotions); // Pass the clone
    updateCascadeViewer();

    // Update Syntrometry Visualization
    try {
        if (threeInitialized) {
            updateThreeJS(
                deltaTime,
                simulationMetrics.currentStateVector,
                simulationMetrics.currentRIHScore,
                agent?.latestAffinities || [], // Use safe navigation for agent properties
                simulationMetrics.currentIntegrationParam,
                simulationMetrics.currentReflexivityParam,
                simulationMetrics.currentCascadeHistory,
                simulationMetrics.currentContext
            );
            updateSyntrometryInfoPanel();
        }
    } catch (e) { console.error("Error updating Syntrometry Viz:", e); }

    // Update Concept Visualization
    try {
        if (conceptInitialized) { // Use the flag set by its init function
            updateAgentSimulationVisuals(
                currentFrameEmotions, // Pass the clone
                simulationMetrics.currentRIHScore,
                simulationMetrics.currentAvgAffinity,
                simulationMetrics.currentHmLabel,
                simulationMetrics.currentTrustScore
            );
            animateConceptNodes(deltaTime, simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam,
                 elapsedTime - lastIntegrationInputTime < inputFeedbackDuration ? lastIntegrationInputTime : -1,
                 elapsedTime - lastReflexivityInputTime < inputFeedbackDuration ? lastReflexivityInputTime : -1,
                 elapsedTime - lastChatImpactTime < inputFeedbackDuration ? lastChatImpactTime : -1
            );
             // Render Concept Graph
             if (conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
                conceptRenderer.render(conceptScene, conceptCamera);
                conceptLabelRenderer.render(conceptScene, conceptCamera);
             }
             // Update OrbitControls for Concept Graph
             if (conceptControls) conceptControls.update();
        }
    } catch (e) { console.error("Error updating/rendering Concept Viz:", e); }


    // Update Live2D Avatar
    try {
        if (live2dInitialized) { // Use the flag set by its init function
            updateLive2DEmotions(currentFrameEmotions); // Pass the clone
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, deltaTime);
            updateLive2D(deltaTime); // Call the main Pixi update loop if needed
        }
    } catch (e) { console.error("Error updating Live2D:", e); }

    // Update Heatmap
    if (agent?.selfState && !agent.selfState.isDisposed) {
        try {
            updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
        } catch (e) {
            console.error("Heatmap update failed:", e);
            // Optionally clear heatmap on error: updateHeatmap([], 'heatmap-content');
        }
    } else {
        updateHeatmap([], 'heatmap-content'); // Clear if no state
    }

    // Update Tensor Inspector if visible
    const inspectorPanel = document.getElementById('tensor-inspector-panel');
    if (inspectorPanel?.classList.contains('visible') && agent) {
         try {
             const beliefEmbeddingTensor = agent.getLatestBeliefEmbedding(); // Use safe method
             inspectTensor(beliefEmbeddingTensor, 'tensor-inspector-content');
             // Dispose the cloned tensor returned by getLatestBeliefEmbedding
             if (beliefEmbeddingTensor && !beliefEmbeddingTensor.isDisposed) {
                 tf.dispose(beliefEmbeddingTensor);
             }
         } catch(e) {
             inspectTensor(`[Error: ${e.message}]`, 'tensor-inspector-content');
         }
    }

    // --- Dispose the temporary clone used for this frame's updates ---
    if (currentFrameEmotions && !currentFrameEmotions.isDisposed) {
        tf.dispose(currentFrameEmotions);
    }
    // --- END Dispose ---

} // End animate()


// ... (Keep the rest of app.js: cleanup, other helpers, state management, listeners, etc.)

// --- Cleanup ---
function cleanup() {
    console.log("Cleaning up application resources (V2.3)...");
    criticalError = true; // Stop animation loop

    // Remove event listeners
    window.removeEventListener('resize', resizeConceptGraphRenderer);
    window.removeEventListener('beforeunload', cleanup); // Avoid infinite loop if called directly

    // Destroy Chart.js
    if (metricsChart) {
        try { metricsChart.destroy(); metricsChart = null; }
        catch (e) { console.error("Chart destroy error:", e); }
    }

    // Cleanup modules in reverse order of dependency (roughly: Viz -> Agent/Env -> Core TF)
    try { if (cleanupLive2D) cleanupLive2D(); }
    catch (e) { console.error("Live2D cleanup error:", e); }

    try { if (cleanupConceptVisualization) cleanupConceptVisualization(); }
    catch (e) { console.error("ConceptViz cleanup error:", e); }

    try { if (cleanupThreeJS) cleanupThreeJS(); } // Syntrometry viz
    catch (e) { console.error("ThreeJS (Syntrometry) cleanup error:", e); }

    try { if (agent?.cleanup) agent.cleanup(); }
    catch (e) { console.error("Agent cleanup error:", e); }

    try { if (environment?.cleanup) environment.cleanup(); }
    catch (e) { console.error("Environment cleanup error:", e); }

    // Dispose global tensor if it exists
    if (typeof tf !== 'undefined' && simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
        try { tf.dispose(simulationMetrics.currentAgentEmotions); }
        catch (e) { console.error("Error disposing global emotions tensor:", e); }
    }

    // Nullify references
    agent = null;
    environment = null;
    simulationMetrics.currentAgentEmotions = null;
    simulationMetrics.currentStateVector = null;

    console.log("Application cleanup complete.");
}

// --- Global Event Listeners ---
window.addEventListener('load', initialize);
window.addEventListener('beforeunload', cleanup);

// Export necessary items if needed by other potential modules (unlikely here)
// export { agent, environment, simulationMetrics };
