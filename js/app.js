// js/app.js

import { Config, emotionKeywords } from './config.js';
import { displayError, appendChatMessage, zeros, tensor, clamp } from './utils.js';
import { SyntrometricAgent } from './agent.js'; // Using the updated agent
import { EmotionalSpace } from './environment.js';
import { initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel, threeInitialized } from './viz-syntrometry.js';
import {
    initConceptVisualization, updateAgentSimulationVisuals, animateConceptNodes,
    updateInfoPanel, cleanupConceptVisualization, conceptInitialized,
    conceptRenderer, conceptLabelRenderer, conceptScene, conceptCamera, conceptControls
} from './viz-concepts.js';
import { initLive2D, updateLive2DEmotions, updateLive2DHeadMovement, live2dInitialized, cleanupLive2D } from './viz-live2d.js';

const emotionNames = Object.values(emotionKeywords).map(e => e.name);

// --- Global State ---
let criticalError = false;
let agent = null; // Will be instance of SyntrometricAgent (with V2.1 logic)
let environment = null;
let currentStateVector = null;
let currentAgentEmotions = null;
let currentRIHScore = 0;
let currentAvgAffinity = 0;
let currentHmLabel = "idle";
let currentContext = "Initializing...";
let currentCascadeHistory = [];
// --- NEW: Store agent's internal params & trust ---
let currentIntegrationParam = 0.5; // Agent's internal value (start default)
let currentReflexivityParam = 0.5; // Agent's internal value (start default)
let currentTrustScore = 1.0;      // Agent's trust score

const appClock = new THREE.Clock();
const SAVED_STATE_KEY = 'syntrometrySimulationState';

// Timestamps for Input Feedback
let lastIntegrationInputTime = -1;
let lastReflexivityInputTime = -1; // Correct declaration
let lastChatImpactTime = -1;
const inputFeedbackDuration = 0.5; // How long the feedback effect should last (seconds)

// --- Initialization ---
/**
 * Initializes all components of the application.
 */
async function initialize() {
    console.log("Initializing application...");
    const coreInitSuccess = initAgentAndEnvironment(); // Creates the V2.1 agent
    const threeSuccess = initThreeJS();
    const conceptSuccess = initConceptVisualization(appClock);
    const live2dSuccess = await initLive2D();

    // Error handling for core components
    if (!coreInitSuccess) {
        criticalError = true;
        displayError("Core simulation components failed to initialize (TensorFlow.js likely missing). Simulation logic disabled.", true, 'error-message');
    }
    // Error handling for visualizations
     if (!threeSuccess) displayError("Syntrometry visualization failed to initialize.", false, 'syntrometry-error-message');
     if (!conceptSuccess) displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
     if (!live2dSuccess) displayError("Live2D avatar failed to initialize.", false, 'error-message');


     // --- Initial State Setup ---
     let initialStateLoaded = false;
     if (coreInitSuccess) {
          // Attempt to load state from localStorage first
         initialStateLoaded = loadState(false); // Try loading silently
     }

     if (!initialStateLoaded && coreInitSuccess) {
         // If no state was loaded or core init failed, perform initial reset
         const initialState = environment.reset();
         // Ensure initial state has correct dimensions
         const initialStateArray = initialState.state.arraySync()[0];
         currentStateVector = initialStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
         while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);

         // Initial agent processing (no slider params needed now)
         const initialAgentResponse = await agent.process(
             currentStateVector,
             { eventType: null, reward: 0 } // Pass environment context
         );

         // Update global state from initial response
         if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
         currentAgentEmotions = initialAgentResponse.emotions; // Should be a NEW tensor
         currentRIHScore = initialAgentResponse.rihScore;
         currentAvgAffinity = (initialAgentResponse.affinities?.length > 0) ? initialAgentResponse.affinities.reduce((a, b) => a + b, 0) / initialAgentResponse.affinities.length : 0;
         currentHmLabel = initialAgentResponse.hmLabel;
         currentContext = "Simulation initialized."; // Initial context
         currentCascadeHistory = initialAgentResponse.cascadeHistory;
         // --- Store initial internal agent params ---
         currentIntegrationParam = initialAgentResponse.integration;
         currentReflexivityParam = initialAgentResponse.reflexivity;
         currentTrustScore = initialAgentResponse.trustScore;
         // -------------------------------------------

         console.log("Initialized with new state.");
     } else if (!coreInitSuccess) {
         // If core failed, ensure default global states
         currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);
         if (typeof tf !== 'undefined') {
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
            currentAgentEmotions = tf.keep(tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]));
         } else { currentAgentEmotions = null; }
         currentRIHScore = 0; currentAvgAffinity = 0; currentHmLabel = "idle";
         currentContext = "Simulation core failed to load."; currentCascadeHistory = [];
         currentIntegrationParam = 0.5; currentReflexivityParam = 0.5; currentTrustScore = 1.0;
     }
     // If initialStateLoaded was true, global state variables were already updated by loadState().


    // --- Initial visualization updates ---
    // Update slider displays with initial AGENT values
    updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);

    if (threeInitialized) {
        // Pass agent's internal params for initial render
        updateThreeJS(0, currentStateVector, currentRIHScore, agent?.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext);
        updateSyntrometryInfoPanel();
    }
    if (conceptInitialized) {
        // Use try-catch for safety if tensor might be null
        try {
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) {
                 updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel);
            } else {
                 updateAgentSimulationVisuals(tf.zeros([1, Config.Agent.EMOTION_DIM]), 0, 0, 'idle'); // Provide default tensor
            }
        } catch (e) {
             console.error("Error during initial concept viz update:", e);
             // Handle potential error if TF is missing but coreInitSuccess was somehow true
        }
        // Animate concepts with AGENT'S internal params, not sliders
        animateConceptNodes(0, currentIntegrationParam, currentReflexivityParam, -1, -1, -1); // Initial animation call
    }
     if (live2dInitialized) {
        try {
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) {
                 updateLive2DEmotions(currentAgentEmotions);
            } else {
                 updateLive2DEmotions(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            }
        } catch (e) {
             console.error("Error during initial Live2D update:", e);
        }
        updateLive2DHeadMovement(currentHmLabel, 0);
     }

    updateMetricsDisplay(currentRIHScore, agent ? (agent.latestAffinities || []) : [], currentAgentEmotions, currentContext, currentTrustScore); // Add trust score
    setupControls();
    setupChat();

    console.log("Initialization complete. Starting animation loop.");
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
        agent = new SyntrometricAgent(); // Uses the V2.1 logic now
        environment = new EmotionalSpace();
        console.log("Agent and Environment initialized.");
        return true;
    } catch (e) {
        displayError(`Error initializing Agent/Environment: ${e.message}. Simulation logic disabled.`, true, 'error-message');
        console.error('[Init] Agent/Env error:', e);
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

    if (integrationValue && integrationSlider) {
        integrationValue.textContent = integration.toFixed(2);
        integrationSlider.value = integration; // Update slider position visually
    }
    if (reflexivityValue && reflexivitySlider) {
        reflexivityValue.textContent = reflexivity.toFixed(2);
        reflexivitySlider.value = reflexivity; // Update slider position visually
    }
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

    // --- Keep listeners ONLY to update timestamps for visual feedback ---
    if (integrationSlider && integrationValue) {
        // Set initial display from agent's current value (done in initialize/animate)
        integrationSlider.addEventListener('input', () => {
            // Update display ONLY, agent value is internal
            integrationValue.textContent = parseFloat(integrationSlider.value).toFixed(2);
            // --- Record Timestamp for visual feedback ---
            lastIntegrationInputTime = appClock.getElapsedTime();
            // ------------------------------------------
        });
        // Keep sliders interactive for feedback trigger
        integrationSlider.removeAttribute('disabled');
        integrationSlider.classList.remove('read-only-slider');
    }
    if (reflexivitySlider && reflexivityValue) {
        // Set initial display from agent's current value (done in initialize/animate)
        reflexivitySlider.addEventListener('input', () => {
            // Update display ONLY, agent value is internal
            reflexivityValue.textContent = parseFloat(reflexivitySlider.value).toFixed(2);
            // --- Record Timestamp for visual feedback ---
            lastReflexivityInputTime = appClock.getElapsedTime();
            // ------------------------------------------
        });
         // Keep sliders interactive for feedback trigger
         reflexivitySlider.removeAttribute('disabled');
         reflexivitySlider.classList.remove('read-only-slider');
    }
    // --- End Timestamp Listeners ---


    // --- Button setup remains the same ---
    if (saveButton) saveButton.addEventListener('click', saveState);
    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true));
         if (localStorage.getItem(SAVED_STATE_KEY)) {
            loadButton.classList.add('has-saved-state');
         }
    }

    // Still disable buttons if there's a critical error unrelated to sliders
    if (criticalError) {
        if (saveButton) saveButton.disabled = true;
        if (loadButton) loadButton.disabled = true;
        // Sliders are not disabled by critical error anymore, agent might still run partially
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
                 const impactDetected = true; // Placeholder - Assume impact for feedback for now
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
function updateMetricsDisplay(rihScore, affinities, emotionsTensor, context, trustScore) { // Added trustScore
    const metricsDiv = document.getElementById('metrics');
    if (!metricsDiv) return;
    // Prevent overwriting if Syntrometry panel is showing details
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
        <p><span class="simulated-data">Trust Score: ${(trustScore * 100).toFixed(1)}%</span></p> <!-- Added Trust -->
        <p><span class="simulated-data">Dominant Emotion: ${dominantEmotionName} (${(dominantEmotionValue * 100).toFixed(1)}%)</span></p>
        <p>Context: ${context || 'Stable'}</p>
    `;
}


// --- Save/Load State Functions ---
function saveState() {
    if (!agent || !environment || criticalError) {
        console.warn("Agent/Env not ready or critical error, cannot save.");
        appendChatMessage('System', 'Save failed: Simulation not ready or error detected.');
        return;
     }
    try {
        const envState = environment.getState();
        const agentState = agent.getState(); // Agent state now includes internal params, trust, self-state etc.

        const stateToSave = {
            environment: envState,
            agent: agentState, // Agent saves its internal state
            timestamp: new Date().toISOString()
        };

        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave));
        console.log("Simulation state saved to localStorage (V2.1 agent).");
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
        const stateString = localStorage.getItem(SAVED_STATE_KEY);
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
        agent.loadState(stateToLoad.agent); // Agent loads its internal params, self-state etc.

        // --- Restore global variables DERIVED from loaded agent/env state ---
        currentStateVector = Array.isArray(stateToLoad.environment.currentStateVector)
             ? stateToLoad.environment.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM) // Ensure correct size
             : zeros([Config.Agent.BASE_STATE_DIM]);
        while(currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0); // Pad if needed


        // Agent's prevEmotions tensor is restored internally by agent.loadState
        // Get a fresh reference AFTER loading
        if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
        // Ensure agent.prevEmotions exists and is not disposed after loading
        if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
            currentAgentEmotions = tf.keep(agent.prevEmotions.clone());
        } else {
            console.warn("Agent prevEmotions tensor invalid after load. Resetting.");
            currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }


        // Restore other globals (these are results, technically could be recalculated but faster to load)
        currentRIHScore = typeof stateToLoad.agent.lastRIH === 'number' ? stateToLoad.agent.lastRIH : 0; // Use agent's lastRIH
        currentTrustScore = typeof stateToLoad.agent.latestTrustScore === 'number' ? stateToLoad.agent.latestTrustScore : 1.0; // Use agent's trust
        currentContext = typeof stateToLoad.environment.currentEvent?.context === 'string' ? stateToLoad.environment.currentEvent.context : "State loaded."; // Restore context better
        currentHmLabel = "idle"; // Reset head movement label on load, will be recalculated
        currentAvgAffinity = 0; // Will be recalculated
        currentCascadeHistory = []; // Will be recalculated

        // Restore internal parameters from agent state (read after loading)
        currentIntegrationParam = agent.integrationParam?.read().arraySync() ?? 0.5;
        currentReflexivityParam = agent.reflexivityParam?.read().arraySync() ?? 0.5;

        // --- Update UI Displays ---
        updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);

        console.log("Simulation state loaded from localStorage (V2.1 agent).");
        if (showMessages) appendChatMessage('System', 'Simulation state loaded.');

         // Trigger visualization updates with loaded state
         if (threeInitialized) {
             updateThreeJS(0, currentStateVector, currentRIHScore, [], currentIntegrationParam, currentReflexivityParam, [], currentContext); // Pass empty affinity/history initially
             updateSyntrometryInfoPanel();
         }
         if (conceptInitialized && currentAgentEmotions) {
             updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, 0, currentHmLabel); // Pass 0 avgAffinity initially
             animateConceptNodes(0, currentIntegrationParam, currentReflexivityParam, -1, -1, -1);
         }
          if (live2dInitialized && currentAgentEmotions) {
              updateLive2DEmotions(currentAgentEmotions);
              updateLive2DHeadMovement(currentHmLabel, 0);
          }
         updateMetricsDisplay(currentRIHScore, [], currentAgentEmotions, currentContext, currentTrustScore); // Pass empty affinity initially

        return true;
    } catch (e) {
        console.error("Error loading state:", e);
         if (showMessages) appendChatMessage('System', `Load failed: ${e.message}`);
         localStorage.removeItem(SAVED_STATE_KEY); // Clear potentially corrupt state on load failure
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
    const elapsedTime = appClock.getElapsedTime(); // Get current time

    // --- Simulation Step ---
    if (agent && environment && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
        try { // Add try-catch around simulation steps
            const envStep = await environment.step(currentAgentEmotions, currentRIHScore, currentAvgAffinity);
            const envStateArray = envStep.state?.arraySync()[0] || zeros([Config.Agent.BASE_STATE_DIM]);
            currentStateVector = envStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
            while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);

            // Agent processes state, NO slider params passed
            const agentResponse = await agent.process(
                currentStateVector,
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
            console.warn("Agent emotions tensor missing or disposed. Using default zero tensor.");
             if (typeof tf !== 'undefined') {
                 if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions); // Dispose if somehow exists but invalid
                 currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Create and keep a new zero tensor
             } else { currentAgentEmotions = null; } // No TF, cannot create tensor
         }
    }


     // --- Update Visualizations ---
    if (threeInitialized) {
        // Pass agent's internal params to visualizations
        updateThreeJS(deltaTime, currentStateVector, currentRIHScore, agent?.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext);
        updateSyntrometryInfoPanel();
    }
    if (conceptInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
        updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel);
    } else if (conceptInitialized) {
        // Handle case where emotions tensor is invalid but viz is up
        updateAgentSimulationVisuals(tf.zeros([1, Config.Agent.EMOTION_DIM]), currentRIHScore, currentAvgAffinity, currentHmLabel);
    }

    if (live2dInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
         updateLive2DEmotions(currentAgentEmotions);
         updateLive2DHeadMovement(currentHmLabel, deltaTime);
    } else if (live2dInitialized) {
         // Handle case where emotions tensor is invalid but viz is up
         updateLive2DEmotions(tf.zeros([1, Config.Agent.EMOTION_DIM]));
         updateLive2DHeadMovement(currentHmLabel, deltaTime); // Use last known hmLabel
    }

    // Update metrics display including trust
    updateMetricsDisplay(currentRIHScore, agent?.latestAffinities || [], currentAgentEmotions, currentContext, currentTrustScore);

    // --- Animate Visualizations ---
    if (conceptInitialized && conceptControls) {
        conceptControls.update();
    }
    if (conceptInitialized) {
        // Pass AGENT'S internal params + input timestamps
        animateConceptNodes(
            deltaTime,
            currentIntegrationParam, // Use agent's value
            currentReflexivityParam, // Use agent's value
            // --- Pass Timestamps (Corrected Variable Name) ---
            elapsedTime - lastIntegrationInputTime < inputFeedbackDuration ? lastIntegrationInputTime : -1,
            elapsedTime - lastReflexivityInputTime < inputFeedbackDuration ? lastReflexivityInputTime : -1, // Corrected typo
            elapsedTime - lastChatImpactTime < inputFeedbackDuration ? lastChatImpactTime : -1
            // -------------------------------------------------
        );
    }

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
     // Syntrometry rendering is inside updateThreeJS
     // Live2D rendering is handled by its internal ticker
}

// --- Cleanup ---
function cleanup() {
    console.log("Cleaning up application resources...");
    // Stop the animation loop first (important!)
    criticalError = true; // Use flag to prevent new animation frames

    try { if (environment?.cleanup) environment.cleanup(); } catch (e) { console.error("Error during environment cleanup:", e); }
    try { if (agent?.cleanup) agent.cleanup(); } catch (e) { console.error("Error during agent cleanup:", e); }
    try { if (cleanupThreeJS) cleanupThreeJS(); } catch (e) { console.error("Error during ThreeJS cleanup:", e); }
    try { if (cleanupConceptVisualization) cleanupConceptVisualization(); } catch (e) { console.error("Error during ConceptViz cleanup:", e); }
    try { if (cleanupLive2D) cleanupLive2D(); } catch (e) { console.error("Error during Live2D cleanup:", e); }

    environment = null;
    agent = null;
    currentAgentEmotions = null; // Ensure reference is cleared
    console.log("Cleanup complete.");
}


// --- Start Initialization ---
window.addEventListener('load', initialize);
window.addEventListener('beforeunload', cleanup);
