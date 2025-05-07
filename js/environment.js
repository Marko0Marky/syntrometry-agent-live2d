"use strict";

import { Config, emotionKeywords, emotionNames } from './config.js';
import { zeros, tensor, clamp, displayError } from './utils.js';

// Assumes tf is available globally via CDN

/**
 * Represents the simulation environment, managing state, events, and rewards.
 * Simulates fluctuations influenced by agent's emotions and random events.
 */
export class EmotionalSpace {
    constructor() {
        // Check TensorFlow.js availability
        if (typeof tf === 'undefined') {
            throw new Error("[Environment] TensorFlow.js is required but not available.");
        }

        // Validate Config properties
        this._validateConfig();

        // Define potential environmental events
        this.events = [
            // [Emotion Name, Context Description, Base Reward/Penalty]
            ["Joy", "A pleasant resonance occurs in the field.", 1.5],
            ["Fear", "A dissonant pattern is detected nearby.", -1.8],
            ["Curiosity", "An unexpected structural variation appears.", 1.2],
            ["Frustration", "System encounters processing resistance.", -1.0],
            ["Calm", "Patterns stabilize into local harmony.", 0.8],
            ["Surprise", "A sudden cascade shift happens.", 1.6]
        ];
        this.emotionNames = this.events.map(e => e[0]); // Extract names for mapping

        // Base emotional tone of the environment (drifts based on agent and events)
        this.baseEmotions = null; // Initialize as null, set in _initializeState

        this.stepCount = 0;
        this.eventTimer = 0; // Countdown timer for active event duration
        this.gapTimer = 0; // Countdown timer for minimum gap between events
        this.currentEvent = null; // Holds data for the currently active event
        this.currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]); // Full state vector (core + emotions)

        // Initialize state synchronously to avoid async constructor issues
        this._initializeState();
    }

    /** Validates required Config properties, setting defaults if missing. */
    _validateConfig() {
        const requiredProps = [
            { path: 'Agent.EMOTION_DIM', default: 6 },
            { path: 'Agent.BASE_STATE_DIM', default: 18 }, // Default derived from DIMENSIONS+EMOTION_DIM
            { path: 'Env.EVENT_GAP', default: 180 },
            { path: 'Env.EVENT_DURATION', default: 120 },
            { path: 'Env.EVENT_FREQ', default: 0.015 },
            { path: 'Env.BASE_EMOTION_DRIFT_RATE', default: 0.005 },
            { path: 'Env.BASE_EMOTION_REVERSION_RATE', default: 0.001 },
            { path: 'DIMENSIONS', default: 12 },
            { path: 'DYSVARIANT_PROB', default: 0.02 }
        ];
        for (const { path, default: def } of requiredProps) {
            const parts = path.split('.');
            let current = Config;
            let validPath = true;
            // Traverse/create nested structure
            for (let i = 0; i < parts.length - 1; i++) {
                if (current[parts[i]] === undefined || typeof current[parts[i]] !== 'object' || current[parts[i]] === null) {
                    // console.warn(`Creating missing Config section for ${path}.`); // Can be noisy
                    current[parts[i]] = {}; // Create section if missing or not an object
                }
                current = current[parts[i]];
                // Double-check after assignment, should not fail if logic above is correct
                if (typeof current !== 'object' || current === null) {
                    console.error(`Failed to create valid section for ${path}. Config structure might be problematic.`);
                    validPath = false;
                    break;
                }
            }
            // Set default value at the final level if path is valid and property is undefined
            if (validPath && current[parts[parts.length - 1]] === undefined) {
                console.warn(`Missing Config.${path}, using default: ${def}`);
                current[parts[parts.length - 1]] = def;
            }
        }
        // Ensure BASE_STATE_DIM is correctly derived after potential defaults are set
        if (Config.DIMENSIONS !== undefined && Config.Agent?.EMOTION_DIM !== undefined) {
             // Ensure Agent object exists if DIMENSIONS and EMOTION_DIM were just defaulted
             Config.Agent = Config.Agent || {};
            Config.Agent.BASE_STATE_DIM = Config.DIMENSIONS + Config.Agent.EMOTION_DIM;
        } else if (Config.Agent?.BASE_STATE_DIM === undefined) {
            // Fallback if derivation isn't possible (shouldn't happen with defaults above)
            console.error("Config.DIMENSIONS or Config.Agent.EMOTION_DIM missing for BASE_STATE_DIM derivation. Using fallback default.");
            Config.Agent = Config.Agent || {};
            Config.Agent.BASE_STATE_DIM = requiredProps.find(p=>p.path === 'Agent.BASE_STATE_DIM').default;
        }
    }

    /** Initializes or resets the environment's internal state. */
    _initializeState() {
        this.stepCount = 0;
        this.eventTimer = 0;
        // Use validated config values
        this.gapTimer = Config.Env?.EVENT_GAP ?? 180; // Start with a gap
        this.currentEvent = null;

        // Dispose previous tensor if it exists
        if (this.baseEmotions && typeof this.baseEmotions.dispose === 'function' && !this.baseEmotions.isDisposed) {
            tf.dispose(this.baseEmotions);
        }

        // Initialize baseEmotions - ensure length matches config
        const initialBaseRaw = [0.6, 0.1, 0.3, 0.1, 0.5, 0.2]; // Example: Joy, Fear, Curiosity, Frustration, Calm, Surprise
        const emotionDim = Config.Agent?.EMOTION_DIM ?? 6;
        const initialBase = initialBaseRaw.slice(0, emotionDim);
        while(initialBase.length < emotionDim) initialBase.push(0.5); // Pad with neutral if needed
        this.baseEmotions = tf.keep(tf.tensor([initialBase], [1, emotionDim]));

        // Initialize the full state vector based on initial base emotions
        const baseStateDim = Config.Agent?.BASE_STATE_DIM ?? 18;
        this.currentStateVector = zeros([baseStateDim]);
        // Populate stateVector based on initial baseEmotions (call awaits result)
        this._updateStateVector(this.baseEmotions, null)
            .catch(e => console.error("Error during initial state vector update:", e)); // Handle potential async error
    }

    /**
     * Resets the environment to its initial state.
     * @returns {Promise<{state: tf.Tensor | null}>} The initial state tensor. Caller is responsible for disposing the tensor.
     */
    async reset() {
        this._initializeState(); // Use the common initialization logic
        console.log("Environment Reset.");
        const stateTensor = await this._getStateTensor(); // Awaits internal update
        // Return a *new* kept tensor for the caller
        return { state: stateTensor ? tf.keep(stateTensor.clone()) : null };
    }

    /**
     * Advances the environment simulation by one step.
     * @param {tf.Tensor|null} agentEmotionsTensor - Agent's emotion tensor [1, EMOTION_DIM], or null if unavailable.
     * @param {number} [currentRIHScore=0] - Agent's RIH score [0, 1], influences dysvariant probability.
     * @param {number} [currentAvgAffinity=0] - Agent's average affinity [-1, 1], affects fluctuation amplitude.
     * @returns {Promise<{state: tf.Tensor|null, reward: number, done: boolean, context: string, eventType: string|null}>}
     * Caller is responsible for disposing the returned state tensor.
     */
    async step(agentEmotionsTensor, currentRIHScore = 0, currentAvgAffinity = 0) {
        this.stepCount++;
        let reward = 0;
        let context = "Ambient fluctuations.";
        let triggeredEventType = null;
        const emotionDim = Config.Agent?.EMOTION_DIM ?? 6;

        // Safely get agent emotions array
        let agentEmotionsArray = zeros([emotionDim]);
        if (agentEmotionsTensor && typeof agentEmotionsTensor.array === 'function' && !agentEmotionsTensor.isDisposed) {
             try {
                  agentEmotionsArray = (await agentEmotionsTensor.array())[0];
                  // Ensure correct length, pad if necessary (shouldn't happen if agent uses config)
                  while (agentEmotionsArray.length < emotionDim) agentEmotionsArray.push(0.5);
                  agentEmotionsArray = agentEmotionsArray.slice(0, emotionDim);
             } catch (e) {
                 console.error("Error getting agent emotions array:", e);
                 // Fallback already initialized
             }
        }

        // Use validated config values with defaults
        const driftRate = Config.Env?.BASE_EMOTION_DRIFT_RATE ?? 0.005;
        const reversionRate = Config.Env?.BASE_EMOTION_REVERSION_RATE ?? 0.001;
        const eventDuration = Config.Env?.EVENT_DURATION ?? 120;
        const eventGap = Config.Env?.EVENT_GAP ?? 180;
        const eventFreq = Config.Env?.EVENT_FREQ ?? 0.015;
        const coreDims = Config?.DIMENSIONS ?? 12;
        const dysVarProb = Config?.DYSVARIANT_PROB ?? 0.02;

        // Update Base Environment Emotions (using tf.tidy)
        if (this.baseEmotions && !this.baseEmotions.isDisposed) {
            try {
                const updatedBaseEmotions = tf.tidy(() => {
                    const currentBase = this.baseEmotions;
                    // Ensure agentEmotions tensor has correct shape [1, emotionDim]
                    const agentEmotions = tf.tensor([agentEmotionsArray], [1, emotionDim]);
                    const driftToAgent = agentEmotions.sub(currentBase).mul(driftRate);
                    const revertToNeutral = tf.scalar(0.5).sub(currentBase).mul(reversionRate);
                    return currentBase.add(driftToAgent).add(revertToNeutral).clipByValue(0, 1);
                });
                tf.dispose(this.baseEmotions); // Dispose old tensor
                this.baseEmotions = tf.keep(updatedBaseEmotions); // Keep the new one
            } catch (e) {
                console.error("Error updating base emotions tensor:", e);
                if (this.baseEmotions && !this.baseEmotions.isDisposed) tf.dispose(this.baseEmotions);
                this.baseEmotions = tf.keep(tf.zeros([1, emotionDim])); // Reset on error
            }
        } else { // If baseEmotions was null or disposed somehow
            this.baseEmotions = tf.keep(tf.zeros([1, emotionDim]));
        }

        // Event Management
        if (this.eventTimer > 0) {
            this.eventTimer--;
            context = this.currentEvent?.context ?? "Event active.";
            // Reward decays linearly over the event duration
            reward = (this.currentEvent?.reward ?? 0) * (this.eventTimer / eventDuration);
            triggeredEventType = this.currentEvent?.type ?? null;
            if (this.eventTimer === 0) {
                this.currentEvent = null;
                this.gapTimer = eventGap; // Start gap after event ends
                context = "Event concluded.";
            }
        } else if (this.gapTimer > 0) {
            this.gapTimer--;
            context = "System stable.";
        } else { // Gap is over, check for new event
            const emotionIntensity = agentEmotionsArray.reduce((sum, val) => sum + val, 0) / emotionDim;
            const triggerProb = Math.min(eventFreq * (1 + emotionIntensity * 0.5), 1);

            if (Math.random() < triggerProb) {
                // Select event based on agent's current emotion profile
                const eventProbs = agentEmotionsArray.map(e => e * 0.5 + 0.5); // Bias towards higher emotions
                const totalProb = eventProbs.reduce((a, b) => a + b, 0);
                const normalizedProbs = totalProb > 0
                    ? eventProbs.map(p => p / totalProb)
                    : Array(emotionDim).fill(1 / emotionDim); // Uniform if no emotion

                let rand = Math.random();
                let eventIdx = 0;
                for (let i = 0; i < normalizedProbs.length; i++) {
                    rand -= normalizedProbs[i];
                    if (rand <= 0) {
                        eventIdx = i;
                        break;
                    }
                }
                // Ensure index is valid for the defined events array
                eventIdx = clamp(eventIdx, 0, this.events.length - 1);

                const eventData = this.events[eventIdx];
                this.currentEvent = { type: eventData[0], context: eventData[1], reward: eventData[2] };
                context = this.currentEvent.context;
                triggeredEventType = this.currentEvent.type;
                // Initial reward is scaled by agent's corresponding emotion intensity
                const agentCorrespondingEmotion = agentEmotionsArray[eventIdx] ?? 0;
                reward = this.currentEvent.reward * (agentCorrespondingEmotion * 0.7 + 0.3);
                this.eventTimer = eventDuration; // Start event timer
            } else {
                // No event triggered, reset gap timer (or maybe a shorter random gap?)
                this.gapTimer = eventGap;
                context = "System stable.";
            }
        }

        // Dysvariant Fluctuations
        // Probability increases if RIH is low
        const effectiveDysVarProb = dysVarProb * (1 - clamp(currentRIHScore, 0, 1));
        if (Math.random() < effectiveDysVarProb) {
            const randomIndex = Math.floor(Math.random() * coreDims);
            // Amplitude decreases if Affinity is high (more coherent structure resists fluctuation)
            const amplitude = (Math.random() - 0.5) * 0.3 * (1 - clamp(currentAvgAffinity, -1, 1));
            if (this.currentStateVector.length > randomIndex) {
                this.currentStateVector[randomIndex] = clamp((this.currentStateVector[randomIndex] || 0) + amplitude, -1, 1);
            }
            context += " (Dysvariant fluctuation)";
        }

        // Update the internal stateVector based on new baseEmotions and event
        await this._updateStateVector(this.baseEmotions, triggeredEventType);

        // Get the final state tensor for output
        const stateTensor = await this._getStateTensor();
        const done = false; // Simulation doesn't naturally end in this model

        if (!stateTensor || (stateTensor instanceof tf.Tensor && stateTensor.isDisposed)) {
            console.error("[Environment Step] Failed to generate valid state tensor. Returning null state.");
            return { state: null, reward, done, context, eventType: triggeredEventType };
        }

        // Return a *new* kept tensor clone for the caller
        return { state: tf.keep(stateTensor.clone()), reward, done, context, eventType: triggeredEventType };
    }

    /**
     * Internal helper to update the core dimensions of the state vector based on emotions and events.
     * Also appends the base emotions to the end to form the full BASE_STATE_DIM vector.
     * @param {tf.Tensor | null} currentBaseEmotions - The environment's base emotion tensor.
     * @param {string | null} eventType - The type of the active event, if any.
     */
    async _updateStateVector(currentBaseEmotions, eventType = null) {
        const emotionDim = Config.Agent?.EMOTION_DIM ?? 6;
        const coreDims = Config?.DIMENSIONS ?? 12;
        const baseStateDim = Config.Agent?.BASE_STATE_DIM ?? 18;

        // Safely get base emotions array
        let emotions = zeros([emotionDim]);
        if (currentBaseEmotions && typeof currentBaseEmotions.array === 'function' && !currentBaseEmotions.isDisposed) {
             try { emotions = (await currentBaseEmotions.array())[0]; }
             catch(e){ console.error("Error getting base emotions array for update:", e); }
        }

        // Ensure currentStateVector has the correct length
        if (this.currentStateVector.length !== baseStateDim) {
            this.currentStateVector = zeros([baseStateDim]);
        }

        // Update core dimensions (indices 0 to coreDims - 1) based on emotions
        // Example mapping (adjust based on desired state vector meaning)
        this.currentStateVector[0] = clamp(((emotions[0] || 0) - (emotions[1] || 0)) * 0.8, -1, 1); // Joy vs Fear
        if (coreDims > 1) this.currentStateVector[1] = clamp(((emotions[4] || 0) - (emotions[3] || 0)) * 0.7, -1, 1); // Calm vs Frustration
        if (coreDims > 2) this.currentStateVector[2] = clamp((emotions[2] || 0) * 1.5 - 0.5, -1, 1); // Curiosity scaled
        if (coreDims > 3) this.currentStateVector[3] = clamp((emotions[5] || 0) * 1.2 - 0.3, -1, 1); // Surprise scaled

        // Update remaining core dimensions with some decay and random noise
        for (let i = 4; i < coreDims; i++) {
            const emoIdx = i % emotionDim; // Cycle through emotions
            const prevVal = this.currentStateVector[i] || 0;
            const emoInfluence = ((emotions[emoIdx] || 0) - 0.5) * 0.15; // Influence towards +/- based on emotion deviation from neutral
            const randomPerturbation = (Math.random() - 0.5) * 0.03; // Small random noise
            this.currentStateVector[i] = clamp(prevVal * 0.95 + emoInfluence + randomPerturbation, -1, 1); // Apply decay, influence, noise
        }

        // Apply event-specific perturbations to core dimensions
        if (eventType) {
            const emotionIndex = this.emotionNames.indexOf(eventType);
            if (emotionIndex !== -1) {
                // Perturb dimensions related to the event's emotion index
                const dim1 = emotionIndex % coreDims;
                const dim2 = (emotionIndex + 3) % coreDims; // Another related dimension
                if (this.currentStateVector.length > dim1) this.currentStateVector[dim1] = clamp((this.currentStateVector[dim1] || 0) + 0.4, -1, 1);
                if (this.currentStateVector.length > dim2) this.currentStateVector[dim2] = clamp((this.currentStateVector[dim2] || 0) + 0.15, -1, 1);
                // Apply small random perturbations to a few other dimensions
                for (let k = 0; k < 3; k++) {
                    const randDim = Math.floor(Math.random() * coreDims);
                    if (this.currentStateVector.length > randDim) this.currentStateVector[randDim] = clamp((this.currentStateVector[randDim] || 0) + (Math.random() - 0.5) * 0.1, -1, 1);
                }
            }
        }

        // Append base emotion values to the vector (indices coreDims to baseStateDim - 1)
        for (let i = 0; i < emotionDim; i++) {
            const emotionVal = emotions[i] ?? 0;
            const stateDimIndex = coreDims + i;
            if (stateDimIndex < baseStateDim) {
                this.currentStateVector[stateDimIndex] = clamp(emotionVal, 0, 1);
            } else {
                // This should not happen if baseStateDim is correctly calculated
                console.warn(`State vector index out of bounds while appending emotions: Index ${stateDimIndex}, Max ${baseStateDim-1}`);
            }
        }
        // Ensure final vector has the correct BASE length (should already be correct)
        this.currentStateVector = this.currentStateVector.slice(0, baseStateDim);
    }

    /**
     * Returns the current BASE state vector as a TensorFlow tensor.
     * @returns {Promise<tf.Tensor | null>} A [1, BASE_STATE_DIM] tensor or null. Caller is responsible for disposing the tensor.
     */
    async _getStateTensor() {
        const baseStateDim = Config.Agent?.BASE_STATE_DIM ?? 18;
        // Ensure the internal vector has the correct length before creating tensor
        while (this.currentStateVector.length < baseStateDim) this.currentStateVector.push(0.0);
        const finalStateArray = this.currentStateVector.slice(0, baseStateDim);

        try {
            // Await needed if tensor creation itself could be async (though usually not)
            const stateTensor = await tf.tensor([finalStateArray], [1, baseStateDim]);
            // No keep here, caller gets the tensor and is responsible
            return stateTensor;
        } catch (e) {
            console.error("Error creating state tensor:", e, finalStateArray);
            displayError(`TF Error creating state tensor: ${e.message}`, false);
            return null;
        }
    }

    /**
     * Calculates the potential emotional impact of a text input based on keywords.
     * Also directly modifies the environment's baseEmotions based on the keywords found.
     * @param {string} text - The input text from the user.
     * @returns {Promise<tf.Tensor | null>} A [1, EMOTION_DIM] tensor representing the detected emotional impact, or null if TF unavailable.
     * Caller is responsible for disposing the tensor.
     */
    async getEmotionalImpactFromText(text) {
         const emotionDim = Config.Agent?.EMOTION_DIM ?? 6;
        const impact = zeros([emotionDim]);
        let foundKeyword = false;
        const lowerText = text.toLowerCase();
        let baseEmotionsChanged = false;
        let currentBase = zeros([emotionDim]);

        // Get current base emotions array safely
        if (this.baseEmotions && !this.baseEmotions.isDisposed) {
            try { currentBase = (await this.baseEmotions.array())[0]; }
            catch (e) { console.error("Error reading base emotions for text impact:", e); }
        } else { console.warn("Using zero fallback for base emotions in text impact."); }
        // Ensure correct length
        while(currentBase.length < emotionDim) currentBase.push(0.5);
        currentBase = currentBase.slice(0, emotionDim);


        // Iterate through defined emotion keywords
        for (const idxStr in emotionKeywords) {
            const info = emotionKeywords[idxStr];
            const numIdx = parseInt(idxStr, 10);
            if (isNaN(numIdx) || numIdx >= emotionDim) continue; // Skip if index invalid or out of bounds

            for (let keyword of info.keywords) {
                if (lowerText.includes(keyword)) {
                    impact[numIdx] = Math.max(impact[numIdx], info.strength);
                    foundKeyword = true;
                    // Modify the *copy* of the base emotions array
                    if (currentBase.length > numIdx) {
                        currentBase[numIdx] = clamp((currentBase[numIdx] || 0) + (info.baseChange || 0), 0, 1);
                        baseEmotionsChanged = true;
                    }
                    break; // Move to next emotion once a keyword is found for the current one
                }
            }
        }

        // Update the environment's baseEmotions tensor *if* changes occurred
        if (baseEmotionsChanged) {
             try{
                 if (this.baseEmotions && !this.baseEmotions.isDisposed) tf.dispose(this.baseEmotions);
                 this.baseEmotions = tf.keep(tf.tensor([currentBase], [1, emotionDim]));
                 // Update the main state vector immediately after changing base emotions
                 await this._updateStateVector(this.baseEmotions, this.currentEvent?.type);
             } catch(e) {
                 console.error("Error updating base emotions tensor after text impact:", e);
             }
        }

        // If no specific keywords found, apply a default low impact (e.g., curiosity)
        if (!foundKeyword) {
            const curiosityIndex = emotionNames.indexOf("Curiosity"); // Find index dynamically
            const calmIndex = emotionNames.indexOf("Calm");
            if (curiosityIndex !== -1 && curiosityIndex < impact.length) impact[curiosityIndex] = 0.3;
            if (calmIndex !== -1 && calmIndex < impact.length) impact[calmIndex] = 0.2;
        }

        try {
            const impactTensor = await tf.tensor([impact], [1, emotionDim]);
            // Return a new kept tensor for the caller
            return tf.keep(impactTensor.clone());
        } catch (e) {
            console.error("Error creating impact tensor:", e, impact);
            displayError(`TF Error creating impact tensor: ${e.message}`, false);
            return null;
        }
    }

    /**
     * Returns the current state of the environment for saving.
     * @returns {Object | null} The current environment state, or null on error.
     */
    getState() {
        try {
             // Ensure baseEmotions tensor is valid before getting array
             let baseEmotionsArray = zeros([Config.Agent?.EMOTION_DIM ?? 6]);
             if (this.baseEmotions && !this.baseEmotions.isDisposed) {
                 baseEmotionsArray = this.baseEmotions.arraySync()[0];
             } else {
                 console.warn("Saving environment state with invalid baseEmotions tensor.");
             }

            return {
                // Ensure arrays are actual copies, not references
                currentStateVector: [...this.currentStateVector],
                baseEmotions: [...baseEmotionsArray], // Save as array
                stepCount: this.stepCount,
                eventTimer: this.eventTimer,
                gapTimer: this.gapTimer,
                currentEvent: this.currentEvent ? { ...this.currentEvent } : null // Deep copy event object
            };
        } catch (e) {
             console.error("Error getting environment state:", e);
             return null; // Indicate failure
        }
    }

    /**
     * Loads the environment state from a saved object.
     * @param {Object} state - The saved state object.
     */
    loadState(state) {
        if (!state || typeof state !== 'object') {
            console.error("Invalid state object provided for environment loading.");
            this._initializeState(); // Reset to default if load fails
            return;
        }
        console.log("Loading environment state...");
        try {
            const baseStateDim = Config.Agent?.BASE_STATE_DIM ?? 18;
            const emotionDim = Config.Agent?.EMOTION_DIM ?? 6;

            // Load state vector carefully, ensuring correct length
            this.currentStateVector = (Array.isArray(state.currentStateVector) && state.currentStateVector.length === baseStateDim)
                ? [...state.currentStateVector] // Copy the array
                : zeros([baseStateDim]); // Reset if invalid

            // Dispose existing tensor before creating new one
            if (this.baseEmotions && !this.baseEmotions.isDisposed) tf.dispose(this.baseEmotions);

            // Load base emotions tensor, ensuring correct length
            const baseEmotionsArray = (Array.isArray(state.baseEmotions) && state.baseEmotions.length === emotionDim)
                ? state.baseEmotions
                : zeros([emotionDim]); // Reset if invalid
            this.baseEmotions = tf.keep(tf.tensor([baseEmotionsArray], [1, emotionDim]));

            // Load timers and event state safely
            this.stepCount = typeof state.stepCount === 'number' ? state.stepCount : 0;
            this.eventTimer = typeof state.eventTimer === 'number' ? state.eventTimer : 0;
            this.gapTimer = typeof state.gapTimer === 'number' ? state.gapTimer : (Config.Env?.EVENT_GAP ?? 180);
            // Safely copy currentEvent object
            this.currentEvent = (state.currentEvent && typeof state.currentEvent === 'object') ? { ...state.currentEvent } : null;

            console.log("Environment state loaded successfully.");
        } catch (e) {
            console.error("Error applying loaded environment state:", e);
            displayError(`Error loading environment state: ${e.message}`, false, 'error-message');
            this._initializeState(); // Reset to default state on error
        }
    }

    /**
     * Cleans up TensorFlow resources used by the environment.
     */
    cleanup() {
        if (this.baseEmotions && !this.baseEmotions.isDisposed) {
            try { tf.dispose(this.baseEmotions); }
            catch (e) { console.error("Error disposing baseEmotions:", e); }
        }
        this.baseEmotions = null; // Nullify reference
    }
}
