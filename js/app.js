// js/app.js - Main Orchestration File

import { Config, emotionKeywords } from './config.js'; // Import emotionKeywords instead
import { displayError, appendChatMessage, zeros, tensor, clamp } from './utils.js'; // Import clamp for safety
import { SyntrometricAgent } from './agent.js';
import { EmotionalSpace } from './environment.js';
import { initThreeJS, updateThreeJS, cleanupThreeJS } from './viz-syntrometry.js';
// Import init, update, animate, cleanup functions, and the conceptInitialized flag
import { initConceptVisualization, updateAgentSimulationVisuals, animateConceptNodes, updateInfoPanel, cleanupConceptVisualization, conceptInitialized, conceptRenderer, conceptLabelRenderer, conceptScene, conceptCamera, conceptControls } from './viz-concepts.js';
import { initLive2D, updateLive2DEmotions, updateLive2DHeadMovement, live2dInitialized } from './viz-live2d.js'; // Import live2dInitialized flag


// Define emotionNames locally using the imported emotionKeywords
const emotionNames = Object.values(emotionKeywords).map(e => e.name);

// --- Global State ---
let criticalError = false; // Flag to stop the animation loop on critical failures
let agent = null;
let environment = null;
let currentStateVector = null; // Array: Holds the environment's state, including emotional readings
let currentAgentEmotions = null; // tf.Tensor: Holds the agent's predicted emotions
let currentRIHScore = 0;
let currentAvgAffinity = 0;
let currentHmLabel = "idle";
let currentContext = "Initializing..."; // Textual context from environment

const appClock = new THREE.Clock(); // Main clock for animation timing


// --- Initialization ---
/**
 * Initializes all components of the application.
 */
async function initialize() {
    console.log("Initializing application...");

    // Initialize core components (Agent, Environment) - requires TF.js
    // initAgentAndEnvironment sets the criticalError flag if TF.js is not available
    const coreInitSuccess = initAgentAndEnvironment();

    // Initialize visualizations
    // These functions set their own internal initialized flags (e.g., threeInitialized)
    const threeSuccess = initThreeJS();
    // Pass the shared clock to the concept visualization init
    const conceptSuccess = initConceptVisualization(appClock);
    const live2dSuccess = await initLive2D(); // Await Live2D loading

    // Check for overall initialization failures
    // If core components failed, mark as critical
    if (!coreInitSuccess) {
        criticalError = true;
        displayError("Core simulation components failed to initialize (TensorFlow.js likely missing). Simulation logic disabled.", true);
    }

     // Visualizations might fail independently, but don't necessarily stop *everything*
     // We'll rely on their internal flags (e.g., threeInitialized) in the animate loop.
     if (!threeSuccess) {
         displayError("Syntrometry visualization failed to initialize.", false);
     }
     if (!conceptSuccess) {
         displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
     }
     if (!live2dSuccess) {
          displayError("Live2D avatar failed to initialize.", false);
     }


     // If core components *did* initialize:
    if (agent && environment) {
         // Get the initial state from the environment
        const initialState = environment.reset();
         currentStateVector = initialState.state.arraySync()[0]; // Store the initial state array

         // Process the initial state with the agent to get starting metrics/emotions
         // Use default params if sliders aren't ready, and default context/reward
         const initialAgentResponse = await agent.process(
             currentStateVector,
             parseFloat(document.getElementById('integration-slider')?.value || 0.5),
             parseFloat(document.getElementById('reflexivity-slider')?.value || 0.5),
             { eventType: null, reward: 0 }
         );

         // Store initial agent outputs
         // Ensure tensors are valid or use fallbacks
         currentAgentEmotions = initialAgentResponse.emotions ? initialAgentResponse.emotions : tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);
         currentRIHScore = initialAgentResponse.rihScore;
         // Handle potential empty affinities array from initial process
         currentAvgAffinity = (initialAgentResponse.affinities && initialAgentResponse.affinities.length > 0) ? initialAgentResponse.affinities.reduce((a, b) => a + b, 0) / initialAgentResponse.affinities.length : 0;
         currentHmLabel = initialAgentResponse.hmLabel;
         currentContext = initialAgentResponse.responseText;

         // Perform initial visualization updates with initial data
         if (threeSuccess) {
             updateThreeJS(
                  currentStateVector.slice(0, Config.DIMENSIONS), // Pass only the visible state dimensions
                  currentRIHScore,
                  initialAgentResponse.affinities || [], // Pass initial affinities, default to empty array
                  parseFloat(document.getElementById('integration-slider')?.value || 0.5),
                  parseFloat(document.getElementById('reflexivity-slider')?.value || 0.5)
              );
         }
         if (conceptSuccess) {
              // Pass initial state to update visual placeholders
             updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel);
             // Update the concept info panel which uses these updated globals
             updateInfoPanel(null); // Pass null to show default/latest sim info
         }
          if (live2dSuccess) {
             // Pass initial state to Live2D
             updateLive2DEmotions(currentAgentEmotions);
             updateLive2DHeadMovement(currentHmLabel, 0); // Delta time is 0 for initial pose
          }


         // Update initial metrics display
         updateMetricsDisplay(currentRIHScore, initialAgentResponse.affinities || [], currentAgentEmotions, currentContext); // Pass affinities array

    } else {
         // Core init failed, update visuals with zeros/defaults if visualizations did init
         currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]); // Default zero state
         currentAgentEmotions = tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]); // Default zero emotions

         if (threeSuccess) {
            updateThreeJS(zeros([Config.DIMENSIONS]), 0, [], 0.5, 0.5);
         }
         if (conceptSuccess) {
             updateAgentSimulationVisuals(currentAgentEmotions, 0, 0, 'idle');
             updateInfoPanel(null);
         }
         if (live2dSuccess) {
              updateLive2DEmotions(currentAgentEmotions);
              updateLive2DHeadMovement('idle', 0);
         }
         updateMetricsDisplay(0, [], currentAgentEmotions, "Simulation core failed to load.");
    }


    // Setup UI controls and chat regardless of core/viz success (they might partially work)
    setupControls();
    setupChat();


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
 * Sets up the slider controls functionality.
 */
function setupControls() {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const integrationValue = document.getElementById('integration-value');
    const reflexivityValue = document.getElementById('reflexivity-value');

    if (integrationSlider && integrationValue) {
        integrationSlider.addEventListener('input', () => {
             // Update the displayed value next to the slider
            integrationValue.textContent = parseFloat(integrationSlider.value).toFixed(2);
        });
    }
    if (reflexivitySlider && reflexivityValue) {
        reflexivitySlider.addEventListener('input', () => {
             // Update the displayed value next to the slider
            reflexivityValue.textContent = parseFloat(reflexivitySlider.value).toFixed(2);
        });
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
                 // Note: env.step will be called by the animation loop.
                 // The agent will react in subsequent frames based on the updated environment state.
            } else {
                 appendChatMessage('System', 'Environment not initialized. Input ignored.');
            }

            // Optionally, could trigger an *immediate* step here if chat input
            // should cause an instant reaction, but the continuous loop is running.
            // For simplicity and consistent update timing, rely on the loop.
        }
    });
}

/**
 * Updates the metrics display panel.
 * @param {number} rihScore The current RIH score (0-1).
 * @param {number[]} affinities Array of affinity scores.
 * @param {tf.Tensor|null} emotionsTensor Tensor of current emotion intensities.
 * @param {string} context Current environment context message.
 */
function updateMetricsDisplay(rihScore, affinities, emotionsTensor, context) {
    const metricsDiv = document.getElementById('metrics');
    if (!metricsDiv) return; // Ensure element exists

     // Get emotion values as array (handle potential null/undefined tensor)
     const emotions = emotionsTensor && typeof emotionsTensor.arraySync === 'function' ? emotionsTensor.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]);

     // Calculate average affinity (handle case with no affinities)
    const avgAffinity = affinities && affinities.length > 0 ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0;

     // Find dominant emotion name (handle empty emotions array)
    // Ensure emotions array has content before finding max
    const dominantEmotionIdx = emotions && emotions.length > 0
        ? emotions.indexOf(Math.max(...emotions))
        : -1;
    const dominantEmotionName = dominantEmotionIdx !== -1 ? emotionNames[dominantEmotionIdx] : 'Unknown';

    // Get dominant emotion value safely
    const dominantEmotionValue = dominantEmotionIdx !== -1 && emotions.length > dominantEmotionIdx ? emotions[dominantEmotionIdx] : 0;


    // Update the HTML content of the metrics div
    metricsDiv.innerHTML = `
        <b>RIH Score:</b> ${(rihScore * 100).toFixed(1)}%<br>
        <b>Avg Affinity:</b> ${(avgAffinity * 100).toFixed(1)}%<br>
        <b>Dominant Emotion:</b> ${dominantEmotionName} (${(dominantEmotionValue * 100).toFixed(1)}%)<br>
        <b>Current Context:</b> ${context || 'Stable'}
    `;
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

         // Dispose of the previous agent emotions tensor if the agent process didn't already
         // Note: The Agent class now handles disposing its *internal* prevEmotions.
         // If the *returned* emotion tensor needs explicit external disposal, it should be done here.
         // However, `agentResponse.emotions` is the *new* tensor the agent will use as `prevEmotions`
         // in the *next* step, so we should NOT dispose it here. We only dispose the *previous*
         // `currentAgentEmotions` if the agent didn't replace it internally (e.g., on error).
         // Let's add a check/dispose here for safety if the agent process *replaces* the tensor instance.
         // The agent process method already handles disposing its OLD prevEmotions. We just need to update
         // our global `currentAgentEmotions` reference to the NEW tensor returned by the agent.


         // Update global state variables with results from the agent
         // Ensure we clone the emotion tensor if the agent returns a reference that might be disposed internally later
         // The agent should return a NEW tensor or clone its internal state for safe external use.
        currentAgentEmotions = agentResponse.emotions; // Update agent's emotion tensor
        currentRIHScore = agentResponse.rihScore; // Update RIH score
         // Update average affinity (ensure affinities array exists)
         currentAvgAffinity = (agentResponse.affinities && agentResponse.affinities.length > 0) ? agentResponse.affinities.reduce((a, b) => a + b, 0) / agentResponse.affinities.length : 0;
        currentHmLabel = agentResponse.hmLabel; // Update head movement label
        currentContext = envStep.context; // Update environment context message
         currentStateVector = envStateArray; // Update the raw state vector array

         // Dispose of the previous agent emotions tensor after getting the new one
         // This assumes agentResponse.emotions is a *new* tensor. If it's a reference to the internal prevEmotions,
         // the agent class is responsible for its disposal before the *next* step's computation.
         // Let's trust the Agent class's internal disposal logic for prevEmotions.

    } else {
         // Handle case where agent/environment are not initialized (e.g., TF.js failed)
         // Visualizations and Live2D might still run their basic animations/idle states
         // Use default values or last known values for updates
         // currentStateVector, currentAgentEmotions etc. would hold their last valid state or initial defaults
         // The update functions should handle null/invalid input gracefully.
         // console.warn("Agent or Environment not initialized, skipping simulation step.");
         // Ensure currentAgentEmotions is a valid (though potentially zero) tensor for Live2D updates
         if (!currentAgentEmotions || typeof currentAgentEmotions.dispose !== 'function') {
             currentAgentEmotions = tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);
         }
    }

     // --- Update Visualizations ---
     // Pass current state variables to visualization update functions
     // Check initialization flags before calling update functions

    // Update the main Syntrometry visualization
    if (initThreeJS) { // Check if the function exists (i.e., module loaded) - initThreeJS sets its own flag
        updateThreeJS(
             currentStateVector ? currentStateVector.slice(0, Config.DIMENSIONS) : zeros([Config.DIMENSIONS]), // Pass only the first N dimensions
             currentRIHScore,
             agent ? (agent.affinities || []) : [], // Pass affinities from agent if available
             integrationParam,
             reflexivityParam
         );
    }

    // Update the Concept Graph placeholders based on agent/env state
    if (conceptInitialized) { // Check if concept visualization is initialized
        updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, currentAvgAffinity, currentHmLabel);
        // Update info panel based on latest data (already updated by updateAgentSimulationVisuals)
        updateInfoPanel(null); // Pass null to show default/latest sim info
    }

     // Update the Live2D model (emotions and head movement)
     if (initLive2D && live2dInitialized) { // Check if function exists AND Live2D initialized
         updateLive2DEmotions(currentAgentEmotions); // Pass current emotion tensor
         updateLive2DHeadMovement(currentHmLabel, deltaTime); // Pass delta time for smoothing
     }


    // Update the metrics display panel
    updateMetricsDisplay(currentRIHScore, agent ? (agent.affinities || []) : [], currentAgentEmotions, currentContext); // Pass affinities and emotions

    // --- Render Visualizations ---
    // Update controls for smooth camera movement in the concept graph
    if (conceptInitialized && conceptControls) {
        conceptControls.update();
    }

     // Animate concept graph nodes (rotations, oscillations)
     if (conceptInitialized) { // Check if concept visualization is initialized
         animateConceptNodes(deltaTime); // Pass deltaTime
     }

     // **CRITICAL FIX:** Explicitly render the Concept Graph scene using both renderers
     if (conceptInitialized && conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
         conceptRenderer.render(conceptScene, conceptCamera);
         conceptLabelRenderer.render(conceptScene, conceptCamera);
     }

     // Rendering for the main Syntrometry panel is handled inside updateThreeJS.
     // Rendering for Live2D is handled by Pixi.js's internal ticker if enabled (which it is by default).
}

/**
 * Cleans up resources when the window is unloaded.
 */
function cleanup() {
    console.log("Cleaning up application resources...");

    // Dispose of TensorFlow.js tensors if they exist
     // tf.disposeVariables(); // Dispose all managed variables - can be aggressive
     if (currentAgentEmotions && typeof currentAgentEmotions.dispose === 'function') {
         currentAgentEmotions.dispose();
         currentAgentEmotions = null;
     }
     // environment cleanup should dispose its base emotions tensor
     if (environment && environment.baseEmotions && typeof environment.baseEmotions.dispose === 'function') {
         environment.baseEmotions.dispose();
          environment.baseEmotions = null; // Set to null after disposing
     }
     // Dispose agent's prevEmotions if agent instance still exists
     if (agent && agent.prevEmotions && typeof agent.prevEmotions.dispose === 'function') {
         agent.prevEmotions.dispose();
         agent.prevEmotions = null;
     }
     // Dispose agent's models if they exist
     if (agent && agent.emotionalModule && typeof agent.emotionalModule.dispose === 'function') {
         agent.emotionalModule.dispose();
         agent.emotionalModule = null; // Set to null after disposing
     }
      if (agent && agent.headMovementHead && typeof agent.headMovementHead.dispose === 'function') {
         agent.headMovementHead.dispose();
         agent.headMovementHead = null; // Set to null after disposing
     }
     // Dispose agent/environment instances (set to null)
     agent = null;
     environment = null;


    // Call cleanup functions for each visualization module
    if (cleanupThreeJS) cleanupThreeJS();
    if (cleanupConceptVisualization) cleanupConceptVisualization();
    if (cleanupLive2D) cleanupLive2D();

    // No need to remove window.load listener, it only runs once
    // cleanup itself is called by window.beforeunload

    console.log("Cleanup complete.");
}


// --- Start Initialization on Window Load ---
window.addEventListener('load', initialize);
// Add cleanup on window unload
window.addEventListener('beforeunload', cleanup);


// Global flag indicating Live2D init status for the concept graph info panel
// This is updated within viz-live2d.js and imported here.
// We need to expose it globally if updateInfoPanel in viz-concepts needs it.
// A better way is to pass the status to updateInfoPanel or have viz-concepts
// import it. Let's import it directly in viz-concepts.js.
// For simplicity, we could also just attach it to window:
// window.live2dInitialized = live2dInitialized; // Or update this flag from here

// The imported `live2dInitialized` variable will automatically reflect the exported value.
// The `updateInfoPanel` function in `viz-concepts.js` imports this flag.


// Ensure TF.js doesn't clean up tensors needed across animation frames by default
// This is generally good practice when using tf.tidy frequently in a loop,
// manually disposing tensors returned by tidy is preferred.
// tf.ENV.set('WEBGL_RENDER_BROWSER', true); // Might help with some issues
// tf.enableProdMode(); // Production mode can improve performance by removing checks
// tf.ENV.set('DEBUG', false); // Disable debug mode