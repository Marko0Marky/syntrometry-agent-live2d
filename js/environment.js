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
        this.baseEmotions = null; // Initialize as null, set in reset/constructor

        this.stepCount = 0;
        this.eventTimer = 0; // Countdown timer for active event duration
        this.gapTimer = 0; // Countdown timer for minimum gap between events
        this.currentEvent = null; // Holds data for the currently active event
        this.currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]); // Full state vector (core + emotions)

        this._initializeState(); // Set up initial baseEmotions and stateVector
    }

    /** Validates required Config properties, setting defaults if missing. */
    _validateConfig() {
        const requiredProps = [
            { path: 'Agent.EMOTION_DIM', default: 6 },
            { path: 'Agent.BASE_STATE_DIM', default: 10 },
            { path: 'Env.EVENT_GAP', default: 5 },
            { path: 'Env.EVENT_DURATION', default: 3 },
            { path: 'Env.EVENT_FREQ', default: 0.1 },
            { path: 'Env.BASE_EMOTION_DRIFT_RATE', default: 0.05 },
            { path: 'Env.BASE_EMOTION_REVERSION_RATE', default: 0.02 },
            { path: 'DIMENSIONS', default: 4 },
            { path: 'DYSVARIANT_PROB', default: 0.05 }
        ];
        for (const { path, default: def } of requiredProps) {
            const [section, key] = path.split('.');
            if (!Config?.[section]?.[key]) {
                console.warn(`Missing Config.${path}, using default: ${def}`);
                Config[section] = Config[section] || {};
                Config[section][key] = def;
            }
        }
    }

    /** Initializes or resets the environment's internal state. */
    _initializeState() {
        this.stepCount = 0;
        this.eventTimer = 0;
        this.gapTimer = Config.Env.EVENT_GAP; // Start with a gap
        this.currentEvent = null;

        // Dispose previous tensor if it exists
        if (this.baseEmotions && typeof this.baseEmotions.dispose === 'function' && !this.baseEmotions.isDisposed) {
            tf.dispose(this.baseEmotions);
        }

        // Initialize baseEmotions carefully checking for tf availability
        if (typeof tf !== 'undefined') {
            // Start with a slightly positive/calm initial environment tone
            const initialBase = [0.6, 0.1, 0.3, 0.1, 0.5, 0.2]; // Joy, Fear, Curiosity, Frustration, Calm, Surprise
            this.baseEmotions = tf.keep(tf.tensor([initialBase], [1, Config.Agent.EMOTION_DIM]));
        } else {
            console.error("[Environment] TensorFlow not available during initialization.");
            this.baseEmotions = null; // Set to null if TF is missing
        }

        // Initialize the full state vector based on initial base emotions
        this.currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);
        this._updateStateVector(this.baseEmotions, null); // Populate stateVector based on initial baseEmotions
    }

    /** Resets the environment to its initial state. */
    reset() {
        this._initializeState(); // Use the common initialization logic
        console.log("Environment Reset.");
        // Return the initial state tensor
        return { state: this._getStateTensor() };
    }

    /**
     * Advances the environment simulation by one step.
     * @param {tf.Tensor|null} agentEmotionsTensor - Agent's emotion tensor [1, EMOTION_DIM], or null if unavailable.
     * @param {number} [currentRIHScore=0] - Agent's RIH score [0, 1], influences dysvariant probability.
     * @param {number} [currentAvgAffinity=0] - Agent's average affinity [-1, 1], affects fluctuation amplitude.
     * @returns {Promise<{state: tf.Tensor|null, reward: number, done: boolean, context: string, eventType: string|null}>}
     * @throws {Error} If TensorFlow.js is unavailable or Config is invalid.
     */
    async step(agentEmotionsTensor, currentRIHScore = 0, currentAvgAffinity = 0) {
        this.stepCount++;
        let reward = 0;
        let context = "Ambient fluctuations.";
        let triggeredEventType = null;

        const agentEmotionsArray = (agentEmotionsTensor && typeof agentEmotionsTensor.array === 'function' && !agentEmotionsTensor.isDisposed)
            ? (await agentEmotionsTensor.array())[0]
            : zeros([Config.Agent.EMOTION_DIM]);

        const driftRate = Config?.Env?.BASE_EMOTION_DRIFT_RATE ?? 0;
        const reversionRate = Config?.Env?.BASE_EMOTION_REVERSION_RATE ?? 0;

        // Update Base Environment Emotions
        if (this.baseEmotions && !this.baseEmotions.isDisposed && typeof tf !== 'undefined') {
            try {
                const updatedBaseEmotions = tf.tidy(() => {
                    const currentBase = this.baseEmotions;
                    const agentEmotions = tf.tensor([agentEmotionsArray], [1, Config.Agent.EMOTION_DIM]);
                    const driftToAgent = agentEmotions.sub(currentBase).mul(driftRate);
                    const revertToNeutral = tf.scalar(0.5).sub(currentBase).mul(reversionRate);
                    return currentBase.add(driftToAgent).add(revertToNeutral).clipByValue(0, 1);
                });
                tf.dispose(this.baseEmotions);
                this.baseEmotions = tf.keep(updatedBaseEmotions);
            } catch (e) {
                console.error("Error updating base emotions tensor:", e);
                if (this.baseEmotions && !this.baseEmotions.isDisposed) tf.dispose(this.baseEmotions);
                this.baseEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            }
        } else if (typeof tf !== 'undefined' && !this.baseEmotions) {
            this.baseEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        // Event Management
        if (this.eventTimer > 0) {
            this.eventTimer--;
            context = this.currentEvent?.context ?? "Event active.";
            reward = (this.currentEvent?.reward ?? 0) * (this.eventTimer / Config.Env.EVENT_DURATION);
            triggeredEventType = this.currentEvent?.type ?? null;
            if (this.eventTimer === 0) {
                this.currentEvent = null;
                this.gapTimer = Config.Env.EVENT_GAP;
                context = "Event concluded.";
            }
        } else if (this.gapTimer > 0) {
            this.gapTimer--;
            context = "System stable.";
        } else {
            const emotionIntensity = agentEmotionsArray.reduce((sum, val) => sum + val, 0) / Config.Agent.EMOTION_DIM;
            const triggerProb = Math.min(Config.Env.EVENT_FREQ * (1 + emotionIntensity * 0.5), 1);
            if (Math.random() < triggerProb) {
                const eventProbs = agentEmotionsArray.map(e => e * 0.5 + 0.5);
                const totalProb = eventProbs.reduce((a, b) => a + b, 0);
                const normalizedProbs = totalProb > 0
                    ? eventProbs.map(p => p / totalProb)
                    : Array(Config.Agent.EMOTION_DIM).fill(1 / Config.Agent.EMOTION_DIM);
                let rand = Math.random();
                let eventIdx = 0;
                for (let i = 0; i < normalizedProbs.length; i++) {
                    rand -= normalizedProbs[i];
                    if (rand <= 0) {
                        eventIdx = i;
                        break;
                    }
                }
                eventIdx = clamp(eventIdx, 0, this.events.length - 1);
                const eventData = this.events[eventIdx];
                this.currentEvent = { type: eventData[0], context: eventData[1], reward: eventData[2] };
                context = this.currentEvent.context;
                triggeredEventType = this.currentEvent.type;
                const agentCorrespondingEmotion = agentEmotionsArray[eventIdx] ?? 0;
                reward = this.currentEvent.reward * (agentCorrespondingEmotion * 0.7 + 0.3);
                this.eventTimer = Config.Env.EVENT_DURATION;
            } else {
                this.gapTimer = Config.Env.EVENT_GAP;
                context = "System stable.";
            }
        }

        // Dysvariant Fluctuations
        const dysvariantProb = Config.DYSVARIANT_PROB * (1 - clamp(currentRIHScore, 0, 1));
        if (Math.random() < dysvariantProb) {
            const randomIndex = Math.floor(Math.random() * Config.DIMENSIONS);
            const amplitude = (Math.random() - 0.5) * 0.3 * (1 - clamp(currentAvgAffinity, -1, 1));
            if (this.currentStateVector.length > randomIndex) {
                this.currentStateVector[randomIndex] = clamp((this.currentStateVector[randomIndex] || 0) + amplitude, -1, 1);
            }
            context += " (Dysvariant fluctuation)";
        }

        this._updateStateVector(this.baseEmotions, triggeredEventType);
        const stateTensor = await this._getStateTensor();
        const done = false;

        if (!stateTensor || (stateTensor instanceof tf.Tensor && stateTensor.isDisposed)) {
            console.error("[Environment Step] Failed to generate valid state tensor. Returning null state.");
            return { state: null, reward, done, context, eventType: triggeredEventType };
        }

        return { state: stateTensor, reward, done, context, eventType: triggeredEventType };
    }

    /**
     * Internal helper to update the core dimensions of the state vector based on emotions and events.
     * Also appends the base emotions to the end to form the full BASE_STATE_DIM vector.
     * @param {tf.Tensor | null} currentBaseEmotions - The environment's base emotion tensor.
     * @param {string | null} eventType - The type of the active event, if any.
     */
    async _updateStateVector(currentBaseEmotions, eventType = null) {
        const emotions = currentBaseEmotions && typeof currentBaseEmotions.array === 'function' && !currentBaseEmotions.isDisposed
            ? (await currentBaseEmotions.array())[0]
            : zeros([Config.Agent.EMOTION_DIM]);

        // Update core dimensions (indices 0 to Config.DIMENSIONS - 1) based on emotions
        this.currentStateVector[0] = clamp(((emotions[0] || 0) - (emotions[1] || 0)) * 0.8, -1, 1); // Joy vs Fear
        this.currentStateVector[1] = clamp(((emotions[4] || 0) - (emotions[3] || 0)) * 0.7, -1, 1); // Calm vs Frustration
        this.currentStateVector[2] = clamp((emotions[2] || 0) * 1.5 - 0.5, -1, 1); // Curiosity scaled
        this.currentStateVector[3] = clamp((emotions[5] || 0) * 1.2 - 0.3, -1, 1); // Surprise scaled

        // Update remaining core dimensions with some decay and random noise
        for (let i = 4; i < Config.DIMENSIONS; i++) {
            const emoIdx = i % Config.Agent.EMOTION_DIM;
            const prevVal = this.currentStateVector[i] || 0;
            const emoInfluence = ((emotions[emoIdx] || 0) - 0.5) * 0.15;
            const randomPerturbation = (Math.random() - 0.5) * 0.03;
            this.currentStateVector[i] = clamp(prevVal * 0.95 + emoInfluence + randomPerturbation, -1, 1);
        }

        // Apply event-specific perturbations to core dimensions
        if (eventType) {
            const emotionIndex = this.emotionNames.indexOf(eventType);
            if (emotionIndex !== -1) {
                const dim1 = emotionIndex % Config.DIMENSIONS;
                const dim2 = (emotionIndex + 3) % Config.DIMENSIONS;
                if (this.currentStateVector.length > dim1) this.currentStateVector[dim1] = clamp((this.currentStateVector[dim1] || 0) + 0.4, -1, 1);
                if (this.currentStateVector.length > dim2) this.currentStateVector[dim2] = clamp((this.currentStateVector[dim2] || 0) + 0.15, -1, 1);
                for (let k = 0; k < 3; k++) {
                    const randDim = Math.floor(Math.random() * Config.DIMENSIONS);
                    if (this.currentStateVector.length > randDim) this.currentStateVector[randDim] = clamp((this.currentStateVector[randDim] || 0) + (Math.random() - 0.5) * 0.1, -1, 1);
                }
            }
        }

        // Append base emotion values to the vector (indices Config.DIMENSIONS to BASE_STATE_DIM - 1)
        for (let i = 0; i < Config.Agent.EMOTION_DIM; i++) {
            const emotionVal = emotions[i] ?? 0;
            const stateDimIndex = Config.DIMENSIONS + i;
            if (stateDimIndex < Config.Agent.BASE_STATE_DIM) {
                this.currentStateVector[stateDimIndex] = clamp(emotionVal, 0, 1);
            }
        }

        // Ensure final vector has the correct BASE length, padding with zeros if necessary
        while (this.currentStateVector.length < Config.Agent.BASE_STATE_DIM) this.currentStateVector.push(0.0);
        this.currentStateVector = this.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM);
    }

    /**
     * Returns the current BASE state vector as a TensorFlow tensor.
     * Returns null if TensorFlow is unavailable.
     * @returns {Promise<tf.Tensor | null>} A [1, BASE_STATE_DIM] tensor or null.
     */
    async _getStateTensor() {
        if (typeof tf === 'undefined') return null;
        while (this.currentStateVector.length < Config.Agent.BASE_STATE_DIM) this.currentStateVector.push(0.0);
        const finalStateArray = this.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM);
        try {
            return await tf.tensor([finalStateArray], [1, Config.Agent.BASE_STATE_DIM]);
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
     */
    async getEmotionalImpactFromText(text) {
        if (typeof tf === 'undefined') return null;

        const impact = zeros([Config.Agent.EMOTION_DIM]);
        let foundKeyword = false;
        const lowerText = text.toLowerCase();
        let baseEmotionsChanged = false;
        let currentBase = null;

        // Get current base emotions array safely
        if (this.baseEmotions && !this.baseEmotions.isDisposed) {
            try {
                currentBase = (await this.baseEmotions.array())[0];
            } catch (e) {
                console.error("Error reading base emotions for text impact:", e);
                currentBase = zeros([Config.Agent.EMOTION_DIM]);
            }
        } else {
            currentBase = zeros([Config.Agent.EMOTION_DIM]);
            console.warn("Using zero fallback for base emotions in text impact.");
        }

        // Iterate through defined emotion keywords
        for (let idx in emotionKeywords) {
            const info = emotionKeywords[idx];
            const numIdx = parseInt(idx, 10);
            if (isNaN(numIdx) || numIdx >= Config.Agent.EMOTION_DIM) continue;

            for (let keyword of info.keywords) {
                if (lowerText.includes(keyword)) {
                    impact[numIdx] = Math.max(impact[numIdx], info.strength);
                    foundKeyword = true;
                    if (currentBase.length > numIdx) {
                        currentBase[numIdx] = clamp((currentBase[numIdx] || 0) + (info.baseChange || 0), 0, 1);
                        baseEmotionsChanged = true;
                    }
                    break;
                }
            }
        }

        // Update the environment's baseEmotions tensor if changes occurred
        if (baseEmotionsChanged && typeof tf !== 'undefined') {
            if (this.baseEmotions && !this.baseEmotions.isDisposed) tf.dispose(this.baseEmotions);
            this.baseEmotions = tf.keep(tf.tensor([currentBase], [1, Config.Agent.EMOTION_DIM]));
        }

        // If no specific keywords found, apply a default low impact
        if (!foundKeyword) {
            if (2 < Config.Agent.EMOTION_DIM) impact[2] = 0.3; // Curiosity
            if (4 < Config.Agent.EMOTION_DIM) impact[4] = 0.2; // Calm
        }

        try {
            return await tf.tensor([impact], [1, Config.Agent.EMOTION_DIM]);
        } catch (e) {
            console.error("Error creating impact tensor:", e, impact);
            displayError(`TF Error creating impact tensor: ${e.message}`, false);
            return null;
        }
    }

    /** Returns the current state of the environment for saving. */
    getState() {
        const baseEmotionsArray = this.baseEmotions && !this.baseEmotions.isDisposed
            ? this.baseEmotions.arraySync()[0]
            : zeros([Config.Agent.EMOTION_DIM]);
        return {
            currentStateVector: [...this.currentStateVector],
            baseEmotions: baseEmotionsArray,
            stepCount: this.stepCount,
            eventTimer: this.eventTimer,
            gapTimer: this.gapTimer,
            currentEvent: this.currentEvent ? { ...this.currentEvent } : null
        };
    }

    /** Loads the environment state from a saved object. */
    loadState(state) {
        if (!state || typeof state !== 'object') {
            console.error("Invalid state object provided for environment loading.");
            return;
        }
        if (typeof tf === 'undefined') {
            console.error("Cannot load environment state: TensorFlow not available.");
            return;
        }

        // Dispose existing tensor
        if (this.baseEmotions && !this.baseEmotions.isDisposed) tf.dispose(this.baseEmotions);

        // Load state vector carefully
        this.currentStateVector = (Array.isArray(state.currentStateVector) && state.currentStateVector.length === Config.Agent.BASE_STATE_DIM)
            ? [...state.currentStateVector]
            : zeros([Config.Agent.BASE_STATE_DIM]);

        // Load base emotions tensor
        const baseEmotionsArray = (Array.isArray(state.baseEmotions) && state.baseEmotions.length === Config.Agent.EMOTION_DIM)
            ? state.baseEmotions
            : zeros([Config.Agent.EMOTION_DIM]);
        this.baseEmotions = tf.keep(tf.tensor([baseEmotionsArray], [1, Config.Agent.EMOTION_DIM]));

        // Load timers and event state
        this.stepCount = typeof state.stepCount === 'number' ? state.stepCount : 0;
        this.eventTimer = typeof state.eventTimer === 'number' ? state.eventTimer : 0;
        this.gapTimer = typeof state.gapTimer === 'number' ? state.gapTimer : Config.Env.EVENT_GAP;
        this.currentEvent = (state.currentEvent && typeof state.currentEvent === 'object') ? { ...state.currentEvent } : null;

        console.log("Environment state loaded.");
    }

    /** Cleans up TensorFlow resources used by the environment. */
    cleanup() {
        if (typeof tf !== 'undefined' && this.baseEmotions && !this.baseEmotions.isDisposed) {
            try {
                tf.dispose(this.baseEmotions);
            } catch (e) {
                console.error("Error disposing baseEmotions:", e);
            }
            this.baseEmotions = null;
        }
    }
}
