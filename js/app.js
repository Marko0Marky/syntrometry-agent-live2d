import { Config, emotionKeywords, emotionNames } from './config.js'; // Assuming config.js exists
import { displayError, appendChatMessage, zeros, tensor, clamp, inspectTensor, logToTimeline } from './utils.js';
import { SyntrometricAgent } from './agent.js'; // Assuming agent.js exists
import { EmotionalSpace } from './environment.js'; // Assuming environment.js exists
import {
    initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel,
    threeInitialized, calculateGraphFeatures,
    rihNode // Assuming viz-syntrometry.js exists and exports these
} from './viz-syntrometry.js';
import {
    initConceptVisualization, updateAgentSimulationVisuals, animateConceptNodes,
    updateInfoPanel, cleanupConceptVisualization, conceptInitialized,
    conceptRenderer, conceptLabelRenderer, conceptScene, conceptCamera, conceptControls // Assuming viz-concepts.js exists
} from './viz-concepts.js';
import { initLive2D, updateLive2DEmotions, updateLive2DHeadMovement, live2dInitialized, cleanupLive2D } from './viz-live2d.js';
import { initializeDraggablePanels } from './draggablepanels.js'; // *** ADDED IMPORT ***

// --- Global State ---
let criticalError = false;
let agent = null;
let environment = null;
let currentStateVector = null;
let currentAgentEmotions = null; // Should hold a tf.Tensor or null
let currentRIHScore = 0;
let currentAvgAffinity = 0;
let currentHmLabel = "idle";
let currentContext = "Initializing...";
let currentCascadeHistory = [];
let currentIntegrationParam = 0.5;
let currentReflexivityParam = 0.5;
let currentTrustScore = 1.0;
let currentBeliefNorm = 0.0;
let currentSelfStateNorm = 0.0;

const appClock = new THREE.Clock(); // Assuming THREE is global or imported correctly
const SAVED_STATE_KEY = 'syntrometrySimulationState_v2_3_1'; // Updated key for compatibility breaks

// Timestamps for Input Feedback
let lastIntegrationInputTime = -1;
let lastReflexivityInputTime = -1;
let lastChatImpactTime = -1;
const inputFeedbackDuration = 0.5; // seconds

// Chart.js Instance
let metricsChart = null;

// --- Resize Handler for Concept Graph Visualization ---
function resizeConceptGraphRenderer() {
    if (!conceptInitialized || !conceptRenderer || !conceptLabelRenderer || !conceptCamera) {
        return;
    }

    const container = document.getElementById('concept-panel');
    if (!container) {
        console.error('Concept panel container not found for resize.');
        return;
    }

    // Use requestAnimationFrame to avoid layout thrashing and ensure container size is stable
    requestAnimationFrame(() => {
        const width = container.clientWidth;
        const height = container.clientHeight;

        if (width > 0 && height > 0) {
            // Update Three.js renderer
            conceptRenderer.setSize(width, height);
            // conceptRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // setPixelRatio often not needed if handled by device

            // Update CSS2DRenderer
            conceptLabelRenderer.setSize(width, height);

            // Update camera aspect ratio
            conceptCamera.aspect = width / height;
            conceptCamera.updateProjectionMatrix();
        }
    });
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
    if (!heatmapContainer) {
        // console.warn("Heatmap container not found:", targetElementId);
        return;
    }
    if (!Array.isArray(stateVector)) {
        heatmapContainer.innerHTML = '<p class="heatmap-placeholder">Invalid State Data</p>';
        return;
    }

    const vectorLength = stateVector.length;
    if (vectorLength === 0) {
        heatmapContainer.innerHTML = '<p class="heatmap-placeholder">No State Data</p>';
        // Ensure grid styles are cleared or minimal
        heatmapContainer.style.gridTemplateColumns = '1fr';
        heatmapContainer.style.gridTemplateRows = 'auto';
        return;
    }

    // Determine grid size dynamically based on container size and vector length
    const containerWidth = heatmapContainer.clientWidth;
    const containerHeight = heatmapContainer.clientHeight;
    if (containerWidth <= 0 || containerHeight <= 0) {
         // console.warn("Heatmap container has no dimensions yet.");
         return; // Don't update if container isn't rendered yet
    }

    const aspectRatio = containerWidth / containerHeight;
    let gridCols = Math.ceil(Math.sqrt(vectorLength * aspectRatio));
    let gridRows = Math.ceil(vectorLength / gridCols);

    // Ensure we have enough rows
    gridRows = Math.max(gridRows, Math.ceil(vectorLength / gridCols));
    // And recalculate cols if rows increased significantly (less common)
    gridCols = Math.max(gridCols, Math.ceil(vectorLength / gridRows));


    // Limit cell size to avoid excessive tiny cells
    const minCellSize = 3;
    const maxCellsW = Math.floor(containerWidth / minCellSize);
    const maxCellsH = Math.floor(containerHeight / minCellSize);

    gridCols = Math.min(gridCols, maxCellsW, vectorLength); // Cannot have more cols than elements or max fit
    gridRows = Math.min(gridRows, maxCellsH, Math.ceil(vectorLength/gridCols));

    // Calculate actual cell size based on constrained grid dimensions
    const cellWidth = Math.max(minCellSize, Math.floor(containerWidth / gridCols) -1); // -1 for gap
    const cellHeight = Math.max(minCellSize, Math.floor(containerHeight / gridRows) -1);

    heatmapContainer.style.gridTemplateColumns = `repeat(${gridCols}, ${cellWidth}px)`;
    heatmapContainer.style.gridTemplateRows = `repeat(${gridRows}, ${cellHeight}px)`;

    let htmlContent = '';
    for (let i = 0; i < vectorLength; i++) {
        const value = stateVector[i] ?? 0;
        const absValue = Math.abs(value);
        // Color mapping (adjust sensitivity/colors as needed)
        let r = 30, g = 30, b = 30;
        const intensity = clamp(absValue * 1.5, 0, 1); // Adjust multiplier for sensitivity

        if (value > 0.01) { // Positive values (e.g., Red range)
            r = 30 + Math.round(210 * intensity);
            g = 30 + Math.round(50 * intensity * intensity); // Less green component
            b = 30;
        } else if (value < -0.01) { // Negative values (e.g., Blue range)
            r = 30;
            g = 30 + Math.round(80 * intensity * intensity); // Less green component
            b = 30 + Math.round(210 * intensity);
        } // Values near zero remain dark gray

        r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
        const color = `rgb(${r}, ${g}, ${b})`;
        const tooltip = `Idx ${i}: ${value.toFixed(4)}`;
        htmlContent += `<div class="heatmap-cell" style="background-color: ${color};" title="${tooltip}"></div>`;
    }

    // Add filler cells if grid is larger than vector
    const totalCells = gridCols * gridRows;
    for (let i = vectorLength; i < totalCells; i++) {
        htmlContent += `<div class="heatmap-cell filler" style="width:${cellWidth}px; height:${cellHeight}px;"></div>`;
    }

    heatmapContainer.innerHTML = htmlContent;
}


function updateMetricsChart() {
    if (!metricsChart || criticalError || agent === null) return;

    const now = Date.now();

    try {
        // Add new data points
        metricsChart.data.datasets[0].data.push({ x: now, y: currentRIHScore });
        metricsChart.data.datasets[1].data.push({ x: now, y: currentAvgAffinity });
        metricsChart.data.datasets[2].data.push({ x: now, y: currentTrustScore });
        metricsChart.data.datasets[3].data.push({ x: now, y: currentBeliefNorm });
        metricsChart.data.datasets[4].data.push({ x: now, y: currentSelfStateNorm });

        // Optional: Limit data points to prevent performance degradation
        metricsChart.data.datasets.forEach(dataset => {
            while (dataset.data.length > MAX_CHART_POINTS) {
                dataset.data.shift(); // Remove oldest data point
            }
        });

        metricsChart.update('quiet'); // Update without animation
    } catch (e) {
        console.error("Error updating metrics chart:", e);
        // Potentially destroy and re-initialize chart if errors persist
    }
}

function updateDashboardDisplay() {
    // Use requestAnimationFrame to batch DOM updates for potentially better performance
    requestAnimationFrame(() => {
        const updateElement = (id, value, text = null, progress = false, range = [0, 1], invert = false) => {
            const element = document.getElementById(id);
            if (element) {
                const displayValue = text !== null ? text : (typeof value === 'number' ? value.toFixed(3) : value);
                if (element.tagName === 'PROGRESS') {
                    const [min, max] = range;
                    const numericValue = typeof value === 'number' ? value : 0; // Handle non-numeric gracefully
                    const scaledValue = ((numericValue - min) / (max - min)) * 100;
                    element.value = clamp(invert ? 100 - scaledValue : scaledValue, 0, 100);
                } else {
                    element.textContent = displayValue;
                }
            } /* else {
                console.warn(`Dashboard element not found: ${id}`);
            } */
        };

        updateElement('metric-rih-value', currentRIHScore, `${(currentRIHScore * 100).toFixed(1)}%`);
        updateElement('metric-rih-progress', currentRIHScore, null, true);
        updateElement('metric-affinity-value', currentAvgAffinity, currentAvgAffinity.toFixed(2));
        updateElement('metric-affinity-progress', currentAvgAffinity, null, true, [-1, 1]); // Range -1 to 1 for affinity
        updateElement('metric-trust-value', currentTrustScore, `${(currentTrustScore * 100).toFixed(1)}%`);
        updateElement('metric-trust-progress', currentTrustScore, null, true);
        updateElement('metric-belief-norm', currentBeliefNorm);
        updateElement('metric-self-norm', currentSelfStateNorm);
        updateElement('metric-context', 0, currentContext); // Use value 0 (unused), pass context as text
    });
}

function updateEmotionBars(emotionsTensor) {
    const container = document.getElementById('emotion-intensities');
    if (!container) return;

    if (!emotionsTensor || emotionsTensor.isDisposed || criticalError) {
        container.style.opacity = '0.5'; // Dim if no data or error
        // Optionally reset bars to 0
        emotionNames.forEach(name => {
            const barFill = container.querySelector(`.${name.toLowerCase()} .bar-fill`);
            if (barFill) barFill.style.width = '0%';
        });
        return;
    }
    container.style.opacity = '1';

    try {
        const emotions = emotionsTensor.arraySync()[0]; // Get the array data
        emotionNames.forEach((name, index) => {
            const barFill = container.querySelector(`.${name.toLowerCase()} .bar-fill`);
            if (barFill && emotions.length > index && typeof emotions[index] === 'number') {
                const intensity = clamp(emotions[index] * 100, 0, 100); // Clamp intensity 0-100
                barFill.style.width = `${intensity}%`;
            } else if (barFill) {
                barFill.style.width = '0%'; // Reset if index out of bounds or not a number
            }
        });
    } catch (e) {
        console.error("Error updating emotion bars:", e);
        container.style.opacity = '0.5'; // Dim on error
    }
}

function updateCascadeViewer() {
    const contentDiv = document.getElementById('cascade-viewer-content');
    if (!contentDiv) return;

    if (!currentCascadeHistory || currentCascadeHistory.length === 0) {
        contentDiv.innerHTML = '<span class="cascade-placeholder">No cascade data.</span>';
        return;
    }

    const containerBaseHeight = 35; // Base height for each level's container
    const maxBarHeight = containerBaseHeight - 4; // Max height for individual bars

    let html = '';
    // Limit number of levels displayed for performance if necessary
    const historyToDisplay = currentCascadeHistory.slice(-5); // Display last 5 levels

    historyToDisplay.forEach((levelData, index) => {
         // Ensure levelData is an array
         const levelArray = Array.isArray(levelData) ? levelData : [];
         const originalLevelIndex = currentCascadeHistory.length - historyToDisplay.length + index; // Get original index

        html += `<div class="cv-level">`;
        html += `<div class="cv-level-title">Level ${originalLevelIndex} (${levelArray.length} syndromes)</div>`;
        html += `<div class="cv-syndrome-container" style="height: ${containerBaseHeight}px;">`;

        if (levelArray.length > 0) {
            // Limit number of bars displayed per level if needed
            const barsToDisplay = levelArray.slice(0, 100); // Limit to 100 bars

            barsToDisplay.forEach((value, sIndex) => {
                const numericValue = typeof value === 'number' ? value : 0;
                const absValue = Math.abs(numericValue);
                const colorIntensity = clamp(absValue * 1.2, 0, 1);
                // Scale bar height, ensure minimum visible height
                const barHeightPx = clamp(absValue * maxBarHeight * 1.5, 2, maxBarHeight);

                // Color mapping (same as heatmap for consistency)
                let r = 50, g = 50, b = 50;
                if (numericValue > 0.01) { // Positive
                    r = 50 + Math.round(180 * colorIntensity);
                    g = 50 + Math.round(30 * colorIntensity * colorIntensity);
                    b = 50;
                } else if (numericValue < -0.01) { // Negative
                    r = 50;
                    g = 50 + Math.round(80 * colorIntensity * colorIntensity);
                    b = 50 + Math.round(180 * colorIntensity);
                }
                r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
                const color = `rgb(${r},${g},${b})`;

                html += `<div class="cv-syndrome-bar" style="background-color: ${color}; height: ${barHeightPx}px;" title="Lvl ${originalLevelIndex}, Idx ${sIndex}: ${numericValue.toFixed(4)}"></div>`;
            });
            if(levelArray.length > 100) {
                 html += `<span class="cascade-placeholder" style="align-self: center; padding-left: 5px;">... (${levelArray.length - 100} more)</span>`;
            }
        } else {
            html += '<span class="cascade-placeholder">[Empty Level]</span>';
        }
        html += `</div></div>`;
    });
    contentDiv.innerHTML = html;
    // Scroll to bottom? Maybe not desirable here.
    // contentDiv.scrollTop = contentDiv.scrollHeight;
}


// --- Initialization ---
async function initialize() {
    console.log("Initializing application (Agent V2.3)...");

    // Initialize core simulation components first
    const coreInitSuccess = initAgentAndEnvironment(); // Sets agent and environment globals

    // Initialize visualizations concurrently
    const threePromise = initThreeJS(); // Returns boolean sync
    const conceptPromise = initConceptVisualization(appClock); // Returns boolean sync
    const live2dPromise = initLive2D(); // Returns Promise<boolean>

    // Wait for all async initializations
    const [threeSuccess, conceptSuccess, live2dSuccess] = await Promise.all([
        Promise.resolve(threePromise), // Wrap sync returns in promises
        Promise.resolve(conceptPromise),
        live2dPromise
    ]).catch(err => {
        // Catch errors during parallel init if needed, though individual errors are handled below
        console.error("Error during parallel initialization:", err);
        return [false, false, false]; // Assume failure on error
    });


    if (!coreInitSuccess) {
        criticalError = true;
        displayError("Core simulation components (Agent/TF) failed to initialize. Check console.", true, 'error-message');
    }
    if (!threeSuccess) displayError("Syntrometry visualization failed to initialize.", false, 'syntrometry-error-message');
    if (!conceptSuccess) displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
    if (!live2dSuccess) displayError("Live2D avatar failed to initialize.", false, 'error-message'); // Target general error div

    // Initialize chart regardless of other errors (might show empty)
    initMetricsChart();

    let initialStateLoaded = false;
    if (coreInitSuccess && !criticalError) { // Only try loading if core is okay
        initialStateLoaded = loadState(false); // Try loading saved state first
    }

    // Initialize default state if core is OK and no state was loaded
    if (coreInitSuccess && !initialStateLoaded && !criticalError) {
        console.log("No valid saved state found or chosen not to load. Initializing default state...");
        try {
            const initialState = environment.reset(); // Get initial state from env
            // Ensure state vector is correctly sized
            const initialStateArray = initialState.state ? initialState.state.arraySync()[0] : zeros([Config.Agent.BASE_STATE_DIM]);
            currentStateVector = initialStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
            while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);

            const initialGraphFeatures = calculateGraphFeatures(); // Calculate initial graph features

            // Initial agent processing step to get starting emotions etc.
            const initialAgentResponse = await agent.process(
                currentStateVector,
                initialGraphFeatures,
                { eventType: 'init', reward: 0 } // Use an 'init' event type
            );

            // Safely dispose old tensor and keep the new one
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
            currentAgentEmotions = tf.keep(initialAgentResponse.emotions.clone()); // Keep the new tensor

            // Update global state from initial response
            currentRIHScore = initialAgentResponse.rihScore;
            currentAvgAffinity = (initialAgentResponse.affinities?.length > 0) ? initialAgentResponse.affinities.reduce((a, b) => a + b, 0) / initialAgentResponse.affinities.length : 0;
            currentHmLabel = initialAgentResponse.hmLabel || "idle";
            currentContext = "Simulation initialized.";
            currentCascadeHistory = initialAgentResponse.cascadeHistory || [];
            currentIntegrationParam = initialAgentResponse.integration;
            currentReflexivityParam = initialAgentResponse.reflexivity;
            currentTrustScore = initialAgentResponse.trustScore;
            currentBeliefNorm = initialAgentResponse.beliefNorm ?? 0.0;
            currentSelfStateNorm = initialAgentResponse.selfStateNorm ?? 0.0;

            console.log("Initialized V2.3 with new default state.");

        } catch (initError) {
             console.error("Error during default state initialization:", initError);
             displayError(`Error initializing default state: ${initError.message}`, true, 'error-message');
             criticalError = true; // Mark as critical if default init fails
             // Fallback state
             currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);
             if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
             currentAgentEmotions = typeof tf !== 'undefined' ? tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])) : null;
             currentContext = "Initialization error.";
        }

    } else if (criticalError) { // Handle case where core init failed entirely
        console.warn("Core initialization failed. Setting fallback state.");
        currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);
        if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
        currentAgentEmotions = typeof tf !== 'undefined' ? tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])) : null;
        currentRIHScore = 0; currentAvgAffinity = 0; currentHmLabel = "error"; currentContext = "Simulation failed.";
        currentCascadeHistory = []; currentIntegrationParam = 0.5; currentReflexivityParam = 0.5;
        currentTrustScore = 0; currentBeliefNorm = 0; currentSelfStateNorm = 0;
    } else if (initialStateLoaded) {
         console.log("Initialized V2.3 from saved state.");
    }

    // --- Perform Initial UI Updates ---
    updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);
    updateDashboardDisplay();
    updateEmotionBars(currentAgentEmotions);
    updateCascadeViewer();
    logToTimeline("System Initialized", 'expressions-list');
    if (agent?.selfState && !agent.selfState.isDisposed) {
        updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
    } else {
        updateHeatmap([], 'heatmap-content'); // Show empty heatmap if no agent state
    }

    // Initial updates for visualizations (ensure they use the current state)
    if (threeInitialized) {
        try {
            updateThreeJS(0, currentStateVector, currentRIHScore, agent?.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext);
            updateSyntrometryInfoPanel(); // Update info panel based on graph
        } catch(e) { console.error("Initial Three.js update failed:", e); }
    }
    if (conceptInitialized) {
        try {
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) {
                updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel, currentTrustScore);
            }
            animateConceptNodes(0, currentIntegrationParam, currentReflexivityParam, -1, -1, -1); // Initial animation state
        } catch(e) { console.error("Initial Concept Graph update failed:", e); }
    }
    if (live2dInitialized) {
         try {
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) {
                updateLive2DEmotions(currentAgentEmotions);
            }
            updateLive2DHeadMovement(currentHmLabel); // Initial head pose
        } catch(e) { console.error("Initial Live2D update failed:", e); }
    }


    // --- Setup UI Interactions ---
    setupControls();
    setupChat();
    setupInspectorToggle();

    // Initialize Draggable Panels after other UI is set up
    try {
        initializeDraggablePanels(
            '.overlay-panel', // Selector for panels
            '.visualization-container', // Selector for bounding container
            // Selectors for elements inside panels that should NOT trigger drag:
            ['input', 'button', 'textarea', 'select', 'progress', 'a', '.no-drag', '[role="button"]', '#metrics-chart', '#chat-output'],
            // CSS classes on the clicked element itself to ignore:
            ['heatmap-cell', 'cv-syndrome-bar', 'bar-fill', 'bar-label'] // Add chart canvas class if needed
        );
        console.log("Draggable panels initialized.");
    } catch (e) {
        console.error("Failed to initialize draggable panels:", e);
        displayError("UI Error: Could not make panels draggable.", false, 'error-message');
    }


    // Add resize listener for Concept Graph after everything else is set up
    window.addEventListener('resize', resizeConceptGraphRenderer);
    resizeConceptGraphRenderer(); // Initial call to size correctly

    console.log("Application initialization complete.");
    if (!criticalError) {
        console.log("Starting animation loop.");
        animate(); // Start the main animation loop
    } else {
        console.warn("Animation loop NOT started due to critical initialization errors.");
        // Display a persistent error message?
        displayError("Critical error during initialization. Simulation disabled. Please reload.", true, 'error-message');
    }
}


// --- Agent & Environment Init ---
function initAgentAndEnvironment() {
    if (typeof tf === 'undefined') {
        console.error("TensorFlow.js (tf) is required but not found.");
        criticalError = true; agent = null; environment = null;
        return false;
    }
    try {
        console.log("Initializing SyntrometricAgent...");
        agent = new SyntrometricAgent();
        console.log("Agent initialized. Validating core components...");
        if (!agent || !agent.optimizer || !agent.beliefNetwork || !agent.selfState || !agent.integrationParam) {
            throw new Error("Agent core components (optimizer, beliefNetwork, selfState, params) missing after initialization.");
        }
        console.log("Agent components validated.");

        console.log("Initializing EmotionalSpace...");
        environment = new EmotionalSpace();
        console.log("Environment initialized.");

        console.log("Agent and Environment initialization successful.");
        return true;
    } catch (e) {
        console.error('[CRITICAL] Agent/Environment initialization failed:', e);
        displayError(`Critical Error: Agent/Environment failed: ${e.message}. Simulation disabled.`, true, 'error-message');
        criticalError = true;
        if (agent && typeof agent.cleanup === 'function') { try { agent.cleanup(); } catch(cleanErr){ console.error("Agent cleanup failed:", cleanErr);}}
        agent = null;
        environment = null;
        return false;
    }
}

// --- Chart Init ---
function initMetricsChart() {
    const ctx = document.getElementById('metrics-chart');
    if (!ctx) {
        console.warn("Metrics chart canvas ('metrics-chart') not found!");
        return;
    }
    if (metricsChart) {
        try { metricsChart.destroy(); } catch (e) { console.error("Error destroying previous chart:", e); }
        metricsChart = null;
    }

    try {
        const computedStyle = getComputedStyle(document.documentElement);
        // Define colors using CSS variables or fallbacks
        const chartGridColor = computedStyle.getPropertyValue('--chart-grid-color').trim() || 'rgba(200, 200, 220, 0.15)';
        const chartTickColor = computedStyle.getPropertyValue('--text-muted').trim() || 'rgba(170, 170, 170, 0.7)';
        const chartLegendLabelColor = computedStyle.getPropertyValue('--text-color').trim() || 'rgba(238, 238, 238, 0.8)';
        const chartTooltipBg = computedStyle.getPropertyValue('--overlay-bg').trim() || 'rgba(30, 30, 42, 0.9)';
        const chartAccentColor = computedStyle.getPropertyValue('--primary-color').trim() || '#00aaff';
        const chartTextColor = computedStyle.getPropertyValue('--text-color').trim() || '#eeeeee';

        // Define dataset colors (using emotion colors where appropriate)
        const colorRIHBorder = `rgba(${hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--emotion-curiosity').trim())}, 1)`;
        const colorAffinityBorder = `rgba(${hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--emotion-joy').trim())}, 1)`; // Maybe blend joy/fear later?
        const colorTrustBorder = `rgba(${hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--emotion-calm').trim())}, 1)`;
        const colorBeliefNormBorder = 'rgba(255, 255, 102, 1)'; // Yellow
        const colorSelfNormBorder = 'rgba(200, 150, 255, 1)'; // Lavender

        metricsChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    { label: 'RIH', data: [], borderColor: colorRIHBorder, borderWidth: 1.5, pointRadius: 0, yAxisID: 'yPercentage', tension: 0.2 },
                    { label: 'Affinity', data: [], borderColor: colorAffinityBorder, borderWidth: 1.5, pointRadius: 0, yAxisID: 'yBipolar', tension: 0.2 },
                    { label: 'Trust', data: [], borderColor: colorTrustBorder, borderWidth: 1.5, pointRadius: 0, yAxisID: 'yPercentage', tension: 0.2 },
                    { label: 'Belief Norm', data: [], borderColor: colorBeliefNormBorder, borderWidth: 1, pointRadius: 0, yAxisID: 'yNorm', tension: 0.2, hidden: true },
                    { label: 'Self Norm', data: [], borderColor: colorSelfNormBorder, borderWidth: 1, pointRadius: 0, yAxisID: 'yNorm', tension: 0.2, hidden: true }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false, // Disable animation for performance
                parsing: false, // Improve perf if data is already {x,y}
                normalized: true, // Indicate data is 0-1 unless axis overrides
                spanGaps: false, // Don't draw lines over missing data
                scales: {
                    x: {
                        type: 'realtime',
                        realtime: {
                            duration: 30000, // 30 seconds window
                            ttl: 45000, // Keep data for 45 seconds
                            delay: 500, // Delay before data is removed
                            refresh: 1000, // Update interval (can be tied to animation loop later)
                            pause: false, // Don't pause chart when hovering
                            // onRefresh: chart => { /* Optional callback */ }
                        },
                        ticks: { display: false }, // Hide x-axis ticks
                        grid: { color: chartGridColor, drawBorder: false }
                    },
                    yPercentage: {
                        min: 0.0, max: 1.0, position: 'left',
                        ticks: { color: chartTickColor, font: { size: 10 }, stepSize: 0.25, callback: value => (value * 100).toFixed(0) + '%' },
                        grid: { color: chartGridColor, drawBorder: false }
                    },
                    yBipolar: {
                        min: -1.0, max: 1.0, position: 'right',
                        ticks: { color: chartTickColor, font: { size: 10 }, stepSize: 0.5 },
                        grid: { drawOnChartArea: false, drawBorder: false } // Hide grid lines for this axis
                    },
                    yNorm: {
                        beginAtZero: true, //min: 0.0,
                        suggestedMax: 2.0, // Start with a reasonable max for norms
                        position: 'right', display: false, // Hidden by default
                        ticks: { color: chartTickColor, font: { size: 10 } },
                        grid: { drawOnChartArea: false, drawBorder: false }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom', align: 'start',
                        labels: { color: chartLegendLabelColor, font: { size: 10 }, boxWidth: 12, padding: 10 }
                    },
                    tooltip: {
                        enabled: true, mode: 'index', intersect: false, position: 'nearest',
                        backgroundColor: chartTooltipBg, titleColor: chartAccentColor, bodyColor: chartTextColor,
                        boxPadding: 5, padding: 8, displayColors: false,
                        callbacks: { /* Keep existing callbacks */ }
                    },
                    streaming: {} // Required empty object for the plugin
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false },
                 elements: { line: { backgroundColor: (ctx) => ctx.dataset.borderColor?.replace('1)', '0.1)') } } // Use border color for fill slightly transparent
            }
        });
        console.log("Metrics chart initialized.");
    } catch (e) {
        console.error("Failed to initialize metrics chart:", e);
        displayError(`UI Error: Chart initialization failed: ${e.message}`, false, 'error-message');
    }
}
// Helper to convert hex to rgba parts for chart
function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
}


// --- UI Setup ---
function updateSliderDisplays(integration, reflexivity) {
    requestAnimationFrame(() => { // Batch DOM read/write
        const integrationValueEl = document.getElementById('integration-value');
        const reflexivityValueEl = document.getElementById('reflexivity-value');
        const integrationSliderEl = document.getElementById('integration-slider');
        const reflexivitySliderEl = document.getElementById('reflexivity-slider');

        if (integrationValueEl) integrationValueEl.textContent = integration?.toFixed(2) ?? 'N/A';
        if (reflexivityValueEl) reflexivityValueEl.textContent = reflexivity?.toFixed(2) ?? 'N/A';
        // Only update slider value if user isn't currently interacting with it
        if (integrationSliderEl && typeof integration === 'number' && !integrationSliderEl.matches(':active')) {
            integrationSliderEl.value = integration;
        }
        if (reflexivitySliderEl && typeof reflexivity === 'number' && !reflexivitySliderEl.matches(':active')) {
            reflexivitySliderEl.value = reflexivity;
        }
    });
}

function setupControls() {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const integrationValue = document.getElementById('integration-value');
    const reflexivityValue = document.getElementById('reflexivity-value');
    const saveButton = document.getElementById('save-state-button');
    const loadButton = document.getElementById('load-state-button');

    if (integrationSlider && integrationValue) {
        integrationSlider.addEventListener('input', () => {
            integrationValue.textContent = parseFloat(integrationSlider.value).toFixed(2);
            // Note: We now only *display* the change. The agent learns its own value.
            // We trigger a feedback effect instead of setting the agent's value.
            lastIntegrationInputTime = appClock.getElapsedTime();
        });
        // Sliders reflect agent's learned value, so they aren't disabled, but don't directly set agent state on input.
        // integrationSlider.disabled = true; // Example if making read-only
        // integrationSlider.classList.add('read-only-slider'); // Add CSS for read-only appearance
    }
    if (reflexivitySlider && reflexivityValue) {
        reflexivitySlider.addEventListener('input', () => {
            reflexivityValue.textContent = parseFloat(reflexivitySlider.value).toFixed(2);
            lastReflexivityInputTime = appClock.getElapsedTime();
        });
        // reflexivitySlider.disabled = true;
        // reflexivitySlider.classList.add('read-only-slider');
    }

    if (saveButton) {
         saveButton.addEventListener('click', saveState);
         saveButton.disabled = criticalError; // Disable if critical error
    }
    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true)); // Pass true to show messages
        if (localStorage.getItem(SAVED_STATE_KEY)) {
            loadButton.classList.add('has-saved-state'); // Indicate saved state exists
        }
         loadButton.disabled = criticalError; // Disable if critical error
    }
}

function setupChat() {
    const chatInput = document.getElementById('chat-input');
    const chatOutput = document.getElementById('chat-output');
    if (!chatInput || !chatOutput) {
        console.warn("Chat UI elements not found.");
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
            chatInput.disabled = true; // Disable input while processing
            appendChatMessage('You', userInput);
            chatInput.value = ''; // Clear input field immediately

            if (environment && agent) {
                 try {
                     // Get impact from environment (this might be async in future)
                     const impactData = environment.getEmotionalImpactFromText(userInput); // Returns { reward, context }
                     lastChatImpactTime = appClock.getElapsedTime();

                     // Process this impact immediately in the agent
                     // We need the *current* state and graph features before the chat input
                     // This requires a slight refactor or passing current state here.
                     // For simplicity, let's assume the next `animate` loop picks up the context change.
                     // Or, trigger a special agent step here? Let's try setting context and letting animate handle it.
                     currentContext = `Responding to: "${userInput.substring(0,30)}..."`; // Update context immediately
                     environment.applyExternalImpact(impactData.reward, currentContext); // Apply reward/context change

                     // appendChatMessage('System', `Input processed. Context: ${impactData.context}, Reward: ${impactData.reward.toFixed(2)}`);
                     logToTimeline(`Chat: "${userInput.substring(0, 20)}..."`, 'expressions-list');

                 } catch (processError) {
                     console.error("Error processing chat input:", processError);
                     appendChatMessage('System', 'Error processing input.');
                 } finally {
                     chatInput.disabled = false; // Re-enable input
                     chatInput.focus(); // Focus back on input
                 }

            } else {
                appendChatMessage('System', 'Environment/Agent not ready.');
                chatInput.disabled = false; // Re-enable if agent not ready
            }
        }
    });
}

function setupInspectorToggle() {
    const toggleButton = document.getElementById('toggle-inspector');
    const inspectorPanel = document.getElementById('tensor-inspector-panel');
    if (toggleButton && inspectorPanel) {
        // Initial state check (if panel starts hidden)
        if (!inspectorPanel.classList.contains('visible')) {
            // Set initial ARIA attribute if needed
            toggleButton.setAttribute('aria-expanded', 'false');
        }

        toggleButton.addEventListener('click', () => {
            const isVisible = inspectorPanel.classList.toggle('visible');
            toggleButton.setAttribute('aria-expanded', isVisible.toString());
            if (isVisible) {
                 // Optional: Update inspector content when opened? Maybe not needed if updated in animate loop.
                 // inspectTensor(agent?.beliefNetwork?.primaryState, 'tensor-inspector-content');
            }
        });
    }
}


// --- State Management ---
function saveState() {
    if (!agent || !environment || criticalError) {
        console.warn("Cannot save state: Agent/Env not ready or critical error detected.");
        appendChatMessage('System', 'Save failed: Simulation not ready or error detected.');
        return;
    }
    try {
        console.log("Saving state...");
        const envState = environment.getState();
        const agentState = agent.getState();

        if (!agentState || !envState) {
             throw new Error("Failed to get valid state from agent or environment.");
        }

        const stateToSave = {
            version: "2.3.1", // Match current version
            environment: envState,
            agent: agentState,
            // Save relevant global state needed to fully restore UI/Simulation sync
            globalState: {
                 currentRIHScore,
                 currentAvgAffinity,
                 currentHmLabel,
                 currentContext,
                 currentCascadeHistory,
                 currentIntegrationParam, // Save learned params explicitly
                 currentReflexivityParam,
                 currentTrustScore,
                 currentBeliefNorm,
                 currentSelfStateNorm,
                 // Don't save tensors directly (agent/env state handles that)
            },
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave));
        console.log(`Simulation state saved (Version: ${stateToSave.version}).`);
        appendChatMessage('System', 'Simulation state saved.');
        logToTimeline('State Saved', 'expressions-list');
        document.getElementById('load-state-button')?.classList.add('has-saved-state');

    } catch (e) {
        console.error("Error saving state:", e);
        appendChatMessage('System', `Save failed: ${e.message}`);
        displayError(`Error saving state: ${e.message}`, false, 'error-message');
    }
}


function loadState(showMessages = false) {
    if (!agent || !environment) { // Don't check criticalError here, allow loading even if previous run had error
        console.warn("Cannot load state: Agent/Env not initialized.");
        if (showMessages) appendChatMessage('System', 'Load failed: Simulation components not ready.');
        return false;
    }

    const stateString = localStorage.getItem(SAVED_STATE_KEY);
    if (!stateString) {
        console.log("No saved state found in localStorage.");
        if (showMessages) appendChatMessage('System', 'No saved state found.');
        return false;
    }

    let stateToLoad;
    try {
        stateToLoad = JSON.parse(stateString);
    } catch (e) {
        console.error("Error parsing saved state JSON:", e);
        if (showMessages) appendChatMessage('System', 'Load failed: Could not parse saved data.');
        localStorage.removeItem(SAVED_STATE_KEY); // Remove corrupted state
        document.getElementById('load-state-button')?.classList.remove('has-saved-state');
        return false;
    }

    if (!stateToLoad || typeof stateToLoad !== 'object' || !stateToLoad.environment || !stateToLoad.agent || !stateToLoad.globalState || stateToLoad.version !== "2.3.1") {
        console.error("Invalid or incompatible saved state format.", { savedVersion: stateToLoad?.version, expected: "2.3.1" });
        if (showMessages) appendChatMessage('System', `Load failed: Invalid or incompatible state format (Found: ${stateToLoad?.version}, Expected: 2.3.1). Saved state cleared.`);
        displayError(`Load failed: Incompatible state format (Version: ${stateToLoad?.version}). State cleared.`, false, 'error-message');
        localStorage.removeItem(SAVED_STATE_KEY); // Remove incompatible state
        document.getElementById('load-state-button')?.classList.remove('has-saved-state');
        return false;
    }

    // --- Attempt to Load State ---
    console.log("Loading state (Version: 2.3.1)...");
    // Set criticalError flag during load to prevent animation loop interference
    const wasCritical = criticalError; // Store previous state
    criticalError = true; // Prevent animation loop during load

    try {
        // Load core components first
        environment.loadState(stateToLoad.environment);
        agent.loadState(stateToLoad.agent); // Agent load should handle tensor reconstruction

        // Restore global state variables from saved data
        const gState = stateToLoad.globalState;
        currentRIHScore = gState.currentRIHScore ?? 0;
        currentAvgAffinity = gState.currentAvgAffinity ?? 0;
        currentHmLabel = gState.currentHmLabel ?? "idle";
        currentContext = gState.currentContext ?? "State loaded.";
        currentCascadeHistory = Array.isArray(gState.currentCascadeHistory) ? gState.currentCascadeHistory : [];
        currentIntegrationParam = gState.currentIntegrationParam ?? 0.5;
        currentReflexivityParam = gState.currentReflexivityParam ?? 0.5;
        currentTrustScore = gState.currentTrustScore ?? 1.0;
        currentBeliefNorm = gState.currentBeliefNorm ?? 0.0;
        currentSelfStateNorm = gState.currentSelfStateNorm ?? 0.0;

        // Restore current environment state vector (important for visuals)
        currentStateVector = Array.isArray(stateToLoad.environment.currentStateVector)
            ? stateToLoad.environment.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM)
            : zeros([Config.Agent.BASE_STATE_DIM]);
        while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0); // Ensure length

        // Reconstruct currentAgentEmotions tensor (agent state should have prevEmotions)
        if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
        if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
            currentAgentEmotions = tf.keep(agent.prevEmotions.clone()); // Keep a fresh copy
        } else {
            console.warn("Agent prevEmotions tensor invalid after load. Resetting to zeros.");
            currentAgentEmotions = typeof tf !== 'undefined' ? tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])) : null;
        }


        // --- Update UI to reflect loaded state ---
        // Clear chart and timeline
        if (metricsChart) {
            metricsChart.data.datasets.forEach(dataset => dataset.data = []);
            metricsChart.update('none'); // Update without animation or re-render immediately
        }
        const timelineList = document.getElementById('expressions-list');
        if (timelineList) timelineList.innerHTML = ''; // Clear timeline

        // Update all UI elements
        updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);
        updateDashboardDisplay();
        updateEmotionBars(currentAgentEmotions);
        updateCascadeViewer();
        if (agent.selfState && !agent.selfState.isDisposed) {
            updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
        } else {
            updateHeatmap([], 'heatmap-content');
        }

        // Update visualizations
        if (threeInitialized) {
            updateThreeJS(0, currentStateVector, currentRIHScore, agent.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext);
            updateSyntrometryInfoPanel();
        }
        if (conceptInitialized) {
             if (currentAgentEmotions && !currentAgentEmotions.isDisposed) {
                updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel, currentTrustScore);
             }
            animateConceptNodes(0, currentIntegrationParam, currentReflexivityParam, -1, -1, -1); // Reset node anim
        }
        if (live2dInitialized) {
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) {
                updateLive2DEmotions(currentAgentEmotions);
            }
            updateLive2DHeadMovement(currentHmLabel); // Set initial head pose
        }

        console.log("Simulation state loaded successfully.");
        if (showMessages) appendChatMessage('System', 'Simulation state loaded.');
        logToTimeline('State Loaded', 'expressions-list');

        criticalError = false; // Load successful, clear critical flag
        // No need to call animate() here, the main loop should resume or be started by initialize

        return true; // Indicate successful load

    } catch (e) {
        console.error("Error applying loaded state:", e);
        if (showMessages) appendChatMessage('System', `Load failed: ${e.message}. State may be corrupted.`);
        displayError(`Error loading state: ${e.message}. State might be corrupted. Try saving again or clearing storage.`, false, 'error-message');
        criticalError = wasCritical; // Restore previous critical error state if load failed
        // Attempt to reset to a default state? Or leave potentially broken? Reset is safer.
        // Consider calling a reset function here. For now, just return false.
        return false;
    }
}


// --- Animation Loop ---
async function animate() {
    if (criticalError) {
        // console.log("Animation loop stopped due to critical error."); // Avoid flooding console
        return; // Stop the loop
    }
    // Request next frame immediately
    requestAnimationFrame(animate);

    const deltaTime = appClock.getDelta();
    const elapsedTime = appClock.getElapsedTime();

    // Guard against excessively large deltaTime after pause/backgrounding
    if (deltaTime > 0.1) { // If frame took longer than 100ms, skip update to avoid jump
        console.warn(`Large deltaTime detected (${deltaTime.toFixed(3)}s), skipping simulation step.`);
        return;
    }


    // --- Simulation Step ---
    let agentResponse = null; // Define here for wider scope if needed
    if (agent && environment && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
        try {
            // 1. Environment evolves based on agent's last state
            const envStep = await environment.step(currentAgentEmotions, currentRIHScore, currentAvgAffinity);

            // 2. Update current state vector from environment
            const envStateArray = envStep.state?.arraySync()[0] || zeros([Config.Agent.BASE_STATE_DIM]);
            currentStateVector = envStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
            while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0); // Ensure length

            // 3. Agent processes the new environment state and graph features
            const graphFeatures = calculateGraphFeatures(); // Calculate current graph features
            agentResponse = await agent.process(
                currentStateVector,
                graphFeatures,
                { eventType: envStep.eventType, reward: envStep.reward }
            );

            // 4. Update global state from agent's response
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions); // Dispose old tensor
            currentAgentEmotions = tf.keep(agentResponse.emotions.clone()); // Keep the new tensor
            currentRIHScore = agentResponse.rihScore;
            currentAvgAffinity = (agentResponse.affinities?.length > 0) ? agentResponse.affinities.reduce((a, b) => a + b, 0) / agentResponse.affinities.length : 0;
            currentContext = envStep.context; // Update context from environment step
            currentCascadeHistory = agentResponse.cascadeHistory || [];
            currentIntegrationParam = agentResponse.integration;
            currentReflexivityParam = agentResponse.reflexivity;
            currentTrustScore = agentResponse.trustScore;
            currentBeliefNorm = agentResponse.beliefNorm ?? 0.0;
            currentSelfStateNorm = agentResponse.selfStateNorm ?? 0.0;

             // Only update head movement label if it changed and isn't idle (prevents spamming timeline)
             if (agentResponse.hmLabel && agentResponse.hmLabel !== currentHmLabel && agentResponse.hmLabel !== 'idle') {
                  // logToTimeline(`Action: ${agentResponse.hmLabel}`, 'expressions-list'); // Log significant actions?
             }
             currentHmLabel = agentResponse.hmLabel || "idle"; // Update label


            // 5. Update learned parameters display
            updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);

        } catch (e) {
            console.error("Error during simulation step:", e);
            displayError(`Simulation Error: ${e.message}. Attempting recovery.`, false, 'error-message');
            criticalError = true; // Consider setting critical error on simulation step failure
            // Attempt to recover state?
            if (!currentAgentEmotions || currentAgentEmotions?.isDisposed) {
                currentAgentEmotions = typeof tf !== 'undefined' ? tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])) : null;
            }
            // Avoid continuing if step fails? Depends on severity. For now, mark critical and stop.
            return;
        }
    } else if (!criticalError) {
         // Log warning if simulation components are missing but no critical error?
         // console.warn("Agent, Environment, or Emotions tensor missing/disposed during animation loop.");
         // Ensure emotion tensor exists if possible
         if ((!currentAgentEmotions || currentAgentEmotions?.isDisposed) && typeof tf !== 'undefined') {
             currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
         }
    }


    // --- Update UI Based on State ---
    updateDashboardDisplay(); // Update progress bars, text values
    updateMetricsChart(); // Add new data points to chart
    updateEmotionBars(currentAgentEmotions); // Update emotion bars visualization
    updateCascadeViewer(); // Update cascade visualization
    if (agent && agent.selfState && !agent.selfState.isDisposed) {
        updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content'); // Update heatmap
    } else {
         updateHeatmap([], 'heatmap-content'); // Clear heatmap if no state
    }
     // Update tensor inspector if visible
     const inspectorPanel = document.getElementById('tensor-inspector-panel');
     if (inspectorPanel && inspectorPanel.classList.contains('visible')) {
         inspectTensor(agent?.beliefNetwork?.primaryState, 'tensor-inspector-content');
     }


    // --- Update Visualizations ---
    try { if (threeInitialized) updateThreeJS(deltaTime, currentStateVector, currentRIHScore, agent?.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext); }
    catch (e) { console.error("Error updating Syntrometry Viz:", e); }

    try { if (threeInitialized) updateSyntrometryInfoPanel(); } // Update info panel based on graph interactions
    catch (e) { console.error("Error updating Syntrometry Info Panel:", e); }

    try {
        if (conceptInitialized) {
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) {
                updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel, currentTrustScore);
            }
            animateConceptNodes(deltaTime, currentIntegrationParam, currentReflexivityParam,
                elapsedTime - lastIntegrationInputTime < inputFeedbackDuration ? lastIntegrationInputTime : -1,
                elapsedTime - lastReflexivityInputTime < inputFeedbackDuration ? lastReflexivityInputTime : -1,
                elapsedTime - lastChatImpactTime < inputFeedbackDuration ? lastChatImpactTime : -1);
        }
    } catch (e) { console.error("Error updating Concept Viz:", e); }

    try {
        if (live2dInitialized) {
             if (currentAgentEmotions && !currentAgentEmotions.isDisposed) {
                 updateLive2DEmotions(currentAgentEmotions); // Sets target expression params
             }
            updateLive2DHeadMovement(currentHmLabel); // Sets target head rotation
             // Note: Actual interpolation/update happens in viz-live2d's internal ticker
        }
    } catch (e) { console.error("Error updating Live2D state:", e); }


    // --- Render Concept Graph ---
    if (conceptInitialized && conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
        try {
             if (conceptControls) conceptControls.update(); // Update orbit controls if used
            conceptRenderer.render(conceptScene, conceptCamera);
            conceptLabelRenderer.render(conceptScene, conceptCamera);
        } catch (e) {
            console.error("Error rendering Concept Graph:", e);
            // Potentially disable concept rendering if errors persist?
        }
    }
} // --- End Animate Loop ---


// --- Cleanup ---
function cleanup() {
    console.log("Cleaning up application resources (V2.3)...");
    const wasCritical = criticalError;
    criticalError = true; // Prevent animation loop from restarting during cleanup

    // Remove global event listeners
    window.removeEventListener('resize', resizeConceptGraphRenderer);
    window.removeEventListener('load', initialize);
    window.removeEventListener('beforeunload', cleanup); // Remove self to prevent multiple calls

    // 1. Destroy Chart
    if (metricsChart) {
        try { metricsChart.destroy(); } catch (e) { console.error("Chart destroy error:", e); }
        metricsChart = null;
    }

    // 2. Cleanup Visualizations (order might matter if they share resources)
    try { if (cleanupLive2D) cleanupLive2D(); }
    catch (e) { console.error("Live2D cleanup error:", e); }
    try { if (cleanupConceptVisualization) cleanupConceptVisualization(); }
    catch (e) { console.error("ConceptViz cleanup error:", e); }
    try { if (cleanupThreeJS) cleanupThreeJS(); }
    catch (e) { console.error("ThreeJS cleanup error:", e); }

    // 3. Cleanup Simulation Core
    try { if (environment?.cleanup) environment.cleanup(); }
    catch (e) { console.error("Environment cleanup error:", e); }
    try { if (agent?.cleanup) agent.cleanup(); } // Agent cleanup should dispose its tensors
    catch (e) { console.error("Agent cleanup error:", e); }

    // 4. Dispose any remaining global tensors
    if (typeof tf !== 'undefined' && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
        try { tf.dispose(currentAgentEmotions); } catch (e) { console.error("Error disposing global emotions tensor:", e); }
    }

    // 5. Nullify globals
    environment = null;
    agent = null;
    currentAgentEmotions = null;
    currentStateVector = null;
    // Clear other state variables if desired
    currentCascadeHistory = [];

    // Optionally clear UI elements like chat, timeline
    const chatOutput = document.getElementById('chat-output');
    if (chatOutput) chatOutput.innerHTML = '<div><b>System:</b> Session ended.</div>';
    const timeline = document.getElementById('expressions-list');
    if (timeline) timeline.innerHTML = '';


    console.log("Cleanup complete.");
}

// --- Global Event Listeners ---
window.addEventListener('load', initialize);
window.addEventListener('beforeunload', cleanup);
