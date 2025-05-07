// js/uiManager.js

// Import update functions for different UI parts
import {
    updateDashboardDisplay as appUpdateDashboardDisplay,
    updateEmotionBars as appUpdateEmotionBars,
    updateHeatmap as appUpdateHeatmap,
    updateCascadeViewer as appUpdateCascadeViewer,
    updateSliderDisplays as appUpdateSliderDisplays,
} from './app.js'; // Assuming exported from app.js

import {
    updateThreeJS, updateSyntrometryInfoPanel
} from './viz-syntrometry.js';
import {
    updateAgentSimulationVisuals, animateConceptNodes,
    // updateInfoPanel as updateConceptInfoPanel, // Info panel update logic is usually self-contained within viz module
    renderConceptVisualization, isConceptVisualizationReady,
    conceptControls
} from './viz-concepts.js';
import {
    updateLive2DEmotions, updateLive2DHeadMovement, updateLive2D
    // REMOVED incorrect import: isLive2DReady
} from './viz-live2d.js'; // Assuming live2d module exports a check function or use live2dInitialized directly

import { Config } from './config.js'; // Config might be needed by some update functions
import { zeros } from './utils.js'; // Utils might be needed


/**
 * Main function to update all relevant UI components based on the simulation state.
 * This acts as a central dispatcher for UI updates.
 *
 * @param {object} simulationMetrics - The global simulation metrics object from app.js.
 * @param {object} agent - The agent instance (needed for selfState, latestAffinities, etc.).
 * @param {tf.Tensor|null} currentEmotionsTensorForViz - The kept emotion tensor clone for this frame's visualization.
 * @param {number} deltaTime - Time since last frame in seconds.
 * @param {object} timeRefs - Object containing time-related data: { elapsedTime, lastIntegrationInputTime, lastReflexivityInputTime, lastChatImpactTime, inputFeedbackDuration }.
 * @param {boolean} syntrometryReady - Flag indicating if Syntrometry viz is initialized.
 * @param {boolean} conceptsReady - Flag indicating if Concept viz is initialized.
 * @param {boolean} live2dReady - Flag indicating if Live2D viz is initialized.
 */
export function updateAllUI(
    simulationMetrics,
    agent,
    currentEmotionsTensorForViz,
    deltaTime,
    timeRefs,
    syntrometryReady, // Use flags passed from app.js
    conceptsReady,
    live2dReady // Use flag passed from app.js
) {
    // --- Basic UI Panels ---
    try {
        appUpdateDashboardDisplay(simulationMetrics);
        appUpdateEmotionBars(currentEmotionsTensorForViz); // Pass the tensor
        appUpdateCascadeViewer(simulationMetrics.currentCascadeHistory);
        // Slider displays reflect agent's internal state, updated here for consistency
        appUpdateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);
    } catch (e) { console.error("Error updating basic UI panels:", e); }

    // --- Heatmap (requires agent's selfState) ---
    try {
        let selfStateData = []; // Default to empty array
        if (agent?.selfState && !agent.selfState.isDisposed) {
             try { selfStateData = Array.from(agent.selfState.dataSync()); }
             catch (syncError) { console.error("Error during selfState.dataSync():", syncError); }
        }
        appUpdateHeatmap(selfStateData, 'heatmap-content');
    } catch (e) { console.error("Heatmap update failed in uiManager:", e); }

    // --- Syntrometry Visualization ---
    try {
        if (syntrometryReady) { // Check flag passed from app.js
            updateThreeJS(
                deltaTime,
                simulationMetrics.currentStateVector,
                simulationMetrics.currentRIHScore,
                agent?.latestAffinities || [], // Use agent's cache or empty array
                simulationMetrics.currentIntegrationParam,
                simulationMetrics.currentReflexivityParam,
                simulationMetrics.currentCascadeHistory,
                simulationMetrics.currentContext
            );
            updateSyntrometryInfoPanel(); // Reads latest cached state internally
        }
    } catch (e) { console.error("Error updating Syntrometry Viz (uiManager):", e); }

    // --- Concept Visualization ---
    try {
        if (isConceptVisualizationReady()) { // Use check function from concepts module
            updateAgentSimulationVisuals(
                currentEmotionsTensorForViz, // Pass the tensor
                simulationMetrics.currentRIHScore,
                simulationMetrics.currentAvgAffinity,
                simulationMetrics.currentHmLabel,
                simulationMetrics.currentTrustScore
            );
            animateConceptNodes(deltaTime, simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam,
                 timeRefs.elapsedTime - timeRefs.lastIntegrationInputTime < timeRefs.inputFeedbackDuration ? timeRefs.lastIntegrationInputTime : -1,
                 timeRefs.elapsedTime - timeRefs.lastReflexivityInputTime < timeRefs.inputFeedbackDuration ? timeRefs.lastReflexivityInputTime : -1,
                 timeRefs.elapsedTime - timeRefs.lastChatImpactTime < timeRefs.inputFeedbackDuration ? timeRefs.lastChatImpactTime : -1
            );
            // Call the exported render function from viz-concepts
             renderConceptVisualization();
            
            // Add this line to update controls
            if (conceptControls) {
                conceptControls.update(); // Apply control changes (damping, target focus)
            }
        }
    } catch (e) { console.error("Error updating/rendering Concept Viz (uiManager):", e); }

    // --- Live2D Avatar ---
    try {
        // Use the flag passed from app.js
        if (live2dReady) {
            updateLive2DEmotions(currentEmotionsTensorForViz); // Pass the tensor
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, deltaTime);
            updateLive2D(deltaTime); // General update (expressions, internal lerping)
        }
    } catch (e) { console.error("Error updating Live2D (uiManager):", e); }
}
