// js/environment.js

import { Config, emotionKeywords, emotionNames } from './config.js';
import { zeros, tensor, clamp } from './utils.js';

// Assumes tf is available globally via CDN

/**
 * Represents the simulation environment, managing state, events, and rewards.
 */
export class EmotionalSpace {
    constructor() {
        // Define potential environment events, their context, and reward
        this.events = [
            ["Joy", "A pleasant resonance occurs.", 1.5],
            ["Fear", "A dissonant pattern is detected.", -1.8],
            ["Curiosity", "An unexpected structural variation appears.", 1.2],
            ["Frustration", "System encounters processing resistance.", -1.0],
            ["Calm", "Patterns stabilize into harmony.", 0.8],
            ["Surprise", "A sudden cascade shift happens.", 1.6]
        ];
        this.emotionNames = this.events.map(e => e[0]); // Extract emotion names from events

        // Base emotional tendency of the environment (starts neutral/calm)
        // This influences the state vector over time, independent of agent emotions
        // Initialize with a default state (zero tensor) if tf is not available
        if (this.baseEmotions && typeof this.baseEmotions.dispose === 'function') {
            tf.dispose(this.baseEmotions);
        }
         this.baseEmotions = tensor([[0.6, 0.1, 0.3, 0.1, 0.5, 0.2]], [1, Config.Agent.EMOTION_DIM])
            || tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);


        // Timers for managing event occurrences
        this.stepCount = 0; // Total simulation steps
        this.eventTimer = 0; // Timer for active event duration (in animation frames)
        this.gapTimer = Config.Env.EVENT_GAP; // Timer for gap between events (in animation frames)
        this.currentEvent = null; // Currently active event details

        // The main state vector representing the environment's condition
        // Combines abstract dimensions with raw emotional "readings"
        // Initialize with correct size, pad with zeros
        this.currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);

        // Initialize the state vector based on the initial base emotions
        this._updateStateVector(this.baseEmotions);
    }

    // Resets the environment to its initial state
    reset() {
        this.stepCount = 0;
        this.eventTimer = 0;
        this.gapTimer = Config.Env.EVENT_GAP;
        this.currentEvent = null;
        // Re-initialize base emotions and state vector
         if (this.baseEmotions && typeof this.baseEmotions.dispose === 'function') {
             tf.dispose(this.baseEmotions);
         }
        this.baseEmotions = tensor([[0.6, 0.1, 0.3, 0.1, 0.5, 0.2]], [1, Config.Agent.EMOTION_DIM])
             || tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);

        this.currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]); // Reset state vector values
        this._updateStateVector(this.baseEmotions); // Update state vector based on reset emotions
        console.log("Environment Reset.");
        return {
            state: this._getState() // Return the initial state tensor
        };
    }

    // Advances the environment simulation by one step
    // Takes agent's emotions, RIH, and Affinity to influence dynamics
    async step(agentEmotionsTensor, currentRIHScore = 0, currentAvgAffinity = 0) {
        this.stepCount++;
        let reward = 0; // Reward for the agent in this step
        let context = "Ambient fluctuations."; // Textual context of the environment state
        let triggeredEventType = null; // Type of event triggered in this step (if any)

        // Get agent's current emotion values as an array
        const agentEmotions = agentEmotionsTensor && typeof agentEmotionsTensor.arraySync === 'function'
            ? agentEmotionsTensor.arraySync()[0]
            : zeros([Config.Agent.EMOTION_DIM]);

        // Update the environment's base emotions, influenced by agent emotions and a tendency towards 0.5
         const currentBaseEmotions = this.baseEmotions && typeof this.baseEmotions.arraySync === 'function'
            ? this.baseEmotions.arraySync()[0]
            : zeros([Config.Agent.EMOTION_DIM]); // Fallback if baseEmotions is null

        const newBaseEmotionsArray = currentBaseEmotions.map((baseVal, i) => {
             // Drift base emotions towards agent's emotion and a central tendency (0.5)
            const drift = (agentEmotions[i] - baseVal) * 0.005 + (0.5 - baseVal) * 0.001;
            return clamp(baseVal + drift, 0, 1); // Keep values within [0, 1]
        });
         if (this.baseEmotions && typeof this.baseEmotions.dispose === 'function') {
             tf.dispose(this.baseEmotions);
         }
        this.baseEmotions = tensor([newBaseEmotionsArray], [1, Config.Agent.EMOTION_DIM])
             || tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]); // Fallback


        // --- Event Management ---
        if (this.eventTimer > 0) {
            // Event is currently active
            this.eventTimer--;
            context = this.currentEvent.context; // Use active event's context
            // Reward scales down as the event duration decreases
            reward = this.currentEvent.reward * (this.eventTimer / Config.Env.EVENT_DURATION);
            triggeredEventType = this.currentEvent.type; // Indicate event type is active

            if (this.eventTimer === 0) {
                // Event just ended
                this.currentEvent = null;
                this.gapTimer = Config.Env.EVENT_GAP; // Start the gap timer
                context = "Event concluded. System stabilizing.";
                 // console.log("Event concluded.");
            }
        } else if (this.gapTimer > 0) {
            // Gap between events is active
            this.gapTimer--;
            context = "System stable."; // Indicate stable state

        } else {
            // Gap timer is zero, check if a new event should be triggered
            // Event frequency can be influenced by overall emotion intensity
            const emotionIntensity = agentEmotions.reduce((sum, val) => sum + val, 0) / Config.Agent.EMOTION_DIM; // Avg intensity
            // Probability increases slightly with higher emotion intensity (V1 influence)
            const triggerProb = Config.Env.EVENT_FREQ * (1 + emotionIntensity * 0.5);

            if (Math.random() < triggerProb) {
                // Trigger a new event
                // Select event biased by agent's dominant emotion (V1 influence)
                 // Handle case where agentEmotions is zero array
                 const dominantEmotionIdx = agentEmotions.length > 0 ? agentEmotions.indexOf(Math.max(...agentEmotions)) : -1;
                 const eventProbs = agentEmotions.map(e => e * 0.5 + 0.5); // Bias towards higher emotions, minimum 0.5 base
                 const totalProb = eventProbs.reduce((a, b) => a + b, 0);
                 const normalizedProbs = totalProb > 0 ? eventProbs.map(p => p / totalProb) : eventProbs.map(() => 1 / Config.Agent.EMOTION_DIM); // Handle zero total prob case

                 let rand = Math.random();
                 let eventIdx = 0; // Default to first event if no probabilities
                 if (normalizedProbs.length > 0) {
                     for (let i = 0; i < normalizedProbs.length; i++) {
                         rand -= normalizedProbs[i];
                         if (rand <= 0) {
                             eventIdx = i;
                             break;
                         }
                     }
                 }


                const eventData = this.events[eventIdx]; // Select event
                this.currentEvent = { type: eventData[0], context: eventData[1], reward: eventData[2] }; // Store event details
                context = this.currentEvent.context; // Set context
                triggeredEventType = this.currentEvent.type; // Set event type
                // Reward scales based on event's type and how much the agent feels that emotion (V1 influence)
                const emotionIndex = this.emotionNames.indexOf(this.currentEvent.type);
                 const agentCorrespondingEmotion = (emotionIndex !== -1 && agentEmotions.length > emotionIndex) ? agentEmotions[emotionIndex] : 0;
                reward = this.currentEvent.reward * (agentCorrespondingEmotion * 0.7 + 0.3); // Stronger reward if agent feels the corresponding emotion

                this.eventTimer = Config.Env.EVENT_DURATION; // Start event timer
                 // console.log(`Event Triggered: ${this.currentEvent.type} - ${this.currentEvent.context}`);
            }
        }

        // --- Update State Vector ---
        // Update the environment's state vector based on current base emotions and event
        this._updateStateVector(this.baseEmotions, triggeredEventType);


        // --- Dysvariant Fluctuations ---
        // Introduce small, random fluctuations (dysvariants)
        // Probability and amplitude tied to RIH and Affinity (V1 influence)
         const dysvariantProb = Config.DYSVARIANT_PROB * (1 - clamp(currentRIHScore, 0, 1)); // More likely with low RIH

        if (Math.random() < dysvariantProb) {
            const randomIndex = Math.floor(Math.random() * Config.DIMENSIONS); // Affect a random abstract dimension
             // Amplitude related to lack of affinity
            const amplitude = (Math.random() - 0.5) * 0.3 * (1 - clamp(currentAvgAffinity, -1, 1)); // Larger fluctuations with low affinity
            this.currentStateVector[randomIndex] = clamp((this.currentStateVector[randomIndex] || 0) + amplitude, -1, 1); // Apply fluctuation
            context += " (Dysvariant fluctuation detected)"; // Add context note
        }


        // Get the final state tensor for the agent
        const stateTensor = this._getState();

        // Determine if the simulation is done (not used for termination in this demo)
        const done = false;

        return {
            state: stateTensor, // The environment's state vector (tensor)
            reward,            // Reward for the agent
            done,              // Simulation done flag
            context,           // Textual context of this step
            eventType: triggeredEventType // Type of event (if any)
        };
    }

    // Updates the numerical state vector based on emotions and events
    _updateStateVector(emotionTensor, eventType = null) {
         // Ensure emotionTensor is valid and get emotion values as array
         const emotions = emotionTensor && typeof emotionTensor.arraySync === 'function' ? emotionTensor.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]);

        // Update the first Config.DIMENSIONS elements based on emotion combinations and dynamics (V1 logic)
         // Ensure we don't try to access emotion indices out of bounds
        this.currentStateVector[0] = clamp(((emotions[0] || 0) - (emotions[1] || 0)) * 0.8, -1, 1); // Joy vs. Fear
        this.currentStateVector[1] = clamp(((emotions[4] || 0) - (emotions[3] || 0)) * 0.7, -1, 1); // Calm vs. Frustration
        this.currentStateVector[2] = clamp((emotions[2] || 0) * 1.5 - 0.5, -1, 1); // Curiosity emphasis
        this.currentStateVector[3] = clamp((emotions[5] || 0) * 1.2 - 0.3, -1, 1); // Surprise emphasis

        // Other dimensions update based on a decay + influence from other emotions + noise
        for (let i = 4; i < Config.DIMENSIONS; i++) {
            const emoIdx = i % Config.Agent.EMOTION_DIM; // Map dimension to an emotion index
            const prevVal = this.currentStateVector[i] || 0; // Get previous value, default to 0
             const emoInfluence = ((emotions[emoIdx] || 0) - 0.5) * 0.15; // Influence from a specific emotion
            const randomPerturbation = (Math.random() - 0.5) * 0.03; // Small random noise
            this.currentStateVector[i] = clamp(prevVal * 0.95 + emoInfluence + randomPerturbation, -1, 1); // Decay + influence + noise
        }

        // --- Event-Specific Perturbations ---
        // Apply specific changes to the state vector if an event was triggered
        if (eventType) {
            const emotionIndex = this.emotionNames.indexOf(eventType); // Get index of triggered emotion
            if (emotionIndex !== -1) {
                 // Apply a pulse to relevant dimensions (V1 logic)
                 // Ensure dimension index is within bounds
                const dim1 = emotionIndex % Config.DIMENSIONS;
                const dim2 = (emotionIndex + 1) % Config.DIMENSIONS; // A related dimension

                if (dim1 < Config.DIMENSIONS) {
                    this.currentStateVector[dim1] = clamp(
                        (this.currentStateVector[dim1] || 0) + 0.4, -1, 1
                    );
                }
                if (dim2 < Config.DIMENSIONS) {
                     this.currentStateVector[dim2] = clamp(
                        (this.currentStateVector[dim2] || 0) + 0.15, -1, 1
                     );
                }

                 // Slightly perturb other random dimensions (V1 logic)
                 for(let k = 0; k < 3; k++) {
                     const randDim = Math.floor(Math.random() * Config.DIMENSIONS);
                     if (randDim < Config.DIMENSIONS) {
                         this.currentStateVector[randDim] = clamp((this.currentStateVector[randDim] || 0) + (Math.random() - 0.5) * 0.1, -1, 1);
                     }
                 }
            }
        }

        // Append raw emotion values to the end of the state vector (for agent to consume)
        for (let i = 0; i < Config.Agent.EMOTION_DIM; i++) {
             // Ensure emotion index is within bounds
             const emotionVal = (emotions.length > i) ? emotions[i] : 0;
             // Ensure dimension index is within bounds
             const stateDimIndex = Config.DIMENSIONS + i;
             if (stateDimIndex < Config.Agent.BASE_STATE_DIM) {
                this.currentStateVector[stateDimIndex] = clamp(emotionVal, 0, 1); // Append emotion values (0-1)
             }
        }

         // Ensure the state vector has the correct final size
         while (this.currentStateVector.length < Config.Agent.BASE_STATE_DIM) {
             this.currentStateVector.push(0.0); // Pad with zeros if undersized
         }
         this.currentStateVector = this.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM); // Truncate if oversized
    }

    // Returns the current state vector as a TensorFlow tensor
    _getState() {
         // Ensure the state vector has the correct size before creating the tensor
         while (this.currentStateVector.length < Config.Agent.BASE_STATE_DIM) {
             this.currentStateVector.push(0.0); // Pad with zeros if somehow undersized
         }
         // Make sure it doesn't exceed the expected size
         const finalStateArray = this.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM);

        return tensor([finalStateArray], [1, Config.Agent.BASE_STATE_DIM]);
    }

    // Processes text input and updates environment's base emotions
    getEmotionalImpactFromText(text) {
        const impact = zeros([Config.Agent.EMOTION_DIM]); // Initialize impact vector
        let foundKeyword = false;
        const lowerText = text.toLowerCase();

        // Check for keywords associated with each emotion
        for (let idx in emotionKeywords) {
            const info = emotionKeywords[idx];
            for (let keyword of info.keywords) {
                if (lowerText.includes(keyword)) {
                     // Apply impact for this emotion, taking the max if multiple keywords match
                    impact[idx] = Math.max(impact[idx], info.strength);
                    foundKeyword = true;

                    // Directly influence the environment's base emotions
                     const currentBase = this.baseEmotions && typeof this.baseEmotions.arraySync === 'function'
                        ? this.baseEmotions.arraySync()[0]
                        : zeros([Config.Agent.EMOTION_DIM]); // Fallback

                    currentBase[idx] = clamp((currentBase[idx] || 0) + (info.baseChange || 0), 0, 1); // Apply base change, handle potential undefined
                     if (this.baseEmotions && typeof this.baseEmotions.dispose === 'function') {
                         tf.dispose(this.baseEmotions);
                     }
                    this.baseEmotions = tensor([currentBase], [1, Config.Agent.EMOTION_DIM])
                         || tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]); // Update base emotions tensor, fallback
                }
            }
        }

        // If no specific emotion keywords found, add a small curiosity/calm impact
        if (!foundKeyword) {
            // Ensure indices are within bounds
            if (2 < Config.Agent.EMOTION_DIM) impact[2] = 0.4; // Curiosity
            if (4 < Config.Agent.EMOTION_DIM) impact[4] = 0.3; // Calm
        }

         // Return impact as a tensor (optional, mainly for debugging or if agent used it directly)
         // For this setup, updating baseEmotions is the primary effect.
         // Ensure the impact tensor is created correctly, fallback if needed
        return tensor([impact], [1, Config.Agent.EMOTION_DIM])
             || tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);
    }
}