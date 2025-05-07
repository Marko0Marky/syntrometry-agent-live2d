import { Config } from './config.js';
import { displayError, zeros } from './utils.js';

const SAVED_STATE_KEY = 'syntrometrySimulationState_v2_3_1';

/**
 * Saves the current simulation state to localStorage
 * @param {Object} agent - The agent instance
 * @param {Object} environment - The environment instance
 * @param {Object} simulationMetrics - Current simulation metrics from app.js
 * @returns {boolean} - Success status
 */
export function saveSimulationState(agent, environment, simulationMetrics) {
    if (!agent || !environment) {
        console.warn("Cannot save state: Simulation components not ready.");
        return false;
    }

    try {
        const envState = environment.getState(); // { currentStateVector, baseEmotions, ... }
        const agentState = agent.getState();     // { prevEmotions, memoryBuffer, params, weights ... }

        if (!envState || !agentState) {
            throw new Error("Failed to retrieve state from environment or agent.");
        }
        if (agentState.error) { // Check if agent itself reported an error during getState
            throw new Error(`Agent state retrieval error: ${agentState.error}`);
        }

        // Construct the state object to save
        const stateToSave = {
            version: "2.3.1",
            timestamp: new Date().toISOString(),
            environment: envState,
            agent: agentState,
            // Save key simulation metrics that are part of app.js's state,
            // not directly part of agent/env internal state.
            // Agent parameters (integration/reflexivity) are saved within agentState.
            metrics: {
                rih: simulationMetrics.currentRIHScore,
                affinity: simulationMetrics.currentAvgAffinity,
                trust: simulationMetrics.currentTrustScore, // Agent's trust score
                context: simulationMetrics.currentContext,
                hmLabel: simulationMetrics.currentHmLabel,
                // Note: No need to save currentStateVector (in envState) or currentAgentEmotions (saved as agent.prevEmotions)
                // Norms (belief/self) are derived dynamically.
                // Params (integration/reflexivity) are saved within agent.getState().
            }
        };

        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave));
        console.log(`Simulation state (V${stateToSave.version}) saved to localStorage (Key: ${SAVED_STATE_KEY}).`);

        return true;
    } catch (e) {
        console.error("Error saving state:", e);
        displayError(`Error saving state: ${e.message}`, false, 'error-message');
        return false;
    }
}

/**
 * Loads a saved simulation state from localStorage.
 * Does NOT directly modify agent/environment. Returns the data.
 * @returns {Object} - Result object: { success: boolean, message: string, data: Object | null }
 *                    'data' contains { environmentState, agentState, metrics } if successful.
 */
export function loadSimulationStateData() {
    const stateString = localStorage.getItem(SAVED_STATE_KEY);
    if (!stateString) {
        return { success: false, message: "No saved state found", data: null };
    }

    try {
        const loadedData = JSON.parse(stateString);

        // --- Validation ---
        if (!loadedData || typeof loadedData !== 'object') {
            throw new Error("Invalid saved state format: Not an object.");
        }
        if (loadedData.version !== "2.3.1") {
            const errorMsg = `Incompatible saved state version (Found: ${loadedData.version}, Expected: 2.3.1). Aborting load.`;
            console.warn(errorMsg); // Warn instead of error to potentially allow manual migration later
            // displayError(`Load warning: ${errorMsg}`, false, 'error-message'); // UI notification optional
            return { success: false, message: errorMsg, data: null };
        }
        if (!loadedData.environment || !loadedData.agent || !loadedData.metrics) {
            throw new Error("Saved state is missing critical environment, agent, or metrics data.");
        }
        if (loadedData.agent.error) { // Check if saved agent state itself had an error
             throw new Error(`Loaded agent state contains error: ${loadedData.agent.error}`);
        }
        // Add more specific validation for environment/agent/metrics structure if needed

        console.log(`Retrieved state V${loadedData.version} saved at ${loadedData.timestamp} for loading...`);

        // Return the raw data needed by app.js to restore state
        return {
            success: true,
            message: "Saved state data retrieved successfully",
            data: {
                environmentState: loadedData.environment,
                agentState: loadedData.agent,
                metrics: loadedData.metrics
            }
        };

    } catch (e) {
        console.error("Error parsing or validating loaded state data:", e);
        displayError(`Load data failed: ${e.message}. Check console for details.`, false, 'error-message');
        // Attempt to remove potentially corrupted state? Or leave it for manual inspection.
        // localStorage.removeItem(SAVED_STATE_KEY); // Use with caution
        return { success: false, message: e.message, data: null };
    }
}


/**
 * Checks if a saved state exists and matches the current version.
 * @returns {boolean} - Whether a valid saved state exists.
 */
export function hasSavedState() {
    const stateString = localStorage.getItem(SAVED_STATE_KEY);
    if (!stateString) return false;
    try {
        const state = JSON.parse(stateString);
        return state && state.version === "2.3.1"; // Check version compatibility
    } catch (e) {
        console.warn("Error parsing saved state for check:", e);
        return false; // Treat invalid JSON as no valid state
    }
}

/**
 * Gets information about the saved state without loading it.
 * @returns {Object|null} - Basic info about the saved state or null if none exists or is invalid.
 */
export function getSavedStateInfo() {
    const stateString = localStorage.getItem(SAVED_STATE_KEY);
    if (!stateString) return null;

    try {
        const state = JSON.parse(stateString);
        // Return info only if structure and version seem correct
        if (state && state.version && state.timestamp && state.metrics) {
            return {
                version: state.version,
                timestamp: state.timestamp,
                metrics: state.metrics // Saved high-level metrics
            };
        } else {
            return null; // Invalid structure
        }
    } catch (e) {
        console.error("Error parsing saved state info:", e);
        return null; // Invalid JSON
    }
}
