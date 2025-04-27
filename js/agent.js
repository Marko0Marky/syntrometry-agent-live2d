// js/agent.js

import { Config, emotionNames, HEAD_MOVEMENT_LABELS, NUM_HEAD_MOVEMENTS } from './config.js';
import { Enyphansyntrix, Affinitaetssyndrom, Strukturkondensation, ReflexiveIntegration } from './syntrometry-core.js';
import { zeros, tensor, clamp, displayError } from './utils.js';

// Assumes tf is available globally via CDN

/**
 * Represents the Syntrometric Agent, processing state and generating responses.
 */
export class SyntrometricAgent {
    constructor() {
        // Enyphansyntrix for state transformation (continuous for this demo)
        this.enyphansyntrix = new Enyphansyntrix('continuous');

        // Operators for processing Syntrix structures
        this.affinitaetssyndrom = new Affinitaetssyndrom(); // Computes affinity between syndromes
        this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, 2); // Processes cascades (stage 2 means pairwise)
        this.reflexiveIntegration = new ReflexiveIntegration(); // Computes RIH

        // Simple TF.js models for emotional response and head movement
        this.emotionalModule = null;
        this.headMovementHead = null;

        if (typeof tf !== 'undefined') {
            try {
                this.emotionalModule = this._buildEmotionalModel();
                this.headMovementHead = this._buildHeadMovementModel();
            } catch(e) {
                displayError(`Failed to build TF models: ${e.message}`, false, 'error-message');
                console.error("TF Model Build Error:", e);
            }
        } else {
             displayError("TensorFlow.js not available, agent models will not function.", false, 'error-message');
        }


        this.emotionNames = emotionNames;

        // Agent's internal state history and previous emotions
        this.history = [];
        // Initialize prevEmotions with a default state (zero tensor), dispose old one if exists
         if (this.prevEmotions && typeof this.prevEmotions.dispose === 'function') {
             tf.dispose(this.prevEmotions);
         }
         this.prevEmotions = tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);
    }

     // Builds a simple TF sequential model for predicting emotions
    _buildEmotionalModel() {
        if (typeof tf === 'undefined') return null;
        const model = tf.sequential();
        // Input features: state vector + previous emotions + reward + event context (binary)
        const inputDim = Config.Agent.BASE_STATE_DIM + Config.Agent.EMOTION_DIM + 1 + 1;
        model.add(tf.layers.dense({ units: 32, inputShape: [inputDim], activation: 'relu' }));
        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
        // Output: EMOTION_DIM values representing emotion intensities (0-1)
        model.add(tf.layers.dense({ units: Config.Agent.EMOTION_DIM, activation: 'sigmoid' }));
        console.log("Emotional model built.");
        return model;
    }

     // Builds a simple TF sequential model for predicting head movements
    _buildHeadMovementModel() {
        if (typeof tf === 'undefined') return null;
        const model = tf.sequential();
         // Input features: RIH score + Avg Affinity + Dominant Emotion Index (as value) + Current Emotions
         const inputDim = 1 + 1 + 1 + Config.Agent.EMOTION_DIM;
        model.add(tf.layers.dense({ units: 16, inputShape: [inputDim], activation: 'relu' }));
        // Output: Logits for each head movement label
        model.add(tf.layers.dense({ units: NUM_HEAD_MOVEMENTS }));
        console.log("Head movement model built.");
        return model;
    }

    // Processes the current state and generates agent responses
    async process(rawState, integrationParam, reflexivityParam, environmentContext = { eventType: null, reward: 0 }) {
        // Get the potentially critical error flag from app.js if needed, or assume it's managed there.
        // For simplicity here, we'll let processing attempt and handle nulls/errors internally.

        // Apply Enyphansyntrix to get the processed state
        // Ensure rawState is an array before processing
        const stateArray = Array.isArray(rawState) ? rawState : (rawState && typeof rawState.arraySync === 'function' ? rawState.arraySync()[0] : zeros([Config.Agent.BASE_STATE_DIM]));
        const processedState = this.enyphansyntrix.apply(stateArray);

        // Add to history (optional)
        this.history.push(processedState);
        if (this.history.length > Config.Agent.HISTORY_SIZE) this.history.shift();

        // Perform Structural Condensation using only the first Config.DIMENSIONS from the state
        // Ensure we slice only up to Config.DIMENSIONS, even if processedState is smaller
        const cascadeInput = processedState.slice(0, Math.min(processedState.length, Config.DIMENSIONS));
        const cascadeHistory = this.strukturkondensation.process(cascadeInput);


        // Calculate Reflexive Integration Hierarchy (RIH)
        // Based on the *last* level of the cascade
        const lastCascadeLevel = cascadeHistory.length > 0 ? cascadeHistory[cascadeHistory.length - 1] : [];
         // Ensure last level has at least 2 elements for variance calculation, pad if needed
         while(lastCascadeLevel.length < 2) {
             lastCascadeLevel.push(0); // Pad with zeros
         }

        let rihScore = this.reflexiveIntegration.compute(lastCascadeLevel); // Pass array to RIH compute


        // Calculate Affinities between consecutive cascade levels
        const affinities = []; // Store scalar affinity scores for each level pair
        if (cascadeHistory.length > 1) {
            for (let i = 0; i < cascadeHistory.length - 1; i++) {
                 // Ensure levels have elements before calculating affinity
                 if (cascadeHistory[i] && cascadeHistory[i].length > 0 && cascadeHistory[i+1] && cascadeHistory[i+1].length > 0) {
                    const affinity = this.affinitaetssyndrom.compute(cascadeHistory[i], cascadeHistory[i+1]); // Pass arrays
                    affinities.push(affinity); // Store scalar affinity
                 } else {
                     affinities.push(0); // Add 0 if levels are empty
                 }
            }
        }
         // Calculate the average affinity across all level pairs
        const avgAffinity = affinities.length > 0 ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0;


        // --- Emotional Module (Predict agent emotions) ---
        let currentEmotions;
         // Check if TF model is available and input state is valid size
         if (this.emotionalModule && typeof tf !== 'undefined' && stateArray.length >= Config.Agent.BASE_STATE_DIM) {
            try {
                currentEmotions = await tf.tidy(() => {
                     // Use the full state array including emotion values added by the environment
                    const stateTensor = tensor(stateArray, [1, Config.Agent.BASE_STATE_DIM]);
                    const rewardTensor = tensor([[environmentContext.reward || 0]], [1, 1]);
                     // Context signal: 1 if there's an event type, 0 otherwise
                    const contextSignal = tensor([[environmentContext.eventType ? 1 : 0]], [1, 1]);

                     if (!stateTensor || !rewardTensor || !contextSignal || !this.prevEmotions) {
                         console.warn("Tensor creation failed for emotional module input.");
                          tf.dispose([stateTensor, rewardTensor, contextSignal, this.prevEmotions]); // Dispose inputs
                          return null; // Indicate failure
                     }

                    // Combine inputs: state, previous emotions, reward, context
                    const input = tf.concat([stateTensor, this.prevEmotions], 1); // Initial state does NOT have reward/context yet

                    // For subsequent steps, input includes reward and context
                    const fullInput = tf.concat([input, rewardTensor, contextSignal], 1);


                    // Predict new emotions
                    const predictedEmotions = this.emotionalModule.predict(fullInput);

                    // Blend previous emotions with prediction (simple smoothing)
                    const blendedEmotions = this.prevEmotions.mul(0.8).add(predictedEmotions.mul(0.2)).clipByValue(0, 1); // Keep emotions between 0 and 1

                     tf.dispose([stateTensor, rewardTensor, contextSignal, input, fullInput, predictedEmotions]); // Dispose tensors
                     return blendedEmotions; // Return the new emotion tensor
                });
            } catch (e) {
                displayError(`TF Error during emotion prediction: ${e.message}`, false, 'error-message');
                // Fallback: Keep previous emotions if prediction fails
                 currentEmotions = this.prevEmotions ? this.prevEmotions.clone() : tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]); // Clone if available
            }
         } else {
            // Fallback if TF model not available or input state is invalid
             if(this.prevEmotions && typeof this.prevEmotions.arraySync === 'function') {
                 const prevEmoArray = this.prevEmotions.arraySync()[0];
                // Simple random walk with decay
                 const newEmoArray = prevEmoArray.map(e => clamp(e * 0.98 + (Math.random() - 0.48) * 0.02, 0, 1));
                 currentEmotions = tensor([newEmoArray], [1, Config.Agent.EMOTION_DIM]);
             } else {
                // Basic default if all else fails
                 currentEmotions = tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]);
             }
        }

        // Dispose of the previous emotions tensor and store the current ones for the next step
         if (this.prevEmotions && typeof this.prevEmotions.dispose === 'function') {
            tf.dispose(this.prevEmotions);
         }
        this.prevEmotions = currentEmotions ? currentEmotions.clone() : tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]); // Ensure prevEmotions is always a tensor


        // --- Head Movement Head (Predict head movement based on state) ---
        let hmLabel = "idle"; // Default label
         // Get emotion values as array from the *newly computed* emotions
         const emotionArray = currentEmotions ? currentEmotions.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]);
         // Find the index of the dominant emotion
         const dominantEmotionIndex = emotionArray.length > 0 ? emotionArray.indexOf(Math.max(...emotionArray)) : -1;

         // Check if TF head movement model is available and required inputs exist
         if (this.headMovementHead && typeof tf !== 'undefined' && currentEmotions && dominantEmotionIndex !== -1) {
            try {
                const hmLogits = await tf.tidy(() => {
                     // Input features: RIH, Avg Affinity, Dominant Emotion Index (as a single value), Current Emotions
                    const rihTensor = tensor([[rihScore]], [1, 1]);
                    const avgAffinityTensor = tensor([[avgAffinity]], [1, 1]);
                     // Use the dominant emotion index as a numerical feature (simplified)
                    const dominantEmotionTensor = tensor([[dominantEmotionIndex]], [1, 1]);
                     // Reshape emotions tensor to match expected input shape
                    const emotionTensorInput = currentEmotions.reshape([1, Config.Agent.EMOTION_DIM]);

                    if (!rihTensor || !avgAffinityTensor || !dominantEmotionTensor || !emotionTensorInput) {
                         console.warn("Tensor creation failed for head movement input.");
                         tf.dispose([rihTensor, avgAffinityTensor, dominantEmotionTensor, emotionTensorInput]); // Dispose inputs
                         return null; // Indicate failure
                    }

                    // Concatenate all inputs
                    const input = tf.concat([rihTensor, avgAffinityTensor, dominantEmotionTensor, emotionTensorInput], 1);

                    // Predict head movement logits
                    const predictedLogits = this.headMovementHead.predict(input);

                     tf.dispose([rihTensor, avgAffinityTensor, dominantEmotionTensor, emotionTensorInput, input]); // Dispose tensors
                    return predictedLogits; // Return the logits tensor
                });

                 if (hmLogits) {
                    // Get the index of the highest logit (most likely head movement)
                    const hmIdx = tf.argMax(hmLogits, 1).arraySync()[0];
                    hmLabel = HEAD_MOVEMENT_LABELS[hmIdx]; // Map index to label
                    tf.dispose(hmLogits); // Dispose logits tensor
                 } else {
                     hmLabel = "idle"; // Fallback on tensor creation failure
                 }


            } catch (e) {
                displayError(`TF Error during head movement prediction: ${e.message}`, false, 'error-message');
                console.error("TF Head Movement Error:", e);
                hmLabel = "idle"; // Fallback to idle on error
            }
         } else {
             // Fallback logic for head movement if TF model not available or inputs are invalid
             // Simple rules based on RIH, Affinity, and dominant emotion index
             if (rihScore > 0.7) hmLabel = "nod";
             else if (avgAffinity < 0.2 && dominantEmotionIndex === emotionNames.indexOf("Frustration")) hmLabel = "shake";
             else if (dominantEmotionIndex === emotionNames.indexOf("Curiosity") && Math.random() > 0.5) hmLabel = Math.random() > 0.5 ? "tilt_left" : "tilt_right";
             else hmLabel = "idle";
         }


        // Generate a simple text response summarization
         const dominantEmotionName = dominantEmotionIndex !== -1 ? emotionNames[dominantEmotionIndex] : 'Unknown';
         const responseText = `Processed state. RIH: ${rihScore.toFixed(2)}, Avg Affinity: ${avgAffinity.toFixed(2)}. Feeling: ${dominantEmotionName}.`;


        return {
            cascadeHistory, // History of element values at each cascade level (array of arrays)
            rihScore,      // Computed RIH score (scalar number)
            affinities,    // Affinities between cascade levels (array of scalar numbers)
            emotions: currentEmotions, // Tensor of current emotion intensities (managed by the class)
            hmLabel,       // Predicted head movement label (string)
            responseText   // Agent's text response (string)
        };
    }

     // Fallback response structure in case of critical errors or agent initialization failure
     // This is now primarily handled by checks in app.js and the process method itself returning defaults.
     // Leaving a placeholder function structure for potential future use.
    // _getFallbackResponse() {
    //     const emptyCascade = [...Array(Config.DIMENSIONS)].map(() => 0);
    //      // Ensure a minimal cascade history with at least 2 elements in the last level for potential RIH computation in fallback logic
    //     const fallbackHistory = [emptyCascade];
    //      while(fallbackHistory[fallbackHistory.length - 1].length < 2) {
    //          fallbackHistory[fallbackHistory.length - 1].push(0);
    //      }
    //      if(fallbackHistory.length < 2) fallbackHistory.push([0,0]);


    //     return {
    //         cascadeHistory: fallbackHistory,
    //         rihScore: 0,
    //         affinities: [0],
    //         emotions: tensor(zeros([1,Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]),
    //         hmLabel: "idle",
    //         responseText: "Simulation paused due to critical errors or missing components."
    //     };
    // }
}