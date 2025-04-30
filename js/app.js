// js/app.js

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
import { initLive2D, updateLive2DEmotions, updateLive2DHeadMovement, live2dInitialized, cleanupLive2D } from './viz-live2d.js';
import { initializeDraggablePanels } from './draggablePanels.js'; // Ensure this is imported

// --- Global State ---
let criticalError = false;
let agent = null;
let environment = null;

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

// Resize Handler for Concept Graph Visualization (Keep separate from main init)
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
    // Calculate cell size based on container width, ensuring a minimum size
    let cellSize = Math.max(2, Math.floor(containerWidth / gridDim) - 1); // Subtract 1 for gap
     // Check if container height limits cell size more
    const containerHeight = heatmapContainer.clientHeight;
    if (containerHeight > 0) {
        const cellSizeH = Math.max(2, Math.floor(containerHeight / gridDim) -1);
        cellSize = Math.min(cellSize, cellSizeH); // Use the smaller dimension constraint
    }
    // Ensure cell size is at least 1 if calculated as 0 or less
    cellSize = Math.max(1, cellSize);


    heatmapContainer.style.gridTemplateColumns = `repeat(${gridDim}, ${cellSize}px)`;
    heatmapContainer.style.gridTemplateRows = `repeat(${gridDim}, ${cellSize}px)`;
    // Add justify-content and align-content to center grid if smaller than container
    heatmapContainer.style.justifyContent = 'center';
    heatmapContainer.style.alignContent = 'center';


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
        htmlContent += `<div class="heatmap-cell" style="background-color: ${color}; width:${cellSize}px; height:${cellSize}px;" title="${tooltip}"></div>`; // Set explicit size
    }

    // Fill remaining grid cells if not a perfect square
    const totalCells = gridDim * gridDim;
    for (let i = vectorLength; i < totalCells; i++) {
        htmlContent += `<div class="heatmap-cell filler" style="width:${cellSize}px; height:${cellSize}px; background-color: #111;"></div>`; // Ensure filler matches bg
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
        // But add manual check just in case ttl doesn't catch up immediately
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
// ========================================================
// == FULL initialize FUNCTION WITH DOM CHECK ADDED ==
// ========================================================
async function initialize() {
    // --- CRITICAL: Add a check for the elements needed by viz-concepts ---
    // We do this check *before* calling initConceptVisualization
    // Ensure these elements exist in index.html with the correct IDs
    const conceptPanel = document.getElementById('concept-panel');
    const infoPanel = document.getElementById('info-panel');
    const toggleButton = document.getElementById('toggle-info-panel');

    // Use a local flag for this specific check
    let conceptDOMElementsMissing = false;
    if (!conceptPanel || !infoPanel || !toggleButton) {
        console.error("!!! DOM Check Failed in app.js initialize !!! Missing crucial elements for Concept Viz.", {
             conceptPanel: conceptPanel, // Will show null if missing
             infoPanel: infoPanel,       // Will show null if missing
             toggleButton: toggleButton   // Will show null if missing
        });
        // Display error message directly
        const errorDiv = document.getElementById('error-message') || document.body;
        const msg = document.createElement('p');
        msg.style.cssText = 'color: red; font-weight: bold; padding: 10px; background: rgba(50,0,0,0.8); border: 1px solid red; margin-bottom: 10px;'; // Added margin
        msg.textContent = "[Critical Init Error] Required visualization panels (concept-panel, info-panel, toggle-info-panel) not found in DOM. Cannot initialize Concept Graph. Check index.html.";
        errorDiv.prepend(msg);
        errorDiv.style.display = 'block'; // Ensure error area is visible
        // Don't set global criticalError yet, allow other things to initialize
        conceptDOMElementsMissing = true;
    }
    // --- END CRITICAL CHECK ---

    console.log("Initializing application (Agent V2.3)...");
    const coreInitSuccess = initAgentAndEnvironment();

    // Initialize Syntrometry Viz (doesn't depend on the failing elements)
    const threeSuccess = initThreeJS();

    // Attempt to initialize Concept Viz only if the critical check passed
    let conceptSuccess = false;
    if (!conceptDOMElementsMissing) { // Check local flag
         conceptSuccess = initConceptVisualization(appClock);
    } else {
         console.warn("Skipping Concept Visualization initialization due to missing DOM elements.");
         displayError("Concept Graph visualization skipped: Required HTML elements not found.", false, 'concept-error-message');
    }

    // Initialize Live2D
    const live2dSuccess = await initLive2D();

    // Handle core failures early (if Agent/Env failed)
    if (!coreInitSuccess) {
        criticalError = true; // Set global critical error
        displayError("Core simulation components (Agent/Environment/TF) failed to initialize. Simulation disabled. Check console.", true, 'error-message');
    } else if (conceptDOMElementsMissing) {
         // If core is OK but concept viz elements are missing, treat it as critical for full functionality
         criticalError = true; // Set global critical error
         console.error("Initialization halted: Concept Graph DOM elements missing.");
         // The specific error message was already displayed above
    }

    // Report non-critical visualization failures (Syntrometry/Live2D)
    if (!threeSuccess) displayError("Syntrometry visualization failed to initialize.", false, 'syntrometry-error-message');
    // Concept failure message handled above or within initConceptVisualization itself
    if (!live2dSuccess) displayError("Live2D avatar failed to initialize.", false, 'error-message'); // Display in main error area

    // Initialize UI elements that don't depend on core/viz
    initMetricsChart();
    setupControls(); // Will be disabled later if criticalError is true
    setupChat(); // Will be disabled later if criticalError is true
    setupInspectorToggle();
    initializeDraggablePanels('.overlay-panel', '.visualization-container'); // Initialize draggable panels

    // Attempt to load saved state or initialize new state ONLY if core is okay
    let initialStateLoaded = false;
    if (coreInitSuccess && !criticalError) { // Check criticalError again in case DOM check failed
        initialStateLoaded = loadState(false); // Load state silently first

        // If not loaded and core is ready, initialize a new state
        if (!initialStateLoaded && agent && environment) {
            console.log("No valid saved state found or load skipped, initializing new simulation state...");
            const initialState = environment.reset(); // Reset environment
            const initialStateArray = initialState.state && !initialState.state.isDisposed
                ? initialState.state.arraySync()[0]
                : zeros([Config.Agent.BASE_STATE_DIM]);

            simulationMetrics.currentStateVector = initialStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
            while (simulationMetrics.currentStateVector.length < Config.Agent.BASE_STATE_DIM) simulationMetrics.currentStateVector.push(0);

            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Start with zero emotions

            try {
                const initialGraphFeatures = calculateGraphFeatures();
                const initialAgentResponse = await agent.process(
                    simulationMetrics.currentStateVector,
                    initialGraphFeatures,
                    { eventType: null, reward: 0 } // Initial neutral context
                );

                if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
                simulationMetrics.currentAgentEmotions = initialAgentResponse.emotions;
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
                 // Reset metrics to default (handled below)
            }
        }
    }

    // If critical error occurred at any point, set default metrics
    if (criticalError) {
        console.warn("Critical error occurred during initialization. Setting default metrics.");
        simulationMetrics.currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);
        if (typeof tf !== 'undefined') {
            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        } else {
            simulationMetrics.currentAgentEmotions = null;
        }
        simulationMetrics.currentRIHScore = 0;
        simulationMetrics.currentAvgAffinity = 0;
        simulationMetrics.currentHmLabel = "idle";
        simulationMetrics.currentContext = "Initialization Failed."; // Clearer context
        simulationMetrics.currentCascadeHistory = [];
        simulationMetrics.currentIntegrationParam = 0.5;
        simulationMetrics.currentReflexivityParam = 0.5;
        simulationMetrics.currentTrustScore = 1.0;
        simulationMetrics.currentBeliefNorm = 0.0;
        simulationMetrics.currentSelfStateNorm = 0.0;
    }

    // Update UI based on the final initial state (loaded or new or default/error)
    updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);

    // --- Initialize Visualizations with Initial State ---
    if (threeInitialized) { // Syntrometry Viz
        try { // Add try-catch for safety
            updateThreeJS(
                0, // deltaTime
                simulationMetrics.currentStateVector,
                simulationMetrics.currentRIHScore,
                agent?.latestAffinities || [],
                simulationMetrics.currentIntegrationParam,
                simulationMetrics.currentReflexivityParam,
                simulationMetrics.currentCascadeHistory,
                simulationMetrics.currentContext
            );
            updateSyntrometryInfoPanel();
        } catch (vizError) { console.error("Error during initial Syntrometry update:", vizError); }
    }

    // Note: conceptInitialized flag is managed within viz-concepts.js
    if (conceptInitialized) { // Concept Viz (Only if successfully initialized)
        try {
            updateAgentSimulationVisuals(
                simulationMetrics.currentAgentEmotions,
                simulationMetrics.currentRIHScore,
                simulationMetrics.currentAvgAffinity,
                simulationMetrics.currentHmLabel,
                simulationMetrics.currentTrustScore
            );
            animateConceptNodes(0, simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, -1, -1, -1);
            resizeConceptGraphRenderer(); // Ensure correct size after setup
        } catch (e) {
            console.error("Error during initial concept visualization update:", e);
        }
    }

    if (live2dInitialized) { // Live2D Avatar
        try {
            updateLive2DEmotions(simulationMetrics.currentAgentEmotions);
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, 0);
        } catch (e) {
            console.error("Error during initial Live2D update:", e);
        }
    }

    // Update remaining UI elements
    updateDashboardDisplay();
    updateEmotionBars(simulationMetrics.currentAgentEmotions);
    updateCascadeViewer();
    if (!criticalError) logToTimeline("System Initialized", 'expressions-list');

    // Update heatmap with initial self-state if available and no error
    if (!criticalError && agent?.selfState && !agent.selfState.isDisposed) {
        try {
            updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
        } catch (e) {
            console.error("Initial heatmap update failed:", e);
            updateHeatmap([], 'heatmap-content'); // Clear heatmap on error
        }
    } else {
        updateHeatmap([], 'heatmap-content'); // No self-state available or critical error
    }

    // Enable/disable controls based on final critical error status
    if (criticalError) {
        disableControls();
    }

    // Add resize listener for Concept Graph (if initialized)
    if (conceptInitialized) {
        window.addEventListener('resize', resizeConceptGraphRenderer);
    }

    // Start the main animation loop if no critical errors
    if (!criticalError) {
        console.log("Initialization complete (V2.3). Starting animation loop.");
        animate();
    } else {
        console.error("Initialization encountered critical errors OR missing required DOM elements. Animation loop will not start.");
    }
}
// ========================================================
// == END OF FULL initialize FUNCTION ==
// ========================================================


// --- initAgentAndEnvironment, initMetricsChart (Keep as they are) ---
function initAgentAndEnvironment() {
    if (typeof tf === 'undefined') {
        console.error("CRITICAL: TensorFlow.js is required for Agent/Environment but not loaded.");
        agent = null;
        environment = null;
        return false;
    }
    try {
        agent = new SyntrometricAgent();
        environment = new EmotionalSpace();

        if (!agent || !agent.optimizer || !agent.beliefNetwork || !agent.enyphansyntrix) {
            console.error("Agent validation failed post-constructor.", {
                agentExists: !!agent,
                optimizerExists: !!agent?.optimizer,
                beliefNetExists: !!agent?.beliefNetwork,
                enyphansyntrixExists: !!agent?.enyphansyntrix
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
                            filter: function(legendItem, chartData) { return chartData.datasets[legendItem.datasetIndex]; }
                        },
                        onClick: (e, legendItem, legend) => {
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

// --- UI Setup Functions (Keep as they are) ---
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
    const labelsToggle = document.getElementById('labels-toggle'); // Added toggle checkbox

    if (integrationSlider && integrationValue) {
        integrationSlider.addEventListener('input', () => {
            integrationValue.textContent = parseFloat(integrationSlider.value).toFixed(2);
            lastIntegrationInputTime = appClock.getElapsedTime();
        });
         integrationSlider.disabled = true; // Read-only
         integrationSlider.classList.add('read-only-slider');
    } else { console.warn("Integration slider/value elements not found."); }

    if (reflexivitySlider && reflexivityValue) {
        reflexivitySlider.addEventListener('input', () => {
            reflexivityValue.textContent = parseFloat(reflexivitySlider.value).toFixed(2);
            lastReflexivityInputTime = appClock.getElapsedTime();
        });
         reflexivitySlider.disabled = true; // Read-only
         reflexivitySlider.classList.add('read-only-slider');
    } else { console.warn("Reflexivity slider/value elements not found."); }

    // Label Toggle Listener (assuming conceptNodes exists)
    if (labelsToggle && typeof conceptNodes !== 'undefined') {
        labelsToggle.addEventListener('change', () => {
            const showLabels = labelsToggle.checked;
            // Iterate through conceptNodes and placeholders that have labels
            [...Object.values(conceptNodes), {object: agentStateMesh}, {object: emergenceCoreMesh}]
              .filter(entry => entry?.object?.userData?.label)
              .forEach(entry => {
                  entry.object.userData.label.element.style.visibility = showLabels ? 'visible' : 'hidden';
              });
        });
        // Set initial state based on checkbox (might be checked by default in HTML)
        const showLabels = labelsToggle.checked;
         [...Object.values(conceptNodes), {object: agentStateMesh}, {object: emergenceCoreMesh}]
              .filter(entry => entry?.object?.userData?.label)
              .forEach(entry => {
                  entry.object.userData.label.element.style.visibility = showLabels ? 'visible' : 'hidden';
              });
    } else { console.warn("Labels toggle or conceptNodes map not found/ready."); }

    if (saveButton) {
        saveButton.addEventListener('click', saveState);
        saveButton.disabled = criticalError;
    } else { console.warn("Save button not found."); }

    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true));
        loadButton.disabled = criticalError;
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
    const labelsToggle = document.getElementById('labels-toggle'); // Added toggle

    if (integrationSlider) integrationSlider.disabled = true;
    if (reflexivitySlider) reflexivitySlider.disabled = true;
    if (saveButton) saveButton.disabled = true;
    if (loadButton) loadButton.disabled = true;
    if (labelsToggle) labelsToggle.disabled = true; // Disable toggle
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
            chatInput.value = '';

            if (environment && agent) {
                try {
                    const impactTensor = environment.getEmotionalImpactFromText(userInput);
                    logToTimeline(`Chat Input: "${userInput.substring(0, 25)}..."`, 'expressions-list');
                    appendChatMessage('System', 'Input processed, influencing environment state.');
                    lastChatImpactTime = appClock.getElapsedTime();

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
            if (isVisible && agent) { // Check agent exists
                 try {
                     const beliefEmbeddingTensor = agent.getLatestBeliefEmbedding();
                     if(beliefEmbeddingTensor && !beliefEmbeddingTensor.isDisposed) {
                         inspectTensor(beliefEmbeddingTensor, 'tensor-inspector-content');
                         tf.dispose(beliefEmbeddingTensor); // Dispose the clone returned by getLatestBeliefEmbedding
                     } else {
                         inspectTensor(null, 'tensor-inspector-content');
                     }
                 } catch (e) {
                     console.error("Error getting tensor for inspector:", e);
                     inspectTensor("[Error retrieving tensor]", 'tensor-inspector-content');
                 }
            } else if (!isVisible) {
                 // Optional: Clear content when hiding
                 // inspectTensor(null, 'tensor-inspector-content');
            }
        });
        toggleButton.setAttribute('aria-expanded', inspectorPanel.classList.contains('visible'));
    } else {
        console.warn("Tensor inspector toggle/panel elements not found.");
    }
}

// --- State Management (Keep saveState, loadState as they are) ---
function saveState() {
    if (criticalError || !agent || !environment) {
        console.warn("Cannot save state: Simulation not ready or critical error detected.");
        appendChatMessage('System', 'Save failed: Simulation not ready or error detected.');
        return;
    }
    try {
        const envState = environment.getState();
        const agentState = agent.getState();

        if (!envState || !agentState || agentState.error) { // Check for agent error state
             throw new Error(`Failed to retrieve valid state from environment or agent. Agent state error: ${agentState?.error}`);
        }

        const stateToSave = {
            version: "2.3.1",
            timestamp: new Date().toISOString(),
            environment: envState,
            agent: agentState,
            metrics: {
                rih: simulationMetrics.currentRIHScore,
                affinity: simulationMetrics.currentAvgAffinity,
                trust: simulationMetrics.currentTrustScore,
                context: simulationMetrics.currentContext,
            }
        };

        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave));
        console.log(`Simulation state (V${stateToSave.version}) saved to localStorage (Key: ${SAVED_STATE_KEY}).`);
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

function loadState(showMessages = false) {
    // Temporarily pause simulation loop by setting a flag
    // Note: A more robust pause mechanism might be needed for complex async ops
    const wasRunning = !criticalError; // Check if it was running before load
    criticalError = true; // Use the existing flag to halt the animate loop

    // Give loop a chance to stop if it was mid-frame
    requestAnimationFrame(async () => { // Use async/await for clarity
        console.log("Attempting to load state...");
        let loadSuccess = false;
        if (!agent || !environment) {
            console.warn("Agent/Environment not initialized, cannot load state.");
            if (showMessages) appendChatMessage('System', 'Load failed: Simulation components not ready.');
            // Don't reset criticalError here, let it remain true if init failed
            return; // Return early
        }

        const stateString = localStorage.getItem(SAVED_STATE_KEY);
        if (!stateString) {
            console.log("No saved state found in localStorage.");
            if (showMessages) appendChatMessage('System', 'No saved state found.');
            criticalError = !wasRunning; // Only resume if it was running before
            if (!criticalError) requestAnimationFrame(animate); // Resume if needed
            return; // Return early
        }

        try {
            const stateToLoad = JSON.parse(stateString);

            if (!stateToLoad || stateToLoad.version !== "2.3.1") {
                console.error(`Incompatible saved state version found (Version: ${stateToLoad?.version}, Expected: 2.3.1). Aborting load.`);
                if (showMessages) appendChatMessage('System', `Load failed: Incompatible state version (${stateToLoad?.version}). Expected 2.3.1.`);
                displayError(`Load failed: Incompatible state format (Version: ${stateToLoad?.version}). Requires 2.3.1.`, false, 'error-message');
                criticalError = !wasRunning;
                if (!criticalError) requestAnimationFrame(animate);
                return; // Return early
            }
            if (!stateToLoad.environment || !stateToLoad.agent) {
                 throw new Error("Saved state is missing critical environment or agent data.");
            }

            console.log(`Loading state V${stateToLoad.version} saved at ${stateToLoad.timestamp}...`);

            // Load state into components
            environment.loadState(stateToLoad.environment);
            agent.loadState(stateToLoad.agent); // Agent loadState handles internal cleanup/reinit

            // --- Restore Simulation Metrics from Loaded Agent/Env State ---
            simulationMetrics.currentStateVector = Array.isArray(stateToLoad.environment.currentStateVector)
                ? stateToLoad.environment.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM)
                : zeros([Config.Agent.BASE_STATE_DIM]);
            while (simulationMetrics.currentStateVector.length < Config.Agent.BASE_STATE_DIM) simulationMetrics.currentStateVector.push(0);

            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
            if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
                simulationMetrics.currentAgentEmotions = tf.keep(agent.prevEmotions.clone());
            } else {
                console.warn("Agent prevEmotions tensor invalid after load. Resetting to zeros.");
                simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            }

            simulationMetrics.currentRIHScore = agent.lastRIH ?? stateToLoad.metrics?.rih ?? 0;
            simulationMetrics.currentTrustScore = agent.latestTrustScore ?? stateToLoad.metrics?.trust ?? 1.0;
            simulationMetrics.currentIntegrationParam = agent.integrationParam?.dataSync()[0] ?? 0.5;
            simulationMetrics.currentReflexivityParam = agent.reflexivityParam?.dataSync()[0] ?? 0.5;
            simulationMetrics.currentAvgAffinity = stateToLoad.metrics?.affinity ?? 0;
            simulationMetrics.currentContext = "State loaded.";
            simulationMetrics.currentHmLabel = "idle";
            simulationMetrics.currentCascadeHistory = [];
            simulationMetrics.currentBeliefNorm = 0.0;

            if (agent.selfState && !agent.selfState.isDisposed) {
                try { simulationMetrics.currentSelfStateNorm = calculateArrayNorm(agent.selfState.dataSync()); }
                catch (e) { console.error("Error calculating self-norm after load:", e); simulationMetrics.currentSelfStateNorm = 0.0; }
            } else { simulationMetrics.currentSelfStateNorm = 0.0; }


            // --- Reset / Update UI ---
            if (metricsChart) {
                metricsChart.data.datasets.forEach(dataset => dataset.data = []);
                metricsChart.update('quiet');
            }

            const timelineList = document.getElementById('expressions-list');
            if (timelineList) timelineList.innerHTML = '';
            logToTimeline('State Loaded', 'expressions-list');

            updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);
            updateDashboardDisplay();
            updateEmotionBars(simulationMetrics.currentAgentEmotions);
            updateCascadeViewer();
            updateHeatmap(agent.selfState?.dataSync() ?? [], 'heatmap-content');

            // Update visualizations (if initialized)
            if (threeInitialized) {
                updateThreeJS(0, simulationMetrics.currentStateVector, simulationMetrics.currentRIHScore, agent.latestAffinities || [], simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, [], simulationMetrics.currentContext);
                updateSyntrometryInfoPanel();
            }
            if (conceptInitialized) {
                updateAgentSimulationVisuals(simulationMetrics.currentAgentEmotions, simulationMetrics.currentRIHScore, simulationMetrics.currentAvgAffinity, simulationMetrics.currentHmLabel, simulationMetrics.currentTrustScore);
                animateConceptNodes(0, simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, -1, -1, -1);
                 // Call resize AFTER potentially making panel visible again
                 resizeConceptGraphRenderer();
            }
            if (live2dInitialized) {
                updateLive2DEmotions(simulationMetrics.currentAgentEmotions);
                updateLive2DHeadMovement(simulationMetrics.currentHmLabel, 0);
            }

            if (showMessages) appendChatMessage('System', 'Simulation state loaded successfully.');
            console.log(`Simulation state loaded successfully (Key: ${SAVED_STATE_KEY}).`);
            loadSuccess = true;

        } catch (e) {
            console.error("Error loading state:", e);
            if (showMessages) appendChatMessage('System', `Load failed: ${e.message}`);
            displayError(`Load failed: ${e.message}. Check console for details.`, false, 'error-message');
            // Keep criticalError = true if loading failed
            loadSuccess = false;
        } finally {
            // Resume animation loop ONLY if load was successful AND it was running before
            criticalError = !loadSuccess || !wasRunning;
            if (!criticalError) {
                 console.log("Resuming animation loop after successful load.");
                 requestAnimationFrame(animate);
            } else {
                 console.error("Load failed or simulation was already stopped. Animation loop not resumed.");
            }
        }
    }); // End requestAnimationFrame wrapper for loadState
}


// --- Main Animation Loop ---
async function animate() {
    if (criticalError) {
        // console.log("Animation loop stopped due to critical error."); // Can be noisy
        return; // Stop loop if critical error occurred
    }

    // Schedule next frame *before* doing work
    requestAnimationFrame(animate);

    const deltaTime = appClock.getDelta();
    const elapsedTime = appClock.getElapsedTime();

    let agentResponse = null;
    let envStepResult = null;

    // --- Simulation Step ---
    if (agent && environment && simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
        try {
            // 1. Environment Step
            envStepResult = await environment.step(
                simulationMetrics.currentAgentEmotions,
                simulationMetrics.currentRIHScore,
                simulationMetrics.currentAvgAffinity
            );

             // Check for null state from environment (could happen if TF fails there)
             if (!envStepResult?.state) {
                 throw new Error("Environment step returned null state. Halting step.");
             }

            const envStateTensor = envStepResult.state; // Already checked for null
            if (envStateTensor.isDisposed) throw new Error("Environment returned disposed state tensor.");

            const envStateArray = envStateTensor.arraySync(); // Now safe to sync
            simulationMetrics.currentStateVector = envStateArray[0].slice(0, Config.Agent.BASE_STATE_DIM); // Get the first (only) batch item
            while (simulationMetrics.currentStateVector.length < Config.Agent.BASE_STATE_DIM) simulationMetrics.currentStateVector.push(0);

            // 2. Agent Processing Step
            const graphFeatures = calculateGraphFeatures();
            agentResponse = await agent.process(
                simulationMetrics.currentStateVector,
                graphFeatures,
                { eventType: envStepResult.eventType, reward: envStepResult.reward }
            );

            // 3. Update Simulation Metrics
            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
                tf.dispose(simulationMetrics.currentAgentEmotions);
            }
             // Ensure agent returned a valid tensor
             if (!agentResponse.emotions || agentResponse.emotions.isDisposed) {
                 console.error("Agent process step returned invalid emotions tensor. Resetting.");
                 simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
             } else {
                 simulationMetrics.currentAgentEmotions = agentResponse.emotions; // Keep the new tensor
             }

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

            updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);

        } catch (e) {
            console.error("Error during simulation step:", e);
            displayError(`Simulation Step Error: ${e.message}. Attempting to continue.`, false, 'error-message');
            if (!simulationMetrics.currentAgentEmotions || simulationMetrics.currentAgentEmotions.isDisposed) {
                if (typeof tf !== 'undefined') {
                    console.warn("Agent emotions tensor became invalid, resetting to zeros.");
                    if(simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions); // Dispose if exists but invalid
                    simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
                } else {
                    simulationMetrics.currentAgentEmotions = null;
                    criticalError = true;
                    displayError("TensorFlow unavailable during error recovery. Stopping simulation.", true, 'error-message');
                    return; // Stop loop
                }
            }
            simulationMetrics.currentContext = "Simulation error occurred.";
        } finally {
            // Dispose environment state tensor *after* agent used it
            if (envStepResult?.state && !envStepResult.state.isDisposed) {
                 tf.dispose(envStepResult.state);
            }
        }
    } else {
        // Handle missing agent/environment or invalid initial emotion tensor
        if (!simulationMetrics.currentAgentEmotions || simulationMetrics.currentAgentEmotions?.isDisposed) {
            if (typeof tf !== 'undefined') {
                if(simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
                simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            } else {
                 simulationMetrics.currentAgentEmotions = null;
                 criticalError = true;
                 displayError("TensorFlow unavailable. Stopping simulation.", true, 'error-message');
                 return;
            }
        }
        if (!agent || !environment) {
             simulationMetrics.currentContext = "Simulation components missing.";
             criticalError = true; // Cannot run without core components
             displayError("Agent or Environment missing. Stopping simulation.", true, 'error-message');
             disableControls();
             return;
        }
    }

    // --- Update UI and Visualizations ---
    updateDashboardDisplay();
    updateMetricsChart();
    updateEmotionBars(simulationMetrics.currentAgentEmotions);
    updateCascadeViewer();

    try {
        if (threeInitialized) {
            updateThreeJS(
                deltaTime,
                simulationMetrics.currentStateVector,
                simulationMetrics.currentRIHScore,
                agent?.latestAffinities || [],
                simulationMetrics.currentIntegrationParam,
                simulationMetrics.currentReflexivityParam,
                simulationMetrics.currentCascadeHistory,
                simulationMetrics.currentContext
            );
            updateSyntrometryInfoPanel();
        }
    } catch (e) { console.error("Error updating Syntrometry Viz:", e); }

    try {
        if (conceptInitialized) {
            updateAgentSimulationVisuals(
                simulationMetrics.currentAgentEmotions,
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
             if (conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
                conceptRenderer.render(conceptScene, conceptCamera);
                conceptLabelRenderer.render(conceptScene, conceptCamera);
             }
             if (conceptControls) conceptControls.update(); // Update controls here
        }
    } catch (e) { console.error("Error updating/rendering Concept Viz:", e); }


    try {
        if (live2dInitialized) {
            updateLive2DEmotions(simulationMetrics.currentAgentEmotions);
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, deltaTime);
        }
    } catch (e) { console.error("Error updating Live2D:", e); }

    if (agent?.selfState && !agent.selfState.isDisposed) {
        try {
            updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
        } catch (e) {
            console.error("Heatmap update failed:", e);
        }
    } else {
        updateHeatmap([], 'heatmap-content'); // Clear if no state
    }

    const inspectorPanel = document.getElementById('tensor-inspector-panel');
    if (inspectorPanel?.classList.contains('visible') && agent) {
         try {
             const beliefEmbeddingTensor = agent.getLatestBeliefEmbedding();
             inspectTensor(beliefEmbeddingTensor, 'tensor-inspector-content');
             if (beliefEmbeddingTensor) tf.dispose(beliefEmbeddingTensor); // Dispose the clone
         } catch(e) {
             inspectTensor(`[Error: ${e.message}]`, 'tensor-inspector-content');
         }
    }

} // End animate()


// --- Cleanup ---
function cleanup() {
    console.log("Cleaning up application resources (V2.3)...");
    criticalError = true; // Stop animation loop immediately

    // Remove event listeners
    window.removeEventListener('resize', resizeConceptGraphRenderer);
    window.removeEventListener('beforeunload', cleanup);
     // Remove specific listeners if they exist (defensive)
     const saveButton = document.getElementById('save-state-button');
     if(saveButton) saveButton.onclick = null;
     const loadButton = document.getElementById('load-state-button');
     if(loadButton) loadButton.onclick = null;
     const chatInput = document.getElementById('chat-input');
     if(chatInput) chatInput.onkeypress = null;
     const labelsToggle = document.getElementById('labels-toggle');
     if (labelsToggle) labelsToggle.onchange = null;
     const inspectorToggle = document.getElementById('toggle-inspector');
     if (inspectorToggle) inspectorToggle.onclick = null;

    // Destroy Chart.js
    if (metricsChart) {
        try { metricsChart.destroy(); metricsChart = null; }
        catch (e) { console.error("Chart destroy error:", e); }
    }

    // Cleanup modules
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
// --- MODIFIED: Use DOMContentLoaded ---
if (document.readyState === 'loading') { // Loading hasn't finished yet
    document.addEventListener('DOMContentLoaded', initialize);
} else { // `DOMContentLoaded` has already fired
    initialize(); // Call initialize directly
}
window.addEventListener('beforeunload', cleanup);
// --- END MODIFICATION ---

// Export necessary items if needed by other potential modules (unlikely here)
// export { agent, environment, simulationMetrics };
