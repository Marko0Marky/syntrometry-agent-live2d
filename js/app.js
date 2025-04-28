// js/app.js

// --- Imports ---
import { Config, emotionKeywords } from './config.js';
import { displayError, appendChatMessage, zeros, tensor, clamp } from './utils.js';
import { SyntrometricAgent } from './agent.js'; // Using the updated V2.3 agent
import { EmotionalSpace } from './environment.js';
// --- CORRECTED IMPORT (No duplicate function below) ---
import {
    initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel,
    threeInitialized, calculateGraphFeatures, // Import the function
    rihNode // Import rihNode directly (if needed elsewhere)
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
let currentBeliefNorm = 0.0;

const appClock = new THREE.Clock();
const SAVED_STATE_KEY = 'syntrometrySimulationState_v2_3'; // New key for V2.3 state

// Timestamps for Input Feedback
let lastIntegrationInputTime = -1;
let lastReflexivityInputTime = -1;
let lastChatImpactTime = -1;
const inputFeedbackDuration = 0.5;


// --- REMOVED calculateGraphFeatures function definition from here ---


// --- Initialization ---
async function initialize() {
    console.log("Initializing application (Agent V2.3)...");
    const coreInitSuccess = initAgentAndEnvironment();
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
         initialStateLoaded = loadState(false);
     }

     if (!initialStateLoaded && coreInitSuccess && agent && environment) {
         const initialState = environment.reset();
         const initialStateArray = initialState.state ? initialState.state.arraySync()[0] : zeros([Config.Agent.BASE_STATE_DIM]);
         currentStateVector = initialStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
         while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);

         const initialGraphFeatures = calculateGraphFeatures(); // Call imported function
         const initialAgentResponse = await agent.process( currentStateVector, initialGraphFeatures, { eventType: null, reward: 0 } );

         // Update global state
         if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
         currentAgentEmotions = initialAgentResponse.emotions;
         currentRIHScore = initialAgentResponse.rihScore;
         currentAvgAffinity = (initialAgentResponse.affinities?.length > 0) ? initialAgentResponse.affinities.reduce((a, b) => a + b, 0) / initialAgentResponse.affinities.length : 0;
         currentHmLabel = initialAgentResponse.hmLabel;
         currentContext = "Simulation initialized (V2.3).";
         currentCascadeHistory = initialAgentResponse.cascadeHistory;
         currentIntegrationParam = initialAgentResponse.integration;
         currentReflexivityParam = initialAgentResponse.reflexivity;
         currentTrustScore = initialAgentResponse.trustScore;
         currentBeliefNorm = initialAgentResponse.beliefNorm ?? 0.0;

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
         currentIntegrationParam = 0.5; currentReflexivityParam = 0.5; currentTrustScore = 1.0; currentBeliefNorm = 0.0;
     }

    // --- Initial visualization updates ---
    updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);

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
                updateAgentSimulationVisuals(initialEmotionsForViz, currentRIHScore, currentAvgAffinity, currentHmLabel);
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

    updateMetricsDisplay(currentRIHScore, agent ? (agent.latestAffinities || []) : [], currentAgentEmotions, currentContext, currentTrustScore);
    setupControls();
    setupChat();

    console.log("Initialization complete (V2.3). Starting animation loop.");
    animate();
}

/**
 * Initializes Agent and Environment instances. Sets criticalError if TF.js is missing.
 */
function initAgentAndEnvironment() {
     if (typeof tf === 'undefined') {
         console.error("TensorFlow.js is required for Agent/Environment.");
         criticalError = true; agent = null; environment = null; return false;
    }
    try {
        agent = new SyntrometricAgent();
        environment = new EmotionalSpace();
        if (!agent || !agent.optimizer) { // Check if agent init failed internally
            throw new Error("Agent core components (like optimizer or TF variables) failed to initialize properly.");
        }
        console.log("Agent (V2.3) and Environment initialized.");
        return true;
    } catch (e) {
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
             if (environment) {
                 const impactDetected = true; // Placeholder
                 environment.getEmotionalImpactFromText(userInput);
                 if (impactDetected) {
                     lastChatImpactTime = appClock.getElapsedTime();
                     appendChatMessage('System', 'Input processed, influencing environment.');
                 } else { appendChatMessage('System', 'Input acknowledged.'); }
             } else { appendChatMessage('System', 'Environment not initialized.'); }
        }
    });
}

/**
 * Updates the metrics display panel (now includes trust).
 */
function updateMetricsDisplay(rihScore, affinities, emotionsTensor, context, trustScore) {
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

    metricsDiv.innerHTML = `
        <h3>Simulation Overview</h3>
        <p><i>Hover/click viz elements for details.</i></p>
        <p><span class="simulated-data">Current RIH: ${(rihScore * 100).toFixed(1)}%</span></p>
        <p><span class="simulated-data">Avg Affinity: ${(avgAffinity * 100).toFixed(1)}%</span></p>
        <p><span class="simulated-data">Trust Score: ${(trustScore * 100).toFixed(1)}%</span></p>
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
        const agentState = agent.getState(); // Agent state now includes internal params, trust, self-state etc.

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
        // Check for agent and environment state specifically
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
             ? stateToLoad.environment.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM) // Ensure correct size
             : zeros([Config.Agent.BASE_STATE_DIM]);
        while(currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0); // Pad if needed


        // Agent's prevEmotions tensor is restored internally by agent.loadState
        // Get a fresh reference AFTER loading
        if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
        if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
            currentAgentEmotions = tf.keep(agent.prevEmotions.clone());
        } else { // Handle case where agent couldn't load prevEmotions
            console.warn("Agent prevEmotions tensor invalid after load. Resetting.");
            currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }


        // Restore other globals
        currentRIHScore = agent.lastRIH ?? 0;
        currentTrustScore = agent.latestTrustScore ?? 1.0;
        currentContext = "State loaded."; // Reset context message
        currentHmLabel = "idle"; currentAvgAffinity = 0; currentCascadeHistory = []; // Recalculated
        // Restore params safely from agent
        currentIntegrationParam = agent.integrationParam?.dataSync()[0] ?? 0.5;
        currentReflexivityParam = agent.reflexivityParam?.dataSync()[0] ?? 0.5;
        currentBeliefNorm = agent.selfState?.norm().arraySync() ?? 0.0; // Get norm of loaded self-state

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
             updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, 0, currentHmLabel);
             animateConceptNodes(0, currentIntegrationParam, currentReflexivityParam, -1, -1, -1);
         }
          if (live2dInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
              updateLive2DEmotions(currentAgentEmotions);
              updateLive2DHeadMovement(currentHmLabel, 0);
          }
         updateMetricsDisplay(currentRIHScore, [], currentAgentEmotions, currentContext, currentTrustScore);

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
        try { // Add try-catch around simulation steps
            const envStep = await environment.step(currentAgentEmotions, currentRIHScore, currentAvgAffinity); // Env step still uses global RIH/Affinity
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
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions); // Dispose previous tensor
            currentAgentEmotions = agentResponse.emotions; // agent.process returns the persistent tensor now
            currentRIHScore = agentResponse.rihScore;
            currentAvgAffinity = (agentResponse.affinities?.length > 0) ? agentResponse.affinities.reduce((a, b) => a + b, 0) / agentResponse.affinities.length : 0;
            currentHmLabel = agentResponse.hmLabel;
            currentContext = envStep.context;
            currentCascadeHistory = agentResponse.cascadeHistory;
            // --- Update internal agent params FROM response ---
            currentIntegrationParam = agentResponse.integration;
            currentReflexivityParam = agentResponse.reflexivity;
            currentTrustScore = agentResponse.trustScore;
            currentBeliefNorm = agentResponse.beliefNorm ?? 0.0;
            // -----------------------------------------------

            // --- Update slider displays based on agent's internal params ---
            updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);
            // -------------------------------------------------------------
        } catch (e) {
             console.error("Error during simulation step:", e);
             displayError(`Simulation Error: ${e.message}. Attempting to continue.`, false, 'error-message');
             // Potentially try to recover or just skip this frame's update
             // For now, we'll just log and potentially use old values
        }

    } else {
         // Handle missing core components or disposed tensor
         if (!currentAgentEmotions || currentAgentEmotions?.isDisposed) {
            // console.warn("Agent emotions tensor missing or disposed. Using default zero tensor."); // Reduce noise
             if (typeof tf !== 'undefined') {
                 if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions); // Dispose if somehow exists but invalid
                 currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Create and keep a new zero tensor
             } else { currentAgentEmotions = null; } // No TF, cannot create tensor
         }
    }


     // --- Update Visualizations ---
     // Use try-catch blocks for robustness during updates
    try {
        if (threeInitialized) {
            updateThreeJS(deltaTime, currentStateVector, currentRIHScore, agent?.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext);
            updateSyntrometryInfoPanel();
        }
    } catch(e) { console.error("Error updating Syntrometry Viz:", e); }

    try {
        if (conceptInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
            updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel);
        } else if (conceptInitialized && typeof tf !== 'undefined') { // Handle invalid tensor
            updateAgentSimulationVisuals(tf.zeros([1, Config.Agent.EMOTION_DIM]), currentRIHScore, currentAvgAffinity, currentHmLabel);
        }
    } catch (e) { console.error("Error updating Concept Viz placeholders:", e); }

    try {
        if (live2dInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
             updateLive2DEmotions(currentAgentEmotions);
             updateLive2DHeadMovement(currentHmLabel, deltaTime);
        } else if (live2dInitialized && typeof tf !== 'undefined') { // Handle invalid tensor
             updateLive2DEmotions(tf.zeros([1, Config.Agent.EMOTION_DIM]));
             updateLive2DHeadMovement(currentHmLabel, deltaTime); // Use last known hmLabel
        }
    } catch (e) { console.error("Error updating Live2D:", e); }

    // Update metrics display including trust
    updateMetricsDisplay(currentRIHScore, agent?.latestAffinities || [], currentAgentEmotions, currentContext, currentTrustScore);

    // --- Animate Visualizations ---
    try {
        if (conceptInitialized && conceptControls) {
            conceptControls.update();
        }
        if (conceptInitialized) {
            animateConceptNodes(
                deltaTime,
                currentIntegrationParam, // Use agent's value
                currentReflexivityParam, // Use agent's value
                // Pass Timestamps (Corrected Variable Name)
                elapsedTime - lastIntegrationInputTime < inputFeedbackDuration ? lastIntegrationInputTime : -1,
                elapsedTime - lastReflexivityInputTime < inputFeedbackDuration ? lastReflexivityInputTime : -1, // Corrected typo
                elapsedTime - lastChatImpactTime < inputFeedbackDuration ? lastChatImpactTime : -1
            );
        }
    } catch (e) { console.error("Error animating Concept Viz nodes:", e); }


     // **Render Visualizations**
     if (conceptInitialized && conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
         try { // Add try-catch around rendering
             conceptRenderer.render(conceptScene, conceptCamera);
             conceptLabelRenderer.render(conceptScene, conceptCamera);
         } catch (e) {
             console.error("Error rendering Concept Graph:", e);
             displayError("Error rendering Concept Graph. Check console.", false, 'concept-error-message');
             // Potentially disable this part of rendering if errors persist
             // conceptInitialized = false; // Drastic option
         }
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
    // Dispose the global tensor explicitly if it exists and TF is loaded
    if (typeof tf !== 'undefined' && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
         try { tf.dispose(currentAgentEmotions); } catch(e){ console.error("Error disposing global emotions tensor:", e);}
    }
    currentAgentEmotions = null;
    console.log("Cleanup complete.");
}


// --- Start Initialization ---
window.addEventListener('load', initialize);
window.addEventListener('beforeunload', cleanup);
