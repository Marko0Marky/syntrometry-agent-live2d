// js/app.js

// --- Imports ---
import { Config, emotionKeywords, emotionNames } from './config.js'; // Added emotionNames import back
import { displayError, appendChatMessage, zeros, tensor, clamp, inspectTensor, logToTimeline } from './utils.js'; // Added inspectTensor, logToTimeline
import { SyntrometricAgent } from './agent.js'; // Using the updated V2.3 agent
import { EmotionalSpace } from './environment.js';
// --- CORRECTED IMPORT ---
import {
    initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel,
    threeInitialized, calculateGraphFeatures, // Import the function
    rihNode // Import rihNode directly (if needed elsewhere, otherwise remove) - calculation func will use internal ref
} from './viz-syntrometry.js';
// -------------------------
import {
    initConceptVisualization, updateAgentSimulationVisuals, animateConceptNodes,
    updateInfoPanel, cleanupConceptVisualization, conceptInitialized,
    conceptRenderer, conceptLabelRenderer, conceptScene, conceptCamera, conceptControls
} from './viz-concepts.js';
import { initLive2D, updateLive2DEmotions, updateLive2DHeadMovement, live2dInitialized, cleanupLive2D } from './viz-live2d.js';

// const emotionNames = Object.values(emotionKeywords).map(e => e.name); // Already imported from config

// --- Global State ---
let criticalError = false;
let agent = null; // Instance of SyntrometricAgent (V2.3)
let environment = null;
let currentStateVector = null; // BASE state from environment (BASE_STATE_DIM)
let currentAgentEmotions = null; // Agent's output emotions (tensor)
let currentRIHScore = 0;
let currentAvgAffinity = 0;
let currentHmLabel = "idle";
let currentContext = "Initializing...";
let currentCascadeHistory = [];
// Agent's internal params & metrics
let currentIntegrationParam = 0.5;
let currentReflexivityParam = 0.5;
let currentTrustScore = 1.0;
let currentBeliefNorm = 0.0; // Track norm of belief embedding
let currentSelfStateNorm = 0.0; // Track norm of self-state

const appClock = new THREE.Clock();
const SAVED_STATE_KEY = 'syntrometrySimulationState_v2_3_1'; // Increment version for new state format

// Timestamps for Input Feedback
let lastIntegrationInputTime = -1;
let lastReflexivityInputTime = -1;
let lastChatImpactTime = -1;
const inputFeedbackDuration = 0.5; // How long the feedback effect should last (seconds)

// --- NEW: Chart.js Instance ---
let metricsChart = null;
const MAX_CHART_POINTS = 150; // Max data points to show

// --- Helper Function ---
/**
 * Calculates L2 norm (magnitude) of a plain JS array.
 * @param {number[]} arr The input array.
 * @returns {number} The L2 norm.
 */
function calculateArrayNorm(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return 0.0;
    let sumSq = 0;
    for (const val of arr) {
        // Ensure value is a number before squaring
        if (typeof val === 'number' && isFinite(val)) {
            sumSq += val * val;
        } // Add this closing brace to match the opening brace of the for loop
    }
    return Math.sqrt(sumSq);
}

/**
 * Updates the heatmap visualization with the agent's state vector.
 * @param {number[]} stateVector - The agent's state vector (e.g., selfState array).
 * @param {string} targetElementId - The ID of the container element for the heatmap.
 */
function updateHeatmap(stateVector, targetElementId) {
    const heatmapContainer = document.getElementById(targetElementId);
    if (!heatmapContainer || !Array.isArray(stateVector)) {
        return;
    }

    const vectorLength = stateVector.length;
    if (vectorLength === 0) {
        heatmapContainer.innerHTML = '<p class="heatmap-placeholder">No State Data</p>'; // Placeholder text
        return;
    }

    // Determine Grid Dimensions (approx square)
    const gridDim = Math.ceil(Math.sqrt(vectorLength));
    const cellSize = Math.max(2, Math.floor(Math.min(heatmapContainer.clientWidth, heatmapContainer.clientHeight) / gridDim) -1 ); // Calculate cell size based on container

    heatmapContainer.style.gridTemplateColumns = `repeat(${gridDim}, ${cellSize}px)`;
    heatmapContainer.style.gridTemplateRows = `repeat(${gridDim}, ${cellSize}px)`;

    // Generate Heatmap Cells
    let htmlContent = '';
    for (let i = 0; i < vectorLength; i++) {
        const value = stateVector[i] ?? 0; // Default to 0 if undefined/null
        const absValue = Math.abs(value);

        // Color Mapping (-1 Blue -> 0 Dark Grey -> 1 Red)
        let r=30, g=30, b=30; // Start Dark Grey
        const intensity = Math.min(1.0, absValue * 1.5); // Amplify intensity slightly

        if (value > 0.01) { // Positive -> Red
            r = 30 + Math.round(200 * intensity);
            g = 30;
            b = 30;
        } else if (value < -0.01) { // Negative -> Blue
            r = 30;
            g = 30 + Math.round(50 * intensity); // Less intense green/cyan component
            b = 30 + Math.round(200 * intensity);
        }
        r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);

        const color = `rgb(${r}, ${g}, ${b})`;
        const tooltip = `Idx ${i}: ${value.toFixed(4)}`;
        htmlContent += `<div class="heatmap-cell" style="background-color: ${color};" title="${tooltip}"></div>`;
    }

    // Add filler cells if vector length isn't a perfect square
    const totalCells = gridDim * gridDim;
    for (let i = vectorLength; i < totalCells; i++) {
        htmlContent += `<div class="heatmap-cell filler"></div>`; // Darker filler color
    }

    // Update DOM
    heatmapContainer.innerHTML = htmlContent;
}

/**
 * Updates the real-time metrics chart.
 */
function updateMetricsChart() {
    if (!metricsChart || criticalError || agent === null) return;

    const now = Date.now(); // Use Luxon via adapter? No, streaming plugin handles it.

    try {
        // Add new data points
        metricsChart.data.datasets[0].data.push({ x: now, y: currentRIHScore });
        metricsChart.data.datasets[1].data.push({ x: now, y: currentAvgAffinity });
        metricsChart.data.datasets[2].data.push({ x: now, y: currentTrustScore });
        metricsChart.data.datasets[3].data.push({ x: now, y: currentBeliefNorm });
        metricsChart.data.datasets[4].data.push({ x: now, y: currentSelfStateNorm });

        // // Limit data points (handled by streaming plugin's ttl/duration)
        // if (metricsChart.data.datasets[0].data.length > MAX_CHART_POINTS) {
        //     metricsChart.data.datasets.forEach(dataset => dataset.data.shift());
        // }

        // Update the chart
        metricsChart.update('quiet'); // Use 'quiet' to prevent animation jumps
    } catch (e) {
        console.error("Error updating metrics chart:", e);
    }
}

/**
 * Updates the dashboard display elements (progress bars, text values).
 */
function updateDashboardDisplay() {
    const updateElement = (id, value, text = null, progress = false, range = [0, 1], invert = false) => {
        const element = document.getElementById(id);
        if (element) {
            const displayValue = text !== null ? text : value.toFixed(3);
             if (element.tagName === 'PROGRESS') {
                 const [min, max] = range;
                 const scaledValue = ((value - min) / (max - min)) * 100;
                 element.value = invert ? 100 - scaledValue : scaledValue;
             } else {
                 element.textContent = displayValue;
             }
        }
    };

    updateElement('metric-rih-value', currentRIHScore * 100, `${(currentRIHScore * 100).toFixed(1)}%`);
    updateElement('metric-rih-progress', currentRIHScore, null, true);

    updateElement('metric-affinity-value', currentAvgAffinity, currentAvgAffinity.toFixed(2));
    updateElement('metric-affinity-progress', currentAvgAffinity, null, true, [-1, 1]); // Range -1 to 1

    updateElement('metric-trust-value', currentTrustScore * 100, `${(currentTrustScore * 100).toFixed(1)}%`);
    updateElement('metric-trust-progress', currentTrustScore, null, true);

    updateElement('metric-belief-norm', currentBeliefNorm);
    updateElement('metric-self-norm', currentSelfStateNorm);
    updateElement('metric-context', 0, currentContext); // Use text argument for context
}


/**
 * Updates the emotion intensity bars UI.
 * @param {tf.Tensor|null} emotionsTensor - Tensor of current emotion intensities.
 */
function updateEmotionBars(emotionsTensor) {
    const container = document.getElementById('emotion-intensities');
    if (!container || !emotionsTensor || emotionsTensor.isDisposed) {
        // Optionally hide or clear bars if no data
        if(container) container.style.opacity = '0.5';
        return;
    }
     if(container) container.style.opacity = '1';


    try {
        const emotions = emotionsTensor.arraySync()[0];
        emotionNames.forEach((name, index) => {
             const barFill = container.querySelector(`.${name.toLowerCase()} .bar-fill`);
             if (barFill && emotions.length > index) {
                 const intensity = clamp(emotions[index] * 100, 0, 100);
                 barFill.style.width = `${intensity}%`;
             }
        });
    } catch (e) {
        console.error("Error updating emotion bars:", e);
    }
}

/**
 * Updates the basic cascade viewer with text representation.
 */
function updateCascadeViewer() {
    const contentDiv = document.getElementById('cascade-viewer-content');
    if (!contentDiv) return;

    if (!currentCascadeHistory || currentCascadeHistory.length === 0) {
        contentDiv.textContent = 'No cascade data available.';
        return;
    }

    let html = '';
    currentCascadeHistory.forEach((levelArray, index) => {
        html += `<div class="level-title">Level ${index}: (${levelArray.length} syndromes)</div>`;
        if (levelArray.length > 0) {
             const valuesString = levelArray.map(v => v.toFixed(3)).join(', ');
             html += `<div class="level-data">[${valuesString}]</div>`;
        } else {
             html += `<div class="level-data">[Empty]</div>`;
        }
    });
    contentDiv.innerHTML = html;
     // Scroll to bottom if needed
    // contentDiv.scrollTop = contentDiv.scrollHeight;
}

// --- Initialization ---
/**
 * Initializes all components of the application.
 */
async function initialize() {
    console.log("Initializing application (Agent V2.3)...");
    const coreInitSuccess = initAgentAndEnvironment(); // Creates the V2.3 agent
    const threeSuccess = initThreeJS();
    const conceptSuccess = initConceptVisualization(appClock);
    const live2dSuccess = await initLive2D();

    // Error handling
    if (!coreInitSuccess) {
        criticalError = true;
        displayError("Core simulation components failed to initialize. Check console for TF/Agent errors.", true, 'error-message');
    }
     if (!threeSuccess) displayError("Syntrometry visualization failed to initialize.", false, 'syntrometry-error-message');
     if (!conceptSuccess) displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
     if (!live2dSuccess) displayError("Live2D avatar failed to initialize.", false, 'error-message');

     // --- Initialize Chart.js ---
     initMetricsChart();


     // --- Initial State Setup ---
     let initialStateLoaded = false;
     if (coreInitSuccess) {
         initialStateLoaded = loadState(false); // Load V2.3 state
     }

     if (!initialStateLoaded && coreInitSuccess && agent && environment) { // Check agent/env exist
         const initialState = environment.reset();
         const initialStateArray = initialState.state ? initialState.state.arraySync()[0] : zeros([Config.Agent.BASE_STATE_DIM]); // Get initial BASE state
         currentStateVector = initialStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
         while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);

         // Initial agent processing needs initial graph features
         const initialGraphFeatures = calculateGraphFeatures(); // Call the imported function
         const initialAgentResponse = await agent.process(
             currentStateVector,
             initialGraphFeatures, // Pass features
             { eventType: null, reward: 0 } // Pass environment context
         );

         // Update global state from initial response
         if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
         currentAgentEmotions = initialAgentResponse.emotions; // Keep the tensor
         currentRIHScore = initialAgentResponse.rihScore;
         currentAvgAffinity = (initialAgentResponse.affinities?.length > 0) ? initialAgentResponse.affinities.reduce((a, b) => a + b, 0) / initialAgentResponse.affinities.length : 0;
         currentHmLabel = initialAgentResponse.hmLabel;
         currentContext = "Simulation initialized (V2.3).";
         currentCascadeHistory = initialAgentResponse.cascadeHistory;
         currentIntegrationParam = initialAgentResponse.integration;
         currentReflexivityParam = initialAgentResponse.reflexivity;
         currentTrustScore = initialAgentResponse.trustScore;
         currentBeliefNorm = initialAgentResponse.beliefNorm ?? 0.0;
         currentSelfStateNorm = initialAgentResponse.selfStateNorm ?? 0.0;


         console.log("Initialized V2.3 with new state.");
     } else if (!coreInitSuccess) {
         // Fallback global states
         currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);
         if (typeof tf !== 'undefined') {
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
            currentAgentEmotions = tf.keep(tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]));
         } else { currentAgentEmotions = null; }
         currentRIHScore = 0; currentAvgAffinity = 0; currentHmLabel = "idle";
         currentContext = "Simulation core failed to load."; currentCascadeHistory = [];
         currentIntegrationParam = 0.5; currentReflexivityParam = 0.5; currentTrustScore = 1.0; currentBeliefNorm = 0.0; currentSelfStateNorm = 0.0;
     }


    // --- Initial visualization updates ---
    updateSliderDisplays(currentIntegrationParam, currentReflexivityParam); // Use agent params

    if (threeInitialized) {
        updateThreeJS(0, currentStateVector, currentRIHScore, agent?.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext);
        updateSyntrometryInfoPanel();
    }
    if (conceptInitialized) {
        try {
            let initialEmotionsForViz = null;
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) { initialEmotionsForViz = currentAgentEmotions; }
            else if (typeof tf !== 'undefined') { initialEmotionsForViz = tf.zeros([1, Config.Agent.EMOTION_DIM]); }
            if (initialEmotionsForViz) {
                // Pass trust score during init as well
                updateAgentSimulationVisuals(initialEmotionsForViz, currentRIHScore, currentAvgAffinity, currentHmLabel, currentTrustScore);
                if (initialEmotionsForViz !== currentAgentEmotions && typeof tf !== 'undefined' && !initialEmotionsForViz.isDisposed) tf.dispose(initialEmotionsForViz); // Dispose if created
            }
        } catch (e) { console.error("Error initial concept viz update:", e); }
        animateConceptNodes(0, currentIntegrationParam, currentReflexivityParam, -1, -1, -1);
    }
     if (live2dInitialized) {
        try {
            let initialEmotionsForLive2D = null;
             if (currentAgentEmotions && !currentAgentEmotions.isDisposed) { initialEmotionsForLive2D = currentAgentEmotions; }
             else if (typeof tf !== 'undefined') { initialEmotionsForLive2D = tf.zeros([1, Config.Agent.EMOTION_DIM]); }
            if (initialEmotionsForLive2D) {
                 updateLive2DEmotions(initialEmotionsForLive2D);
                  if (initialEmotionsForLive2D !== currentAgentEmotions && typeof tf !== 'undefined' && !initialEmotionsForLive2D.isDisposed) tf.dispose(initialEmotionsForLive2D); // Dispose if created
            }
        } catch (e) { console.error("Error initial Live2D update:", e); }
        updateLive2DHeadMovement(currentHmLabel, 0);
     }

    // Initial Metrics and Heatmap update
    updateDashboardDisplay(); // Update progress bars etc.
    updateEmotionBars(currentAgentEmotions); // Update emotion bars
    updateCascadeViewer(); // Update cascade view
    logToTimeline("System Initialized", 'expressions-list'); // Log initial event

    if (agent?.selfState && !agent.selfState.isDisposed) {
         try { updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content'); } catch(e) { console.error("Initial heatmap update failed:", e); }
    } else { updateHeatmap([], 'heatmap-content');} // Show empty heatmap

    setupControls();
    setupChat();
    setupInspectorToggle(); // Setup toggle for inspector

    console.log("Initialization complete (V2.3). Starting animation loop.");
    animate(); // Start the main loop
}

/**
 * Initializes Agent and Environment instances. Sets criticalError if TF.js is missing.
// In app.js

/**
 * Initializes Agent and Environment instances. Sets criticalError if TF.js is missing.
 * @returns {boolean} True if successful, false otherwise.
 */
function initAgentAndEnvironment() {
    if (typeof tf === 'undefined') {
        console.error("TensorFlow.js is required for Agent/Environment.");
        criticalError = true; agent = null; environment = null; return false;
   }
   try {
       // Log before creation
       console.log("Attempting to create SyntrometricAgent...");
       agent = new SyntrometricAgent(); // Uses the V2.3 logic now
       // Log immediately after creation attempt
       console.log("SyntrometricAgent instance created (or constructor finished). Agent object:", agent);

       environment = new EmotionalSpace();

       // --- Move Check Inside Try Block ---
       // Check if agent and its essential components are valid *after* creation
       if (!agent || !agent.optimizer || !agent.beliefNetwork) {
           console.error("Validation Failed *after* agent constructor finished.", {
               agentExists: !!agent,
               optimizerExists: !!agent?.optimizer,
               beliefNetExists: !!agent?.beliefNetwork
           });
           // Throw error to be caught by the outer catch block
           throw new Error("Agent core components failed validation immediately after initialization.");
       }
       // --- End Moved Check ---

       console.log("Agent (V2.3) and Environment validation passed.");
       return true;

   } catch (e) {
       // Catch errors from agent creation OR the explicit check
       console.error('[Init] Agent/Env error:', e); // Log the specific error
       displayError(`Error initializing Agent/Environment: ${e.message}. Simulation logic disabled.`, true, 'error-message');
       criticalError = true;
       // Ensure agent/env are nulled if initialization failed at any point
       if (agent && typeof agent.cleanup === 'function') { agent.cleanup(); }
       agent = null;
       environment = null;
       return false;
   }
}

/**
 * Initializes the Chart.js instance for metrics.
 */
// In app.js

/**
 * Initializes the Chart.js instance for metrics.
 */
function initMetricsChart() {
    const ctx = document.getElementById('metrics-chart');
    if (!ctx) {
        console.error("Metrics chart canvas not found!");
        return;
    }
    if (metricsChart) { // Destroy previous chart if re-initializing
        metricsChart.destroy();
    }

    // --- Get CSS Variable Values ---
    const computedStyle = getComputedStyle(document.documentElement);
    const chartGridColor = computedStyle.getPropertyValue('--chart-grid-color').trim();
    const chartTickColor = 'rgba(238, 238, 238, 0.7)'; // Can keep as literal or get variable if needed
    const chartLegendLabelColor = 'rgba(238, 238, 238, 0.8)'; // Can keep as literal
    const chartTooltipBg = computedStyle.getPropertyValue('--chart-tooltip-bg').trim();
    const chartAccentColor = computedStyle.getPropertyValue('--accent-color').trim();
    const chartTextColor = computedStyle.getPropertyValue('--text-color').trim();
    // --- Get Emotion Colors for potential use later if needed ---
    // const colorJoy = computedStyle.getPropertyValue('--emotion-joy').trim();
    // const colorFear = computedStyle.getPropertyValue('--emotion-fear').trim();
    // const colorCuriosity = computedStyle.getPropertyValue('--emotion-curiosity').trim();
    // const colorFrustration = computedStyle.getPropertyValue('--emotion-frustration').trim();
    // const colorCalm = computedStyle.getPropertyValue('--emotion-calm').trim();
    // const colorSurprise = computedStyle.getPropertyValue('--emotion-surprise').trim();
    // --- Get Specific RGB Values for borders/backgrounds if alpha needed ---
    const colorRIHBorder = 'rgb(102, 255, 102)';
    const colorAffinityBorder = 'rgb(255, 170, 102)';
    const colorTrustBorder = 'rgb(102, 170, 255)';
    const colorBeliefNormBorder = 'rgb(255, 255, 102)';
    const colorSelfNormBorder = 'rgb(200, 150, 255)';


    metricsChart = new Chart(ctx, {
        type: 'line',
        data: {
            // labels: [], // Managed by streaming plugin
            datasets: [
                {
                    label: 'RIH',
                    data: [],
                    borderColor: colorRIHBorder,
                    backgroundColor: colorRIHBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), // Derive rgba
                    borderWidth: 1.5,
                    pointRadius: 0,
                    yAxisID: 'yPercentage',
                    tension: 0.1
                },
                {
                    label: 'Affinity',
                    data: [],
                    borderColor: colorAffinityBorder,
                    backgroundColor: colorAffinityBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'),
                    borderWidth: 1.5,
                    pointRadius: 0,
                     yAxisID: 'yBipolar',
                     tension: 0.1
                },
                {
                    label: 'Trust',
                    data: [],
                    borderColor: colorTrustBorder,
                    backgroundColor: colorTrustBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'),
                    borderWidth: 1.5,
                    pointRadius: 0,
                    yAxisID: 'yPercentage',
                    tension: 0.1
                },
                 {
                    label: 'Belief Norm',
                    data: [],
                    borderColor: colorBeliefNormBorder,
                    backgroundColor: colorBeliefNormBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'),
                    borderWidth: 1,
                    pointRadius: 0,
                    yAxisID: 'yNorm',
                    tension: 0.1,
                    hidden: true // Initially hidden
                },
                 {
                    label: 'Self Norm',
                    data: [],
                    borderColor: colorSelfNormBorder,
                    backgroundColor: colorSelfNormBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'),
                    borderWidth: 1,
                    pointRadius: 0,
                    yAxisID: 'yNorm',
                    tension: 0.1,
                    hidden: true // Initially hidden
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Disable default animation for smoother streaming
            scales: {
                x: {
                    type: 'realtime',
                    realtime: {
                        duration: 30000, // Show last 30 seconds
                        ttl: 60000, // Keep data for 60 seconds
                        delay: 500, // Delay before data is removed
                        pause: false, // Do not pause on hover
                        // frameRate: 15 // Optional: Limit chart updates
                    },
                    ticks: { display: false }, // Hide x-axis labels
                    grid: {
                        color: chartGridColor // Use retrieved JS variable
                    }
                },
                yPercentage: { // For RIH, Trust (0-1 range)
                    beginAtZero: true,
                    max: 1.0,
                    position: 'left',
                    ticks: {
                         color: chartTickColor, // Use variable or literal
                         font: { size: 10 },
                         stepSize: 0.25,
                         // Format ticks as percentages
                         callback: value => (value * 100).toFixed(0) + '%'
                    },
                    grid: {
                        color: chartGridColor // Use retrieved JS variable
                    }
                },
                 yBipolar: { // For Affinity (-1 to 1 range)
                    min: -1.0,
                    max: 1.0,
                    position: 'right', // Place on opposite side
                    ticks: {
                        color: chartTickColor, // Use variable or literal
                        font: { size: 10 },
                        stepSize: 0.5
                    },
                    grid: {
                        display: false // Hide grid for this axis
                    }
                 },
                 yNorm: { // For Norms (0 to ~5 range, might need adjustment)
                    beginAtZero: true,
                    // max: 5.0, // Let it auto-scale for now
                    position: 'right',
                    display: false, // Hidden by default, shown if dataset visible
                    ticks: {
                        color: chartTickColor, // Use variable or literal
                        font: { size: 10 }
                    },
                    grid: {
                        display: false
                    }
                 }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: chartLegendLabelColor, // Use variable or literal
                        font: { size: 10 },
                        boxWidth: 12,
                        padding: 10
                    }
                },
                 tooltip: {
                     enabled: true,
                     mode: 'index',
                     intersect: false,
                     backgroundColor: chartTooltipBg, // Use retrieved JS variable
                     titleColor: chartAccentColor, // Use retrieved JS variable
                     bodyColor: chartTextColor, // Use retrieved JS variable
                     boxPadding: 5,
                     // Format tooltip titles and values
                     callbacks: {
                         title: function(tooltipItems) {
                             // Format timestamp if needed, Luxon adapter might handle this
                             const timestamp = tooltipItems[0]?.parsed?.x;
                             return timestamp ? new Date(timestamp).toLocaleTimeString() : '';
                         },
                         label: function(context) {
                              let label = context.dataset.label || '';
                              if (label) {
                                  label += ': ';
                              }
                              if (context.parsed.y !== null) {
                                  // Format percentage axes correctly
                                  if (context.dataset.yAxisID === 'yPercentage') {
                                       label += (context.parsed.y * 100).toFixed(1) + '%';
                                  } else {
                                       label += context.parsed.y.toFixed(3);
                                  }
                              }
                              return label;
                          }
                     }
                 }
            },
            interaction: { // Optimize interaction
                 mode: 'nearest',
                 axis: 'x',
                 intersect: false
            }
        }
    });
    console.log("Metrics chart initialized.");
}

/**
 * Updates the slider display values based on agent's internal state.
 */
function updateSliderDisplays(integration, reflexivity) {
    const integrationValue = document.getElementById('integration-value');
    const reflexivityValue = document.getElementById('reflexivity-value');
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');

    if (integrationValue) integrationValue.textContent = integration?.toFixed(2) ?? 'N/A';
    if (reflexivityValue) reflexivityValue.textContent = reflexivity?.toFixed(2) ?? 'N/A';
    // Update sliders only if they are NOT currently being dragged by the user
    if (integrationSlider && typeof integration === 'number' && !integrationSlider.matches(':active')) integrationSlider.value = integration;
    if (reflexivitySlider && typeof reflexivity === 'number' && !reflexivitySlider.matches(':active')) reflexivitySlider.value = reflexivity;
}

/**
 * Sets up the slider controls (now update timestamps for feedback) and buttons.
 */
function setupControls() {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const integrationValue = document.getElementById('integration-value');
    const reflexivityValue = document.getElementById('reflexivity-value');
    const saveButton = document.getElementById('save-state-button');
    const loadButton = document.getElementById('load-state-button');

    if (integrationSlider && integrationValue) {
        integrationSlider.addEventListener('input', () => {
            // Display value immediately, but don't modify agent param here
            integrationValue.textContent = parseFloat(integrationSlider.value).toFixed(2);
            lastIntegrationInputTime = appClock.getElapsedTime(); // Mark time for feedback pulse
        });
        integrationSlider.removeAttribute('disabled');
        integrationSlider.classList.remove('read-only-slider');
    }
    if (reflexivitySlider && reflexivityValue) {
        reflexivitySlider.addEventListener('input', () => {
            // Display value immediately
            reflexivityValue.textContent = parseFloat(reflexivitySlider.value).toFixed(2);
            lastReflexivityInputTime = appClock.getElapsedTime(); // Mark time for feedback pulse
        });
         reflexivitySlider.removeAttribute('disabled');
         reflexivitySlider.classList.remove('read-only-slider');
    }

    if (saveButton) saveButton.addEventListener('click', saveState);
    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true));
         if (localStorage.getItem(SAVED_STATE_KEY)) {
            loadButton.classList.add('has-saved-state');
         }
    }
    if (criticalError) {
        if (saveButton) saveButton.disabled = true;
        if (loadButton) loadButton.disabled = true;
    }
}

/**
 * Sets up the chat input functionality.
 */
function setupChat() {
    const chatInput = document.getElementById('chat-input');
    const chatOutput = document.getElementById('chat-output');
    if (!chatInput || !chatOutput) {
        console.warn("Chat elements not found.");
        return;
    }
     if (criticalError) {
        chatInput.disabled = true; chatInput.placeholder = "Simulation disabled."; return;
     }

    chatInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && chatInput.value.trim()) {
             const userInput = chatInput.value.trim();
             appendChatMessage('You', userInput);
             chatInput.value = '';
             if (environment && agent) { // Check agent exists too
                 // Let environment process text for potential base emotion changes
                 const impactTensor = environment.getEmotionalImpactFromText(userInput);
                 // Optional: Use impact tensor to directly influence agent's next step? (more complex)
                 // For now, just let it modify env state.
                  tf.dispose(impactTensor); // Dispose tensor returned by impact function

                 lastChatImpactTime = appClock.getElapsedTime(); // Trigger feedback pulse
                 appendChatMessage('System', 'Input processed, influencing environment.');
                 logToTimeline(`Chat: "${userInput.substring(0, 20)}..."`, 'expressions-list'); // Log chat event

             } else { appendChatMessage('System', 'Environment/Agent not initialized.'); }
        }
    });
}

/**
 * Sets up the toggle button for the tensor inspector.
 */
function setupInspectorToggle() {
    const toggleButton = document.getElementById('toggle-inspector');
    const inspectorPanel = document.getElementById('tensor-inspector-panel');
    if(toggleButton && inspectorPanel) {
        toggleButton.addEventListener('click', () => {
            inspectorPanel.classList.toggle('visible');
        });
    }
}


// --- Save/Load State Functions (Using V2.3.1 key) ---
function saveState() {
    if (!agent || !environment || criticalError) {
        console.warn("Agent/Env not ready or critical error, cannot save.");
        appendChatMessage('System', 'Save failed: Simulation not ready or error detected.');
        return;
     }
    try {
        const envState = environment.getState();
        const agentState = agent.getState(); // Gets V2.3 state

        // Add chart data? Maybe too large. Only save core state.
        const stateToSave = {
            version: "2.3.1", // Mark state version
            environment: envState,
            agent: agentState,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave)); // Use new key

        console.log(`Simulation state saved to localStorage (Key: ${SAVED_STATE_KEY}).`);
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
    if (!agent || !environment || criticalError) {
        console.warn("Agent/Env not ready or critical error, cannot load.");
        if (showMessages) appendChatMessage('System', 'Load failed: Simulation not ready or error detected.');
        return false;
    }
    try {
        const stateString = localStorage.getItem(SAVED_STATE_KEY); // Use new key
        if (!stateString) {
            console.log("No saved state found in localStorage.");
            if (showMessages) appendChatMessage('System', 'No saved state found.');
            return false;
        }

        const stateToLoad = JSON.parse(stateString);
        // Basic validation
        if (!stateToLoad || !stateToLoad.environment || !stateToLoad.agent || stateToLoad.version !== "2.3.1") {
             console.error("Invalid or incompatible saved state format.", stateToLoad?.version);
             if (showMessages) appendChatMessage('System', `Load failed: Invalid state format (Version: ${stateToLoad?.version}, Expected: 2.3.1).`);
             // localStorage.removeItem(SAVED_STATE_KEY); // Optionally remove invalid state
             displayError(`Load failed: Invalid state format (Version: ${stateToLoad?.version}).`, false, 'error-message');
            return false;
        }

        // Pause animation/updates during load? Could prevent race conditions.
        const wasAnimating = !criticalError; // Check if it was running
        criticalError = true; // Temporarily pause animation loop

        // Load state into modules
        environment.loadState(stateToLoad.environment);
        agent.loadState(stateToLoad.agent); // Loads V2.3 state

        // --- Restore global variables DERIVED from loaded agent/env state ---
        currentStateVector = Array.isArray(stateToLoad.environment.currentStateVector)
             ? stateToLoad.environment.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM)
             : zeros([Config.Agent.BASE_STATE_DIM]);
        while(currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);


        if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
        if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
            currentAgentEmotions = tf.keep(agent.prevEmotions.clone());
        } else {
            console.warn("Agent prevEmotions tensor invalid after load. Resetting.");
            currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        currentRIHScore = agent.lastRIH ?? 0;
        currentTrustScore = agent.latestTrustScore ?? 1.0;
        currentContext = "State loaded.";
        currentHmLabel = "idle"; // Reset head movement on load
        currentAvgAffinity = 0; // Reset average affinity
        currentCascadeHistory = []; // Clear cascade history display
        currentIntegrationParam = agent.integrationParam?.dataSync()[0] ?? 0.5;
        currentReflexivityParam = agent.reflexivityParam?.dataSync()[0] ?? 0.5;
        // Calculate norms after load
         currentBeliefNorm = 0.0; // Recalculated on next step
        if (agent.selfState && !agent.selfState.isDisposed) {
             try { currentSelfStateNorm = calculateArrayNorm(Array.from(agent.selfState.dataSync())); } catch(e){currentSelfStateNorm = 0.0;}
        } else { currentSelfStateNorm = 0.0;}


        // --- Clear Chart Data ---
        if (metricsChart) {
             metricsChart.data.datasets.forEach(dataset => dataset.data = []);
             metricsChart.update();
        }
         // Clear Timeline
         const timelineList = document.getElementById('expressions-list');
         if(timelineList) timelineList.innerHTML = '';


        // --- Update UI Displays ---
        updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);
        updateDashboardDisplay();
        updateEmotionBars(currentAgentEmotions);
        updateCascadeViewer(); // Update cascade view (likely empty initially after load)
        if (agent.selfState && !agent.selfState.isDisposed) { updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content'); }
        else { updateHeatmap([], 'heatmap-content'); }


        console.log(`Simulation state loaded (Key: ${SAVED_STATE_KEY}).`);
        if (showMessages) appendChatMessage('System', 'Simulation state loaded.');
        logToTimeline('State Loaded', 'expressions-list');

         // Trigger initial viz updates with loaded state
         if (threeInitialized) {
             updateThreeJS(0, currentStateVector, currentRIHScore, [], currentIntegrationParam, currentReflexivityParam, [], currentContext);
             updateSyntrometryInfoPanel();
         }
         if (conceptInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
             updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, 0, currentHmLabel, currentTrustScore); // Pass trust score
             animateConceptNodes(0, currentIntegrationParam, currentReflexivityParam, -1, -1, -1);
         }
          if (live2dInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
              updateLive2DEmotions(currentAgentEmotions);
              updateLive2DHeadMovement(currentHmLabel, 0);
          }
         // updateMetricsDisplay(currentRIHScore, [], currentAgentEmotions, currentContext, currentTrustScore, currentBeliefNorm, currentSelfStateNorm); // Replaced by updateDashboardDisplay

         criticalError = !wasAnimating; // Resume animation if it was running before load
         if (!criticalError) animate(); // Restart loop if needed

        return true;
    } catch (e) {
        console.error("Error loading state:", e);
         if (showMessages) appendChatMessage('System', `Load failed: ${e.message}`);
         // localStorage.removeItem(SAVED_STATE_KEY); // Optionally remove corrupt state
         displayError(`Load failed: ${e.message}`, false, 'error-message');
         criticalError = false; // Allow animation loop to restart if it was paused
         return false;
    }
}


/**
 * The main animation loop.
 */
async function animate() {
    if (criticalError) {
        // console.log("Animation loop paused due to critical error or loading.");
        return;
    }
    requestAnimationFrame(animate);

    const deltaTime = appClock.getDelta();
    const elapsedTime = appClock.getElapsedTime();

    // Calculate Graph Features
    const graphFeatures = calculateGraphFeatures(); // Calculate every frame

    // --- Simulation Step ---
    let agentResponse = null; // Define agentResponse outside the try block
    if (agent && environment && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
        try {
            const envStep = await environment.step(currentAgentEmotions, currentRIHScore, currentAvgAffinity);
            const envStateArray = envStep.state?.arraySync()[0] || zeros([Config.Agent.BASE_STATE_DIM]);
            currentStateVector = envStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
            while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);

            // Agent processes state + graph features
            agentResponse = await agent.process( // Assign to outer scope variable
                currentStateVector,
                graphFeatures, // Pass calculated features
                { eventType: envStep.eventType, reward: envStep.reward }
            );

            // Update global state from agent response
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
            currentAgentEmotions = agentResponse.emotions; // Keep new tensor
            currentRIHScore = agentResponse.rihScore;
            currentAvgAffinity = (agentResponse.affinities?.length > 0) ? agentResponse.affinities.reduce((a, b) => a + b, 0) / agentResponse.affinities.length : 0;
            currentHmLabel = agentResponse.hmLabel;
            currentContext = envStep.context;
            currentCascadeHistory = agentResponse.cascadeHistory;
            currentIntegrationParam = agentResponse.integration;
            currentReflexivityParam = agentResponse.reflexivity;
            currentTrustScore = agentResponse.trustScore;
            currentBeliefNorm = agentResponse.beliefNorm ?? 0.0; // Capture Belief Norm
            currentSelfStateNorm = agentResponse.selfStateNorm ?? 0.0; // Capture Self-State Norm

            updateSliderDisplays(currentIntegrationParam, currentReflexivityParam); // Update sliders based on agent's internal params

        } catch (e) {
             console.error("Error during simulation step:", e);
             displayError(`Simulation Error: ${e.message}. Attempting to continue.`, false, 'error-message');
             // Attempt to reuse previous values if an error occurs during processing
             // Ensure currentAgentEmotions is valid
              if (!currentAgentEmotions || currentAgentEmotions?.isDisposed) {
                 if (typeof tf !== 'undefined') {
                     currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
                 } else { currentAgentEmotions = null; }
             }
        }
    } else {
         // Fallback logic if agent/env not ready
         if (!currentAgentEmotions || currentAgentEmotions?.isDisposed) {
             if (typeof tf !== 'undefined') {
                 if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
                 currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
             } else { currentAgentEmotions = null; }
         }
         // Ensure norms are reset if sim isn't running
         currentBeliefNorm = 0.0;
         currentSelfStateNorm = 0.0;
    }


     // --- Update UI & Visualizations ---
     updateDashboardDisplay(); // Update progress bars, text values
     updateMetricsChart(); // Update the historical chart
     updateEmotionBars(currentAgentEmotions); // Update emotion intensity bars
     updateCascadeViewer(); // Update cascade text view

     // Log head movement to timeline if it changed
     if (agentResponse && agentResponse.hmLabel !== currentHmLabel && agentResponse.hmLabel !== 'idle') {
          // logToTimeline(`Action: ${agentResponse.hmLabel}`, 'expressions-list'); // Log significant actions
          // currentHmLabel = agentResponse.hmLabel; // Update global currentHmLabel (already done above)
     }


    try {
        if (threeInitialized) {
            updateThreeJS(deltaTime, currentStateVector, currentRIHScore, agent?.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext);
            updateSyntrometryInfoPanel(); // Update the hover/select info panel
        }
    } catch(e) { console.error("Error updating Syntrometry Viz:", e); }

    try {
        if (conceptInitialized) {
            let emotionsForViz = null;
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) emotionsForViz = currentAgentEmotions;
            else if(typeof tf !== 'undefined') emotionsForViz = tf.zeros([1, Config.Agent.EMOTION_DIM]);

            if (emotionsForViz) {
                updateAgentSimulationVisuals(emotionsForViz, currentRIHScore, currentAvgAffinity, currentHmLabel, currentTrustScore); // Pass trust
                 if (emotionsForViz !== currentAgentEmotions && typeof tf !== 'undefined' && !emotionsForViz.isDisposed) tf.dispose(emotionsForViz); // Dispose if created
            }
        }
    } catch (e) { console.error("Error updating Concept Viz placeholders:", e); }

    try {
        if (live2dInitialized) {
             let emotionsForLive2D = null;
             if (currentAgentEmotions && !currentAgentEmotions.isDisposed) emotionsForLive2D = currentAgentEmotions;
             else if(typeof tf !== 'undefined') emotionsForLive2D = tf.zeros([1, Config.Agent.EMOTION_DIM]);

            if (emotionsForLive2D) {
                 updateLive2DEmotions(emotionsForLive2D);
                 if (emotionsForLive2D !== currentAgentEmotions && typeof tf !== 'undefined' && !emotionsForLive2D.isDisposed) tf.dispose(emotionsForLive2D); // Dispose if created
            }
            updateLive2DHeadMovement(currentHmLabel, deltaTime);
        }
    } catch (e) { console.error("Error updating Live2D:", e); }


    // --- Update Heatmap ---
    if (agent && agent.selfState && !agent.selfState.isDisposed) {
        try { updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content'); } catch(e) { console.error("Heatmap update failed:", e); }
    } else { updateHeatmap([], 'heatmap-content');} // Show empty heatmap if state unavailable


    // --- Animate Visualizations ---
    try {
        if (conceptInitialized && conceptControls) conceptControls.update();
        if (conceptInitialized) {
            animateConceptNodes(deltaTime, currentIntegrationParam, currentReflexivityParam, elapsedTime - lastIntegrationInputTime < inputFeedbackDuration ? lastIntegrationInputTime : -1, elapsedTime - lastReflexivityInputTime < inputFeedbackDuration ? lastReflexivityInputTime : -1, elapsedTime - lastChatImpactTime < inputFeedbackDuration ? lastChatImpactTime : -1 );
        }
    } catch (e) { console.error("Error animating Concept Viz nodes:", e); }


     // **Render Visualizations**
     if (conceptInitialized && conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
         try { conceptRenderer.render(conceptScene, conceptCamera); conceptLabelRenderer.render(conceptScene, conceptCamera); } catch (e) { console.error("Error rendering Concept Graph:", e); }
     }
}

// --- Cleanup ---
function cleanup() {
    console.log("Cleaning up application resources (V2.3)...");
    criticalError = true; // Stop animation loop requests

    // Destroy Chart.js instance
    if (metricsChart) {
        try { metricsChart.destroy(); metricsChart = null; } catch(e) { console.error("Chart destroy error:", e); }
    }

    try { if (environment?.cleanup) environment.cleanup(); } catch (e) { console.error("Env cleanup error:", e); }
    try { if (agent?.cleanup) agent.cleanup(); } catch (e) { console.error("Agent cleanup error:", e); }
    try { if (cleanupThreeJS) cleanupThreeJS(); } catch (e) { console.error("ThreeJS cleanup error:", e); }
    try { if (cleanupConceptVisualization) cleanupConceptVisualization(); } catch (e) { console.error("ConceptViz cleanup error:", e); }
    try { if (cleanupLive2D) cleanupLive2D(); } catch (e) { console.error("Live2D cleanup error:", e); }

    environment = null; agent = null;
    if (typeof tf !== 'undefined' && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
         try { tf.dispose(currentAgentEmotions); } catch(e){ console.error("Error disposing global emotions tensor:", e);}
    }
    currentAgentEmotions = null;
    console.log("Cleanup complete.");
}


// --- Start Initialization ---
window.addEventListener('load', initialize);
window.addEventListener('beforeunload', cleanup);
