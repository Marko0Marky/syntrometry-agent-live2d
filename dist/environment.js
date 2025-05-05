// js/environment.ts
import * as tf from '@tensorflow/tfjs';
// import { Tensor, dispose, tidy } from '@tensorflow/tfjs';
import { Config, emotionKeywords } from './config.js'; // Typed config
import { zeros, clamp, displayError } from './utils.js'; // Typed utils
import { tensorDataToArray } from './tensorArrayUtils.js';
import { hasNaNorInf } from './tensorUtils.js';
// Add this helper function at the top of your file, after the imports
// This will safely dispose tensors without relying on tf.dispose directly
function safeDisposeTensor(tensor) {
    if (tensor && !tensor.isDisposed) {
        tensor.dispose(); // Use the dispose method on the tensor itself
    }
}
// Helper for tf.tidy operations
function safeTidy(fn) {
    // Try to use tf.tidy if available, otherwise just execute the function
    try {
        // @ts-ignore - Ignore TypeScript error for tf.tidy
        return tf.tidy(fn);
    }
    catch (e) {
        console.warn("tf.tidy not available, executing function directly:", e);
        return fn();
    }
}
// Helper for tf.clipByValue operations - updated version
function safeClipByValue(tensor, min, max) {
    try {
        // Try using the global function if available
        // @ts-ignore - Ignore TypeScript error for tf.clipByValue
        if (typeof tf.clipByValue === 'function') {
            // @ts-ignore
            return tf.clipByValue(tensor, min, max);
        }
        // Alternative implementation using min/max
        // @ts-ignore - Ignore TypeScript errors for tensor methods
        const clippedMin = tensor.minimum ? tensor.minimum(max) :
            // @ts-ignore
            tf.minimum(tensor, max);
        // @ts-ignore - Ignore TypeScript errors for tensor methods
        return clippedMin.maximum ? clippedMin.maximum(min) :
            // @ts-ignore
            tf.maximum(clippedMin, min);
    }
    catch (e) {
        console.error("Error in clipByValue operation:", e);
        return tensor; // Return original tensor if all else fails
    }
}
// Helper function (can be outside class or private static) to safely get config values
const getConfigValue = (path, defaultValue) => {
    const parts = path.split('.');
    let current = Config;
    for (const part of parts) {
        if (current && typeof current === 'object' && current !== null && part in current) {
            current = current[part];
        }
        else {
            console.warn(`Missing Config.${path}, using default: ${defaultValue}`);
            return defaultValue;
        }
    }
    // Basic type check (can be expanded)
    if (defaultValue !== null && typeof current !== typeof defaultValue) {
        console.warn(`Config.${path} has incorrect type (${typeof current}), expected (${typeof defaultValue}). Using default: ${defaultValue}`);
        return defaultValue;
    }
    return current;
};
/**
 * Represents the simulation environment.
 */
export class EmotionalSpace {
    constructor() {
        this.baseEmotions = null; // Shape [1, EMOTION_DIM]
        this.stepCount = 0;
        this.eventTimer = 0;
        this.gapTimer = 0;
        this.currentEvent = null;
        this.currentStateVector = []; // Full state vector [BASE_STATE_DIM]
        // Store validated config values internally, initialized with defaults
        this.eventFreq = getConfigValue('Env.EVENT_FREQ', 0.015);
        this.eventDuration = getConfigValue('Env.EVENT_DURATION', 120);
        this.eventGap = getConfigValue('Env.EVENT_GAP', 180);
        this.driftRate = getConfigValue('Env.BASE_EMOTION_DRIFT_RATE', 0.005);
        this.reversionRate = getConfigValue('Env.BASE_EMOTION_REVERSION_RATE', 0.001);
        this.dimensions = getConfigValue('DIMENSIONS', 12);
        this.emotionDim = getConfigValue('Agent.EMOTION_DIM', 6);
        this.baseStateDim = this.dimensions + this.emotionDim; // Initial calculation based on defaults
        this.dysvariantProb = getConfigValue('DYSVARIANT_PROB', 0.02);
        if (typeof tf?.tensor !== 'function') {
            throw new Error("[Environment] TensorFlow.js is required but not available.");
        }
        // Validate config and potentially overwrite initialized defaults
        this._validateAndStoreConfig();
        this.events = [
            ["Joy", "A pleasant resonance occurs in the field.", 1.5],
            ["Fear", "A dissonant pattern is detected nearby.", -1.8],
            ["Curiosity", "An unexpected structural variation appears.", 1.2],
            ["Frustration", "System encounters processing resistance.", -1.0],
            ["Calm", "Patterns stabilize into local harmony.", 0.8],
            ["Surprise", "A sudden cascade shift happens.", 1.6]
        ];
        // Ensure events array matches emotionDim if possible, or handle mismatch
        if (this.events.length < this.emotionDim) {
            console.warn(`Configured emotionDim (${this.emotionDim}) is larger than defined events (${this.events.length}). Behavior for extra dimensions might be undefined.`);
            // Optionally pad events or adjust emotionDim
        }
        else if (this.events.length > this.emotionDim) {
            console.warn(`Defined events (${this.events.length}) is larger than configured emotionDim (${this.emotionDim}). Truncating events list.`);
            this.events = this.events.slice(0, this.emotionDim);
        }
        this.emotionNames = this.events.map(e => e[0]);
        this._initializeState();
    }
    /** Validates required Config properties and stores them internally, overwriting defaults. */
    _validateAndStoreConfig() {
        // Re-fetch values using the helper, using the already initialized property as the default
        this.emotionDim = getConfigValue('Agent.EMOTION_DIM', this.emotionDim);
        this.dimensions = getConfigValue('DIMENSIONS', this.dimensions);
        // IMPORTANT: Recalculate baseStateDim *after* fetching potentially updated dimensions/emotionDim
        this.baseStateDim = this.dimensions + this.emotionDim;
        // Verify consistency with external Config if needed
        if (Config.Agent.BASE_STATE_DIM !== this.baseStateDim) {
            console.warn(`Config.Agent.BASE_STATE_DIM (${Config.Agent.BASE_STATE_DIM}) differs from calculated ${this.baseStateDim}. Using calculated value.`);
        }
        this.eventGap = getConfigValue('Env.EVENT_GAP', this.eventGap);
        this.eventDuration = getConfigValue('Env.EVENT_DURATION', this.eventDuration);
        this.eventFreq = getConfigValue('Env.EVENT_FREQ', this.eventFreq);
        this.driftRate = getConfigValue('Env.BASE_EMOTION_DRIFT_RATE', this.driftRate);
        this.reversionRate = getConfigValue('Env.BASE_EMOTION_REVERSION_RATE', this.reversionRate);
        this.dysvariantProb = getConfigValue('DYSVARIANT_PROB', this.dysvariantProb);
    }
    /** Initializes or resets the environment's internal state. */
    _initializeState() {
        this.stepCount = 0;
        this.eventTimer = 0;
        this.gapTimer = this.eventGap; // Use stored (potentially validated) config value
        this.currentEvent = null;
        if (this.baseEmotions && !this.baseEmotions.isDisposed) {
            safeDisposeTensor(this.baseEmotions);
        }
        // Use stored config value for dimension
        // Initialize base emotions based on the (potentially validated) emotionDim
        const initialBase = [0.6, 0.1, 0.3, 0.1, 0.5, 0.2]; // Example initial values
        const sizedInitialBase = initialBase.slice(0, this.emotionDim);
        // Pad with a neutral value (e.g., 0.5) if emotionDim is larger than the example array
        while (sizedInitialBase.length < this.emotionDim) {
            sizedInitialBase.push(0.5);
        }
        this.baseEmotions = tf.keep(tf.tensor([sizedInitialBase], [1, this.emotionDim]));
        // Initialize state vector based on the (potentially validated) baseStateDim
        this.currentStateVector = zeros([this.baseStateDim]);
        // Initialize with current base emotions (no event)
        this._updateStateVector(this.baseEmotions, null); // Does not need await here
    }
    /** Resets the environment. */
    async reset() {
        console.log("Environment Resetting...");
        this._initializeState(); // Re-initialize using potentially updated config values
        console.log("Environment Reset Complete.");
        const stateTensor = await this._getStateTensor();
        // Return a *kept* clone for the caller
        return { state: stateTensor ? tf.keep(stateTensor.clone()) : null };
    }
    /** Advances the environment simulation by one step. */
    async step(agentEmotionsTensor, currentRIHScore = 0, currentAvgAffinity = 0) {
        this.stepCount++;
        let reward = 0;
        let context = "Ambient fluctuations.";
        let triggeredEventType = null;
        let agentEmotionsArray;
        // Safely get agent emotions array
        try {
            // Ensure tensor exists, isn't disposed, and get data
            agentEmotionsArray = (agentEmotionsTensor && !agentEmotionsTensor.isDisposed)
                ? tensorDataToArray(agentEmotionsTensor) || zeros([this.emotionDim])
                : zeros([this.emotionDim]);
            // Validate dimensions after getting the array
            if (agentEmotionsArray.length !== this.emotionDim) {
                console.warn(`Agent emotion tensor/array has wrong dimension (${agentEmotionsArray.length}), expected ${this.emotionDim}. Using zeros.`);
                agentEmotionsArray = zeros([this.emotionDim]);
            }
        }
        catch (e) {
            console.error("Error reading agent emotions tensor in environment step:", e);
            agentEmotionsArray = zeros([this.emotionDim]); // Fallback
        }
        // Update Base Environment Emotions
        if (this.baseEmotions && !this.baseEmotions.isDisposed) {
            try {
                const updatedBaseEmotions = safeTidy(() => {
                    const currentBase = this.baseEmotions; // Assert non-null after check
                    // Ensure agentEmotions tensor is created correctly for TF ops
                    const agentEmotions = tf.tensor([agentEmotionsArray], [1, this.emotionDim]);
                    const driftToAgent = agentEmotions.sub(currentBase).mul(this.driftRate); // Use stored config
                    const revertToNeutral = tf.scalar(0.5).sub(currentBase).mul(this.reversionRate); // Use stored config
                    return safeClipByValue(currentBase.add(driftToAgent).add(revertToNeutral), 0, 1);
                });
                safeDisposeTensor(this.baseEmotions); // Dispose old tensor
                this.baseEmotions = tf.keep(updatedBaseEmotions); // Keep the new one
            }
            catch (e) {
                console.error("Error updating base emotions tensor:", e);
                // Attempt to recover if possible, otherwise dispose and create zeros
                if (this.baseEmotions && !this.baseEmotions.isDisposed)
                    safeDisposeTensor(this.baseEmotions);
                this.baseEmotions = tf.keep(tf.zeros([1, this.emotionDim])); // Fallback
            }
        }
        else {
            console.warn("Base emotions tensor was invalid during step, resetting to zeros.");
            this.baseEmotions = tf.keep(tf.zeros([1, this.emotionDim])); // Fallback
        }
        // Event Management
        if (this.eventTimer > 0) {
            this.eventTimer--;
            context = this.currentEvent?.context ?? "Event active.";
            // Gradual reward decay during event
            reward = (this.currentEvent?.reward ?? 0) * clamp(this.eventTimer / this.eventDuration, 0, 1);
            triggeredEventType = this.currentEvent?.type ?? null;
            if (this.eventTimer === 0) {
                this.currentEvent = null;
                this.gapTimer = this.eventGap; // Reset gap timer using stored config
                context = "Event concluded.";
            }
        }
        else if (this.gapTimer > 0) {
            this.gapTimer--;
            context = "System stable.";
        }
        else {
            // Calculate trigger probability based on agent's average emotion intensity
            const avgIntensity = agentEmotionsArray.reduce((sum, val) => sum + (isFinite(val) ? Math.abs(val - 0.5) : 0), 0) / this.emotionDim; // Intensity as deviation from neutral
            const triggerProb = clamp(this.eventFreq * (1 + avgIntensity * 1.5), 0, 0.95); // Use stored config, amplify effect, cap probability
            if (Math.random() < triggerProb) {
                // Weighted random choice based on agent emotions deviation from neutral
                const eventProbs = agentEmotionsArray.map(e => clamp(Math.abs(e - 0.5), 0.01, 1)); // Weight based on deviation, ensure non-zero
                const totalProb = eventProbs.reduce((a, b) => a + b, 0);
                // Normalize probabilities, fallback to uniform if total is zero
                const normalizedProbs = totalProb > 0
                    ? eventProbs.map(p => p / totalProb)
                    : Array(this.emotionDim).fill(1 / this.emotionDim);
                let rand = Math.random();
                let eventIdx = 0;
                for (let i = 0; i < normalizedProbs.length; i++) {
                    rand -= normalizedProbs[i];
                    if (rand <= 0) { // Simplified break condition
                        eventIdx = i;
                        break;
                    }
                }
                // Ensure index is valid for the events array (which should match emotionDim)
                eventIdx = clamp(eventIdx, 0, this.events.length - 1);
                const eventData = this.events[eventIdx];
                this.currentEvent = { type: eventData[0], context: eventData[1], reward: eventData[2] };
                context = this.currentEvent.context;
                triggeredEventType = this.currentEvent.type;
                // Reward influenced by agent's corresponding emotion intensity (deviation from neutral)
                const agentCorrespondingEmotionIntensity = Math.abs((agentEmotionsArray[eventIdx] ?? 0.5) - 0.5);
                // Scale reward: Base reward * (some mix of base + agent intensity influence)
                reward = this.currentEvent.reward * (0.4 + agentCorrespondingEmotionIntensity * 1.2); // Example scaling
                this.eventTimer = this.eventDuration; // Use stored config
                this.gapTimer = 0; // Ensure gap doesn't count down while event is starting
            }
            else {
                // Reset gap timer if no event triggered
                this.gapTimer = this.eventGap; // Use stored config
                context = "System stable.";
            }
        }
        // Dysvariant Fluctuations (Use internal probability)
        // Increase probability if RIH is low (more unstable)
        const effectiveDysvariantProb = this.dysvariantProb * (1 + (1 - clamp(currentRIHScore, 0, 1)) * 0.5); // Use stored config
        if (Math.random() < clamp(effectiveDysvariantProb, 0, 0.95)) {
            const randomIndex = Math.floor(Math.random() * this.dimensions); // Only affect core dimensions
            // Amplitude inversely related to affinity (more chaos if less affinity)
            const amplitude = (Math.random() - 0.5) * 0.35 * (1.1 - clamp(currentAvgAffinity, -1, 1));
            if (this.currentStateVector.length > randomIndex && randomIndex < this.dimensions) { // Check index validity
                this.currentStateVector[randomIndex] = clamp((this.currentStateVector[randomIndex] || 0) + amplitude, -1, 1);
                context += " (Dysvariant fluctuation)";
            }
        }
        // Update internal state vector array (doesn't need await, uses current baseEmotions tensor)
        this._updateStateVector(this.baseEmotions, triggeredEventType);
        // Get the tensor representation for output
        const stateTensor = await this._getStateTensor(); // Fetches tensor from currentStateVector
        const done = false; // Simulation typically runs indefinitely
        if (!stateTensor || stateTensor.isDisposed) { // Check disposal just in case
            console.error("[Environment Step] Failed to generate valid state tensor. Returning null state.");
            return { state: null, reward, done, context, eventType: triggeredEventType };
        }
        // Return a *kept clone* for the caller (caller is responsible for disposal)
        return { state: tf.keep(stateTensor.clone()), reward, done, context, eventType: triggeredEventType };
    }
    /**
     * Internal helper to update the state vector array based on base emotions and events.
     */
    async _updateStateVector(currentBaseEmotionsTensor, eventType = null) {
        let baseEmotionsArray;
        try {
            // Prefer dataSync for synchronous access if tensor is ready, fallback to async data()
            baseEmotionsArray = currentBaseEmotionsTensor && !currentBaseEmotionsTensor.isDisposed
                ? [...currentBaseEmotionsTensor.dataSync()].map(Number)
                : zeros([this.emotionDim]);
            if (baseEmotionsArray.length !== this.emotionDim) {
                console.warn(`Base emotions array has wrong dimension (${baseEmotionsArray.length}) in _updateStateVector, expected ${this.emotionDim}. Using zeros.`);
                baseEmotionsArray = zeros([this.emotionDim]);
            }
        }
        catch (e) {
            // If dataSync fails (e.g., tensor not on CPU), try async
            try {
                baseEmotionsArray = currentBaseEmotionsTensor && !currentBaseEmotionsTensor.isDisposed
                    ? (await currentBaseEmotionsTensor.array())[0]
                    : zeros([this.emotionDim]);
                if (baseEmotionsArray.length !== this.emotionDim) {
                    console.warn(`Base emotions array (async) has wrong dimension (${baseEmotionsArray.length}) in _updateStateVector, expected ${this.emotionDim}. Using zeros.`);
                    baseEmotionsArray = zeros([this.emotionDim]);
                }
            }
            catch (asyncError) {
                console.error("Error reading base emotions tensor (sync and async) for state update:", e, asyncError);
                baseEmotionsArray = zeros([this.emotionDim]); // Final fallback
            }
        }
        // --- Update core dimensions (Indices 0 to dimensions - 1) ---
        // Ensure operations only happen if dimensions > 0
        if (this.dimensions > 0) {
            // Example: Joy vs Fear influence on dim 0
            this.currentStateVector[0] = clamp(((baseEmotionsArray[0] ?? 0) - (baseEmotionsArray[1] ?? 0)) * 0.8, -1, 1);
        }
        if (this.dimensions > 1 && this.emotionDim > 4) { // Need Calm (idx 4) and Frustration (idx 3)
            this.currentStateVector[1] = clamp(((baseEmotionsArray[4] ?? 0) - (baseEmotionsArray[3] ?? 0)) * 0.7, -1, 1);
        }
        if (this.dimensions > 2 && this.emotionDim > 2) { // Need Curiosity (idx 2)
            this.currentStateVector[2] = clamp((baseEmotionsArray[2] ?? 0) * 1.5 - 0.5, -1, 1);
        }
        if (this.dimensions > 3 && this.emotionDim > 5) { // Need Surprise (idx 5)
            this.currentStateVector[3] = clamp((baseEmotionsArray[5] ?? 0) * 1.2 - 0.3, -1, 1);
        }
        // Update remaining core dimensions with decay, noise, and broad emotional influence
        for (let i = 4; i < this.dimensions; i++) {
            const emoIdxInfluence1 = i % this.emotionDim;
            const emoIdxInfluence2 = (i + Math.floor(this.emotionDim / 2)) % this.emotionDim; // Opposite emotion influence
            const prevVal = this.currentStateVector[i] || 0;
            // Influence from related emotion and its opposite
            const emoInfluence = (((baseEmotionsArray[emoIdxInfluence1] ?? 0.5) - 0.5) - ((baseEmotionsArray[emoIdxInfluence2] ?? 0.5) - 0.5)) * 0.1;
            const randomPerturbation = (Math.random() - 0.5) * 0.04; // Slightly more noise
            const decay = 0.97; // Slightly faster decay
            this.currentStateVector[i] = clamp(prevVal * decay + emoInfluence + randomPerturbation, -1, 1);
        }
        // Apply event-specific perturbations to core dimensions
        if (eventType) {
            const emotionIndex = this.emotionNames.indexOf(eventType);
            if (emotionIndex !== -1 && this.dimensions > 0) {
                // Stronger impact on a dimension directly related to the event emotion
                const primaryDim = emotionIndex % this.dimensions;
                this.currentStateVector[primaryDim] = clamp((this.currentStateVector[primaryDim] || 0) + (this.currentEvent?.reward ?? 0 > 0 ? 0.5 : -0.5), -1, 1); // Effect direction depends on reward sign
                // Smaller impact on a secondary related dimension
                const secondaryDim = (emotionIndex + Math.floor(this.dimensions / 3)) % this.dimensions;
                if (secondaryDim !== primaryDim) { // Avoid double impact if dims wrap around
                    this.currentStateVector[secondaryDim] = clamp((this.currentStateVector[secondaryDim] || 0) + (this.currentEvent?.reward ?? 0 > 0 ? 0.2 : -0.2), -1, 1);
                }
                // Add small random perturbations to a few other dimensions
                for (let k = 0; k < Math.min(3, this.dimensions); k++) { // Perturb up to 3 dims or total dims
                    const randDim = Math.floor(Math.random() * this.dimensions);
                    if (randDim !== primaryDim && randDim !== secondaryDim) { // Avoid perturbing already affected dims
                        this.currentStateVector[randDim] = clamp((this.currentStateVector[randDim] || 0) + (Math.random() - 0.5) * 0.15, -1, 1);
                    }
                }
            }
        }
        // --- Append base emotion values (Indices dimensions to baseStateDim - 1) ---
        for (let i = 0; i < this.emotionDim; i++) {
            const emotionVal = baseEmotionsArray[i] ?? 0;
            const stateDimIndex = this.dimensions + i;
            if (stateDimIndex < this.baseStateDim) { // Ensure index is within bounds
                this.currentStateVector[stateDimIndex] = clamp(emotionVal, 0, 1);
            }
            else {
                console.warn(`Calculated state index ${stateDimIndex} exceeds baseStateDim ${this.baseStateDim} while appending emotions.`);
            }
        }
        // Ensure final vector has the correct BASE length, padding if necessary (shouldn't be needed if logic is correct)
        while (this.currentStateVector.length < this.baseStateDim)
            this.currentStateVector.push(0.0);
        // Truncate if necessary (safety check)
        this.currentStateVector.length = this.baseStateDim;
    }
    /** Returns the current state vector as a TensorFlow tensor. */
    async _getStateTensor() {
        // Ensure internal vector has the correct length before creating tensor
        if (this.currentStateVector.length !== this.baseStateDim) {
            console.error(`Internal state vector length (${this.currentStateVector.length}) mismatch with baseStateDim (${this.baseStateDim}). Fixing...`);
            // Attempt to fix: Pad or truncate
            while (this.currentStateVector.length < this.baseStateDim)
                this.currentStateVector.push(0.0);
            this.currentStateVector.length = this.baseStateDim;
        }
        const finalStateArray = [...this.currentStateVector]; // Create a copy for tensor creation
        try {
            // Create tensor, but don't keep it here (caller is responsible for keeping the clone)
            const stateTensor = tf.tensor([finalStateArray], [1, this.baseStateDim]);
            // Optional: Check for NaNs or Infs before returning
            const containsInvalidValues = hasNaNorInf(stateTensor);
            if (containsInvalidValues) {
                console.error("State tensor contains NaN or Inf values!", finalStateArray);
                safeDisposeTensor(stateTensor); // Dispose invalid tensor
                // Potentially try to recover or return null
                displayError("Environment Error: Generated invalid state tensor (NaN/Inf).", false);
                return null;
            }
            return stateTensor; // Return the valid, unkept tensor
        }
        catch (e) {
            console.error("Error creating state tensor:", e, finalStateArray);
            displayError(`TF Error creating state tensor: ${e instanceof Error ? e.message : String(e)}`, false);
            return null;
        }
    }
    /** Calculates emotional impact of text and modifies base emotions. */
    async getEmotionalImpactFromText(text) {
        if (!tf?.tensor) {
            console.error("TensorFlow not available for text impact calculation.");
            return null;
        }
        const impact = zeros([this.emotionDim]);
        let foundKeyword = false;
        const lowerText = text.toLowerCase();
        let baseEmotionsChanged = false;
        let currentBaseArray; // Will hold numeric array
        // Get current base emotions safely
        try {
            if (this.baseEmotions && !this.baseEmotions.isDisposed) {
                currentBaseArray = [...this.baseEmotions.dataSync()].map(Number);
                if (currentBaseArray.length !== this.emotionDim) {
                    console.warn(`Base emotions array (sync) had wrong dimension (${currentBaseArray.length}) in text impact. Resetting.`);
                    currentBaseArray = zeros([this.emotionDim]);
                }
            }
            else {
                console.warn("Base emotions tensor invalid in text impact. Using zeros.");
                currentBaseArray = zeros([this.emotionDim]);
            }
        }
        catch (e) {
            try {
                // Fallback to async if sync failed
                currentBaseArray = this.baseEmotions && !this.baseEmotions.isDisposed
                    ? (await this.baseEmotions.array())[0]
                    : zeros([this.emotionDim]);
                if (currentBaseArray.length !== this.emotionDim) {
                    console.warn(`Base emotions array (async) had wrong dimension (${currentBaseArray.length}) in text impact. Resetting.`);
                    currentBaseArray = zeros([this.emotionDim]);
                }
            }
            catch (asyncError) {
                console.error("Error reading base emotions (sync/async) for text impact:", e, asyncError);
                currentBaseArray = zeros([this.emotionDim]); // Final fallback
            }
        }
        // Iterate through keywords and apply impact/base changes
        for (const idxStr in emotionKeywords) {
            const idx = parseInt(idxStr, 10);
            // Check if key is a valid index and within emotionDim bounds
            if (!isNaN(idx) && idx >= 0 && idx < this.emotionDim) {
                const info = emotionKeywords[idx];
                if (!info || !Array.isArray(info.keywords))
                    continue; // Skip if data is malformed
                for (const keyword of info.keywords) {
                    if (typeof keyword === 'string' && lowerText.includes(keyword)) {
                        // Apply impact (max strength found for this emotion)
                        impact[idx] = Math.max(impact[idx] ?? 0, info.strength ?? 0);
                        foundKeyword = true;
                        // Apply base change if defined
                        if (typeof info.baseChange === 'number') {
                            const currentVal = currentBaseArray[idx] ?? 0.5; // Default to neutral if somehow missing
                            const newVal = clamp(currentVal + info.baseChange, 0, 1);
                            // Check if the value actually changed to avoid unnecessary tensor updates
                            if (newVal !== currentVal) {
                                currentBaseArray[idx] = newVal;
                                baseEmotionsChanged = true;
                            }
                        }
                        break; // Only count first keyword hit per emotion category
                    }
                }
            }
            else {
                console.warn(`Invalid index ${idxStr} found in emotionKeywords keys.`);
            }
        }
        // Update the environment's baseEmotions tensor *if* changes occurred
        if (baseEmotionsChanged) {
            try {
                // Create a new tensor from the modified array
                const newBaseTensor = tf.tensor([currentBaseArray], [1, this.emotionDim]);
                // Dispose the old tensor if it exists
                if (this.baseEmotions && !this.baseEmotions.isDisposed) {
                    safeDisposeTensor(this.baseEmotions);
                }
                // Keep the new tensor
                this.baseEmotions = tf.keep(newBaseTensor);
            }
            catch (e) {
                console.error("Error creating new base emotions tensor after text impact:", e);
                // If update fails, might keep the old tensor or try to recover
            }
        }
        // Apply default impact if no keywords were found
        if (!foundKeyword) {
            // Default to slight Curiosity and Calm if indices exist
            if (2 < this.emotionDim)
                impact[2] = Math.max(impact[2] ?? 0, 0.3);
            if (4 < this.emotionDim)
                impact[4] = Math.max(impact[4] ?? 0, 0.2);
        }
        // Create and return the impact tensor
        try {
            // Create and keep the impact tensor for the caller
            const impactTensor = tf.tensor([impact], [1, this.emotionDim]);
            return tf.keep(impactTensor); // Caller is responsible for disposing this
        }
        catch (e) {
            console.error("Error creating impact tensor:", e, impact);
            displayError(`TF Error creating impact tensor: ${e instanceof Error ? e.message : String(e)}`, false);
            return null;
        }
    }
    /** Returns the current state for saving. */
    getState() {
        let baseEmotionsArray = [];
        try {
            // Use dataSync for immediate array access if possible
            baseEmotionsArray = this.baseEmotions && !this.baseEmotions.isDisposed
                ? tensorDataToArray(this.baseEmotions) || zeros([this.emotionDim])
                : zeros([this.emotionDim]);
            // Validate length after getting the array
            if (baseEmotionsArray.length !== this.emotionDim) {
                console.warn(`Base emotions array had wrong dimension (${baseEmotionsArray.length}) in getState. Using zeros.`);
                baseEmotionsArray = zeros([this.emotionDim]);
            }
        }
        catch (e) {
            // dataSync might fail if tensor isn't ready/on CPU, log error but return fallback
            console.error("Error getting baseEmotions arraySync for getState (might be backend issue):", e);
            baseEmotionsArray = zeros([this.emotionDim]);
        }
        // Return clones of mutable state parts
        return {
            currentStateVector: [...this.currentStateVector], // Clone state vector
            baseEmotions: [...baseEmotionsArray], // Clone base emotions array
            stepCount: this.stepCount,
            eventTimer: this.eventTimer,
            gapTimer: this.gapTimer,
            currentEvent: this.currentEvent ? { ...this.currentEvent } : null // Clone event object
        };
    }
    /** Loads the environment state, validating input structure. */
    loadState(state) {
        if (!state || typeof state !== 'object') {
            console.error("Invalid state object provided for environment loading. Resetting state.");
            this._initializeState(); // Reset to defaults if load fails early
            return;
        }
        console.log("Loading environment state...");
        // Dispose existing tensor before creating a new one
        if (this.baseEmotions && !this.baseEmotions.isDisposed) {
            safeDisposeTensor(this.baseEmotions);
            this.baseEmotions = null; // Ensure it's null before reassignment
        }
        // Validate and load base dimensions first, as they affect vector sizes
        this.emotionDim = getConfigValue('Agent.EMOTION_DIM', 6); // Reload dims from config
        this.dimensions = getConfigValue('DIMENSIONS', 12);
        this.baseStateDim = this.dimensions + this.emotionDim;
        // Validate and load state vector
        if (Array.isArray(state.currentStateVector) && state.currentStateVector.every((v) => typeof v === 'number')) {
            if (state.currentStateVector.length === this.baseStateDim) {
                this.currentStateVector = [...state.currentStateVector];
            }
            else {
                console.warn(`Loaded currentStateVector length (${state.currentStateVector.length}) differs from expected ${this.baseStateDim}. Resetting state vector.`);
                this.currentStateVector = zeros([this.baseStateDim]);
            }
        }
        else {
            console.warn("Invalid or missing 'currentStateVector' in saved state. Resetting state vector.");
            this.currentStateVector = zeros([this.baseStateDim]);
        }
        // Validate and load base emotions array
        let loadedBaseEmotionsArray;
        if (Array.isArray(state.baseEmotions) && state.baseEmotions.every((v) => typeof v === 'number')) {
            if (state.baseEmotions.length === this.emotionDim) {
                loadedBaseEmotionsArray = [...state.baseEmotions];
            }
            else {
                console.warn(`Loaded baseEmotions length (${state.baseEmotions.length}) differs from expected ${this.emotionDim}. Resetting base emotions.`);
                loadedBaseEmotionsArray = zeros([this.emotionDim]);
            }
        }
        else {
            console.warn("Invalid or missing 'baseEmotions' array in saved state. Resetting base emotions.");
            loadedBaseEmotionsArray = zeros([this.emotionDim]);
        }
        // Create and keep the tensor from the loaded/validated array
        try {
            this.baseEmotions = tf.keep(tf.tensor([loadedBaseEmotionsArray], [1, this.emotionDim]));
        }
        catch (e) {
            console.error("Error creating baseEmotions tensor during loadState:", e);
            this.baseEmotions = tf.keep(tf.zeros([1, this.emotionDim])); // Fallback tensor
        }
        // Validate and load timers and event state
        this.stepCount = (typeof state.stepCount === 'number' && isFinite(state.stepCount) && state.stepCount >= 0) ? state.stepCount : 0;
        this.eventTimer = (typeof state.eventTimer === 'number' && isFinite(state.eventTimer) && state.eventTimer >= 0) ? state.eventTimer : 0;
        // Use the potentially reloaded config value for eventGap as fallback
        this.gapTimer = (typeof state.gapTimer === 'number' && isFinite(state.gapTimer) && state.gapTimer >= 0) ? state.gapTimer : this.eventGap;
        // Validate currentEvent structure
        if (state.currentEvent && typeof state.currentEvent === 'object' &&
            typeof state.currentEvent.type === 'string' &&
            typeof state.currentEvent.context === 'string' &&
            typeof state.currentEvent.reward === 'number' && isFinite(state.currentEvent.reward)) {
            // Ensure the event type is still valid according to current config
            if (this.events.some(e => e[0] === state.currentEvent.type)) {
                this.currentEvent = { ...state.currentEvent };
            }
            else {
                console.warn(`Loaded currentEvent type "${state.currentEvent.type}" is no longer valid. Clearing current event.`);
                this.currentEvent = null;
                // If event was active, reset timers appropriately
                if (this.eventTimer > 0) {
                    this.eventTimer = 0;
                    this.gapTimer = this.eventGap;
                }
            }
        }
        else {
            // If eventTimer indicates an event should be active, but event data is bad, reset
            if (this.eventTimer > 0) {
                console.warn("Inconsistent state: eventTimer > 0 but currentEvent data is invalid/missing. Resetting event state.");
                this.eventTimer = 0;
                this.gapTimer = this.eventGap;
            }
            this.currentEvent = null;
        }
        console.log("Environment state loaded successfully.");
    }
    /** Cleans up TensorFlow resources (specifically the baseEmotions tensor). */
    cleanup() {
        console.log("Cleaning up Environment tensors...");
        if (this.baseEmotions) { // Check if it exists first
            if (!this.baseEmotions.isDisposed) {
                try {
                    safeDisposeTensor(this.baseEmotions);
                }
                catch (e) {
                    console.error("Error disposing baseEmotions tensor:", e);
                }
            }
            this.baseEmotions = null; // Set to null after disposal
        }
        console.log("Environment cleanup complete.");
    }
}
