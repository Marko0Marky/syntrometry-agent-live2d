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
import { initLive2D, updateLive2DEmotions, updateLive2DHeadMovement, live2dInitialized, cleanupLive2D } from './viz-live2d.js'; // Added cleanupLive2D import


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
    const threeSuccess = initThreeJS(); // Assumes initThreeJS gets the container ID itself
    const conceptSuccess = initConceptVisualization(appClock); // Assumes initConceptVisualization gets the container ID itself
    const live2dSuccess = await initLive2D(); // Assumes initLive2D gets the container ID itself

    // Check for overall initialization failures
    if (!coreInitSuccess) {
        criticalError = true;
        // Use the general error div for core errors
        displayError("Core simulation components failed to initialize (TensorFlow.js likely missing). Simulation logic disabled.", true, 'error-message');
    }

     // Visualizations might fail independently
     if (!threeSuccess) {
         // Target the error div INSIDE the syntrometry panel
         displayError("Syntrometry visualization failed to initialize.", false, 'syntrometry-error-message');
     }
     if (!conceptSuccess) {
         // Target the error div INSIDE the concept panel
         displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
     }
     if (!live2dSuccess) {
         // Use the general error div for Live2D errors
          displayError("Live2D avatar failed to initialize.", false, 'error-message');
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
         // Ensure a valid tensor exists even on failure for downstream checks
         if (typeof tf !== 'undefined') {
            currentAgentEmotions = tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);
         } else {
            currentAgentEmotions = null; // Or handle appropriately if tf is missing
         }
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
         // Call Syntrometry info panel update initially
         updateSyntrometryInfoPanel();
    }
    if (conceptInitialized) { // Use conceptInitialized flag
        // Pass initial state to update visual placeholders
        // Ensure currentAgentEmotions is a valid tensor or handle null case
        if (currentAgentEmotions) {
            updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel);
        } else {
            // Handle case where tensor couldn't be created (TF missing) - provide defaults
            updateAgentSimulationVisuals(tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]), 0, 0, 'idle');
        }
        // Update the concept info panel which reads these updated globals (handled by viz-concepts wrappers)
        // updateInfoPanel(); // No longer needed here, wrapper calls it initially
    }
     if (live2dInitialized) { // Use the exported flag directly
        // Pass initial state to Live2D
        // Ensure currentAgentEmotions is a valid tensor or handle null case
        if (currentAgentEmotions) {
            updateLive2DEmotions(currentAgentEmotions);
        } else {
            // Handle case where tensor couldn't be created (TF missing) - provide defaults
            updateLive2DEmotions(tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]));
        }
        updateLive2DHeadMovement(currentHmLabel, 0); // Delta time is 0 for initial pose
     }


    // Update initial metrics display (the small panel below chat)
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
         // Error is displayed in initialize() where the target ID is specified
         console.error("TensorFlow.js is required for Agent/Environment.");
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
        // Use the general error display here
        displayError(`Error initializing Agent/Environment: ${e.message}. Simulation logic disabled.`, true, 'error-message');
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
 * Updates the metrics display panel (the small one, #metrics).
 * Note: updateSyntrometryInfoPanel now handles the main 'metrics' area content IF it exists.
 * This function provides a default/fallback content for the #metrics div.
 * @param {number} rihScore The current RIH score (0-1).
 * @param {number[]} affinities Array of affinity scores.
 * @param {tf.Tensor|null} emotionsTensor Tensor of current emotion intensities.
 * @param {string} context Current environment context message.
 */
function updateMetricsDisplay(rihScore, affinities, emotionsTensor, context) {
    const metricsDiv = document.getElementById('metrics');
    // Only update if the div exists
    if (!metricsDiv) return;

    // If the main viz is actively using the panel (indicated by specific content), don't overwrite
    if (metricsDiv.innerHTML.includes('<h3>Dimension') || metricsDiv.innerHTML.includes('<h3>Reflexive Integration')) {
        return;
    }

     // Get emotion values as array (handle potential null/undefined/disposed tensor)
     let emotions = zeros([Config.Agent.EMOTION_DIM]);
     if (emotionsTensor && typeof emotionsTensor.arraySync === 'function' && !emotionsTensor.isDisposed) {
        try {
            emotions = emotionsTensor.arraySync()[0];
        } catch (e) {
            console.warn("Error getting emotions from tensor in updateMetricsDisplay:", e);
            // Keep default zeros
        }
     }

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
        <p><i>Hover/click viz elements for details.</i></p>
        <p><span class="simulated-data">Current RIH: ${(rihScore * 100).toFixed(1)}%</span></p>
        <p><span class="simulated-data">Avg Affinity: ${(avgAffinity * 100).toFixed(1)}%</span></p>
        <p><span class="simulated-data">Dominant Emotion: ${dominantEmotionName} (${(dominantEmotionValue * 100).toFixed(1)}%)</span></p>
        <p>Context: ${context || 'Stable'}</p>
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
    if (criticalError) {
        console.warn("Critical error detected, cannot save state.");
        appendChatMessage('System', 'Save failed: Critical error detected.');
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
             // Save previous emotions (input to next agent step after load) as array
             // agentState already contains this, but let's be explicit for global restore
             prevEmotionsArray: agent.prevEmotions && !agent.prevEmotions.isDisposed ? agent.prevEmotions.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]),
             currentRIHScore: currentRIHScore,
             currentAvgAffinity: currentAvgAffinity,
             currentHmLabel: currentHmLabel,
             currentContext: currentContext,
             currentCascadeHistory: currentCascadeHistory ? [...currentCascadeHistory] : [] // Clone cascade history
        };


        const stateToSave = {
            environment: envState,
            agent: agentState, // Agent internal state (e.g., history)
            global: globalState, // Save global simulation variables
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
        displayError(`Error saving state: ${e.message}`, false, 'error-message'); // Show in general errors
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
     if (criticalError) {
        console.warn("Critical error detected, cannot load state.");
        if (showMessages) appendChatMessage('System', 'Load failed: Critical error detected.');
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
             displayError("Load failed: Invalid saved state format.", false, 'error-message');
            return false;
        }

        // Load state into modules
        environment.loadState(stateToLoad.environment);
        agent.loadState(stateToLoad.agent); // This loads agent internal state (prevEmotions, history, etc.)

        // Restore global state variables from loaded state
        currentStateVector = Array.isArray(stateToLoad.global.currentStateVector) ? stateToLoad.global.currentStateVector : zeros([Config.Agent.BASE_STATE_DIM]);

        // Restore agent's previous emotions (which become currentAgentEmotions *for the next step*)
        // Dispose the old global tensor first
        if (currentAgentEmotions && typeof currentAgentEmotions.dispose === 'function') {
            tf.dispose(currentAgentEmotions);
        }
        // Create a new tensor from the saved array in global state
        const loadedPrevEmotionsArray = Array.isArray(stateToLoad.global.prevEmotionsArray) ? stateToLoad.global.prevEmotionsArray : zeros([Config.Agent.EMOTION_DIM]);
        currentAgentEmotions = tensor([loadedPrevEmotionsArray], [1, Config.Agent.EMOTION_DIM]); // Restore as tensor

        // Restore other global metrics
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
         if (conceptInitialized && currentAgentEmotions) { // Check tensor exists
             updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel);
         }
          // Update Live2D (emotions/HM will be updated on the next animation frame by animate())
          if (live2dInitialized && currentAgentEmotions) { // Check tensor exists
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
         displayError(`Load failed: ${e.message}`, false, 'error-message');
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
    // Only run simulation step if agent and environment are initialized AND we have a valid emotion tensor
    if (agent && environment && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
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

    } else if (!agent || !environment) {
        // Handle case where agent/environment are not initialized (e.g., TF.js failed)
        // Visualizations and Live2D might still run their basic animations/idle states
        // Use default values or last known values for updates
        if (!currentAgentEmotions || (currentAgentEmotions && currentAgentEmotions.isDisposed)) {
            if (typeof tf !== 'undefined') {
                currentAgentEmotions = tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);
            } else {
                 currentAgentEmotions = null; // No TF, no tensor
            }
        }
        // currentRIHScore, currentAvgAffinity, currentHmLabel, currentContext, currentStateVector, currentCascadeHistory
        // retain their last valid state or initial defaults/loaded state.
    } else if (currentAgentEmotions && currentAgentEmotions.isDisposed) {
         console.warn("currentAgentEmotions tensor was disposed unexpectedly. Recreating default.");
         if (typeof tf !== 'undefined') {
            currentAgentEmotions = tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);
         } else {
             currentAgentEmotions = null;
         }
         // Reset metrics potentially?
         currentRIHScore = 0;
         currentAvgAffinity = 0;
    }


     // --- Update Visualizations ---
     // Pass current state variables and slider params to visualization update/animate functions
     // Check initialization flags before calling functions

    // Update the main Syntrometry visualization
    if (threeInitialized) { // Use threeInitialized flag
        updateThreeJS(
             deltaTime, // Pass deltaTime
             currentStateVector ? currentStateVector.slice(0, Config.DIMENSIONS) : zeros([Config.DIMENSIONS]),
             currentRIHScore,
             agent ? (agent.latestAffinities || []) : [],
             integrationParam,
             reflexivityParam,
             agent ? (agent.latestCascadeHistory || []) : [],
             currentContext
          );
         // Update Syntrometry info panel every frame based on state/interaction
         updateSyntrometryInfoPanel();
    }

    // Update the Concept Graph placeholders based on agent/env state
    if (conceptInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
        updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel);
        // updateInfoPanel is handled by viz-concepts wrappers/event listeners
    }

     // Update the Live2D model
     if (live2dInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
         updateLive2DEmotions(currentAgentEmotions);
         updateLive2DHeadMovement(currentHmLabel, deltaTime);
     }


    // Update the fallback metrics display panel (#metrics)
    updateMetricsDisplay(currentRIHScore, agent ? (agent.latestAffinities || []) : [], currentAgentEmotions, currentContext);

    // --- Animate Visualizations ---
    // Update controls for smooth camera movement in the concept graph
    if (conceptInitialized && conceptControls) {
        conceptControls.update();
    }

     // Animate concept graph nodes
     if (conceptInitialized) {
         animateConceptNodes(deltaTime, integrationParam, reflexivityParam);
     }

     // **Render Visualizations**
     // Explicitly render the Concept Graph scene using both renderers
     if (conceptInitialized && conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
         conceptRenderer.render(conceptScene, conceptCamera);
         conceptLabelRenderer.render(conceptScene, conceptCamera);
     }

     // Rendering for the main Syntrometry panel is handled inside updateThreeJS.
     // Rendering for Live2D is handled by Pixi.js's internal ticker.
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
    if (cleanupLive2D) cleanupLive2D(); // Make sure this is imported and defined

    console.log("Cleanup complete.");
}


// --- Start Initialization on Window Load ---
window.addEventListener('load', initialize);
// Add cleanup on window unload
window.addEventListener('beforeunload', cleanup);


// TensorFlow.js environment settings (Optional, uncomment if needed)
// tf.ENV.set('WEBGL_RENDER_EVEN_UPDATES', false); // Might affect performance/updates
// tf.enableProdMode(); // Production mode can improve performance
// tf.ENV.set('DEBUG', false); // Disable debug mode for performance
