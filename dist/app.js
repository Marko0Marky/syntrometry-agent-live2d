import { SyntrometricAgent } from './agent.js';
import { EmotionalSpace } from './environment.js';
import { displayError, zeros } from './utils.js';
import { safeDispose } from './tensorUtils.js';
import { Config } from './config.js';

// Import visualization modules
import {
    initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel,
    threeInitialized
} from './viz-syntrometry.js';
import {
    initConceptVisualization, updateAgentSimulationVisuals, animateConceptNodes,
    updateInfoPanel as updateConceptInfoPanel, cleanupConceptVisualization, conceptInitialized,
    conceptRenderer, conceptLabelRenderer, conceptScene, conceptCamera, conceptControls
} from './viz-concepts.js';
import { initLive2D, updateLive2DEmotions, cleanupLive2D, live2dInitialized } from './viz-live2d.js';

// Import THREE for the clock
import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Add this with your other constants at the top of the file
const SAVED_STATE_KEY = 'syntrometrySimulationState_v2_3_1'; // Updated version key

// Other global variables
let agent = null;
let environment = null;
let criticalError = false;
const appClock = new THREE.Clock();
let metricsChart = null;
let animationFrameId = null;

// Define the simulation metrics object
const simulationMetrics = {
  currentStateVector: [],
  currentAgentEmotions: null,
  currentRIHScore: 0.5,
  currentTrustScore: 0.5,
  currentIntegrationParam: 0.5,
  currentReflexivityParam: 0.5,
  currentCascadeHistory: [[0.5, 0.5, 0.5]],
  currentContext: "Initializing...",
  lastUpdateTime: Date.now()
};

// Timestamps for Input Feedback Visualization
let lastIntegrationInputTime = -1;
let lastReflexivityInputTime = -1;
let lastChatImpactTime = -1;

// Chart.js Instance
const MAX_CHART_POINTS = 150; // Max history points for chart

async function waitForTensorFlow() {
  console.log("Waiting for TensorFlow.js to be fully loaded...");
  
  // If our shim has loaded TensorFlow, use that
  if (typeof window.loadTensorFlow === 'function') {
    try {
      await window.loadTensorFlow();
    } catch (e) {
      console.error("Error loading TensorFlow.js:", e);
    }
  }
  
  // Check if TensorFlow is properly loaded
  if (typeof tf === 'undefined') {
    console.error("TensorFlow.js is not loaded at all");
    return false;
  }
  
  // Check for essential functions
  if (typeof tf.tensor2d !== 'function' || typeof tf.variable !== 'function') {
    console.error("TensorFlow.js is missing essential functions");
    
    // Try loading again if our shim is available
    if (typeof window.loadTensorFlow === 'function') {
      try {
        await window.loadTensorFlow();
      } catch (e) {
        console.error("Error reloading TensorFlow.js:", e);
        return false;
      }
    } else {
      return false;
    }
  }
  
  // Verify capabilities
  if (typeof window.verifyTensorFlowCapabilities === 'function') {
    return window.verifyTensorFlowCapabilities();
  }
  
  // Basic verification if our shim isn't available
  return typeof tf.tensor2d === 'function' && 
         typeof tf.variable === 'function' && 
         typeof tf.sequential === 'function';
}

// Update the initialize function to wait for TensorFlow
async function initialize() {
  console.log("Initializing application (Agent V2.3)...");
  
  // Wait for TensorFlow.js to be fully loaded
  const tfReady = await waitForTensorFlow();
  if (!tfReady) {
    console.error("TensorFlow.js failed to load properly. Application may not function correctly.");
    displayError("TensorFlow.js failed to load properly. Some features may not work.", true, 'error-message');
  } else {
    console.log("TensorFlow.js loaded successfully with all required capabilities");
  }
  
  const coreInitSuccess = initAgentAndEnvironment();
  const threeSuccess = initThreeJS(); // Syntrometry
  const conceptSuccess = initConceptVisualization(appClock); // Concepts
  const live2dSuccess = await initLive2D(); // Live2D Avatar
  
  // Handle critical core failure first
  if (!coreInitSuccess) {
    criticalError = true;
    displayError("Core simulation components (Agent/Environment/TF) failed to initialize. Simulation disabled.", true, 'error-message');
    // Still try to initialize UI parts that don't depend on core
  }
  
  // Log non-critical visualization errors
  if (!threeSuccess)
    displayError("Syntrometry visualization failed to initialize.", false, 'syntrometry-error-message');
  if (!conceptSuccess)
    displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
  if (!live2dSuccess)
    displayError("Live2D avatar failed to initialize.", false, 'error-message');
  
  // Init UI elements
  initMetricsChart();
  setupControls();
  setupChat();
  setupInspectorToggle();
  
  let initialStateLoaded = false;
  if (coreInitSuccess) { // Only try to load if core is okay
    initialStateLoaded = await loadState(false); // await loadState
  }
  
  // If core is okay but no state was loaded, initialize a new simulation state
  if (coreInitSuccess && !initialStateLoaded && agent && environment) {
    console.log("No valid saved state found or load skipped, initializing new simulation state...");
    let envResetResult = null;
    try {
      // Define the expected return type
      envResetResult = await environment.reset();
      const initialStateTensor = envResetResult?.state;
      
      if (!initialStateTensor || initialStateTensor.isDisposed) {
        throw new Error("Environment reset returned invalid state tensor.");
      }
      
      // Process initial state
      const agentResponse = agent.process(initialStateTensor, "Initial state");
      
      // Update metrics with initial state
      simulationMetrics.currentStateVector = await tensorToArrayAsync(initialStateTensor);
      
      // Dispose old emotions tensor if it exists
      safeDispose(simulationMetrics.currentAgentEmotions);
      
      // Keep a reference to the new emotions tensor
      simulationMetrics.currentAgentEmotions = tf.keep(agentResponse.emotions.clone());
      
      // Create a clone for this frame's rendering
      const initialFrameEmotions = tf.keep(agentResponse.emotions.clone());
      
      // Update other metrics
      simulationMetrics.currentRIHScore = agentResponse.rihScore || 0;
      simulationMetrics.currentAvgAffinity = agent.latestAffinities ? 
          agent.latestAffinities.reduce((a, b) => a + b, 0) / agent.latestAffinities.length : 0;
      simulationMetrics.currentHmLabel = agentResponse.headMovement || "idle";
      simulationMetrics.currentContext = agentResponse.context || "Initial context";
      simulationMetrics.currentCascadeHistory = agentResponse.cascadeHistory || [];
      simulationMetrics.currentTrustScore = agentResponse.trustScore || 0.5;
      
      // Update visualizations with initial state
      if (threeInitialized) {
        try {
          updateThreeJS(initialFrameEmotions, simulationMetrics.currentRIHScore);
        } catch (e) {
          console.error("Error during initial ThreeJS update:", e);
        }
      }
      
      if (conceptInitialized) {
        try {
          updateAgentSimulationVisuals(
              initialFrameEmotions, 
              simulationMetrics.currentRIHScore, 
              simulationMetrics.currentAvgAffinity, 
              simulationMetrics.currentHmLabel, 
              simulationMetrics.currentTrustScore
          );
          
          animateConceptNodes(
              appClock.getElapsedTime(), 
              simulationMetrics.currentIntegrationParam, 
              simulationMetrics.currentReflexivityParam, 
              -1, -1, -1
          );
          
          resizeConceptGraphRenderer(); // Resize after initial setup
        } catch (e) {
          console.error("Error during initial concept viz update:", e);
        }
      }
      
      if (live2dInitialized && initialFrameEmotions) {
        try {
          updateLive2DEmotions(toNumberArray(initialFrameEmotions.dataSync()));
          updateLive2DHeadMovement(simulationMetrics.currentHmLabel, 0);
        } catch (e) {
          console.error("Error during initial Live2D update:", e);
        }
      }
      
      // Dispose the initial state tensor
      safeDispose(initialStateTensor);
      
    } catch (initialProcessError) {
      console.error("Error during initial agent/environment processing:", initialProcessError);
      displayError(`Error initializing agent state: ${initialProcessError instanceof Error ? initialProcessError.message : String(initialProcessError)}. Simulation may be unstable.`, true, 'error-message');
      criticalError = true; // Mark as critical if initialization fails badly
      
      // Reset metrics to default
      simulationMetrics.currentStateVector = zeros(Config.Agent.BASE_STATE_DIM);
      safeDispose(simulationMetrics.currentAgentEmotions);
      simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Keep zeros
      
      // Create a default initialFrameEmotions for visualization
      const initialFrameEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
      
      // Try to update visualizations with default state
      if (threeInitialized) {
        try {
          updateThreeJS(initialFrameEmotions, 0);
        } catch (e) {
          console.error("Error during fallback ThreeJS update:", e);
        }
      }
      
      if (conceptInitialized) {
        try {
          updateAgentSimulationVisuals(initialFrameEmotions, 0, 0, "idle", 0.5);
          animateConceptNodes(appClock.getElapsedTime(), 0.5, 0.5, -1, -1, -1);
        } catch (e) {
          console.error("Error during fallback concept viz update:", e);
        }
      }
      
      if (live2dInitialized) {
        try {
          updateLive2DEmotions([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
          updateLive2DHeadMovement("idle", 0);
        } catch (e) {
          console.error("Error during fallback Live2D update:", e);
        }
      }
      
      // Dispose the fallback tensor
      safeDispose(initialFrameEmotions);
    }
  } else if (!coreInitSuccess || !agent || !environment) {
    // Handle core failure or state load failure where core is invalid
    console.warn("Core components not available or initial state failed. Setting default metrics.");
    simulationMetrics.currentStateVector = zeros(Config.Agent.BASE_STATE_DIM);
    safeDispose(simulationMetrics.currentAgentEmotions);
    
    if (typeof tf !== 'undefined') { // Only create tensor if TF is available
      simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
    } else {
      simulationMetrics.currentAgentEmotions = null; // No TF available
    }
  }
  
  // Update Remaining UI
  updateDashboardDisplay();
  updateCascadeViewer();
  logToTimeline("System Initialized", 'expressions-list');
  
  // Enable/disable controls based on final state
  if (criticalError) {
    disableControls();
  }
  
  // Add window event listeners
  window.addEventListener('resize', resizeConceptGraphRenderer);
  window.addEventListener('beforeunload', cleanup);
  
  // Start animation loop if no critical errors
  if (!criticalError) {
    console.log("Initialization complete (V2.3). Starting animation loop.");
    requestAnimationFrame(animate); // Start the loop
  } else {
    console.error("Initialization encountered critical errors. Animation loop will not start.");
  }
}
function initAgentAndEnvironment() {
  try {
    if (typeof tf === 'undefined' || typeof tf.layers === 'undefined') {
      console.error("CRITICAL: TensorFlow.js is required for Agent/Environment but not loaded/incomplete.");
      agent = null; 
      environment = null; 
      return false;
    }
    
    // Create the agent
    agent = new SyntrometricAgent();
    
    // Create the environment using the correct class name
    environment = new EmotionalSpace();
    
    return true;
  } catch (e) {
    console.error('[Init] Agent/Environment creation/validation error:', e);
    console.error(`Initialization Error: ${e instanceof Error ? e.message : String(e)}. Simulation logic disabled.`);
    
    agent = null;
    environment = null;
    return false;
  }
}
/**
 * Initializes the metrics chart using Chart.js
 */
function initMetricsChart() {
  const canvas = getCanvasElement('metrics-chart');
  if (!canvas) {
    console.error("Metrics chart canvas not found!");
    return;
  }
  
  if (metricsChart) {
    try {
      metricsChart.destroy();
    } catch(e) {
      /* ignore */
    }
    metricsChart = null;
  }
  
  // Define chart colors
  const colorRIHBorder = 'rgb(102, 255, 102)';
  const colorAffinityBorder = 'rgb(255, 170, 102)';
  const colorTrustBorder = 'rgb(102, 170, 255)';
  const colorBeliefNormBorder = 'rgb(255, 255, 102)';
  const colorSelfNormBorder = 'rgb(200, 150, 255)';
  
  // Chart configuration
  const chartConfig = {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'RIH Score',
          borderColor: colorRIHBorder,
          backgroundColor: 'rgba(102, 255, 102, 0.1)',
          data: [],
          borderWidth: 2,
          tension: 0.2
        },
        {
          label: 'Affinity',
          borderColor: colorAffinityBorder,
          backgroundColor: 'rgba(255, 170, 102, 0.1)',
          data: [],
          borderWidth: 2,
          tension: 0.2
        },
        {
          label: 'Trust',
          borderColor: colorTrustBorder,
          backgroundColor: 'rgba(102, 170, 255, 0.1)',
          data: [],
          borderWidth: 2,
          tension: 0.2
        },
        {
          label: 'Belief Norm',
          borderColor: colorBeliefNormBorder,
          backgroundColor: 'rgba(255, 255, 102, 0.1)',
          data: [],
          borderWidth: 2,
          tension: 0.2
        },
        {
          label: 'Self Norm',
          borderColor: colorSelfNormBorder,
          backgroundColor: 'rgba(200, 150, 255, 0.1)',
          data: [],
          borderWidth: 2,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'realtime',
          realtime: {
            duration: 60000,
            refresh: 1000,
            delay: 1000,
            onRefresh: function() {
              // This will be called when the chart is refreshed
            }
          }
        },
        y: {
          min: 0,
          max: 1.0,
          ticks: {
            stepSize: 0.1
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  };
  
  try {
    // Create the chart
    metricsChart = new Chart(canvas, chartConfig);
    console.log("Metrics chart initialized.");
  } catch (chartError) {
    console.error("Error initializing Chart.js:", chartError);
    displayError(`Chart initialization failed: ${chartError instanceof Error ? chartError.message : String(chartError)}`, false, 'error-message');
  }
}
function updateSliderDisplays(integration, reflexivity) {
    const integrationValue = getElement('integration-value');
    const reflexivityValue = getElement('reflexivity-value');
    const integrationSlider = getInputElement('integration-slider');
    const reflexivitySlider = getInputElement('reflexivity-slider');
    if (integrationValue)
        integrationValue.textContent = (typeof integration === 'number' && isFinite(integration)) ? integration.toFixed(2) : 'N/A';
    if (reflexivityValue)
        reflexivityValue.textContent = (typeof reflexivity === 'number' && isFinite(reflexivity)) ? reflexivity.toFixed(2) : 'N/A';
    // Only update slider value if it's not being actively dragged
    if (integrationSlider && typeof integration === 'number' && isFinite(integration) && !integrationSlider.matches(':active')) {
        integrationSlider.value = String(integration);
    }
    if (reflexivitySlider && typeof reflexivity === 'number' && isFinite(reflexivity) && !reflexivitySlider.matches(':active')) {
        reflexivitySlider.value = String(reflexivity);
    }
}
function setupControls() {
    const integrationSlider = getInputElement('integration-slider');
    const reflexivitySlider = getInputElement('reflexivity-slider');
    const integrationValue = getElement('integration-value');
    const reflexivityValue = getElement('reflexivity-value');
    const saveButton = getElement('save-state-button');
    const loadButton = getElement('load-state-button');
    const labelToggle = getInputElement('labels-toggle'); // Label toggle
    // Sliders are read-only, reflecting agent state
    if (integrationSlider && integrationValue) {
        integrationSlider.disabled = true; // Make it read-only visually/functionally
        integrationSlider.classList.add('read-only-slider');
        // No event listener needed for input if read-only
    }
    else {
        console.warn("Integration slider/value elements not found.");
    }
    if (reflexivitySlider && reflexivityValue) {
        reflexivitySlider.disabled = true;
        reflexivitySlider.classList.add('read-only-slider');
    }
    else {
        console.warn("Reflexivity slider/value elements not found.");
    }
    // Save/Load Buttons
    if (saveButton) {
        saveButton.addEventListener('click', saveState);
        saveButton.disabled = criticalError; // Disable if core error
    }
    else {
        console.warn("Save button not found.");
    }
    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true)); // await loadState inside handler
        loadButton.disabled = criticalError;
        // Check local storage to add indicator class
        if (localStorage.getItem(SAVED_STATE_KEY)) {
            loadButton.classList.add('has-saved-state');
        }
        else {
            loadButton.classList.remove('has-saved-state');
        }
    }
    else {
        console.warn("Load button not found.");
    }
    // Label Toggle Logic (Concept Graph)
    if (labelToggle) {
        const toggleLabels = (show) => {
            if (conceptScene) {
                conceptScene.traverse((object) => {
                    // Check if it's a CSS2DObject and has the 'label' class
                    if (object instanceof CSS2DObject &&
                        object.element &&
                        object.element.classList &&
                        object.element.classList.contains('label')) {
                        // Use type assertion to add visible property
                        object.visible = show;
                    }
                });
            } else {
                console.warn("Cannot toggle labels: conceptScene is not available");
            }
        };
        labelToggle.addEventListener('change', () => toggleLabels(labelToggle.checked));
        // Only call toggleLabels if conceptScene is available
        if (conceptScene) {
            toggleLabels(labelToggle.checked); // Set initial state
        }
    } else {
        console.warn("Labels toggle checkbox not found.");
    }
}
function disableControls() {
    const selectors = [
        '#integration-slider', '#reflexivity-slider',
        '#save-state-button', '#load-state-button',
        '#chat-input'
    ];
    selectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
            el.disabled = true;
            if (el.id === 'chat-input') {
                el.placeholder = "Simulation disabled.";
            }
        }
    });
}
function setupChat() {
    const chatInput = getInputElement('chat-input');
    const chatOutput = getElement('chat-output');
    if (!chatInput || !chatOutput) {
        console.warn("Chat elements not found.");
        return;
    }
    chatInput.disabled = criticalError;
    chatInput.placeholder = criticalError ? "Simulation disabled." : "Interact with the simulation...";
    chatInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && chatInput.value.trim() && !criticalError && agent && environment) {
            const userInput = chatInput.value.trim();
            appendChatMessage('You', userInput);
            chatInput.value = '';
            chatInput.disabled = true; // Disable input during processing
            try {
                // Environment returns kept tensor or null
                const impactTensor = await environment.getEmotionalImpactFromText(userInput);
                logToTimeline(`Chat Input: "${userInput.substring(0, 25)}..."`, 'expressions-list');
                appendChatMessage('System', 'Input processed, influencing environment state.');
                lastChatImpactTime = appClock.getElapsedTime();
                safeDispose(impactTensor); // Dispose the tensor after use
            }
            catch (chatError) {
                console.error("Error processing chat input:", chatError);
                appendChatMessage('System', 'Error processing input.');
            }
            finally {
                chatInput.disabled = criticalError; // Re-enable (or keep disabled if critical error occurred)
            }
        }
        else if (e.key === 'Enter' && (!agent || !environment)) {
            appendChatMessage('System', 'Environment/Agent not ready for interaction.');
        }
    });
}
function setupInspectorToggle() {
    const toggleButton = getElement('toggle-inspector');
    const inspectorPanel = getElement('tensor-inspector-panel');
    const inspectorContent = getElement('tensor-inspector-content');
    if (toggleButton && inspectorPanel && inspectorContent) {
        toggleButton.addEventListener('click', async () => {
            const isVisible = inspectorPanel.classList.toggle('visible');
            toggleButton.setAttribute('aria-expanded', String(isVisible));
            if (isVisible && agent) {
                let beliefEmbeddingTensor = null;
                try {
                    beliefEmbeddingTensor = agent.getLatestBeliefEmbedding(); // Returns disposable clone or null
                    await inspectTensor(beliefEmbeddingTensor, 'tensor-inspector-content'); // Await inspection
                }
                catch (e) {
                    console.error("Error getting/inspecting tensor:", e);
                    await inspectTensor(`[Error: ${e instanceof Error ? e.message : String(e)}]`, 'tensor-inspector-content');
                }
                finally {
                    safeDispose(beliefEmbeddingTensor); // Dispose the clone after inspection
                }
            }
            else if (isVisible) {
                await inspectTensor(null, 'tensor-inspector-content'); // Show null if agent unavailable
            }
        });
        toggleButton.setAttribute('aria-expanded', String(inspectorPanel.classList.contains('visible')));
    }
    else {
        console.warn("Tensor inspector toggle/panel/content elements not found.");
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
        // Agent state now includes check for internal errors during serialization potentially
        if (!envState || !agentState || agentState.error) {
            throw new Error(`Failed to retrieve state: ${agentState?.error || 'Agent/Env state missing'}`);
        }
        const stateToSave = {
            version: "2.3.1", // Match version check in loadState
            timestamp: new Date().toISOString(),
            environment: envState,
            agent: agentState,
            metrics: {
                rih: simulationMetrics.currentRIHScore,
                affinity: simulationMetrics.currentAvgAffinity,
                trust: simulationMetrics.currentTrustScore,
                context: simulationMetrics.currentContext,
                intParam: simulationMetrics.currentIntegrationParam, // Save params used by agent
                refParam: simulationMetrics.currentReflexivityParam,
            }
        };
        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave));
        console.log(`Simulation state (V${stateToSave.version}) saved.`);
        appendChatMessage('System', 'Simulation state saved.');
        logToTimeline('State Saved', 'expressions-list');
        const loadButton = getElement('load-state-button');
        if (loadButton)
            loadButton.classList.add('has-saved-state');
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("Error saving state:", e);
        appendChatMessage('System', `Save failed: ${message}`);
        displayError(`Error saving state: ${message}`, false, 'error-message');
    }
}
// Made async to allow awaiting agent.loadState
async function loadState(showMessages = false) {
    criticalError = true; // Halt simulation during load
    if (animationFrameId)
        cancelAnimationFrame(animationFrameId);
    animationFrameId = null; // Stop loop if running
    if (!agent || !environment) {
        console.warn("Agent/Environment not initialized, cannot load state.");
        if (showMessages)
            appendChatMessage('System', 'Load failed: Simulation components not ready.');
        criticalError = false; // Allow potential re-init or start
        return false;
    }
    const stateString = localStorage.getItem(SAVED_STATE_KEY);
    if (!stateString) {
        console.log("No saved state found in localStorage.");
        if (showMessages)
            appendChatMessage('System', 'No saved state found.');
        criticalError = false;
        return false;
    }
    try {
        const stateToLoad = JSON.parse(stateString);
        if (!stateToLoad || stateToLoad.version !== "2.3.1") { // Match saved version key
            throw new Error(`Incompatible state version: ${stateToLoad?.version}. Expected 2.3.1`);
        }
        if (!stateToLoad.environment || !stateToLoad.agent) {
            throw new Error("Saved state is missing critical environment or agent data.");
        }
        console.log(`Loading state V${stateToLoad.version} saved at ${stateToLoad.timestamp}...`);
        // --- Load State into Components ---
        environment.loadState(stateToLoad.environment); // Load env first
        await agent.loadState(stateToLoad.agent); // Await agent load (handles internal TF setup)
        // --- Restore Simulation Metrics from Loaded Agent/Env State ---
        simulationMetrics.currentStateVector = environment.currentStateVector; // Get vector from loaded env
        // Restore emotions from agent's loaded state
        safeDispose(simulationMetrics.currentAgentEmotions); // Dispose old tensor
        if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
            simulationMetrics.currentAgentEmotions = tf.keep(agent.prevEmotions.clone()); // Keep clone from agent
        }
        else {
            console.warn("Agent prevEmotions tensor invalid after load. Resetting to zeros.");
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }
        simulationMetrics.currentRIHScore = agent.lastRIH; // Use agent's loaded value
        simulationMetrics.currentTrustScore = agent.latestTrustScore; // Use agent's loaded value
        simulationMetrics.currentIntegrationParam = agent.getScalarParam('integrationParam'); // Use public method
        simulationMetrics.currentReflexivityParam = agent.getScalarParam('reflexivityParam'); // Use public method
        simulationMetrics.currentAvgAffinity = stateToLoad.metrics?.affinity ?? 0; // Restore from metrics or default
        simulationMetrics.currentContext = "State loaded.";
        simulationMetrics.currentHmLabel = "idle"; // Reset on load
        simulationMetrics.currentCascadeHistory = []; // Reset on load
        simulationMetrics.currentBeliefNorm = 0.0; // Recalculated on next step
        simulationMetrics.currentSelfStateNorm = agent.selfState ? norm(toNumberArray(agent.selfState.dataSync())) : 0.0; // Calc from loaded state
        // --- Reset / Update UI ---
        if (metricsChart) {
            metricsChart.data.datasets.forEach((dataset) => dataset.data = []);
            metricsChart.update('quiet');
        }
        const timelineList = getElement('expressions-list');
        if (timelineList)
            timelineList.innerHTML = ''; // Clear timeline
        logToTimeline('State Loaded', 'expressions-list');
        updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);
        updateDashboardDisplay();
        if (simulationMetrics.currentAgentEmotions)
            await updateEmotionBars(simulationMetrics.currentAgentEmotions); // await UI update
        updateCascadeViewer();
        if (agent.selfState)
            updateHeatmap(toNumberArray(agent.selfState.dataSync()), 'heatmap-content');
        // --- Update Visualizations (Use Frame Clone Pattern) ---
        let loadFrameEmotions = null;
        if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
            loadFrameEmotions = tf.keep(simulationMetrics.currentAgentEmotions.clone());
        }
        else if (typeof tf !== 'undefined') {
            loadFrameEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }
        if (threeInitialized) { // Syntrometry
            updateThreeJS(0, simulationMetrics.currentStateVector, simulationMetrics.currentRIHScore, agent.latestAffinities || [], simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, [], simulationMetrics.currentContext);
            updateSyntrometryInfoPanel();
        }
        if (conceptInitialized) { // Concepts
            updateAgentSimulationVisuals(loadFrameEmotions, simulationMetrics.currentRIHScore, simulationMetrics.currentAvgAffinity, simulationMetrics.currentHmLabel, simulationMetrics.currentTrustScore);
            animateConceptNodes(0, simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, -1, -1, -1);
        }
        if (live2dInitialized) { // Live2D
            if (loadFrameEmotions)
                updateLive2DEmotions(toLive2DFormat(loadFrameEmotions.dataSync()));
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, 0);
            updateLive2D(0); // Render update
        }
        safeDispose(loadFrameEmotions); // Dispose frame clone
        if (showMessages)
            appendChatMessage('System', 'Simulation state loaded successfully.');
        console.log(`Simulation state loaded successfully.`);
        criticalError = false; // Load successful, allow animation to restart
        // Restart animation loop
        requestAnimationFrame(animate);
        return true;
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("Error loading state:", e);
        if (showMessages)
            appendChatMessage('System', `Load failed: ${message}`);
        displayError(`Load failed: ${message}. Check console.`, false, 'error-message');
        criticalError = false; // Allow potential re-init or restart attempt
        // If loop was stopped, potentially restart it even on failure? Or require manual start?
        // requestAnimationFrame(animate); // Optional: restart loop even on load fail
        return false;
    }
}
// --- Main Animation Loop ---
async function animate() {
    if (criticalError) {
        console.warn("Animation loop stopped due to critical error.");
        // Ensure loop doesn't restart itself
        if (animationFrameId)
            cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        disableControls(); // Ensure controls are disabled
        return;
    }
    // Schedule next frame immediately
    animationFrameId = requestAnimationFrame(animate);
    const deltaTime = appClock.getDelta();
    const elapsedTime = appClock.getElapsedTime();
    // Tensor to use for *this frame's rendering* - created by cloning agent output
    let currentFrameEmotions = null;
    // --- Simulation Step ---
    if (agent && environment && simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
        let envStepResult = null;
        let agentResponse = null;
        try {
            // 1. Environment Step
            const envStepResult = environment ?
                await environment.step(simulationMetrics.currentAgentEmotions, simulationMetrics.currentRIHScore, simulationMetrics.currentAvgAffinity) : null;
            if (!envStepResult) {
                console.error("Environment step returned null result");
                return; // Exit early if no result
            }
            const envStateTensor = envStepResult.state; // This is a kept clone
            if (!envStateTensor || envStateTensor.isDisposed) {
                throw new Error("Environment returned invalid state tensor in step.");
            }
            // Use async helper and dispose env tensor after getting data
            const envStateArray = await tensorToArrayAsync(envStateTensor);
            safeDispose(envStateTensor); // Dispose the env's kept clone
            if (envStateArray.length !== Config.Agent.BASE_STATE_DIM) {
                throw new Error(`Env state array length mismatch (${envStateArray.length}). Expected ${Config.Agent.BASE_STATE_DIM}.`);
            }
            simulationMetrics.currentStateVector = envStateArray; // Update state
            // 2. Agent Processing Step
            const graphFeatures = calculateGraphFeatures();
            agentResponse = await agent.process(simulationMetrics.currentStateVector, graphFeatures, {
                eventType: envStepResult.eventType,
                reward: envStepResult.reward
            });
            // agentResponse.emotions is the agent's *new kept* internal state tensor for emotions
            // 3. Manage Emotion Tensors for State & Rendering
            // Dispose the *previous* frame's main simulation tensor *before* assigning the new one
            safeDispose(simulationMetrics.currentAgentEmotions);
            // Update the main simulation state with the new kept tensor from agentResponse
            simulationMetrics.currentAgentEmotions = agentResponse.emotions; // Takes ownership of the kept tensor
            // Clone the new main tensor for this frame's rendering needs
            const emotionsTensor = simulationMetrics.currentAgentEmotions;
            if (emotionsTensor && !emotionsTensor.isDisposed) {
                currentFrameEmotions = tf.keep(emotionsTensor.clone());
            }
            else {
                // Should not happen if agent.process works, but handle defensively
                console.error("Agent returned invalid emotion tensor!");
                if (typeof tf !== 'undefined') {
                    // Create a new tensor and store it
                    const zerosTensor = tf.zeros([1, Config.Agent.EMOTION_DIM]);
                    // Keep it for the simulation state
                    simulationMetrics.currentAgentEmotions = tf.keep(zerosTensor);
                    // Create a separate clone for the current frame
                    currentFrameEmotions = tf.keep(zerosTensor.clone());
                }
                else {
                    simulationMetrics.currentAgentEmotions = null;
                    currentFrameEmotions = null;
                }
                criticalError = true; // Treat as critical
            }
            // 4. Update Other Metrics from Agent Response
            simulationMetrics.currentRIHScore = agentResponse.rihScore;
            simulationMetrics.currentAvgAffinity = (agentResponse.affinities?.length > 0) ? agentResponse.affinities.reduce((a, b) => a + b, 0) / agentResponse.affinities.length : 0;
            const hmLabel = agentResponse.hmLabel;
            simulationMetrics.currentHmLabel = isValidHeadMovement(hmLabel) ? hmLabel : "idle";
            simulationMetrics.currentContext = envStepResult ? envStepResult.context : "No context available";
            simulationMetrics.currentCascadeHistory = agentResponse.cascadeHistory || [];
            simulationMetrics.currentIntegrationParam = agentResponse.integration;
            simulationMetrics.currentReflexivityParam = agentResponse.reflexivity;
            simulationMetrics.currentTrustScore = agentResponse.trustScore;
            simulationMetrics.currentBeliefNorm = agentResponse.beliefNorm ?? 0.0;
            simulationMetrics.currentSelfStateNorm = agentResponse.selfStateNorm ?? 0.0;
            // Update sliders only if needed (values derived from agent params now)
            updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);
        }
        catch (e) {
            console.error("Error during simulation step:", e);
            displayError(`Simulation Step Error: ${e instanceof Error ? e.message : String(e)}. Attempting recovery.`, false, 'error-message');
            // Dispose potentially invalid frame clone if created before error
            safeDispose(currentFrameEmotions);
            currentFrameEmotions = null;
            // Attempt to recover main emotion state if it became invalid
            const mainEmotionsTensor = simulationMetrics.currentAgentEmotions;
            if (!mainEmotionsTensor || mainEmotionsTensor.isDisposed) {
                if (typeof tf !== 'undefined') {
                    console.warn("Agent emotions tensor invalid during error, resetting to zeros.");
                    simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Reset main state
                }
                else {
                    simulationMetrics.currentAgentEmotions = null;
                    criticalError = true;
                    displayError("TensorFlow unavailable during error recovery. Stopping simulation.", true, 'error-message');
                }
            }
            // Ensure currentFrameEmotions is valid for rendering (clone potentially recovered state)
            const updatedEmotionsTensor = simulationMetrics.currentAgentEmotions;
            if (updatedEmotionsTensor && !updatedEmotionsTensor.isDisposed) {
                currentFrameEmotions = tf.keep(updatedEmotionsTensor.clone());
            }
            else if (!criticalError && typeof tf !== 'undefined') {
                // If not critical but tensor is bad, create zeros clone for frame
                const zerosTensor = tf.zeros([1, Config.Agent.EMOTION_DIM]);
                currentFrameEmotions = tf.keep(zerosTensor);
            } // If critical error or no TF, currentFrameEmotions remains null
            simulationMetrics.currentContext = "Simulation error occurred.";
            // Avoid updating other possibly inconsistent metrics
            if (criticalError) { // If error was critical, stop the loop now
                if (animationFrameId)
                    cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
                return;
            }
        }
    }
    else {
        // Handle case where simulation prerequisites aren't met (e.g., initial load failed)
        // Ensure emotion state and frame clone are valid or null
        const prereqEmotionsTensor = simulationMetrics.currentAgentEmotions;
        if (!prereqEmotionsTensor || prereqEmotionsTensor.isDisposed) {
            if (typeof tf !== 'undefined') {
                console.warn("Initializing/Resetting simulation emotions in animation loop (prereq failed).");
                safeDispose(simulationMetrics.currentAgentEmotions);
                simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            }
            else {
                simulationMetrics.currentAgentEmotions = null;
                criticalError = true;
                displayError("TensorFlow unavailable. Stopping simulation.", true, 'error-message');
            }
        }
        // Create frame clone if possible
        const finalEmotionsTensor = simulationMetrics.currentAgentEmotions;
        if (finalEmotionsTensor && !finalEmotionsTensor.isDisposed) {
            currentFrameEmotions = tf.keep(finalEmotionsTensor.clone());
        }
        else if (!criticalError && typeof tf !== 'undefined') {
            // Create a new zeros tensor directly
            const zerosTensor = tf.zeros([1, Config.Agent.EMOTION_DIM]);
            currentFrameEmotions = tf.keep(zerosTensor);
        }
        else {
            currentFrameEmotions = null; // No TF or critical error
        }
        if (!agent || !environment)
            simulationMetrics.currentContext = "Simulation components missing.";
        if (criticalError) { // Stop loop if critical error identified here
            if (animationFrameId)
                cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
            return;
        }
    }
    // --- Update UI and Visualizations ---
    // Use the kept clone `currentFrameEmotions` for all UI updates this frame
    updateDashboardDisplay();
    updateMetricsChart();
    if (currentFrameEmotions)
        await updateEmotionBars(currentFrameEmotions); // Pass frame clone
    updateCascadeViewer();
    // Update Syntrometry Viz
    try {
        if (threeInitialized) {
            updateThreeJS(deltaTime, simulationMetrics.currentStateVector, simulationMetrics.currentRIHScore, agent?.latestAffinities || [], simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, simulationMetrics.currentCascadeHistory, simulationMetrics.currentContext);
            updateSyntrometryInfoPanel();
        }
    }
    catch (e) {
        console.error("Error updating Syntrometry Viz:", e);
    }
    // Update Concept Viz
    try {
        if (conceptInitialized) {
            updateAgentSimulationVisuals(currentFrameEmotions, simulationMetrics.currentRIHScore, simulationMetrics.currentAvgAffinity, simulationMetrics.currentHmLabel, simulationMetrics.currentTrustScore);
            animateConceptNodes(appClock.getElapsedTime(), simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, elapsedTime - lastIntegrationInputTime, // Pass raw time difference
            elapsedTime - lastReflexivityInputTime, elapsedTime - lastChatImpactTime
            // Let animateConceptNodes handle the duration check
            );
            if (conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
                conceptRenderer.render(conceptScene, conceptCamera);
                conceptLabelRenderer.render(conceptScene, conceptCamera);
            }
            conceptControls?.update();
        }
    }
    catch (e) {
        console.error("Error updating/rendering Concept Viz:", e);
    }
    // Update Live2D Avatar
    try {
        if (live2dInitialized && currentFrameEmotions) {
            updateLive2DEmotions(toNumberArray(currentFrameEmotions.dataSync()));
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, deltaTime);
            updateLive2D(deltaTime);
        }
    }
    catch (e) {
        console.error("Error updating Live2D:", e);
    }
    // Update Heatmap
    let selfStateData = [];
    if (agent?.selfState && !agent.selfState.isDisposed) {
        try {
            selfStateData = tensorToArray(agent.selfState);
        } // Use safe util
        catch (e) {
            console.error("Heatmap update failed:", e);
        }
    }
    updateHeatmap(selfStateData, 'heatmap-content');
    // Update Tensor Inspector
    const inspectorPanel = getElement('tensor-inspector-panel');
    if (inspectorPanel?.classList.contains('visible') && agent) {
        let beliefEmbeddingTensor = null;
        try {
            beliefEmbeddingTensor = agent.getLatestBeliefEmbedding(); // Returns disposable clone or null
            await inspectTensor(beliefEmbeddingTensor, 'tensor-inspector-content'); // Await inspection
        }
        catch (e) {
            await inspectTensor(`[Error: ${e instanceof Error ? e.message : String(e)}]`, 'tensor-inspector-content');
        }
        finally {
            safeDispose(beliefEmbeddingTensor); // Dispose the clone after inspection
        }
    }
    // --- Dispose the temporary clone used for this frame's updates ---
    safeDispose(currentFrameEmotions);
} // End animate()
// --- Cleanup ---
function cleanup() {
    console.log("Cleaning up application resources (V2.3)...");
    criticalError = true; // Prevent animation loop from restarting during cleanup
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    // Remove global listeners
    window.removeEventListener('resize', resizeConceptGraphRenderer);
    window.removeEventListener('beforeunload', cleanup);
    // Destroy chart
    if (metricsChart) {
        try {
            metricsChart.destroy();
            metricsChart = null;
        }
        catch (e) {
            console.error("Chart destroy error:", e);
        }
    }
    // Cleanup visualizations and core components
    try {
        cleanupLive2D();
    }
    catch (e) {
        console.error("Live2D cleanup error:", e);
    }
    try {
        cleanupConceptVisualization();
    }
    catch (e) {
        console.error("ConceptViz cleanup error:", e);
    }
    try {
        cleanupThreeJS();
    }
    catch (e) {
        console.error("ThreeJS (Syntrometry) cleanup error:", e);
    }
    try {
        agent?.cleanup();
        agent = null;
    }
    catch (e) {
        console.error("Agent cleanup error:", e);
    }
    try {
        environment?.cleanup();
        environment = null;
    }
    catch (e) {
        console.error("Environment cleanup error:", e);
    }
    // Dispose global simulation state tensor
    safeDispose(simulationMetrics.currentAgentEmotions);
    simulationMetrics.currentAgentEmotions = null;
    simulationMetrics.currentStateVector = null;
    console.log("Application cleanup complete.");
}
// --- Global Event Listeners ---
window.addEventListener('load', initialize);
window.addEventListener('beforeunload', cleanup); // Ensure cleanup runs when closing tab/window
// --- END OF FILE app.ts ---

/**
 * Gets a canvas element by ID
 * @param {string} id - The ID of the canvas element
 * @returns {HTMLCanvasElement|null} - The canvas element or null if not found
 */
function getCanvasElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Canvas element with ID "${id}" not found`);
    return null;
  }
  
  if (element.tagName.toLowerCase() !== 'canvas') {
    console.warn(`Element with ID "${id}" is not a canvas element`);
    return null;
  }
  
  return element;
}

/**
 * Gets an element by ID
 * @param {string} id - The ID of the element
 * @returns {HTMLElement|null} - The element or null if not found
 */
function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element with ID "${id}" not found`);
    return null;
  }
  return element;
}

/**
 * Updates an element's content
 * @param {string} id - The ID of the element
 * @param {number|string} value - The value to display
 * @param {string} [prefix=''] - Optional prefix to add before the value
 */
function updateElement(id, value, prefix = '') {
  const element = getElement(id);
  if (element) {
    if (typeof value === 'number') {
      // Format number to 3 decimal places
      element.textContent = prefix + value.toFixed(3);
    } else {
      element.textContent = prefix + value;
    }
  }
}

/**
 * Gets an input element by ID
 * @param {string} id - The ID of the input element
 * @returns {HTMLInputElement|null} - The input element or null if not found
 */
function getInputElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Input element with ID "${id}" not found`);
    return null;
  }
  
  if (!(element instanceof HTMLInputElement)) {
    console.warn(`Element with ID "${id}" is not an input element`);
    return null;
  }
  
  return element;
}

/**
 * Gets a button element by ID
 * @param {string} id - The ID of the button element
 * @returns {HTMLButtonElement|null} - The button element or null if not found
 */
function getButtonElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Button element with ID "${id}" not found`);
    return null;
  }
  
  if (!(element instanceof HTMLButtonElement)) {
    console.warn(`Element with ID "${id}" is not a button element`);
    return null;
  }
  
  return element;
}

/**
 * Gets a progress element by ID
 * @param {string} id - The ID of the progress element
 * @returns {HTMLProgressElement|null} - The progress element or null if not found
 */
function getProgressElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Progress element with ID "${id}" not found`);
    return null;
  }
  
  if (!(element instanceof HTMLProgressElement)) {
    console.warn(`Element with ID "${id}" is not a progress element`);
    return null;
  }
  
  return element;
}











