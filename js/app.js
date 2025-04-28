// js/app.js

// --- Imports ---
import { Config, emotionKeywords } from './config.js';
import { displayError, appendChatMessage, zeros, tensor, clamp } from './utils.js';
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

const emotionNames = Object.values(emotionKeywords).map(e => e.name);

// --- Global State ---
let criticalError = false;
let agent = null; // Instance of SyntrometricAgent (V2.3)
let environment = null;
let currentStateVector = null; // BASE state from environment (12D)
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
const SAVED_STATE_KEY = 'syntrometrySimulationState_v2_3'; // New key for V2.3 state

// Timestamps for Input Feedback
let lastIntegrationInputTime = -1;
let lastReflexivityInputTime = -1; // Correct declaration name
let lastChatImpactTime = -1;
const inputFeedbackDuration = 0.5; // How long the feedback effect should last (seconds)


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
        }
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
        heatmapContainer.innerHTML = ''; // Clear if no data
        return;
    }

    // Determine Grid Dimensions (approx square)
    const gridDim = Math.ceil(Math.sqrt(vectorLength));
    // Calculate cell size based on container width/height if possible, otherwise fixed size
    const containerWidth = heatmapContainer.clientWidth;
    const containerHeight = heatmapContainer.clientHeight;
    // Use slightly less than 100% to account for gaps
    const cellSizePercent = Math.max(0.1, (100 / gridDim) - (100 * (gridDim-1) / (gridDim * Math.max(containerWidth, containerHeight))) );

    heatmapContainer.style.gridTemplateColumns = `repeat(${gridDim}, ${cellSizePercent}%)`;
    heatmapContainer.style.gridTemplateRows = `repeat(${gridDim}, ${cellSizePercent}%)`;

    // Generate Heatmap Cells
    let htmlContent = '';
    for (let i = 0; i < vectorLength; i++) {
        const value = stateVector[i] ?? 0; // Default to 0 if undefined/null

        // Simple Color Mapping (-1 Blue -> 0 Grey -> 1 Red)
        let r = 128, g = 128, b = 128; // Start Grey
        const intensity = Math.min(1.0, Math.abs(value)); // Intensity 0 to 1, capped at 1

        if (value > 0) { // Positive -> Red
            r = 128 + Math.round(127 * intensity);
            g = 128 - Math.round(128 * intensity);
            b = 128 - Math.round(128 * intensity);
        } else if (value < 0) { // Negative -> Blue
            r = 128 - Math.round(128 * intensity);
            g = 128 - Math.round(128 * intensity);
            b = 128 + Math.round(127 * intensity);
        }
        r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);

        const color = `rgb(${r}, ${g}, ${b})`;
        const tooltip = `Value: ${value.toFixed(4)}`;
        htmlContent += `<div class="heatmap-cell" style="background-color: ${color};" title="${tooltip}"></div>`;
    }

    // Add filler cells if vector length isn't a perfect square
    const totalCells = gridDim * gridDim;
    for (let i = vectorLength; i < totalCells; i++) {
        htmlContent += `<div class="heatmap-cell" style="background-color: #181820;"></div>`; // Darker filler color
    }

    // Update DOM
    heatmapContainer.innerHTML = htmlContent;
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
          // Calculate initial self-state norm
         if (agent.selfState && !agent.selfState.isDisposed) {
            try { currentSelfStateNorm = calculateArrayNorm(Array.from(agent.selfState.dataSync())); } catch (e) { currentSelfStateNorm = 0.0; }
         } else { currentSelfStateNorm = 0.0; }


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
                if (initialEmotionsForViz !== currentAgentEmotions) tf.dispose(initialEmotionsForViz);
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
                 if (initialEmotionsForLive2D !== currentAgentEmotions) tf.dispose(initialEmotionsForLive2D);
            }
        } catch (e) { console.error("Error initial Live2D update:", e); }
        updateLive2DHeadMovement(currentHmLabel, 0);
     }

    // Initial Metrics and Heatmap update
    updateMetricsDisplay(currentRIHScore, agent?.latestAffinities || [], currentAgentEmotions, currentContext, currentTrustScore, currentBeliefNorm, currentSelfStateNorm);
    if (agent?.selfState && !agent.selfState.isDisposed) {
         try { updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content'); } catch(e) { console.error("Initial heatmap update failed:", e); }
    } else { updateHeatmap([], 'heatmap-content');} // Show empty heatmap

    setupControls();
    setupChat();

    console.log("Initialization complete (V2.3). Starting animation loop.");
    animate(); // Start the main loop
}

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
        agent = new SyntrometricAgent(); // Uses the V2.3 logic now
        environment = new EmotionalSpace();
        // Check if agent init failed internally
        if (!agent || !agent.optimizer) { // Check essential components
            throw new Error("Agent core components failed to initialize properly.");
        }
        console.log("Agent (V2.3) and Environment initialized.");
        return true;
    } catch (e) {
        // Use console.error here as logger might not be set up
        console.error('[Init] Agent/Env error:', e);
        displayError(`Error initializing Agent/Environment: ${e.message}. Simulation logic disabled.`, true, 'error-message');
        criticalError = true; agent = null; environment = null; return false;
    }
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
    if (integrationSlider && typeof integration === 'number') integrationSlider.value = integration;
    if (reflexivitySlider && typeof reflexivity === 'number') reflexivitySlider.value = reflexivity;
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
            integrationValue.textContent = parseFloat(integrationSlider.value).toFixed(2);
            lastIntegrationInputTime = appClock.getElapsedTime();
        });
        integrationSlider.removeAttribute('disabled');
        integrationSlider.classList.remove('read-only-slider');
    }
    if (reflexivitySlider && reflexivityValue) {
        reflexivitySlider.addEventListener('input', () => {
            reflexivityValue.textContent = parseFloat(reflexivitySlider.value).toFixed(2);
            lastReflexivityInputTime = appClock.getElapsedTime();
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
                 const impactDetected = true; // Placeholder
                 environment.getEmotionalImpactFromText(userInput);
                 if (impactDetected) {
                     lastChatImpactTime = appClock.getElapsedTime();
                     appendChatMessage('System', 'Input processed, influencing environment.');
                 } else { appendChatMessage('System', 'Input acknowledged.'); }
             } else { appendChatMessage('System', 'Environment/Agent not initialized.'); }
        }
    });
}

/**
 * Updates the metrics display panel (now includes trust, belief norm, self-state norm).
 */
function updateMetricsDisplay(rihScore, affinities, emotionsTensor, context, trustScore, beliefNorm, selfStateNorm) {
    const metricsDiv = document.getElementById('metrics');
    if (!metricsDiv) return;
    if (metricsDiv.innerHTML.includes('<h3>Dimension') || metricsDiv.innerHTML.includes('<h3>Reflexive Integration')) return;

    let emotions = zeros([Config.Agent.EMOTION_DIM]);
    if (emotionsTensor && typeof emotionsTensor.arraySync === 'function' && !emotionsTensor.isDisposed) {
       try { emotions = emotionsTensor.arraySync()[0]; } catch (e) { console.warn("Error reading emotions tensor:", e)}
    }
    const avgAffinity = affinities?.length > 0 ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0;
    const dominantEmotionIdx = emotions.length === Config.Agent.EMOTION_DIM ? emotions.indexOf(Math.max(...emotions)) : -1;
    const dominantEmotionName = dominantEmotionIdx !== -1 ? emotionNames[dominantEmotionIdx] : 'Unknown';
    const dominantEmotionValue = dominantEmotionIdx !== -1 ? (emotions[dominantEmotionIdx] || 0) : 0;

    // Added Belief Norm and Self-State Norm
    metricsDiv.innerHTML = `
        <h3>Simulation Overview</h3>
        <p><i>Hover/click viz elements for details.</i></p>
        <p><span class="simulated-data">RIH: ${(rihScore * 100).toFixed(1)}%</span> | <span class="simulated-data">Avg Aff: ${(avgAffinity * 100).toFixed(1)}%</span></p>
        <p><span class="simulated-data">Trust: ${(trustScore * 100).toFixed(1)}%</span> | <span class="simulated-data">Belief Norm: ${beliefNorm.toFixed(3)}</span></p>
        <p><span class="simulated-data">Self-State Norm: ${selfStateNorm.toFixed(3)}</span></p>
        <p><span class="simulated-data">Dominant Emotion: ${dominantEmotionName} (${(dominantEmotionValue * 100).toFixed(1)}%)</span></p>
        <p>Context: ${context || 'Stable'}</p>
    `;
}


// --- Save/Load State Functions (Using V2.3 key) ---
function saveState() {
    if (!agent || !environment || criticalError) {
        console.warn("Agent/Env not ready or critical error, cannot save.");
        appendChatMessage('System', 'Save failed: Simulation not ready or error detected.');
        return;
     }
    try {
        const envState = environment.getState();
        const agentState = agent.getState(); // Gets V2.3 state

        const stateToSave = { environment: envState, agent: agentState, timestamp: new Date().toISOString() };
        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave)); // Use new key

        console.log(`Simulation state saved to localStorage (Key: ${SAVED_STATE_KEY}).`);
        appendChatMessage('System', 'Simulation state saved.');
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
        if (!stateToLoad || !stateToLoad.environment || !stateToLoad.agent) {
             console.error("Invalid saved state format.");
             if (showMessages) appendChatMessage('System', 'Load failed: Invalid saved state format.');
             localStorage.removeItem(SAVED_STATE_KEY);
             displayError("Load failed: Invalid saved state format.", false, 'error-message');
            return false;
        }

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
        currentHmLabel = "idle"; currentAvgAffinity = 0; currentCascadeHistory = [];
        currentIntegrationParam = agent.integrationParam?.dataSync()[0] ?? 0.5;
        currentReflexivityParam = agent.reflexivityParam?.dataSync()[0] ?? 0.5;
        // Calculate self-state norm after load
        if (agent.selfState && !agent.selfState.isDisposed) {
             try { currentSelfStateNorm = calculateArrayNorm(Array.from(agent.selfState.dataSync())); } catch(e){currentSelfStateNorm = 0.0;}
        } else { currentSelfStateNorm = 0.0;}
        currentBeliefNorm = 0.0; // Recalculated on next step

        // --- Update UI Displays ---
        updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);

        console.log(`Simulation state loaded (Key: ${SAVED_STATE_KEY}).`);
        if (showMessages) appendChatMessage('System', 'Simulation state loaded.');

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
         updateMetricsDisplay(currentRIHScore, [], currentAgentEmotions, currentContext, currentTrustScore, currentBeliefNorm, currentSelfStateNorm);

        return true;
    } catch (e) {
        console.error("Error loading state:", e);
         if (showMessages) appendChatMessage('System', `Load failed: ${e.message}`);
         localStorage.removeItem(SAVED_STATE_KEY);
         displayError(`Load failed: ${e.message}`, false, 'error-message');
         return false;
    }
}


/**
 * The main animation loop.
 */
async function animate() {
    if (criticalError) { console.log("Critical error detected, stopping animation."); return; }
    requestAnimationFrame(animate);

    const deltaTime = appClock.getDelta();
    const elapsedTime = appClock.getElapsedTime();

    // Calculate Graph Features
    const graphFeatures = calculateGraphFeatures(); // Calculate every frame

    // --- Simulation Step ---
    if (agent && environment && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
        try {
            const envStep = await environment.step(currentAgentEmotions, currentRIHScore, currentAvgAffinity);
            const envStateArray = envStep.state?.arraySync()[0] || zeros([Config.Agent.BASE_STATE_DIM]);
            currentStateVector = envStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
            while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);

            // Agent processes state + graph features
            const agentResponse = await agent.process(
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

            // Calculate Self-State Norm AFTER agent processing
            if (agent.selfState && !agent.selfState.isDisposed) {
                try {
                    const selfStateArray = Array.from(agent.selfState.dataSync());
                    currentSelfStateNorm = calculateArrayNorm(selfStateArray);
                } catch (e) { console.warn("Error calculating self-state norm:", e); currentSelfStateNorm = 0.0; }
            } else { currentSelfStateNorm = 0.0; }


            updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);

        } catch (e) {
             console.error("Error during simulation step:", e);
             displayError(`Simulation Error: ${e.message}. Attempting to continue.`, false, 'error-message');
        }
    } else {
         // Fallback logic
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


     // --- Update Visualizations ---
    try {
        if (threeInitialized) {
            updateThreeJS(deltaTime, currentStateVector, currentRIHScore, agent?.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext);
            updateSyntrometryInfoPanel();
        }
    } catch(e) { console.error("Error updating Syntrometry Viz:", e); }

    try {
        if (conceptInitialized) {
            let emotionsForViz = null;
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) emotionsForViz = currentAgentEmotions;
            else if(typeof tf !== 'undefined') emotionsForViz = tf.zeros([1, Config.Agent.EMOTION_DIM]);

            if (emotionsForViz) {
                updateAgentSimulationVisuals(emotionsForViz, currentRIHScore, currentAvgAffinity, currentHmLabel, currentTrustScore); // Pass trust
                if (emotionsForViz !== currentAgentEmotions && typeof tf !== 'undefined') tf.dispose(emotionsForViz);
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
                 if (emotionsForLive2D !== currentAgentEmotions && typeof tf !== 'undefined') tf.dispose(emotionsForLive2D);
            }
            updateLive2DHeadMovement(currentHmLabel, deltaTime);
        }
    } catch (e) { console.error("Error updating Live2D:", e); }

    // Update metrics display including norms
    updateMetricsDisplay(currentRIHScore, agent?.latestAffinities || [], currentAgentEmotions, currentContext, currentTrustScore, currentBeliefNorm, currentSelfStateNorm);

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
