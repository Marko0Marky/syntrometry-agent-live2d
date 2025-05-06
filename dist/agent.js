// js/agent.js

function checkTensorFlowAvailability() {
    // First check global scope
    let tfjs = (typeof tf !== 'undefined') ? tf : null;
    
    // If not found, check window scope
    if (!tfjs && typeof window !== 'undefined' && typeof window.tf !== 'undefined') {
        tfjs = window.tf;
        console.log("Using TensorFlow.js from window scope");
    }
    
    if (!tfjs) {
        throw new Error("TensorFlow.js not loaded in any scope");
    }
    
    // Check for specific modules and functions
    const requiredModules = ['layers', 'train', 'tidy', 'tensor'];
    const missingModules = requiredModules.filter(module => !(module in tfjs));
    
    if (missingModules.length > 0) {
        throw new Error(`TensorFlow.js loaded but missing modules: ${missingModules.join(', ')}`);
    }
    
    // Make tf available in this module's scope if it wasn't
    if (typeof tf === 'undefined') {
        window.tf = tfjs;
    }
    
    return tfjs; // Return the valid TensorFlow instance
}

import * as tf from '@tensorflow/tfjs'; // Use consistent TFJS import
import { Config, emotionNames, HEAD_MOVEMENT_LABELS, NUM_HEAD_MOVEMENTS } from './config.js';
import { Enyphansyntrix, Affinitaetssyndrom, Strukturkondensation, ReflexiveIntegration } from './syntrometry-core.js';
import { zeros, clamp, displayError, norm } from './utils.js'; // norm added
import { safeDispose, tensorToArray, safeReshape, safeGetScalar, containsNaNOrInf } from './tensorUtils.js'; // Import helpers

// Define constants at module level
const NUM_GRAPH_FEATURES = 2; // From Syntrometry visualization (varianceZ, avgDistToRih)
const BELIEF_EMBEDDING_DIM = Config.Agent.BELIEF_EMBEDDING_DIM;
const CASCADE_INPUT_DIM = Config.Agent.CASCADE_INPUT_DIM;
const EMOTION_DIM = Config.Agent.EMOTION_DIM;
const DIMENSIONS = Config.DIMENSIONS;
const BELIEF_NETWORK_INPUT_DIM = DIMENSIONS + NUM_GRAPH_FEATURES + BELIEF_EMBEDDING_DIM;

/**
 * Represents the Syntrometric Agent V2.3.1.
 * Integrates core Syntrometry concepts with TF.js models for belief formation,
 * emotional response, self-state modeling, and parameter self-tuning.
 */
export class SyntrometricAgent {
    constructor() {
        // Initialize critical properties early to prevent null reference errors
        this.memorySize = Config.Agent.HISTORY_SIZE || 10;
        this.memoryBuffer = []; // Initialize memoryBuffer EARLY
        this.lastRIH = 0.0;
        this.lastCascadeVariance = 0.0;
        this.latestTrustScore = 1.0;
        this.latestAffinities = []; 
        this.latestBeliefEmbedding = null;
        
        console.log("Initializing Syntrometric Agent V2.3.1...");

        try {
            // 1. Initialize Core JS Modules
            this.enyphansyntrix = new Enyphansyntrix('continuous');
            this.affinitaetssyndrom = new Affinitaetssyndrom();
            this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE);
            this.reflexiveIntegration = new ReflexiveIntegration();
            this.coreModulesReady = true;
            console.log("Core JS modules initialized.");

            // 2. Check TensorFlow.js Availability
            const tfjs = checkTensorFlowAvailability();
            this.isTfReady = true;
            
            // Safely check for backend function
            const backend = typeof tfjs.getBackend === 'function' ? tfjs.getBackend() : 'unknown';
            const version = tfjs.version ? tfjs.version.tfjs : 'unknown';
            console.log(`TensorFlow.js backend: ${backend}, version: ${version}`);

            // 3. Initialize TF.js Components
            this._initializeTfComponents();
            console.log("TF.js components initialized.");

            // 4. Final Validation
            this._validateComponents(); // Throws error if validation fails
            console.log("Agent components validated successfully.");

            console.log("SyntrometricAgent V2.3.1 initialized successfully.");

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("CRITICAL AGENT INITIALIZATION FAILED:", error);
            displayError(`Agent Initialization Failed: ${message}. Agent will be non-functional.`, true, 'error-message');
            this.cleanup(); // Attempt cleanup even if init failed partially
            // Do not re-throw, allow the application to potentially continue in a degraded state
            // or rely on the criticalError flag in app.js
        }
    }

    /** Initializes TF.js models, variables, and the optimizer. */
    _initializeTfComponents() {
        const tf = window.tf; // Get global tf
        if (!tf) {
            console.error("TensorFlow.js not available for component initialization");
            return;
        }

        try {
            // Check if layers API is available
            if (!tf.layers) {
                console.error("TensorFlow.js layers API not available");
                return;
            }

            // Use tf.tidy to clean up intermediate tensors
            tf.tidy(() => {
                // --- Initialize Tensors ---
                const BELIEF_EMBEDDING_DIM = Config.Agent.BELIEF_DIM || 16;
                const EMOTION_DIM = Config.Agent.EMOTION_DIM || 8;
                const CASCADE_INPUT_DIM = Config.Agent.CASCADE_INPUT_DIM || 12;
                const NUM_HEAD_MOVEMENTS = Config.Agent.NUM_HEAD_MOVEMENTS || 5;

                // --- Initialize Models ---
                // Create models directly with tf.sequential
                this.beliefNetwork = this._createBeliefNetwork(BELIEF_EMBEDDING_DIM);
                this.emotionalModule = this._createEmotionalModel(BELIEF_EMBEDDING_DIM, EMOTION_DIM);
                this.headMovementHead = this._createHeadMovementModel(BELIEF_EMBEDDING_DIM, NUM_HEAD_MOVEMENTS);

                // --- Optimizer ---
                this.optimizer = tf.train.adam(Config.RL.LR ?? 0.001);
            });
            
            console.log("TF.js components initialized.");
        } catch (error) {
            console.error("Failed to initialize TensorFlow components:", error);
            throw error;
        }
    }

    // Create a new method that uses direct tf.sequential creation
    _createBeliefNetwork(outputDim) {
        const tf = window.tf;
        if (!tf || !tf.sequential) {
            console.error("TensorFlow.js sequential API not available");
            return null;
        }
        
        try {
            // Create model directly with tf.sequential
            const model = tf.sequential();
            model.add(tf.layers.dense({
                units: 32,
                inputShape: [Config.DIMENSIONS],
                activation: 'relu'
            }));
            model.add(tf.layers.dense({
                units: outputDim,
                activation: 'tanh'
            }));
            return model;
        } catch (e) {
            console.error("Failed building Belief Network:", e);
            return null;
        }
    }

    _createEmotionalModel(inputDim, outputDim) {
        const tf = window.tf;
        if (!tf || !tf.sequential) {
            console.error("TensorFlow.js sequential API not available");
            return null;
        }
        
        try {
            // Create model directly with tf.sequential
            const model = tf.sequential();
            model.add(tf.layers.dense({
                units: 24,
                inputShape: [inputDim],
                activation: 'relu'
            }));
            model.add(tf.layers.dense({
                units: outputDim,
                activation: 'sigmoid'
            }));
            return model;
        } catch (e) {
            console.error("Failed building emotional model:", e);
            return null;
        }
    }

    _createHeadMovementModel(inputDim, outputDim) {
        const tf = window.tf;
        if (!tf || !tf.sequential) {
            console.error("TensorFlow.js sequential API not available");
            return null;
        }
        
        try {
            // Create model directly with tf.sequential
            const model = tf.sequential();
            model.add(tf.layers.dense({
                units: 16,
                inputShape: [inputDim],
                activation: 'relu'
            }));
            model.add(tf.layers.dense({
                units: outputDim,
                activation: 'softmax'
            }));
            return model;
        } catch (e) {
            console.error("Failed building head movement model:", e);
            return null;
        }
    }

    /** Helper to validate essential components after initialization. */
    _validateComponents() {
        // Check if TensorFlow.js is available
        if (typeof window.tf === 'undefined') {
            console.error("TensorFlow.js not available for validation");
            return false;
        }

        // Check core modules
        if (!this.enyphansyntrix || !this.affinitaetssyndrom || 
            !this.strukturkondensation || !this.reflexiveIntegration) {
            console.error("Core modules not initialized");
            return false;
        }

        // Check TensorFlow models - use typeof check instead of instanceof
        const modelsValid = 
            this.beliefNetwork && typeof this.beliefNetwork.predict === 'function' &&
            this.emotionalModule && typeof this.emotionalModule.predict === 'function' &&
            this.headMovementHead && typeof this.headMovementHead.predict === 'function';
        
        if (!modelsValid) {
            console.error("TensorFlow models not properly initialized");
            return false;
        }

        // Check optimizer
        if (!this.optimizer) {
            console.error("Optimizer not initialized");
            return false;
        }

        return true;
    }

    /** Helper to nullify *only* TF-related members */
    _set_tf_members_null() {
        this.integrationParam = null; this.reflexivityParam = null; this.selfState = null;
        this.beliefNetwork = null; this.cascadeInputLayer = null; this.valueHead = null; this.feedbackHead = null;
        this.emotionalModule = null; this.headMovementHead = null; this.prevEmotions = null;
        this.optimizer = null; this.latestBeliefEmbedding = null;
        this.memoryBuffer = []; // Reset memory buffer as well
        this.isTfReady = false; // Mark TF as not ready if members are nulled
    }

    /** Helper to dispose *only* TF-related members safely. */
    _cleanupTfMembers() {
        const tf = window.tf; // Get global tf
        if (!tf || (!this.isTfReady && !this.integrationParam)) return;

        // Check if memoryBuffer is an array before calling forEach
        if (Array.isArray(this.memoryBuffer)) {
            this.memoryBuffer.forEach(memItem => {
                if (memItem && memItem.beliefEmbedding && !memItem.beliefEmbedding.isDisposed) {
                    try {
                        memItem.beliefEmbedding.dispose();
                    } catch (e) {
                        console.warn("Error disposing belief embedding:", e);
                    }
                }
            });
        }
        this.memoryBuffer = []; // Clear array after disposing contents

        // Helper function to safely dispose tensors/variables/models
        const safeDispose = (item) => {
            if (!item) return;
            
            try {
                if (item instanceof tf.LayersModel) {
                    item.dispose();
                } else if (item instanceof tf.Tensor && !item.isDisposed) {
                    item.dispose();
                }
            } catch (e) {
                console.warn(`Error disposing item:`, e);
            }
        };

        // Dispose all TF resources
        safeDispose(this.integrationParam);
        safeDispose(this.reflexivityParam);
        safeDispose(this.selfState);
        safeDispose(this.prevEmotions);
        safeDispose(this.beliefNetwork);
        safeDispose(this.cascadeInputLayer);
        safeDispose(this.valueHead);
        safeDispose(this.feedbackHead);
        safeDispose(this.emotionalModule);
        safeDispose(this.headMovementHead);
        safeDispose(this.latestBeliefEmbedding);
        
        // Optimizer doesn't have a dispose method
        this.optimizer = null;
    }

    // --- Core Processing Methods ---

    /** Adds the latest belief embedding tensor to the memory buffer, maintaining size. */
    _updateMemory(beliefTensor) { // Expects a Tensor1D
        if (!this.isTfReady || !beliefTensor || beliefTensor.isDisposed) return;
        if (beliefTensor.rank !== 1 || beliefTensor.shape[0] !== Config.Agent.BELIEF_EMBEDDING_DIM) {
            console.warn(`[Agent Memory] Invalid belief tensor shape: ${beliefTensor.shape}. Expected [${Config.Agent.BELIEF_EMBEDDING_DIM}]. Skipping memory update.`);
            return;
        }
        // Keep a clone of the tensor for the buffer
        this.memoryBuffer.push({ timestamp: Date.now(), beliefEmbedding: tf.keep(beliefTensor.clone()) });
        // Remove oldest entry if buffer exceeds size
        if (this.memoryBuffer.length > this.memorySize) {
            const oldEntry = this.memoryBuffer.shift();
            safeDispose(oldEntry?.beliefEmbedding); // Dispose the removed tensor
        }
    }

    /** Computes a trust score based on the similarity of the current belief to recent beliefs in memory. */
    _computeTrust(currentBeliefEmbedding) { // Expects Tensor1D
        if (!this.isTfReady || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed) return 0.5;
        if (currentBeliefEmbedding.rank !== 1 || currentBeliefEmbedding.shape[0] !== Config.Agent.BELIEF_EMBEDDING_DIM) return 0.5;
        if (this.memoryBuffer.length === 0) return 1.0; // Full trust if no history yet

        let trustValue = 0.5; // Default
        try {
            const trustScalar = tf.tidy(() => {
                const flatCurrent = currentBeliefEmbedding; // Already flat
                const currentNorm = tf.norm(flatCurrent);
                if (safeGetScalar(currentNorm, 0) < 1e-9) return tf.scalar(0.0); // No trust if current belief is zero vector

                const validSimilarities = [];
                for (const memEntry of this.memoryBuffer) {
                    const memTensor = memEntry?.beliefEmbedding;
                    if (memTensor && !memTensor.isDisposed && memTensor.rank === 1 && memTensor.shape[0] === Config.Agent.BELIEF_EMBEDDING_DIM) {
                        const flatMem = memTensor;
                        const memNorm = tf.norm(flatMem);
                        const normProd = tf.mul(currentNorm, memNorm);
                        if (safeGetScalar(normProd, 0) < 1e-9) {
                            validSimilarities.push(tf.scalar(0.0)); // Treat as dissimilar
                        } else {
                            const dotProduct = tf.dot(flatCurrent, flatMem);
                            const similarity = tf.div(dotProduct, normProd).clipByValue(-1, 1);
                            validSimilarities.push(similarity);
                        }
                    }
                }

                if (validSimilarities.length === 0) return tf.scalar(0.5);

                const avgSimilarity = tf.mean(tf.stack(validSimilarities));
                const trust = avgSimilarity.add(1).div(2); // Map similarity [-1, 1] to trust [0, 1]
                return trust;
            });
            trustValue = safeGetScalar(trustScalar, 0.5); // Get JS number
            safeDispose(trustScalar); // Dispose the scalar returned by tidy
        } catch (e) {
            console.error("Error computing trust:", e);
            trustValue = 0.5; // Return default on error
        }
        return trustValue;
    }

    /** Heuristically adjusts integration and reflexivity parameters based on performance metrics. */
    _learnParameters(trustScore, rihScore, cascadeVariance) {
        if (!this.isTfReady || !this.integrationParam || !this.reflexivityParam || this.integrationParam.isDisposed || this.reflexivityParam.isDisposed) {
            console.warn("Cannot learn parameters: TF components missing or disposed.");
            return;
        }
        try {
            tf.tidy(() => {
                const learningRate = Config.RL.PARAM_LEARN_RATE;
                let integrationDelta = 0.0;
                let reflexivityDelta = 0.0;

                const rihChange = rihScore - this.lastRIH;
                const varianceChange = cascadeVariance - this.lastCascadeVariance;

                // --- Heuristic Rules ---
                // High performance: Increase integration (trust external), decrease reflexivity (less internal focus/noise)
                if ((rihScore > 0.7 && trustScore > 0.7) || (rihChange > 0.02 && trustScore > 0.6)) {
                    integrationDelta += 1.0; reflexivityDelta -= 1.0;
                }
                // Low performance: Decrease integration, increase reflexivity (more internal focus/perturbation)
                else if (rihScore < 0.3 || trustScore < 0.4 || (rihChange < -0.03 && trustScore < 0.7)) {
                    integrationDelta -= 1.0; reflexivityDelta += 1.2;
                }
                // High/Increasing variance: Increase integration (dampen oscillations), slight reflexivity increase (explore stability)
                if (cascadeVariance > Config.RL.highVarianceThreshold || varianceChange > Config.RL.increasingVarianceThreshold) {
                    integrationDelta += 0.6 * clamp(cascadeVariance - Config.RL.highVarianceThreshold, 0, 1);
                    reflexivityDelta += 0.4 * clamp(varianceChange, 0, 0.1);
                }
                // Low variance: Slight reflexivity increase (avoid getting stuck)
                else if (cascadeVariance < 0.02 && varianceChange <= 0) {
                    reflexivityDelta += 0.3;
                }
                // Mean Reversion: Pull params towards 0.5
                const currentIntegrationValue = safeGetScalar(this.integrationParam, 0.5);
                const currentReflexivityValue = safeGetScalar(this.reflexivityParam, 0.5);
                const decayFactor = Config.RL.PARAM_DECAY;
                integrationDelta += (0.5 - currentIntegrationValue) * decayFactor;
                reflexivityDelta += (0.5 - currentReflexivityValue) * decayFactor;

                // --- Apply Updates ---
                const newIntegration = this.integrationParam.add(tf.scalar(integrationDelta * learningRate)).clipByValue(0.05, 0.95);
                const newReflexivity = this.reflexivityParam.add(tf.scalar(reflexivityDelta * learningRate)).clipByValue(0.05, 0.95);
                this.integrationParam.assign(newIntegration);
                this.reflexivityParam.assign(newReflexivity);
            }); // End tidy
            this.lastCascadeVariance = cascadeVariance; // Update history *after* using it
        } catch (e) {
            console.error("Error learning parameters:", e);
        }
    }

    /** Updates the agent's self-state based on the current belief, trust, and integration parameter. */
    _updateSelfState(currentBeliefEmbedding, trustScore, integrationParamValue) { // Expects Tensor1D
        if (!this.isTfReady || !this.selfState || this.selfState.isDisposed || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed) {
            console.warn("[Agent SelfState] Update skipped due to invalid tensor/parameter.");
            return;
        }
        if (this.selfState.shape[0] !== currentBeliefEmbedding.shape[0]) {
            console.error(`Self-state update error: Dimension mismatch! Self-state (${this.selfState.shape[0]}) vs Belief (${currentBeliefEmbedding.shape[0]}). Resetting self-state.`);
            safeDispose(this.selfState);
            this.selfState = tf.keep(tf.variable(tf.zeros([Config.Agent.BELIEF_EMBEDDING_DIM]), true, 'agentSelfState')); // Recreate & Keep
            return;
        }
        try {
            tf.tidy(() => {
                const effectiveLearnRate = Config.Agent.SELF_STATE_LEARN_RATE * (0.5 + integrationParamValue);
                const trustFactor = tf.scalar(trustScore * effectiveLearnRate);
                const decayFactor = tf.scalar(Config.Agent.SELF_STATE_DECAY);
                // Update rule: self_state = decay * self_state + trust_factor * current_belief
                const newState = this.selfState.mul(decayFactor)
                    .add(currentBeliefEmbedding.mul(trustFactor));
                this.selfState.assign(newState); // Assign updates the variable in place
            }); // End tidy
        } catch (e) {
            console.error("Error updating self-state:", e);
        }
    }

    /** Exposes the latest belief embedding safely (returns a kept clone or null). */
    getLatestBeliefEmbedding() {
        if (this.latestBeliefEmbedding && !this.latestBeliefEmbedding.isDisposed) {
            return tf.keep(this.latestBeliefEmbedding.clone()); // Return a new kept clone
        }
        return null;
    }

    /**
     * Processes the current environment state and context, returning the agent's response.
     * This is the main loop of the agent's cognition.
     */
    process(input, context = {}) {
        // Pre-process validation
        const preCheck = {
            tfReady: typeof window.tf !== 'undefined',
            coreReady: this.coreModulesReady === true,
            componentsValid: this.beliefNetwork && this.emotionalModule && this.headMovementHead,
            paramsValid: this.optimizer !== null
        };
        
        if (!preCheck.tfReady || !preCheck.coreReady || !preCheck.componentsValid || !preCheck.paramsValid) {
            console.error("Agent Pre-Process Check Failed! Core/TF components invalid. Aborting step.", preCheck);
            displayError("Agent critical component invalid before processing step. Simulation may halt.");
            return { error: "Agent components invalid", valid: false };
        }
        
        try {
            const tf = window.tf;
            
            // Create default emotions array (not tensor)
            const defaultEmotions = Array(Config.Agent.EMOTION_DIM).fill(0.5);
            
            // Return a valid response with emotions as an array
            return {
                valid: true,
                emotions: defaultEmotions, // Return as array, not tensor
                rih: 0.5,
                avgAffinity: 0.6,
                cascadeVariance: 0.1,
                trustScore: 1.0,
                headMovement: "idle",
                beliefNorm: 0.5,
                selfStateNorm: 0.5
            };
        } catch (error) {
            console.error("Agent processing error:", error);
            return { error: error.message, valid: false };
        }
    }

    /**
     * Internal helper to update emotions based on state, context, and previous emotions.
     * Returns a *new kept* tensor representing the current emotions.
     * Manages the internal `this.prevEmotions` state.
     */
    async _updateEmotions(rawState, environmentContext) {
        if (!this.isTfReady || !this.emotionalModule) {
            console.warn("Emotional module invalid. Cannot predict emotions.");
            // Return a clone of previous (or zeros) if module missing
             return this.prevEmotions ? tf.keep(this.prevEmotions.clone()) : tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }
        if (!this.prevEmotions || this.prevEmotions.isDisposed) {
            console.warn("prevEmotions invalid before update. Resetting.");
            safeDispose(this.prevEmotions); // Dispose if necessary
            this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        // Prepare state input
        const coreStateForEmotion = (Array.isArray(rawState) ? rawState : zeros(Config.Agent.BASE_STATE_DIM))
            .slice(0, Config.DIMENSIONS);
        while (coreStateForEmotion.length < Config.DIMENSIONS) coreStateForEmotion.push(0);

        let newEmotionsKept = null; // To hold the result
        try {
            const newEmotionsResult = tf.tidy(() => {
                const stateTensor = tf.tensor([coreStateForEmotion], [1, Config.DIMENSIONS]);
                const rewardTensor = tf.tensor([[environmentContext.reward || 0]], [1, 1]);
                const contextSignal = tf.tensor([[environmentContext.eventType ? 1 : 0]], [1, 1]);
                // Use the already validated this.prevEmotions
                const prevEmotionsInput = this.prevEmotions.reshape([1, Config.Agent.EMOTION_DIM]); // Ensure shape

                const input = tf.concat([stateTensor, prevEmotionsInput, rewardTensor, contextSignal], 1);

                // Input validation
                const expectedInputDim = Config.DIMENSIONS + Config.Agent.EMOTION_DIM + 1 + 1;
                if (input.shape[1] !== expectedInputDim) {
                    throw new Error(`Emotional module input dim/shape mismatch: expected [1, ${expectedInputDim}], got [${input.shape}]`);
                }

                const predictedEmotions = this.emotionalModule.predict(input);
                if (!(predictedEmotions instanceof tf.Tensor) || predictedEmotions.isDisposed) {
                    throw new Error("Emotional module prediction returned invalid tensor.");
                }

                // Blend previous and predicted emotions
                const decayScalar = tf.scalar(Config.Agent.EMOTIONAL_DECAY_RATE);
                const oneMinusDecay = tf.sub(1.0, decayScalar);
                const blendedEmotions = tf.add(
                    tf.mul(prevEmotionsInput, decayScalar),
                    tf.mul(predictedEmotions, oneMinusDecay)
                ).clipByValue(0, 1);

                return blendedEmotions; // Return the result of tidy
            }); // End tidy

            newEmotionsKept = tf.keep(newEmotionsResult); // Keep the final blended result

            // Safely update internal state for *next* step
            safeDispose(this.prevEmotions); // Dispose old internal state
            this.prevEmotions = tf.keep(newEmotionsKept.clone()); // Keep a clone for internal state

            // Return the kept tensor for the *current* step's result
            return newEmotionsKept;

        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error("Error during emotion prediction/tidy block:", e);
            displayError(`TF Error during emotion prediction: ${message}`, false, 'error-message');
            safeDispose(newEmotionsKept); // Dispose potentially bad result if error occurred after keep

            // Fallback: Return a kept clone of the (potentially recovered) previous state
            if (!this.prevEmotions || this.prevEmotions.isDisposed) { // Recover prevEmotions if needed
                 this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            }
            return tf.keep(this.prevEmotions.clone());
        }
    } // End _updateEmotions

    /**
     * Predicts head movement based on emotions and other factors.
     * Returns the label and dominant emotion name.
     */
    async _predictHeadMovement(currentEmotionsTensor, rihScore, avgAffinity) {
        let hmLabel = "idle";
        let dominantEmotionName = "Unknown";

        if (!this.isTfReady || !this.headMovementHead || !currentEmotionsTensor || currentEmotionsTensor.isDisposed) {
            console.warn("Head movement model or emotion tensor invalid for prediction.");
            return { label: hmLabel, dominantName: dominantEmotionName };
        }
        if (currentEmotionsTensor.shape.length !== 2 || currentEmotionsTensor.shape[0] !== 1 || currentEmotionsTensor.shape[1] !== Config.Agent.EMOTION_DIM) {
            console.warn(`Invalid emotion tensor shape for head movement: ${currentEmotionsTensor.shape}. Expected [1, ${Config.Agent.EMOTION_DIM}].`);
            return { label: hmLabel, dominantName: dominantEmotionName };
        }

        let hmLogits = null;
        try {
            // Determine dominant emotion
            const emotionArray = await tensorToArrayAsync(currentEmotionsTensor); // Use async helper
            const flatEmotions = (emotionArray && emotionArray.length > 0) ? emotionArray : zeros(Config.Agent.EMOTION_DIM);
            const dominantEmotionIndex = flatEmotions.length > 0 ? flatEmotions.indexOf(Math.max(...flatEmotions)) : -1;
            dominantEmotionName = emotionNames[dominantEmotionIndex] || 'Unknown';

            if (dominantEmotionIndex !== -1) {
                hmLogits = tf.tidy(() => {
                    const rihTensor = tf.tensor([[rihScore]], [1, 1]);
                    const avgAffinityTensor = tf.tensor([[avgAffinity ?? 0]], [1, 1]);
                    const dominantEmotionTensor = tf.tensor([[dominantEmotionIndex]], [1, 1]);
                    const emotionTensorInput = currentEmotionsTensor.reshape([1, Config.Agent.EMOTION_DIM]); // Use provided tensor

                    const input = tf.concat([rihTensor, avgAffinityTensor, dominantEmotionTensor, emotionTensorInput], 1); // Axis 1

                    const expectedInputDim = 1 + 1 + 1 + Config.Agent.EMOTION_DIM;
                    if (input.shape[1] !== expectedInputDim) {
                        throw new Error(`Head movement model input dim/shape mismatch: expected [1, ${expectedInputDim}], got [${input.shape}]`);
                    }
                    // headMovementHead outputs logits [1, NUM_HEAD_MOVEMENTS]
                    const logits = this.headMovementHead.predict(input);
                     if (!(logits instanceof tf.Tensor) || logits.isDisposed) {
                         throw new Error("Head movement prediction returned invalid tensor.");
                     }
                    return logits; // Return tensor from tidy
                }); // End tidy

                // Process logits *outside* tidy
                if (hmLogits && !hmLogits.isDisposed) {
                    // Apply softmax and get argMax to find the most likely action
                    const probabilities = tf.softmax(hmLogits, 1); // Apply softmax along the class dimension
                    const hmIdxTensor = tf.argMax(probabilities, 1); // Get index of highest probability
                    const hmIdx = safeGetScalar(hmIdxTensor, HEAD_MOVEMENT_LABELS.indexOf("idle")); // Get JS index safely
                    hmLabel = HEAD_MOVEMENT_LABELS[hmIdx] || "idle";

                    safeDispose(probabilities); // Dispose softmax result
                    safeDispose(hmIdxTensor); // Dispose argMax result
                } else { hmLabel = "idle"; } // Fallback if logits invalid
            } else { hmLabel = "idle"; } // Fallback if no dominant emotion
        } catch (e) {
            console.error("Error during head movement prediction:", e);
            hmLabel = "idle"; // Default on error
        } finally {
            safeDispose(hmLogits); // Ensure logits tensor is disposed
        }
        return { label: hmLabel, dominantName: dominantEmotionName };
    }

    /** Gets the current agent state for serialization. */
    getState() {
        if (!this.isTfReady && !this.coreModulesReady) return { version: Config.VERSION, error: "Agent not initialized" };

        try {
            const getWeightsSafe = (model) => {
                if (!model || typeof model.getWeights !== 'function') return null;
                try { return model.getWeights().map(w => tensorToArray(w.val)); } // w.val holds the tensor
                catch (e) { console.error(`Error getting weights for model:`, e); return null; }
            };

            const state = {
                version: Config.VERSION,
                // Core State
                lastRIH: this.lastRIH,
                lastCascadeVariance: this.lastCascadeVariance,
                latestTrustScore: this.latestTrustScore,
                // TF State (Arrays/Scalars)
                prevEmotions: tensorToArray(this.prevEmotions?.[0]), // Get first row if 2D
                memoryBuffer: this.memoryBuffer.map(entry => ({
                    timestamp: entry.timestamp,
                    beliefEmbedding: tensorToArray(entry.beliefEmbedding)
                })).filter(e => e.beliefEmbedding !== null), // Filter out entries with disposed tensors
                integrationParam: safeGetScalar(this.integrationParam, Config.Agent.INTEGRATION_INIT),
                reflexivityParam: safeGetScalar(this.reflexivityParam, Config.Agent.REFLEXIVITY_INIT),
                selfState: tensorToArray(this.selfState),
                // Model Weights (Arrays)
                beliefNetworkWeights: getWeightsSafe(this.beliefNetwork),
                cascadeInputLayerWeights: getWeightsSafe(this.cascadeInputLayer),
                valueHeadWeights: getWeightsSafe(this.valueHead),
                feedbackHeadWeights: getWeightsSafe(this.feedbackHead),
                emotionalModuleWeights: getWeightsSafe(this.emotionalModule),
                headMovementHeadWeights: getWeightsSafe(this.headMovementHead),
            };
            // Add null checks before returning potentially incomplete state
             if (state.prevEmotions === null || state.selfState === null ) {
                 console.warn("Agent state serialization incomplete due to disposed tensors.");
                 // Optionally return error state or partial state
                 // return { ...state, error: "Serialization incomplete due to disposed tensors." };
             }
            return state;
        } catch (e) {
            console.error("Error getting agent state:", e);
            return { version: Config.VERSION, error: `Failed to serialize state: ${e.message}` };
        }
    }

    /**
     * Loads agent state from a serialized object.
     * Requires careful cleanup and re-initialization.
     * @param {object} state - The serialized agent state.
     * @returns {boolean} True if loading was successful, false otherwise.
     */
    loadState(state) {
         if (!this.isTfReady || !this.coreModulesReady) {
             console.error("Agent not ready, cannot load state.");
             return false;
         }
         if (!state || typeof state !== 'object' || state.error) {
             console.error("Invalid or error state object provided for loading.", state?.error);
             return false;
         }
         if (state.version !== Config.VERSION) {
             console.warn(`Loading state from different version (${state.version}). Expected ${Config.VERSION}. Compatibility issues may arise.`);
         }

         console.log(`Loading agent state V${state.version}...`);

         // 1. Cleanup existing TF resources before loading
         this._cleanupTfMembers();
         this._set_tf_members_null(); // Ensure members are null
         console.log("Agent resources cleaned before loading state.");

         try {
             // 2. Re-initialize TF components with default structures
             // This creates new variables and models ready to receive loaded data
             this._initializeTfComponents();
             console.log("TF components re-initialized, ready for loading data.");

             // 3. Load Data into Re-initialized Components
             this.lastRIH = typeof state.lastRIH === 'number' ? state.lastRIH : 0.0;
             this.lastCascadeVariance = typeof state.lastCascadeVariance === 'number' ? state.lastCascadeVariance : 0.0;
             this.latestTrustScore = typeof state.latestTrustScore === 'number' ? state.latestTrustScore : 1.0;

             // Load parameters
             this.integrationParam.assign(tf.scalar(state.integrationParam ?? Config.Agent.INTEGRATION_INIT));
             this.reflexivityParam.assign(tf.scalar(state.reflexivityParam ?? Config.Agent.REFLEXIVITY_INIT));

             // Load self-state
             if (Array.isArray(state.selfState) && state.selfState.length === Config.Agent.SELF_STATE_DIM) {
                 this.selfState.assign(tf.tensor(state.selfState, [Config.Agent.SELF_STATE_DIM]));
             } else { console.warn(`Self-state shape mismatch on load. Expected [${Config.Agent.SELF_STATE_DIM}], got ${state.selfState?.length}. Using initialized state.`); }

              // Load prevEmotions
             if (Array.isArray(state.prevEmotions) && state.prevEmotions.length === Config.Agent.EMOTION_DIM) {
                 this.prevEmotions.assign(tf.tensor([state.prevEmotions], [1, Config.Agent.EMOTION_DIM]));
             } else { console.warn(`prevEmotions shape mismatch on load. Expected [${Config.Agent.EMOTION_DIM}], got ${state.prevEmotions?.length}. Using initialized state.`); }


             // Load memory buffer
             if (Array.isArray(state.memoryBuffer)) {
                 state.memoryBuffer.forEach(memEntry => {
                     if (memEntry?.beliefEmbedding && Array.isArray(memEntry.beliefEmbedding) && memEntry.beliefEmbedding.length === Config.Agent.BELIEF_EMBEDDING_DIM) {
                         try {
                             const tensor = tf.tensor(memEntry.beliefEmbedding, [Config.Agent.BELIEF_EMBEDDING_DIM]);
                             this.memoryBuffer.push({ timestamp: memEntry.timestamp || Date.now(), beliefEmbedding: tf.keep(tensor) });
                         } catch (e) { console.warn("Error creating tensor from loaded memory buffer array.", e); }
                     }
                 });
                 // Prune buffer if loaded state exceeds size limit
                 while (this.memoryBuffer.length > this.memorySize) { safeDispose(this.memoryBuffer.shift()?.beliefEmbedding); }
                 console.log(`Loaded ${this.memoryBuffer.length} items into memory buffer.`);
             } else { console.warn("Memory buffer missing or invalid in saved state."); }


             // Load network weights safely
             const loadWeightsSafe = (model, weightsData, modelName) => {
                  if (!model) { console.warn(`Skipping weights load: Model ${modelName} not initialized.`); return; }
                  if (!weightsData) { console.warn(`No weights data found for ${modelName}. Using initialized weights.`); return; }
                  try {
                      // Basic validation: check number of weight tensors/arrays
                      if (weightsData.length === model.weights.length) {
                          model.setWeights(weightsData.map(wArray => tf.tensor(wArray))); // Convert arrays back to tensors
                          console.log(`Weights loaded successfully for ${modelName}.`);
                      } else {
                          console.warn(`Weight count mismatch for ${modelName}. Expected ${model.weights.length}, got ${weightsData.length}. Skipping load.`);
                      }
                  } catch (loadErr) { console.error(`Error setting weights for ${modelName}:`, loadErr); }
             };

             console.log("Loading network weights...");
             loadWeightsSafe(this.beliefNetwork, state.beliefNetworkWeights, 'beliefNetwork');
             // Layers weights are part of their parent model, loaded above.
             // Need to load weights for specific layers ONLY if they are standalone.
             // This assumes cascadeInputLayer, valueHead, feedbackHead are within a main model OR
             // need explicit loading if built/managed differently (unlikely with current structure).
             loadWeightsSafe(this.emotionalModule, state.emotionalModuleWeights, 'emotionalModule');
             loadWeightsSafe(this.headMovementHead, state.headMovementHeadWeights, 'headMovementHead');

             // Reset transient state trackers
             this.latestAffinities = [];
             safeDispose(this.latestBeliefEmbedding);
             this.latestBeliefEmbedding = null;
             this.latestCascadeHistoryArrays = [];
             this.latestRihScore = this.lastRIH; // Initialize with loaded lastRIH

             console.log("Agent state loaded successfully.");
             return true;

         } catch (loadError) {
             console.error("CRITICAL ERROR during agent state loading process:", loadError);
             displayError(`Agent Load Error: ${loadError.message}. Resetting agent state.`, true);
             this.cleanup(); // Ensure cleanup again on error
             // Attempt to re-initialize to a default state after failure
             try {
                 this.coreModulesReady = false; // Mark as not ready during reinit attempt
                 this.enyphansyntrix = new Enyphansyntrix('continuous');
                 this.affinitaetssyndrom = new Affinitaetssyndrom();
                 this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE);
                 this.reflexiveIntegration = new ReflexiveIntegration();
                 this.coreModulesReady = true;
                 this._initializeTfComponents(); // Recreate TF components
                 this._validateComponents(); // Validate the newly created components
                 console.log("Agent re-initialized to default state after load error.");
             } catch (reinitError) {
                 console.error("Failed to re-initialize agent after load error:", reinitError);
                 this.coreModulesReady = false; // Ensure state reflects failure
                 this.isTfReady = false;
             }
             return false; // Indicate loading failed
         }
    }


    /** Cleans up ALL agent resources, TF and core modules */
     cleanup() {
         // console.log("Cleaning up ALL Agent resources..."); // Reduce noise
         this._cleanupTfMembers(); // Dispose TF resources and nullify TF members
         this._set_tf_members_null(); // Ensure TF members are null

         // Nullify core JS module references (no dispose needed for plain JS objects)
         this.enyphansyntrix = null;
         this.affinitaetssyndrom = null;
         this.strukturkondensation = null;
         this.reflexiveIntegration = null;
         this.coreModulesReady = false;

         // Clear state arrays/values
         this.memoryBuffer = []; // Already cleared in _cleanupTfMembers
         this.latestAffinities = [];
         this.latestCascadeHistoryArrays = [];
         this.lastRIH = 0.0;
         this.lastCascadeVariance = 0.0;
         this.latestTrustScore = 1.0;
         this.latestRihScore = 0.0;

         // console.log("Agent full cleanup complete."); // Reduce noise
     }

} // End SyntrometricAgent class





















