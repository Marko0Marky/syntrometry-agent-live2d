// js/environment.js

import * as tf from '@tensorflow/tfjs'; // Use consistent TFJS import
import { Config, emotionKeywords, emotionNames } from './config.js';
import { zeros, clamp, displayError } from './utils.js';
import { safeDispose, tensorToArray, safeGetScalar, containsNaNOrInf } from './tensorUtils.js';

/**
 * Represents the simulation environment, managing state, events, and rewards.
 */
export class EmotionalSpace {
    constructor() {
        try {
            // First check global scope
            let tfjs = (typeof tf !== 'undefined') ? tf : null;
            
            // If not found, check window scope
            if (!tfjs && typeof window !== 'undefined' && typeof window.tf !== 'undefined') {
                tfjs = window.tf;
                console.log("[Environment] Using TensorFlow.js from window scope");
            }
            
            if (!tfjs) {
                throw new Error("[Environment] TensorFlow.js is required but not available in any scope");
            }
            
            // Make tf available in this module's scope if it wasn't
            if (typeof tf === 'undefined') {
                window.tf = tfjs;
            }
            
            // Store the TensorFlow instance
            this.tf = tfjs;
            
            // Continue with initialization
            this._validateConfig();
            this._initializeState();
        } catch (error) {
            console.error("Environment initialization failed:", error);
            throw new Error("Environment Config validation failed. Check console.");
        }
    }

    _validateConfig() {
        // Calculate default BASE_STATE_DIM based on other defaults
        const defaultDims = 12;
        const defaultEmoDim = 6;
        const defaultBaseStateDim = defaultDims + defaultEmoDim;

        // Check if Config exists
        if (!Config) {
            throw new Error("Config object is missing");
        }

        // Check if Config.Env exists
        if (!Config.Env || typeof Config.Env !== 'object') {
            throw new Error("Config.Env object is missing or not an object");
        }

        const requiredProps = [
            { path: 'Agent.EMOTION_DIM', default: defaultEmoDim, type: 'number'},
            { path: 'Agent.BASE_STATE_DIM', default: defaultBaseStateDim, type: 'number' },
            { path: 'Env.EVENT_GAP', default: 180, type: 'number' },
            { path: 'Env.EVENT_DURATION', default: 120, type: 'number' },
            { path: 'Env.EVENT_FREQ', default: 0.015, type: 'number' },
            { path: 'Env.BASE_EMOTION_DRIFT_RATE', default: 0.005, type: 'number' },
            { path: 'Env.BASE_EMOTION_REVERSION_RATE', default: 0.001, type: 'number' },
            { path: 'DIMENSIONS', default: defaultDims, type: 'number' },
            { path: 'DYSVARIANT_PROB', default: 0.02, type: 'number' }
        ];

        const errors = [];
        
        for (const { path, default: defaultValue, type } of requiredProps) {
            const parts = path.split('.');
            let current = Config;
            let currentPath = 'Config';
            let found = true;
            
            for (const part of parts) {
                currentPath += `.${part}`;
                if (current && typeof current === 'object' && current !== null && part in current && current[part] !== undefined) {
                    current = current[part];
                } else {
                    // Check if the specific key 'Env' was the issue if path starts with Env
                    if (parts.length > 1 && parts[0] === 'Env' && !(part in (Config.Env || {}))) {
                        errors.push(`Missing Config.Env or Config.Env.${part}`);
                    } else {
                        errors.push(`Missing or undefined: ${currentPath}`);
                    }
                    found = false;
                    break;
                }
            }
            
            if (found && typeof current !== type) {
                errors.push(`Wrong type for ${currentPath}: Expected ${type}, got ${typeof current}`);
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Validation failed:\n- ${errors.join('\n- ')}`);
        }
        
        console.log("Environment config validation passed");
        return true;
    }

    _initializeState() {
        this.stepCount = 0;
        this.eventTimer = 0;
        this.gapTimer = Config.Env.EVENT_GAP;
        this.currentEvent = null;

        // Safely dispose previous tensor if exists
        if (this.baseEmotions && !this.baseEmotions.isDisposed) {
            try {
                this.baseEmotions.dispose();
            } catch (e) {
                console.warn("Error disposing baseEmotions tensor:", e);
            }
        }

        // Example initial base emotions, ensure length matches EMOTION_DIM
        const initialBase = [0.6, 0.1, 0.3, 0.1, 0.5, 0.2];
        const sizedInitialBase = initialBase.slice(0, Config.Agent.EMOTION_DIM);
        while (sizedInitialBase.length < Config.Agent.EMOTION_DIM) sizedInitialBase.push(0.5);
        
        const tf = window.tf;
        if (!tf) {
            throw new Error("TensorFlow.js not available for state initialization");
        }
        
        this.baseEmotions = tf.keep(tf.tensor([sizedInitialBase], [1, Config.Agent.EMOTION_DIM]));

        this.currentStateVector = new Array(Config.Agent.BASE_STATE_DIM).fill(0);
        this._updateStateVectorSync(this.baseEmotions, null); // Use sync update for initialization
    }

    async reset() {
        this._initializeState();
        console.log("Environment Reset.");
        const stateTensor = this._getStateTensorSync(); // Use sync version for reset
        // Return a *kept clone* for the caller
        return { state: stateTensor ? tf.keep(stateTensor.clone()) : null };
    }

    async step(agentEmotionsTensor, currentRIHScore = 0, currentAvgAffinity = 0) {
        this.stepCount++;
        let reward = 0;
        let context = "Ambient fluctuations.";
        let triggeredEventType = null;

        const agentEmotionsArray = tensorToArray(agentEmotionsTensor?.[0]) ?? zeros(Config.Agent.EMOTION_DIM); // Use safe util

        const driftRate = Config.Env.BASE_EMOTION_DRIFT_RATE;
        const reversionRate = Config.Env.BASE_EMOTION_REVERSION_RATE;

        // --- Update Base Environment Emotions ---
        if (this.baseEmotions && !this.baseEmotions.isDisposed) {
            let updatedBaseEmotions = null;
            try {
                updatedBaseEmotions = tf.tidy(() => {
                    const currentBase = this.baseEmotions;
                    const agentEmotions = tf.tensor([agentEmotionsArray], [1, Config.Agent.EMOTION_DIM]);
                    const driftToAgent = agentEmotions.sub(currentBase).mul(driftRate);
                    const revertToNeutral = tf.scalar(0.5).sub(currentBase).mul(reversionRate);
                    return currentBase.add(driftToAgent).add(revertToNeutral).clipByValue(0, 1);
                });
                safeDispose(this.baseEmotions); // Dispose old internal tensor
                this.baseEmotions = tf.keep(updatedBaseEmotions); // Keep the new one
            } catch (e) {
                console.error("Error updating base emotions tensor:", e);
                safeDispose(this.baseEmotions); // Dispose potentially problematic tensor
                safeDispose(updatedBaseEmotions); // Dispose result if error occurred after creation
                this.baseEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Fallback
            }
        } else { // Recover if baseEmotions was invalid
            this.baseEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        // --- Event Management ---
        if (this.eventTimer > 0) { /* ... (Event active logic - unchanged) ... */
            this.eventTimer--;
            context = this.currentEvent?.context ?? "Event active.";
            reward = (this.currentEvent?.reward ?? 0) * clamp(this.eventTimer / Config.Env.EVENT_DURATION, 0, 1); // Gradual decay
            triggeredEventType = this.currentEvent?.type ?? null;
            if (this.eventTimer === 0) {
                this.currentEvent = null;
                this.gapTimer = Config.Env.EVENT_GAP;
                context = "Event concluded.";
            }
        } else if (this.gapTimer > 0) { /* ... (Gap logic - unchanged) ... */
            this.gapTimer--;
            context = "System stable.";
        } else { /* ... (Event trigger logic - unchanged, uses agentEmotionsArray) ... */
            const avgIntensity = agentEmotionsArray.reduce((sum, val) => sum + Math.abs(val - 0.5), 0) / Config.Agent.EMOTION_DIM;
            const triggerProb = clamp(Config.Env.EVENT_FREQ * (1 + avgIntensity * 1.5), 0, 0.95);

            if (Math.random() < triggerProb) {
                const eventProbs = agentEmotionsArray.map(e => clamp(Math.abs(e - 0.5), 0.01, 1));
                const totalProb = eventProbs.reduce((a, b) => a + b, 0);
                const normalizedProbs = totalProb > 0 ? eventProbs.map(p => p / totalProb) : Array(Config.Agent.EMOTION_DIM).fill(1 / Config.Agent.EMOTION_DIM);

                let rand = Math.random();
                let eventIdx = 0;
                for (let i = 0; i < normalizedProbs.length; i++) {
                    rand -= normalizedProbs[i];
                    if (rand <= 0) { eventIdx = i; break; }
                }
                eventIdx = clamp(eventIdx, 0, this.events.length - 1);

                const eventData = this.events[eventIdx];
                this.currentEvent = { type: eventData[0], context: eventData[1], reward: eventData[2] };
                context = this.currentEvent.context;
                triggeredEventType = this.currentEvent.type;

                const agentCorrespondingEmotionIntensity = Math.abs((agentEmotionsArray[eventIdx] ?? 0.5) - 0.5);
                reward = this.currentEvent.reward * (0.4 + agentCorrespondingEmotionIntensity * 1.2);
                this.eventTimer = Config.Env.EVENT_DURATION;
                this.gapTimer = 0; // Reset gap
            } else {
                this.gapTimer = Config.Env.EVENT_GAP; // Reset gap if no event
                context = "System stable.";
            }
        }

        // --- Dysvariant Fluctuations ---
        const effectiveDysvariantProb = Config.DYSVARIANT_PROB * (1 + (1 - clamp(currentRIHScore, 0, 1)) * 0.5);
        if (Math.random() < clamp(effectiveDysvariantProb, 0, 0.95)) {
            const randomIndex = Math.floor(Math.random() * Config.DIMENSIONS);
            const amplitude = (Math.random() - 0.5) * 0.35 * (1.1 - clamp(currentAvgAffinity, -1, 1));
            if (this.currentStateVector.length > randomIndex) { // Check index validity
                this.currentStateVector[randomIndex] = clamp((this.currentStateVector[randomIndex] || 0) + amplitude, -1, 1);
                context += " (Dysvariant fluctuation)";
            }
        }

        // --- Update internal state vector (uses current baseEmotions tensor) ---
        this._updateStateVectorSync(this.baseEmotions, triggeredEventType);

        // --- Get state tensor for output ---
        // We return a *kept clone* - caller (app.js) must dispose it
        const stateTensor = this._getStateTensorSync();
        const done = false; // Simulation runs indefinitely

        if (!stateTensor || stateTensor.isDisposed) {
            console.error("[Environment Step] Failed to generate valid state tensor. Returning null state.");
            return { state: null, reward, done, context, eventType: triggeredEventType };
        }

        // Important: Return a kept *clone*
        return { state: tf.keep(stateTensor.clone()), reward, done, context, eventType: triggeredEventType };
    }

    /** Sync helper to update the state vector array */
    _updateStateVectorSync(currentBaseEmotionsTensor, eventType = null) {
        let baseEmotionsArray = tensorToArray(currentBaseEmotionsTensor?.[0]) ?? zeros(Config.Agent.EMOTION_DIM); // Use safe util

        // --- Update core dimensions (Indices 0 to dimensions - 1) ---
        const D = Config.DIMENSIONS;
        const E = Config.Agent.EMOTION_DIM;
        if (D > 0 && E > 1) this.currentStateVector[0] = clamp(((baseEmotionsArray[0] ?? 0) - (baseEmotionsArray[1] ?? 0)) * 0.8, -1, 1);
        if (D > 1 && E > 4) this.currentStateVector[1] = clamp(((baseEmotionsArray[4] ?? 0) - (baseEmotionsArray[3] ?? 0)) * 0.7, -1, 1);
        if (D > 2 && E > 2) this.currentStateVector[2] = clamp((baseEmotionsArray[2] ?? 0) * 1.5 - 0.5, -1, 1);
        if (D > 3 && E > 5) this.currentStateVector[3] = clamp((baseEmotionsArray[5] ?? 0) * 1.2 - 0.3, -1, 1);

        // Update remaining core dimensions
        for (let i = 4; i < D; i++) {
            const emoIdx1 = i % E;
            const emoIdx2 = (i + Math.floor(E / 2)) % E;
            const prevVal = this.currentStateVector[i] || 0;
            const emoInfluence = (((baseEmotionsArray[emoIdx1] ?? 0.5) - 0.5) - ((baseEmotionsArray[emoIdx2] ?? 0.5) - 0.5)) * 0.1;
            const randomPerturbation = (Math.random() - 0.5) * 0.04;
            const decay = 0.97;
            this.currentStateVector[i] = clamp(prevVal * decay + emoInfluence + randomPerturbation, -1, 1);
        }

        // Apply event perturbations
        if (eventType) {
            const emotionIndex = this.emotionNames.indexOf(eventType);
            if (emotionIndex !== -1 && D > 0) {
                const rewardSign = (this.currentEvent?.reward ?? 0) > 0 ? 1 : -1;
                const primaryDim = emotionIndex % D;
                this.currentStateVector[primaryDim] = clamp((this.currentStateVector[primaryDim] || 0) + rewardSign * 0.5, -1, 1);
                const secondaryDim = (emotionIndex + Math.floor(D / 3)) % D;
                if (secondaryDim !== primaryDim) {
                    this.currentStateVector[secondaryDim] = clamp((this.currentStateVector[secondaryDim] || 0) + rewardSign * 0.2, -1, 1);
                }
                for (let k = 0; k < Math.min(3, D); k++) {
                    const randDim = Math.floor(Math.random() * D);
                    if (randDim !== primaryDim && randDim !== secondaryDim) {
                        this.currentStateVector[randDim] = clamp((this.currentStateVector[randDim] || 0) + (Math.random() - 0.5) * 0.15, -1, 1);
                    }
                }
            }
        }

        // --- Append base emotion values ---
        for (let i = 0; i < E; i++) {
            const stateDimIndex = D + i;
            if (stateDimIndex < Config.Agent.BASE_STATE_DIM) {
                this.currentStateVector[stateDimIndex] = clamp(baseEmotionsArray[i] ?? 0, 0, 1);
            }
        }
        // Ensure final length (should already be correct)
        this.currentStateVector.length = Config.Agent.BASE_STATE_DIM;
    }

    /** Sync helper to return the current state vector as a TF tensor. */
    _getStateTensorSync() {
        const finalStateArray = [...this.currentStateVector]; // Create copy
        try {
            const stateTensor = tf.tensor([finalStateArray], [1, Config.Agent.BASE_STATE_DIM]);
            // Check for NaN/Inf before returning
            if (containsNaNOrInf(stateTensor)) {
                console.error("State tensor contains NaN or Inf!", finalStateArray);
                safeDispose(stateTensor);
                displayError("Environment Error: Generated invalid state tensor (NaN/Inf).", false);
                return null;
            }
            return stateTensor; // Return the valid tensor (caller keeps/clones/disposes)
        } catch (e) {
            console.error("Error creating state tensor:", e, finalStateArray);
            displayError(`TF Error creating state tensor: ${e.message}`, false);
            return null;
        }
    }

    /** Calculates emotional impact of text and modifies base emotions. */
    async getEmotionalImpactFromText(text) {
        const impact = zeros(Config.Agent.EMOTION_DIM);
        let foundKeyword = false;
        const lowerText = text.toLowerCase();
        let baseEmotionsChanged = false;
        let currentBaseArray = tensorToArray(this.baseEmotions?.[0]) ?? zeros(Config.Agent.EMOTION_DIM);

        for (const idxStr in emotionKeywords) { /* ... (Keyword matching logic - unchanged) ... */
            const idx = parseInt(idxStr, 10);
            if (!isNaN(idx) && idx >= 0 && idx < Config.Agent.EMOTION_DIM) {
                const info = emotionKeywords[idx];
                if (!info || !Array.isArray(info.keywords)) continue;
                for (const keyword of info.keywords) {
                    if (typeof keyword === 'string' && lowerText.includes(keyword)) {
                        impact[idx] = Math.max(impact[idx] ?? 0, info.strength ?? 0);
                        foundKeyword = true;
                        if (typeof info.baseChange === 'number') {
                            const currentVal = currentBaseArray[idx] ?? 0.5;
                            const newVal = clamp(currentVal + info.baseChange, 0, 1);
                            if (newVal !== currentVal) {
                                currentBaseArray[idx] = newVal;
                                baseEmotionsChanged = true;
                            }
                        }
                        break;
                    }
                }
            }
        }

        if (baseEmotionsChanged) {
            try {
                const newBaseTensor = tf.tensor([currentBaseArray], [1, Config.Agent.EMOTION_DIM]);
                safeDispose(this.baseEmotions); // Dispose old internal tensor
                this.baseEmotions = tf.keep(newBaseTensor); // Keep the new one
            } catch (e) {
                console.error("Error creating new base emotions tensor after text impact:", e);
            }
        }

        if (!foundKeyword) { /* ... (Default impact logic - unchanged) ... */
            if (2 < Config.Agent.EMOTION_DIM) impact[2] = Math.max(impact[2] ?? 0, 0.3); // Curiosity
            if (4 < Config.Agent.EMOTION_DIM) impact[4] = Math.max(impact[4] ?? 0, 0.2); // Calm
        }

        try {
            const impactTensor = tf.tensor([impact], [1, Config.Agent.EMOTION_DIM]);
            // Return a kept tensor - caller is responsible for disposal
            return tf.keep(impactTensor);
        } catch (e) {
            console.error("Error creating impact tensor:", e, impact);
            displayError(`TF Error creating impact tensor: ${e.message}`, false);
            return null;
        }
    }

    /** Returns the current state for saving. */
    getState() {
        return {
            currentStateVector: [...this.currentStateVector],
            baseEmotions: tensorToArray(this.baseEmotions?.[0]), // Use safe util
            stepCount: this.stepCount,
            eventTimer: this.eventTimer,
            gapTimer: this.gapTimer,
            currentEvent: this.currentEvent ? { ...this.currentEvent } : null
        };
    }

    /** Loads the environment state. */
    loadState(state) {
        if (!state || typeof state !== 'object') {
            console.error("Invalid state object for environment loading. Resetting.");
            this._initializeState(); return;
        }
        console.log("Loading environment state...");
        safeDispose(this.baseEmotions); // Dispose existing tensor

        this._validateConfig(); // Re-validate config in case it changed

        // Load state vector, ensure correct length
        this.currentStateVector = (Array.isArray(state.currentStateVector) && state.currentStateVector.length === Config.Agent.BASE_STATE_DIM)
            ? [...state.currentStateVector] : zeros(Config.Agent.BASE_STATE_DIM);

        // Load base emotions, ensure correct length
        const baseEmotionsArray = (Array.isArray(state.baseEmotions) && state.baseEmotions.length === Config.Agent.EMOTION_DIM)
            ? state.baseEmotions : zeros(Config.Agent.EMOTION_DIM);
        try {
            this.baseEmotions = tf.keep(tf.tensor([baseEmotionsArray], [1, Config.Agent.EMOTION_DIM]));
        } catch (e) {
            console.error("Error creating baseEmotions tensor during loadState:", e);
            this.baseEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Fallback
        }

        // Load timers and event state
        this.stepCount = (typeof state.stepCount === 'number' && isFinite(state.stepCount)) ? state.stepCount : 0;
        this.eventTimer = (typeof state.eventTimer === 'number' && isFinite(state.eventTimer)) ? state.eventTimer : 0;
        this.gapTimer = (typeof state.gapTimer === 'number' && isFinite(state.gapTimer)) ? state.gapTimer : Config.Env.EVENT_GAP;

        // Validate loaded event
        if (state.currentEvent && typeof state.currentEvent === 'object' && typeof state.currentEvent.type === 'string' &&
            this.events.some(e => e[0] === state.currentEvent.type)) {
            this.currentEvent = { ...state.currentEvent };
        } else {
            if (this.eventTimer > 0) { console.warn("Inconsistent state: eventTimer > 0 but currentEvent invalid/missing. Resetting event."); }
            this.currentEvent = null;
            if (this.eventTimer > 0) this.eventTimer = 0; // Reset timer if event is invalid
            if (this.gapTimer <= 0 && this.eventTimer <= 0) this.gapTimer = Config.Env.EVENT_GAP; // Ensure gap restarts if no event
        }
        console.log("Environment state loaded successfully.");
    }

    /** Cleans up TensorFlow resources. */
    cleanup() {
        // console.log("Cleaning up Environment tensors..."); // Reduce noise
        safeDispose(this.baseEmotions);
        this.baseEmotions = null;
        // console.log("Environment cleanup complete."); // Reduce noise
    }
}






