// js/app.js - Main Orchestration File

import { Config, emotionKeywords } from './config.js'; // Import emotionKeywords instead
import { displayError, appendChatMessage, zeros, tensor, clamp } from './utils.js'; // Import clamp for safety
// Import Agent and Environment classes
import { SyntrometricAgent } from './agent.js';
import { EmotionalSpace } from './environment.js';
// Import Syntrometry viz functions and the new info panel update function
// Make sure updateSyntrometryInfoPanel is imported
import { initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel, threeInitialized } from './viz-syntrometry.js';
// Import Concept viz functions and variables
import { initConceptVisualization, updateAgentSimulationVisuals, animateConceptNodes, updateInfoPanel, cleanupConceptVisualization, conceptInitialized, conceptRenderer, conceptLabelRenderer, conceptScene, conceptCamera, conceptControls } from './viz-concepts.js';
// Import Live2D viz functions and flags
import { initLive2D, updateLive2DEmotions, updateLive2DHeadMovement, live2dInitialized } from './viz-live2d.js';


// Define emotionNames locally using the imported emotionKeywords (used by updateMetricsDisplay and updateInfoPanel in viz-concepts)
const emotionNames = Object.values(emotionKeywords).map(e => e.name);

// --- Global State ---
let criticalError = false; // Flag to stop the animation loop on critical failures
let agent = null;
let environment = null;
// Global state variables derived from Agent/Env (used by multiple modules)
let currentStateVector = null; // Array: Holds the environment's state, including emotional readings (full BASE_STATE_DIM)
let currentAgentEmotions = null; // tf.Tensor: Holds the agent's predicted emotions
let currentRIHScore = 0; // Number: Latest RIH from agent
let currentAvgAffinity = 0; // Number: Latest Avg Affinity from agent
let currentHmLabel = "idle"; // String: Latest head movement label from agent
let currentContext = "Initializing..."; // String: Latest environment context message
let currentCascadeHistory = []; // Array of Arrays: Latest cascade history from agent


const appClock = new THREE.Clock(); // Main clock for animation timing

// --- Constants ---
const SAVED_STATE_KEY = 'syntrometrySimulationState';


// --- Initialization ---
/**
 * Initializes all components of the application.
 */
async function initialize() {
    console.log("Initializing application...");

    // Initialize core components (Agent, Environment) - requires TF.js
    // initAgentAndEnvironment sets the criticalError flag if TF.js is not available
    const coreInitSuccess = initAgentAndEnvironment();

    // Initialize visualizations (Concept Graph needs the clock)
    // Syntrometry init should happen first so its DOM elements are ready for interaction setup
    const threeSuccess = initThreeJS();
    const conceptSuccess = initConceptVisualization(appClock);
    const live2dSuccess = await initLive2D();

    // Check for overall initialization failures
    if (!coreInitSuccess) {
        criticalError = true;
        displayError("Core simulation components failed to initialize (TensorFlow.js likely missing). Simulation logic disabled.", true);
    }

     // Visualizations might fail independently
     if (!threeSuccess) {
         displayError("Syntrometry visualization failed to initialize.", false);
     }
     if (!conceptSuccess) {
         displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
     }
     if (!live2dSuccess) {
          displayError("Live2D avatar failed to initialize.", false);
     }


     // --- Initial State Setup ---
     let initialStateLoaded = false;
     if (coreInitSuccess) {
          // Attempt to load state from localStorage first
         initialStateLoaded = loadState(false); // Try loading silently
     }

     if (!initialStateLoaded && coreInitSuccess) {
         // If no state was loaded or core init failed, perform initial reset
         const initialState = environment.reset();
         currentStateVector = initialState.state.arraySync()[0]; // Store the initial state array

         // Process the initial state with the agent to get starting metrics/emotions
         const integrationParam = parseFloat(document.getElementById('integration-slider')?.value || 0.5);
         const reflexivityParam = parseFloat(document.getElementById('reflexivity-slider')?.value || 0.5);
         const initialAgentResponse = await agent.process(
             currentStateVector,
             integrationParam,
             reflexivityParam,
             { eventType: null, reward: 0 }
         );

         // Update global state variables from initial agent response
         // Dispose old tensor before replacing the reference
         if (currentAgentEmotions && typeof currentAgentEmotions.dispose === 'function') {
             tf.dispose(currentAgentEmotions);
         }
         currentAgentEmotions = initialAgentResponse.emotions; // Should be a NEW tensor from agent.process
         currentRIHScore = initialAgentResponse.rihScore;
         currentAvgAffinity = (initialAgentResponse.affinities && initialAgentResponse.affinities.length > 0) ? initialAgentResponse.affinities.reduce((a, b) => a + b, 0) / initialAgentResponse.affinities.length : 0;
         currentHmLabel = initialAgentResponse.hmLabel;
         currentContext = initialAgentResponse.responseText; // Use agent's response text initially
         currentCascadeHistory = initialAgentResponse.cascadeHistory; // Store cascade history

         console.log("Initialized with new state.");
     } else if (!coreInitSuccess) {
         // If core failed, ensure default global states
         currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);
         currentAgentEmotions = tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);
         currentRIHScore = 0;
         currentAvgAffinity = 0;
         currentHmLabel = "idle";
         currentContext = "Simulation core failed to load.";
         currentCascadeHistory = []; // Default empty history
     }
     // If initialStateLoaded was true, global state variables were already updated by loadState().


    // Perform initial visualization updates with the determined initial state
     // Pass required state and slider params + cascade history + context
     // Pass deltaTime = 0 for the initial render
    if (threeInitialized) { // Use threeInitialized flag
        const integrationParam = parseFloat(document.getElementById('integration-slider')?.value || 0.5);
        const reflexivityParam = parseFloat(document.getElementById('reflexivity-slider')?.value || 0.5);
        updateThreeJS(
             0, // deltaTime = 0 for initial render
             currentStateVector ? currentStateVector.slice(0, Config.DIMENSIONS) : zeros([Config.DIMENSIONS]), // Pass only the visible state dimensions
             currentRIHScore,
             agent ? (agent.latestAffinities || []) : [], // Pass latest affinities from agent instance if available
             integrationParam,
             reflexivityParam,
             agent ? (agent.latestCascadeHistory || []) : [], // Pass latest cascade history from agent instance if available
             currentContext // Pass current context
          );
         // FIX: Call Syntrometry info panel update initially
         // This will use the latest data stored by the updateThreeJS call above
         updateSyntrometryInfoPanel();
    }
    if (conceptInitialized) { // Use conceptInitialized flag
        // Pass initial state to update visual placeholders
        updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel);
        // Update the concept info panel which reads these updated globals (handled by viz-concepts wrappers)
        // updateInfoPanel(); // No longer needed here, wrapper calls it initially
    }
     if (live2dInitialized) { // Use the exported flag directly
        // Pass initial state to Live2D
        updateLive2DEmotions(currentAgentEmotions);
        updateLive2DHeadMovement(currentHmLabel, 0); // Delta time is 0 for initial pose
     }


    // Update initial metrics display (this is the small panel below chat)
    // Note: updateSyntrometryInfoPanel now handles the main 'metrics' area content.
    // This div could be deprecated or repurposed.
    // Let's keep this basic metrics update for the existing small div structure.
    updateMetricsDisplay(currentRIHScore, agent ? (agent.latestAffinities || []) : [], currentAgentEmotions, currentContext);


    // Setup UI controls and chat regardless of core/viz success
    setupControls();
    setupChat(); // This is where chat input listener is set up

    console.log("Initialization complete. Starting animation loop.");
    // Start the continuous animation loop
    animate();
}


/**
 * Initializes Agent and Environment instances. Sets criticalError if TF.js is missing.
 * @returns {boolean} True if successful, false otherwise.
 */
function initAgentAndEnvironment() {
     // Check if TensorFlow.js is available, as Agent/Env heavily depend on it
    if (typeof tf === 'undefined') {
         displayError("TensorFlow.js is required to initialize Agent and Environment. Simulation logic will be disabled.", true);
         criticalError = true; // Mark as critical error
         agent = null; // Ensure agent/env are null
         environment = null;
         return false; // Indicate failure
    }
    try {
        agent = new SyntrometricAgent(); // Agent constructor handles its own TF model checks
        environment = new EmotionalSpace();
        console.log("Agent and Environment initialized.");
        return true; // Indicate success
    } catch (e) {
        displayError(`Error initializing Agent/Environment: ${e.message}. Simulation logic disabled.`, true); // Mark as critical
        console.error('[Init] Agent/Env error:', e);
        criticalError = true; // Mark as critical
        agent = null; // Ensure agent/env are null
        environment = null;
        return false; // Indicate failure
    }
}

/**
 * Sets up the slider controls and button functionality.
 */
function setupControls() {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const integrationValue = document.getElementById('integration-value');
    const reflexivityValue = document.getElementById('reflexivity-value');
    const saveButton = document.getElementById('save-state-button');
    const loadButton = document.getElementById('load-state-button');


    if (integrationSlider && integrationValue) {
        integrationValue.textContent = parseFloat(integrationSlider.value).toFixed(2); // Set initial value display
        integrationSlider.addEventListener('input', () => {
             // Update the displayed value next to the slider
            integrationValue.textContent = parseFloat(integrationSlider.value).toFixed(2);
        });
    }
    if (reflexivitySlider && reflexivityValue) {
        reflexivityValue.textContent = parseFloat(reflexivitySlider.value).toFixed(2); // Set initial value display
        reflexivitySlider.addEventListener('input', () => {
             // Update the displayed value next to the slider
            reflexivityValue.textContent = parseFloat(reflexivitySlider.value).toFixed(2);
        });
    }

    // Add event listeners for Save/Load buttons
    if (saveButton) {
        saveButton.addEventListener('click', saveState);
    }
    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true)); // Pass true to show messages
         // Check if saved state exists on load and perhaps visually indicate it's loadable
         if (localStorage.getItem(SAVED_STATE_KEY)) {
            console.log("Saved state found in localStorage.");
            // Optional: Add a class or style to the load button to show it's active
            loadButton.classList.add('has-saved-state'); // Requires corresponding CSS
         }
    }

    // Disable buttons if critical error occurred
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

    // Add event listener for the 'keypress' event on the input field
    chatInput.addEventListener('keypress', async (e) => {
         // Check if the key pressed was Enter and the input is not empty
        if (e.key === 'Enter' && chatInput.value.trim()) {
            const userInput = chatInput.value.trim(); // Get user input
            appendChatMessage('You', userInput); // Display user message in chat output
            chatInput.value = ''; // Clear the input field

            // --- Process User Input ---
            // User input directly influences the environment's base emotions
            if (environment) {
                 // This updates env.baseEmotions, which is then used in the next env.step call
                 environment.getEmotionalImpactFromText(userInput);
                 appendChatMessage('System', 'Input processed.'); // Indicate that input had an effect
            } else {
                 appendChatMessage('System', 'Environment not initialized. Input ignored.');
            }

            // Note: env.step and agent.process will be called by the animation loop in subsequent frames.
        }
    });
}

/**
 * Updates the metrics display panel (the small one below chat).
 * Note: updateSyntrometryInfoPanel now handles the main 'metrics' area content.
 * This function could be deprecated or repurposed.
 * @param {number} rihScore The current RIH score (0-1).
 * @param {number[]} affinities Array of affinity scores.
 * @param {tf.Tensor|null} emotionsTensor Tensor of current emotion intensities.
 * @param {string} context Current environment context message.
 */
function updateMetricsDisplay(rihScore, affinities, emotionsTensor, context) {
    const metricsDiv = document.getElementById('metrics');
    // If the metrics div is being used by updateSyntrometryInfoPanel, don't overwrite it here.
    // We can check if its content looks like the default state.
    if (!metricsDiv || (metricsDiv.innerHTML && metricsDiv.innerHTML.includes('<h3>Dimension')) || (metricsDiv.innerHTML && metricsDiv.innerHTML.includes('<h3>Reflexive Integration'))) return; // Skip if showing dimension or RIH info


     // Get emotion values as array (handle potential null/undefined tensor)
     const emotions = emotionsTensor && typeof emotionsTensor.arraySync === 'function' ? emotionsTensor.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]);

     // Calculate average affinity (handle case with no affinities)
    const avgAffinity = affinities && affinities.length > 0 ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0;

     // Find dominant emotion name (handle empty emotions array)
    // Ensure emotions array has content before finding max
    const dominantEmotionIdx = emotions && emotions.length === Config.Agent.EMOTION_DIM ? emotions.indexOf(Math.max(...emotions)) : -1;
    const dominantEmotionName = dominantEmotionIdx !== -1 ? emotionNames[dominantEmotionIdx] : 'Unknown';

    // Get dominant emotion value safely
    const dominantEmotionValue = dominantEmotionIdx !== -1 && emotions.length > dominantEmotionIdx ? emotions[dominantEmotionIdx] : 0;


    // Update the HTML content of the metrics div (as a fallback default display)
    metricsDiv.innerHTML = `
        <h3>Simulation Overview</h3>
        <p><i>Hover or click dimensions/RIH node for details.</i></p>
        <p><span class="simulated-data">Current RIH: ${(rihScore * 100).toFixed(1)}%</span></p>
        <p><span class="simulated-data">Avg Affinity: ${(avgAffinity * 100).toFixed(1)}%</span></p>
        <p><span class="simulated-data">Dominant Emotion: ${dominantEmotionName}</span></p>
        <p>Environment Context: ${context || 'Stable'}</p>
    `;
}


// --- Save/Load State Functions ---
/**
 * Saves the current simulation state to localStorage.
 */
function saveState() {
    if (!agent || !environment) {
        console.warn("Agent or Environment not initialized, cannot save state.");
        appendChatMessage('System', 'Save failed: Simulation not ready.');
        return;
    }
    try {
        // Get serializable state from modules
        const envState = environment.getState();
        const agentState = agent.getState(); // Agent state includes prevEmotions, history, latest metrics

        // Get slider values
        const integrationParam = parseFloat(document.getElementById('integration-slider')?.value || 0.5);
        const reflexivityParam = parseFloat(document.getElementById('reflexivity-slider')?.value || 0.5);

        // Get current global state variables needed to fully restore
        const globalState = {
             currentStateVector: [...currentStateVector],
             currentRIHScore: currentRIHScore,
             currentAvgAffinity: currentAvgAffinity,
             currentHmLabel: currentHmLabel,
             currentContext: currentContext,
             currentCascadeHistory: currentCascadeHistory ? [...currentCascadeHistory] : [] // Clone cascade history
        };


        const stateToSave = {
            environment: envState,
            agent: agentState,
            global: globalState, // Save global state variables
            ui: { // Save UI state like slider positions
                 integration: integrationParam,
                 reflexivity: reflexivityParam,
            },
            timestamp: new Date().toISOString() // Optional timestamp
        };

        const stateString = JSON.stringify(stateToSave);
        localStorage.setItem(SAVED_STATE_KEY, stateString);

        console.log("Simulation state saved to localStorage.");
        appendChatMessage('System', 'Simulation state saved.');

         // Optional: Update load button visual state
         const loadButton = document.getElementById('load-state-button');
         if (loadButton) loadButton.classList.add('has-saved-state');


    } catch (e) {
        console.error("Error saving state:", e);
        appendChatMessage('System', `Save failed: ${e.message}`);
    }
}

/**
 * Loads simulation state from localStorage.
 * @param {boolean} showMessages - Whether to display success/failure messages in chat.
 * @returns {boolean} True if state was loaded, false otherwise.
 */
function loadState(showMessages = false) {
    if (!agent || !environment) {
        console.warn("Agent or Environment not initialized, cannot load state.");
         if (showMessages) appendChatMessage('System', 'Load failed: Simulation not ready.');
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

        if (!stateToLoad || !stateToLoad.environment || !stateToLoad.agent || !stateToLoad.global || !stateToLoad.ui) {
             console.error("Invalid saved state format.");
             if (showMessages) appendChatMessage('System', 'Load failed: Invalid saved state format.');
             localStorage.removeItem(SAVED_STATE_KEY); // Clear potentially corrupt state
            return false;
        }

        // Load state into modules
        environment.loadState(stateToLoad.environment);
        agent.loadState(stateToLoad.agent); // This loads prevEmotions, history, latest metrics into the agent instance

        // Restore global state variables from loaded state
        currentStateVector = Array.isArray(stateToLoad.global.currentStateVector) ? stateToLoad.global.currentStateVector : zeros([Config.Agent.BASE_STATE_DIM]);
        // currentAgentEmotions is the agent's prevEmotions for the *next* step.
        // agent.loadState already set agent.prevEmotions. We can just clone that.
        currentAgentEmotions = agent.prevEmotions ? agent.prevEmotions.clone() : tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);

        currentRIHScore = typeof stateToLoad.global.currentRIHScore === 'number' ? stateToLoad.global.currentRIHScore : 0;
        currentAvgAffinity = typeof stateToLoad.global.currentAvgAffinity === 'number' ? stateToLoad.global.currentAvgAffinity : 0;
        currentHmLabel = typeof stateToLoad.global.currentHmLabel === 'string' ? stateToLoad.global.currentHmLabel : "idle";
        currentContext = typeof stateToLoad.global.currentContext === 'string' ? stateToLoad.global.currentContext : "State loaded. Resuming simulation...";
        currentCascadeHistory = Array.isArray(stateToLoad.global.currentCascadeHistory) ? stateToLoad.global.currentCascadeHistory : [];


        // Restore UI state
         const integrationSlider = document.getElementById('integration-slider');
         const reflexivitySlider = document.getElementById('reflexivity-slider');
         const integrationValue = document.getElementById('integration-value');
         const reflexivityValue = document.getElementById('reflexivity-value');

          if (integrationSlider && typeof stateToLoad.ui.integration === 'number') {
              integrationSlider.value = stateToLoad.ui.integration;
              if (integrationValue) integrationValue.textContent = stateToLoad.ui.integration.toFixed(2);
          }
          if (reflexivitySlider && typeof stateToLoad.ui.reflexivity === 'number') {
             reflexivitySlider.value = stateToLoad.ui.reflexivity;
             if (reflexivityValue) reflexivityValue.textContent = parseFloat(stateToLoad.ui.reflexivity).toFixed(2); // Ensure two decimal places
          }


        console.log("Simulation state loaded from localStorage.");
        if (showMessages) appendChatMessage('System', 'Simulation state loaded.');

         // Trigger visualization updates manually with the loaded state for immediate feedback
         // Pass deltaTime = 0 for these immediate updates
         const integrationParam = parseFloat(document.getElementById('integration-slider')?.value || 0.5);
         const reflexivityParam = parseFloat(document.getElementById('reflexivity-slider')?.value || 0.5);

         // Update Syntrometry viz (Pass deltaTime = 0, loaded global state)
         if (threeInitialized) {
             updateThreeJS(
                 0, // deltaTime = 0
                 currentStateVector ? currentStateVector.slice(0, Config.DIMENSIONS) : zeros([Config.DIMENSIONS]), // Pass only the visible state dimensions
                 currentRIHScore,
                 agent.latestAffinities || [], // Use agent's loaded latest affinities
                 integrationParam,
                 reflexivityParam,
                 currentCascadeHistory, // Pass loaded cascade history
                 currentContext // Pass loaded context
             );
             // Update Syntrometry info panel (uses loaded state)
             updateSyntrometryInfoPanel();
         }
         // Update Concept Graph placeholders (uses loaded state)
         if (conceptInitialized) {
             updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel); // updateAgentSimulationVisuals uses loaded globals
             // Update concept info panel (handled by viz-concepts wrappers)
         }
          // Update Live2D (emotions/HM will be updated on the next animation frame by animate())
          if (live2dInitialized) {
              updateLive2DEmotions(currentAgentEmotions);
              // updateLive2DHeadMovement will use currentHmLabel on the next frame
          }

         // Update metrics display (small panel, uses loaded state)
         updateMetricsDisplay(currentRIHScore, agent.latestAffinities || [], currentAgentEmotions, currentContext);


        return true; // Indicate success
    } catch (e) {
        console.error("Error loading state:", e);
         if (showMessages) appendChatMessage('System', `Load failed: ${e.message}`);
         localStorage.removeItem(SAVED_STATE_KEY); // Clear potentially corrupt state on load failure
        return false; // Indicate failure
    }
}


// --- Animation Loop ---
/**
 * The main animation loop.
 */
async function animate() {
    // Stop the loop if a critical error occurred
    if (criticalError) {
         console.log("Critical error detected, stopping animation.");
         return; // Stop requesting next frame
    }

    // Request the next frame
    requestAnimationFrame(animate);

    // Get the time delta for frame-rate independent animations
    const deltaTime = appClock.getDelta();

    // Get current slider values
    const integrationParam = parseFloat(document.getElementById('integration-slider')?.value || 0.5);
    const reflexivityParam = parseFloat(document.getElementById('reflexivity-slider')?.value || 0.5);

    // --- Simulation Step (Environment and Agent) ---
    // Only run simulation step if agent and environment are initialized
    if (agent && environment && currentAgentEmotions) { // Ensure agent emotions are available for env step
         // Step the environment. Pass agent emotions and latest RIH/Affinity for dysvariant influence.
        const envStep = await environment.step(currentAgentEmotions, currentRIHScore, currentAvgAffinity);

         // Process the new environment state with the agent
         // Ensure state from envStep is an array before passing
         const envStateArray = envStep.state && typeof envStep.state.arraySync === 'function' ? envStep.state.arraySync()[0] : zeros([Config.Agent.BASE_STATE_DIM]);

        const agentResponse = await agent.process(
            envStateArray,
            integrationParam,
            reflexivityParam,
             { eventType: envStep.eventType, reward: envStep.reward } // Pass environment context
        );

         // Update global state variables from agent response
         // Dispose old tensor before replacing the reference
         if (currentAgentEmotions && typeof currentAgentEmotions.dispose === 'function') {
             tf.dispose(currentAgentEmotions);
         }
        currentAgentEmotions = agentResponse.emotions; // Update agent's emotion tensor (should be a NEW tensor)
        currentRIHScore = agentResponse.rihScore; // Update RIH score
         // Update average affinity (ensure affinities array exists)
         currentAvgAffinity = (agentResponse.affinities && agentResponse.affinities.length > 0) ? agentResponse.affinities.reduce((a, b) => a + b, 0) / agentResponse.affinities.length : 0;
        currentHmLabel = agentResponse.hmLabel; // Update head movement label
        currentContext = envStep.context; // Update environment context message
         currentStateVector = envStateArray; // Update the raw state vector array
         currentCascadeHistory = agentResponse.cascadeHistory; // Store cascade history

    } else {
         // Handle case where agent/environment are not initialized (e.g., TF.js failed)
         // Visualizations and Live2D might still run their basic animations/idle states
         // Use default values or last known values for updates
         if (!currentAgentEmotions || typeof currentAgentEmotions.dispose !== 'function') {
             currentAgentEmotions = tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);
         }
         // currentRIHScore, currentAvgAffinity, currentHmLabel, currentContext, currentStateVector, currentCascadeHistory
         // retain their last valid state or initial defaults/loaded state.
    }

     // --- Update Visualizations ---
     // Pass current state variables and slider params to visualization update/animate functions
     // Check initialization flags before calling functions

    // Update the main Syntrometry visualization (Pass deltaTime, loaded global state)
    if (threeInitialized) { // Use threeInitialized flag
        updateThreeJS(
             deltaTime, // Pass deltaTime
             currentStateVector ? currentStateVector.slice(0, Config.DIMENSIONS) : zeros([Config.DIMENSIONS]), // Pass only the visible state dimensions
             currentRIHScore,
             agent ? (agent.latestAffinities || []) : [], // Pass latest affinities from agent instance
             integrationParam,
             reflexivityParam,
             agent ? (agent.latestCascadeHistory || []) : [], // Pass latest cascade history from agent instance
             currentContext // Pass current context
          );
         // FIX: Update Syntrometry info panel every frame based on state/interaction
         updateSyntrometryInfoPanel();
    }

    // Update the Concept Graph placeholders based on agent/env state (This updates base color/scale/opacity)
    if (conceptInitialized) {
        updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel);
        // The info panel state is managed by hover/click events and updateInfoPanel
        // updateInfoPanel(); // This call is handled by the viz-concepts wrapper and called here.
    }

     // Update the Live2D model (emotions and head movement)
     if (live2dInitialized) { // Use the exported flag directly
         updateLive2DEmotions(currentAgentEmotions); // Pass current emotion tensor
         updateLive2DHeadMovement(currentHmLabel, deltaTime); // Pass delta time for smoothing
     }


    // Update the metrics display panel (small one below chat)
    // This acts as a fallback/default summary if updateSyntrometryInfoPanel isn't showing anything specific.
    updateMetricsDisplay(currentRIHScore, agent ? (agent.latestAffinities || []) : [], currentAgentEmotions, currentContext);

    // --- Animate Visualizations ---
    // Update controls for smooth camera movement in the concept graph
    if (conceptInitialized && conceptControls) {
        conceptControls.update();
    }

     // Animate concept graph nodes (rotations, oscillations, state reactions)
     // The animations also handle highlight state now
     if (conceptInitialized) {
         // Pass slider values to animateConceptNodes for animation influence
         // updateInfoPanel is called by the wrappers after mouse events in viz-concepts
         animateConceptNodes(deltaTime, integrationParam, reflexivityParam);
     }

     // **Render Visualizations**
     // Explicitly render the Concept Graph scene using both renderers
     if (conceptInitialized && conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
         conceptRenderer.render(conceptScene, conceptCamera);
         conceptLabelRenderer.render(conceptScene, conceptCamera);
     }

     // Rendering for the main Syntrometry panel is handled inside updateThreeJS.
     // Rendering for Live2D is handled by Pixi.js's internal ticker if enabled.
}

/**
 * Cleans up resources when the window is unloaded.
 */
function cleanup() {
    console.log("Cleaning up application resources...");

    // Dispose of TensorFlow.js tensors held by global state and modules
     if (currentAgentEmotions && typeof currentAgentEmotions.dispose === 'function') {
         tf.dispose(currentAgentEmotions);
         currentAgentEmotions = null;
     }
     // Call cleanup methods on modules if they exist
     if (environment && typeof environment.cleanup === 'function') {
         environment.cleanup();
         environment = null; // Clear reference
     }
      if (agent && typeof agent.cleanup === 'function') {
         agent.cleanup();
         agent = null; // Clear reference
     }

    // Call cleanup functions for each visualization module
    if (cleanupThreeJS) cleanupThreeJS();
    if (cleanupConceptVisualization) cleanupConceptVisualization();
    if (cleanupLive2D) cleanupLive2D();

    console.log("Cleanup complete.");
}


// --- Start Initialization on Window Load ---
window.addEventListener('load', initialize);
// Add cleanup on window unload
window.addEventListener('beforeunload', cleanup);


// Ensure TF.js doesn't clean up tensors needed across animation frames by default
// This is generally good practice when using tf.tidy frequently in a loop,
// manually disposing tensors returned by tidy is preferred.
// tf.ENV.set('WEBGL_RENDER_BROWSER', true); // Might help with some issues
// tf.enableProdMode(); // Production mode can improve performance by removing checks
// tf.ENV.set('DEBUG', false); // Disable debug mode
