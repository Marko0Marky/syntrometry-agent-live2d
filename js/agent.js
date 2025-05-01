// js/agent.js

import { Config, emotionNames, HEAD_MOVEMENT_LABELS, NUM_HEAD_MOVEMENTS } from './config.js';
// Import updated core classes
import { Enyphansyntrix, Affinitaetssyndrom, Strukturkondensation, ReflexiveIntegration, Synkolator } from './syntrometry-core.js';
import { zeros, tensor, clamp, displayError, inspectTensor, norm } from './utils.js'; // Added norm

// --- Constants ---
const NUM_GRAPH_FEATURES = 2; // From Syntrometry visualization (varianceZ, avgDistToRih)
const BELIEF_EMBEDDING_DIM = Config.Agent.HIDDEN_DIM || 64;
// Input: Core State (DIMENSIONS) + Graph Features (NUM_GRAPH_FEATURES) + Self State (BELIEF_EMBEDDING_DIM)
const BELIEF_NETWORK_INPUT_DIM = Config.DIMENSIONS + NUM_GRAPH_FEATURES + BELIEF_EMBEDDING_DIM;
// Input to Cascade: Projected from Belief Embedding
const CASCADE_INPUT_DIM = Config.DIMENSIONS; // Cascade operates on core dimension space
const EMOTIONAL_DECAY_RATE = 0.97;
const SELF_STATE_DECAY = 0.98; // Decay factor for self-state update
const SELF_STATE_LEARN_RATE = 0.05; // Base learning rate for self-state update

/**
 * Represents the Syntrometric Agent V2.3.
 * Integrates core Syntrometry concepts with TF.js models for belief formation,
 * emotional response, self-state modeling, and parameter self-tuning.
 */
export class SyntrometricAgent {
    constructor() {
        // --- Initialize Core Syntrometry Modules FIRST ---
        // These are plain JS objects, less prone to async/init issues
        this.enyphansyntrix = new Enyphansyntrix('continuous'); // Use perturbation
        this.affinitaetssyndrom = new Affinitaetssyndrom();
        this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2);
        this.reflexiveIntegration = new ReflexiveIntegration();
        // Synkolator is used internally by Strukturkondensation

        // V2 Features & State Tracking
        this.memorySize = Config.Agent.HISTORY_SIZE || 10;
        this.memoryBuffer = []; // Holds last N { timestamp: Date, beliefEmbedding: tf.Tensor }
        this.lastRIH = 0.0;
        this.lastCascadeVariance = 0.0;
        this.latestTrustScore = 1.0;
        this.latestAffinities = []; // Cache affinities from last step for viz
        this.latestBeliefEmbedding = null; // Cache for inspector

        // --- Initialize TF Members ---
        this._set_tf_members_null(); // Nullify *only* TF members initially

        // --- TF.js Models & Variables ---
        if (typeof tf === 'undefined') {
            console.error("CRITICAL: TensorFlow.js not loaded. Agent cannot initialize TF components.");
            displayError("TensorFlow.js not loaded. Agent initialization failed.", true, 'error-message');
             // Ensure core modules are nulled if TF isn't available from the start
             this.enyphansyntrix = null; this.affinitaetssyndrom = null;
             this.strukturkondensation = null; this.reflexiveIntegration = null;
            return; // Stop constructor
        }

        try {
            // --- Self-Learning Parameters ---
            // These parameters represent the agent's internal strategy for balancing
            // new information (Integration) vs. internal coherence (Reflexivity).
            // They are trainable variables, adjusted based on performance (RIH, Trust, Variance).
            this.integrationParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentIntegrationParam'));
            this.reflexivityParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentReflexivityParam'));

            // --- Belief Network ---
            // Processes current state, graph context, and self-state to form a belief embedding.
            this.beliefNetwork = tf.sequential({ name: 'beliefNetwork'});
            this.beliefNetwork.add(tf.layers.dense({ units: Config.Agent.HIDDEN_DIM * 2, inputShape: [BELIEF_NETWORK_INPUT_DIM], activation: 'relu' })); // Wider first layer
            this.beliefNetwork.add(tf.layers.dropout({ rate: 0.1 })); // Added dropout
            this.beliefNetwork.add(tf.layers.dense({ units: BELIEF_EMBEDDING_DIM, activation: 'tanh' })); // Output embedding

            // --- Cascade Input Projection Layer ---
            // Maps the belief embedding to the dimensionality required by the Strukturkondensation.
            this.cascadeInputLayer = tf.layers.dense({ units: CASCADE_INPUT_DIM, inputShape: [BELIEF_EMBEDDING_DIM], activation: 'tanh', name:'cascadeInputLayer' });

            // --- Value and Feedback Heads (Currently not used for training, but structure is present) ---
            // Could be used for future RL implementations (e.g., predicting state value or generating feedback).
            this.valueHead = tf.layers.dense({ units: 1, inputShape: [BELIEF_EMBEDDING_DIM], name: 'valueHead'});
            this.feedbackHead = tf.layers.dense({ units: Config.DIMENSIONS, inputShape: [BELIEF_EMBEDDING_DIM], name: 'feedbackHead'});

            // --- Self-State Model ---
            // Represents the agent's persistent internal state, updated based on belief embeddings and trust.
            // It's a trainable variable, allowing the agent's core self-representation to evolve.
            this.selfState = tf.keep(tf.variable(tf.randomNormal([BELIEF_EMBEDDING_DIM], 0, 0.1), true, 'agentSelfState')); // Start with small random values

            // --- Emotion and Head Movement Models ---
            this.emotionalModule = this._buildEmotionalModel();
            this.headMovementHead = this._buildHeadMovementModel();

            // --- Previous Emotion State ---
            // Stores the emotion tensor from the previous step for temporal dynamics.
            this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));

            // --- Optimizer ---
            // Used for potentially training models in the future (currently only params are trained heuristically).
            const learningRate = Config?.RL?.LR ?? 0.001;
            this.optimizer = tf.train.adam(learningRate);


             // --- Detailed Check for Initialization Failures ---
             this._validateComponents(); // Run validation method

             console.log("SyntrometricAgent V2.3 TF components initialized successfully.");

        } catch (tfError) { // Catch errors specifically from TF setup
            console.error("Error during TF model/optimizer setup in Agent:", tfError);
            displayError(`Agent TF Setup Error: ${tfError.message}. Agent may be unstable.`, true, 'error-message');
            this._cleanupTfMembers(); // Attempt cleanup of partially created TF members
            this._set_tf_members_null(); // Ensure TF members are null
            // Core JS modules remain, but TF functionality is lost.
            return; // Stop constructor
        }
    }

    /** Helper to validate essential components after TF initialization attempt. */
    _validateComponents() {
        const components = {
             enyphansyntrix: this.enyphansyntrix, affinitaetssyndrom: this.affinitaetssyndrom,
             strukturkondensation: this.strukturkondensation, reflexiveIntegration: this.reflexiveIntegration,
             emotionalModule: this.emotionalModule, headMovementHead: this.headMovementHead,
             beliefNetwork: this.beliefNetwork, cascadeInputLayer: this.cascadeInputLayer,
             valueHead: this.valueHead, feedbackHead: this.feedbackHead,
             optimizer: this.optimizer, integrationParam: this.integrationParam,
             reflexivityParam: this.reflexivityParam, selfState: this.selfState,
             prevEmotions: this.prevEmotions,
         };
         const failedComponents = Object.entries(components)
             .filter(([key, value]) => !value || (value instanceof tf.Tensor && value.isDisposed) || (value instanceof tf.Variable && value.isDisposed))
             .map(([key]) => key);

         if (failedComponents.length > 0) {
             console.error("Failed to initialize/validate components:", failedComponents);
             throw new Error(`Agent component(s) failed initialization/validation: ${failedComponents.join(', ')}`);
         }
    }


    /** Helper to nullify *only* TF-related members */
    _set_tf_members_null() {
        this.integrationParam = null; this.reflexivityParam = null; this.selfState = null;
        this.beliefNetwork = null; this.cascadeInputLayer = null; this.valueHead = null; this.feedbackHead = null;
        this.emotionalModule = null; this.headMovementHead = null; this.prevEmotions = null;
        this.optimizer = null;
        this.latestBeliefEmbedding = null;
        // DO NOT nullify core JS modules here
    }

    /** Helper to dispose *only* TF-related members */
    _cleanupTfMembers() {
        if (typeof tf === 'undefined') return;
        // console.log("Cleaning up Agent TF members..."); // Reduce noise
         const safeDispose = (item) => {
             if (!item) return;
             // Dispose tensors in memory buffer first
             if (item === this.memoryBuffer) {
                 item.forEach(memItem => safeDispose(memItem?.beliefEmbedding));
                 this.memoryBuffer = []; // Clear array after disposing contents
                 return;
             }
             // Dispose single tensor/variable or weights of a model
             if (item instanceof tf.LayersModel) {
                 item.weights.forEach(w => safeDispose(w?.val)); // Dispose weights' tensors
             } else if (item instanceof tf.Tensor && !item.isDisposed) {
                  try { item.dispose(); } catch (e) { console.error("Dispose error (tensor/var):", e); }
             }
         };

         safeDispose(this.beliefNetwork);
         safeDispose(this.cascadeInputLayer);
         safeDispose(this.valueHead);
         safeDispose(this.feedbackHead);
         safeDispose(this.emotionalModule);
         safeDispose(this.headMovementHead);
         safeDispose(this.prevEmotions);
         safeDispose(this.selfState);
         safeDispose(this.integrationParam);
         safeDispose(this.reflexivityParam);
         safeDispose(this.latestBeliefEmbedding);
         safeDispose(this.memoryBuffer); // Dispose tensors within the buffer

         this.optimizer = null; // Optimizer doesn't have a dispose method
         // console.log("Agent TF members disposed."); // Reduce noise
    }

    // --- TF Model Builders ---
    _buildEmotionalModel() {
        if (typeof tf === 'undefined') return null;
        try {
            const model = tf.sequential({ name: 'emotionalModule' });
            // Input: Core State Dims + Previous Emotion Dims + Reward Signal (1) + Event Type Signal (1)
            const inputDim = Config.DIMENSIONS + Config.Agent.EMOTION_DIM + 1 + 1;
            model.add(tf.layers.dense({ units: 32, inputShape: [inputDim], activation: 'relu' }));
            model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
            model.add(tf.layers.dense({ units: Config.Agent.EMOTION_DIM, activation: 'sigmoid' })); // Output emotions (0-1 range)
            return model;
        } catch (e) { console.error("Failed building emotional model:", e); return null; }
     }

    _buildHeadMovementModel() {
        if (typeof tf === 'undefined') return null;
        try {
            const model = tf.sequential({ name: 'headMovementHead' });
            // Input: RIH (1) + Avg Affinity (1) + Dominant Emotion Index (1) + Full Emotion Vector (EMOTION_DIM)
            const inputDim = 1 + 1 + 1 + Config.Agent.EMOTION_DIM;
            model.add(tf.layers.dense({ units: 16, inputShape: [inputDim], activation: 'relu' }));
            model.add(tf.layers.dense({ units: NUM_HEAD_MOVEMENTS })); // Output logits for each head movement
            return model;
        } catch (e) { console.error("Failed building head movement model:", e); return null; }
    }

    // --- Core Methods ---

    /** Adds the latest belief embedding tensor to the memory buffer, maintaining size. */
    _updateMemory(beliefTensor) {
        if (typeof tf === 'undefined' || !beliefTensor || beliefTensor.isDisposed) return;
        if (beliefTensor.rank !== 1 || beliefTensor.shape[0] !== BELIEF_EMBEDDING_DIM) {
             console.warn(`[Agent Memory] Invalid belief tensor shape: ${beliefTensor.shape}. Expected [${BELIEF_EMBEDDING_DIM}]. Skipping memory update.`);
             return;
        }
        // Store timestamp along with the tensor
        this.memoryBuffer.push({ timestamp: Date.now(), beliefEmbedding: tf.keep(beliefTensor.clone()) });
        // Remove oldest entry if buffer exceeds size
        if (this.memoryBuffer.length > this.memorySize) {
            const oldEntry = this.memoryBuffer.shift();
            if (oldEntry?.beliefEmbedding && !oldEntry.beliefEmbedding.isDisposed) {
                tf.dispose(oldEntry.beliefEmbedding);
            }
        }
    }

    /** Computes a trust score based on the similarity of the current belief to recent beliefs in memory. */
    _computeTrust(currentBeliefEmbedding) {
        if (typeof tf === 'undefined' || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed) return 0.5; // Default trust
        if (currentBeliefEmbedding.rank !== 1 || currentBeliefEmbedding.shape[0] !== BELIEF_EMBEDDING_DIM) return 0.5;
        if (this.memoryBuffer.length === 0) return 1.0; // Full trust if no history yet

        try {
            return tf.tidy(() => {
                const flatCurrent = currentBeliefEmbedding; // Already flat (rank 1)
                const currentNorm = flatCurrent.norm();
                if (currentNorm.arraySync() < 1e-9) return tf.scalar(0.0); // No trust if current belief is zero vector

                const validSimilarities = this.memoryBuffer
                    .map(memEntry => {
                        const memTensor = memEntry?.beliefEmbedding;
                        if (!memTensor || memTensor.isDisposed || memTensor.rank !== 1 || memTensor.shape[0] !== BELIEF_EMBEDDING_DIM) return null;
                        const flatMem = memTensor;
                        const memNorm = flatMem.norm();
                        const normProd = currentNorm.mul(memNorm);
                        if (normProd.arraySync() < 1e-9) return tf.scalar(0); // Treat as dissimilar if either norm is near zero
                        // Cosine Similarity
                        return flatCurrent.dot(flatMem).div(normProd).clipByValue(-1, 1);
                    })
                    .filter(s => s !== null); // Filter out invalid entries

                if (validSimilarities.length === 0) return tf.scalar(0.5); // Default trust if no valid history

                // Calculate weighted average similarity (more recent entries could have higher weight - TBD)
                const avgSimilarity = tf.mean(tf.stack(validSimilarities));

                // Convert similarity [-1, 1] to trust score [0, 1]
                const trust = avgSimilarity.add(1).div(2);
                return trust; // Return the tensor
            }).arraySync(); // Get the JS number value
        } catch (e) {
            console.error("Error computing trust:", e);
            return 0.5; // Default trust on error
        }
    }

    /** Heuristically adjusts integration and reflexivity parameters based on performance metrics. */
    _learnParameters(trustScore, rihScore, cascadeVariance) {
        if (typeof tf === 'undefined' || !this.integrationParam || !this.reflexivityParam || this.integrationParam.isDisposed || this.reflexivityParam.isDisposed) {
            return; // Cannot learn if params are invalid
        }

        tf.tidy(() => {
            const learningRate = 0.006; // How fast parameters adapt
            let integrationDelta = 0.0; // Change to apply to integrationParam
            let reflexivityDelta = 0.0; // Change to apply to reflexivityParam

            const rihChange = rihScore - this.lastRIH;
            const varianceChange = cascadeVariance - this.lastCascadeVariance;

            // --- Heuristic Rules ---
            // Rule 1: High performance -> Increase integration, decrease reflexivity (explore more)
            if ((rihScore > 0.7 && trustScore > 0.7) || (rihChange > 0.02 && trustScore > 0.6)) {
                integrationDelta += 1.0;
                reflexivityDelta -= 1.0;
            }
            // Rule 2: Low performance -> Decrease integration, increase reflexivity (rely more on internal state)
            else if (rihScore < 0.3 || trustScore < 0.4 || (rihChange < -0.03 && trustScore < 0.7)) {
                integrationDelta -= 1.0;
                reflexivityDelta += 1.2; // Increase reflexivity more strongly on failure
            }

            // Rule 3: High or increasing variance -> Increase integration (adapt to complexity), slight increase reflexivity (maintain some stability)
            const highVarianceThreshold = 0.15;
            const increasingVarianceThreshold = 0.01;
            if (cascadeVariance > highVarianceThreshold || varianceChange > increasingVarianceThreshold) {
                integrationDelta += 0.6 * clamp(cascadeVariance - highVarianceThreshold, 0, 1);
                reflexivityDelta += 0.4 * clamp(varianceChange, 0, 0.1);
            }
            // Rule 4: Low variance (stable) -> Slight increase in reflexivity (reinforce stability)
            else if (cascadeVariance < 0.02 && varianceChange <= 0) {
                reflexivityDelta += 0.3;
            }

            // Rule 5: Mean reversion -> Gently pull parameters back towards 0.5 over time
            let currentIntegrationValue = 0.5, currentReflexivityValue = 0.5;
            try { currentIntegrationValue = this.integrationParam.dataSync()[0]; currentReflexivityValue = this.reflexivityParam.dataSync()[0]; } catch(e) { console.error("Error reading param values for decay:", e); }
            const decayFactor = 0.03; // Strength of mean reversion
            integrationDelta += (0.5 - currentIntegrationValue) * decayFactor;
            reflexivityDelta += (0.5 - currentReflexivityValue) * decayFactor;

            // Apply updates and clamp
            const newIntegration = this.integrationParam.add(tf.scalar(integrationDelta * learningRate));
            const newReflexivity = this.reflexivityParam.add(tf.scalar(reflexivityDelta * learningRate));

            this.integrationParam.assign(newIntegration.clipByValue(0.05, 0.95)); // Keep params within reasonable bounds
            this.reflexivityParam.assign(newReflexivity.clipByValue(0.05, 0.95));

            // Update last values for next step's calculation
            this.lastCascadeVariance = cascadeVariance;
            // lastRIH updated in process()
        });
    }

    /** Updates the agent's self-state based on the current belief, trust, and integration parameter. */
    _updateSelfState(currentBeliefEmbedding, trustScore, integrationParamValue) {
        if (typeof tf === 'undefined' || !this.selfState || this.selfState.isDisposed || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed) {
             console.warn("[Agent SelfState] Update skipped due to invalid tensor/parameter.");
             return;
         }
        // Dimension check
        if (this.selfState.shape[0] !== currentBeliefEmbedding.shape[0]) {
             console.error(`Self-state update error: Dimension mismatch! Self-state (${this.selfState.shape[0]}) vs Belief (${currentBeliefEmbedding.shape[0]}). Resetting self-state.`);
             tf.dispose(this.selfState); // Dispose the invalid state
             this.selfState = tf.keep(tf.variable(tf.zeros([BELIEF_EMBEDDING_DIM]), true, 'agentSelfState')); // Recreate
             return;
         }

         tf.tidy(() => {
             // Learn rate modulated by integration param (higher integration = faster self-state update)
             const effectiveLearnRate = SELF_STATE_LEARN_RATE * (0.5 + integrationParamValue);
             // Trust modulates how much the current belief influences the update
             const trustFactor = tf.scalar(trustScore * effectiveLearnRate);
             // Decay previous state slightly, add weighted current belief
             const newState = this.selfState.mul(SELF_STATE_DECAY)
                               .add(currentBeliefEmbedding.mul(trustFactor));
             // Assign the updated state
             this.selfState.assign(newState);
         });
    }

    /** Exposes the latest belief embedding safely (returns a clone or null). */
    getLatestBeliefEmbedding() {
        if (this.latestBeliefEmbedding && !this.latestBeliefEmbedding.isDisposed) {
            return tf.keep(this.latestBeliefEmbedding.clone()); // Return a kept clone
        }
        return null;
    }


    /**
     * Processes the current environment state and context, returning the agent's response.
     * This is the main loop of the agent's cognition.
     */
    async process(rawState, graphFeatures, environmentContext = { eventType: null, reward: 0 }) {

        // --- Rigorous Pre-Check ---
        // Ensures all essential components are valid before proceeding.
        const isTfReady = typeof tf !== 'undefined';
        const componentsValid = !(!this.beliefNetwork || !this.cascadeInputLayer || !this.valueHead || !this.feedbackHead ||
                                !this.integrationParam || this.integrationParam.isDisposed || !this.reflexivityParam || this.reflexivityParam.isDisposed ||
                                !this.selfState || this.selfState.isDisposed || !this.prevEmotions || this.prevEmotions.isDisposed ||
                                !this.enyphansyntrix || !this.strukturkondensation || !this.reflexiveIntegration || !this.affinitaetssyndrom ||
                                !this.emotionalModule || !this.headMovementHead);

        if (!isTfReady || !componentsValid) {
             console.error("Agent Pre-Process Check Failed! Aborting step.", { isTfReady, componentsValid });
             displayError("Agent critical component invalid before processing step. Simulation may halt.", true, 'error-message');
             // Return default/error state
             const defaultEmotions = isTfReady ? tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])) : null;
             return {
                 cascadeHistory: [], rihScore: 0, affinities: [], emotions: defaultEmotions, hmLabel: 'idle',
                 responseText: "Error: Agent component invalid.", integration: 0.5, reflexivity: 0.5,
                 trustScore: 0.0, beliefNorm: 0, feedbackNorm: 0, selfStateNorm: 0
             };
        }
        // --- End Rigorous Pre-Check ---

        // Get current parameter values safely
        let currentIntegration = 0.5, currentReflexivity = 0.5;
        try {
            if (!this.integrationParam.isDisposed) currentIntegration = this.integrationParam.dataSync()[0];
            if (!this.reflexivityParam.isDisposed) currentReflexivity = this.reflexivityParam.dataSync()[0];
        } catch (e) { console.error("Error reading agent parameters:", e); }

        let results = {};
        let beliefNormValue = 0.0, feedbackNormValue = 0.0, currentSelfStateNorm = 0.0;

        try {
             // --- Core Cognitive Loop (within tf.tidy for memory management) ---
            results = tf.tidy(() => {
                // 1. Prepare Input State
                // Ensure input state array has the correct base dimensions
                let stateArray = Array.isArray(rawState)
                    ? rawState.slice(0, Config.Agent.BASE_STATE_DIM)
                    : zeros([Config.Agent.BASE_STATE_DIM]);
                while(stateArray.length < Config.Agent.BASE_STATE_DIM) stateArray.push(0);

                // Extract core dimensions for processing, ensure it's a tensor
                const coreStateTensor = tf.tensor(stateArray.slice(0, Config.DIMENSIONS));
                const graphFeaturesTensor = tf.tensor(graphFeatures); // Features from Syntrometry viz
                const currentSelfState = this.selfState; // Get current self-state tensor

                // 2. Input Modulation & Perturbation (Enyphansyntrix)
                // Modulate input by RIH and Reflexivity (higher reflexivity -> more internal focus)
                const rihModulation = this.lastRIH * (currentReflexivity * 2 - 1); // Scale RIH influence based on reflexivity
                let modulatedInput = coreStateTensor.add(tf.scalar(rihModulation * 0.1)).clipByValue(-1, 1);
                // Apply perturbation (noise) based on inverse RIH and reflexivity (more noise if uncertain/less reflexive)
                const perturbationScale = clamp(0.005 + (1.0 - this.lastRIH) * 0.02 + currentReflexivity * 0.02, 0.001, 0.05);
                const perturbedInput = this.enyphansyntrix.apply(modulatedInput, perturbationScale); // Enyphansyntrix handles clipping

                // 3. Belief Formation
                // Concatenate processed state, graph features, and self-state for the belief network
                const beliefNetInput = tf.concat([
                    perturbedInput.reshape([1, Config.DIMENSIONS]),
                    graphFeaturesTensor.reshape([1, NUM_GRAPH_FEATURES]),
                    currentSelfState.reshape([1, BELIEF_EMBEDDING_DIM]) // Use current self-state
                ], 1); // Concatenate along the feature dimension

                // Dimension check for safety
                if (beliefNetInput.shape[1] !== BELIEF_NETWORK_INPUT_DIM) {
                     throw new Error(`Belief network input dim mismatch: expected ${BELIEF_NETWORK_INPUT_DIM}, got ${beliefNetInput.shape[1]}`);
                }
                // Generate the belief embedding vector (internal representation)
                const beliefEmbedding = this.beliefNetwork.apply(beliefNetInput).reshape([BELIEF_EMBEDDING_DIM]);
                const keptBeliefEmbedding = tf.keep(beliefEmbedding.clone()); // Keep for updateMemory/updateSelfState outside tidy

                // 4. Cascade Processing (Strukturkondensation)
                // Project belief embedding onto the cascade input dimension
                const cascadeInput = this.cascadeInputLayer.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([CASCADE_INPUT_DIM]);
                // Process through structural condensation levels
                const cascadeHistoryTensors = this.strukturkondensation.process(cascadeInput); // Returns array of kept tensors
                const cascadeHistoryArrays = cascadeHistoryTensors.map(t => t.arraySync()); // Convert to JS arrays for output
                const lastCascadeLevelTensor = cascadeHistoryTensors.length > 0 ? cascadeHistoryTensors[cascadeHistoryTensors.length - 1] : tf.tensor([]);

                // 5. Compute RIH & Affinities
                // RIH score from the final cascade level (Reflexive Integration)
                const currentRihScore = this.reflexiveIntegration.compute(lastCascadeLevelTensor);
                // Affinities between cascade levels (Affinitaetssyndrom)
                const currentAffinities = [];
                if (cascadeHistoryTensors.length > 1) {
                    for (let i = 0; i < cascadeHistoryTensors.length - 1; i++) {
                        if (cascadeHistoryTensors[i]?.shape[0] > 0 && cascadeHistoryTensors[i+1]?.shape[0] > 0 && !cascadeHistoryTensors[i].isDisposed && !cascadeHistoryTensors[i+1].isDisposed) {
                            try {
                                const affinity = this.affinitaetssyndrom.compute(cascadeHistoryTensors[i], cascadeHistoryTensors[i+1]);
                                currentAffinities.push(affinity);
                            } catch (affError) { console.error(`Affinity Error L${i}: ${affError}`); currentAffinities.push(0); }
                        } else { currentAffinities.push(0); } // Push 0 if tensors invalid/empty
                    }
                }
                const currentAvgAffinity = currentAffinities.length > 0 ? currentAffinities.reduce((a, b) => a + b, 0) / currentAffinities.length : 0;

                // 6. Compute Trust Score
                const currentTrustScore = this._computeTrust(beliefEmbedding); // Based on memory comparison

                // 7. Extract Cascade Features (for parameter learning)
                let varFinal = 0.0, meanFinal = 0.0;
                if (lastCascadeLevelTensor.size > 1) {
                    const moments = tf.moments(lastCascadeLevelTensor);
                    varFinal = moments.variance.arraySync();
                    meanFinal = moments.mean.arraySync();
                } else if (lastCascadeLevelTensor.size === 1) { meanFinal = lastCascadeLevelTensor.arraySync()[0]; }
                const cascadeFeatures = [clamp(varFinal, 0, 10), clamp(meanFinal, -10, 10)]; // Variance and Mean

                // 8. Value/Feedback Prediction (currently unused for training)
                const valuePred = this.valueHead.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([]);
                const feedbackSignalRaw = this.feedbackHead.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([Config.DIMENSIONS]);
                const feedbackSignal = feedbackSignalRaw; // No modifications for now

                // Dispose intermediate cascade tensors (process returns kept ones)
                cascadeHistoryTensors.forEach(t => tf.dispose(t));

                // Return results needed outside the tidy block
                return {
                    keptBeliefEmbedding, // Must be kept for updates outside
                    cascadeHistoryArrays, // JS arrays, no disposal needed
                    currentRihScore: currentRihScore ?? 0,
                    currentAffinities: currentAffinities,
                    currentAvgAffinity: currentAvgAffinity ?? 0,
                    currentTrustScore: currentTrustScore ?? 0.5,
                    cascadeFeatures: cascadeFeatures,
                    valuePred: tf.keep(valuePred.clone()), // Keep if needed later
                    feedbackSignal: tf.keep(feedbackSignal.clone()) // Keep if needed later
                };
            }); // End tf.tidy

            // --- Post-Tidy Updates ---

            // Store results for state tracking and visualization
            this.latestRihScore = results.currentRihScore;
            this.latestAffinities = results.currentAffinities;
            this.latestTrustScore = results.currentTrustScore;
            this.latestCascadeHistoryArrays = results.cascadeHistoryArrays; // Store for viz

            // Calculate norms for dashboard display
            if (results.keptBeliefEmbedding && !results.keptBeliefEmbedding.isDisposed) {
                beliefNormValue = norm(results.keptBeliefEmbedding.dataSync());
                // Update memory and self-state using the kept belief embedding
                this._updateMemory(results.keptBeliefEmbedding);
                this._updateSelfState(results.keptBeliefEmbedding, results.currentTrustScore, currentIntegration);

                // Cache the latest belief embedding (dispose previous if exists)
                if (this.latestBeliefEmbedding && !this.latestBeliefEmbedding.isDisposed) tf.dispose(this.latestBeliefEmbedding);
                this.latestBeliefEmbedding = tf.keep(results.keptBeliefEmbedding.clone());
            } else { beliefNormValue = 0; }

            if (results.feedbackSignal && !results.feedbackSignal.isDisposed) {
                feedbackNormValue = norm(results.feedbackSignal.dataSync());
            }
            if (this.selfState && !this.selfState.isDisposed) {
                currentSelfStateNorm = norm(this.selfState.dataSync());
            } else { currentSelfStateNorm = 0.0; }

            // Learn/Adjust integration/reflexivity parameters
            this._learnParameters(results.currentTrustScore, results.currentRihScore, results.cascadeFeatures[0]); // Use variance feature

            // Update history for next step's calculations
            this.lastRIH = results.currentRihScore;

            // Dispose kept tensors from tidy block now that they've been used/cached
            if (results.keptBeliefEmbedding && !results.keptBeliefEmbedding.isDisposed) tf.dispose(results.keptBeliefEmbedding);
            if (results.valuePred && !results.valuePred.isDisposed) tf.dispose(results.valuePred);
            if (results.feedbackSignal && !results.feedbackSignal.isDisposed) tf.dispose(results.feedbackSignal);

        } catch (e) {
             console.error("Error during agent core processing:", e);
             displayError(`Agent Processing Error: ${e.message}`, false, 'error-message');
             // Use last known good values or defaults as fallback
             results = {
                 cascadeHistoryArrays: this.latestCascadeHistoryArrays || [],
                 currentRihScore: this.lastRIH,
                 currentAffinities: this.latestAffinities || [],
                 currentAvgAffinity: this.latestAffinities.length > 0 ? this.latestAffinities.reduce((a,b)=>a+b,0)/this.latestAffinities.length : 0,
                 currentTrustScore: this.latestTrustScore,
                 // Cannot reliably provide other values like beliefNorm etc. on error
             };
             beliefNormValue = 0; feedbackNormValue = 0; currentSelfStateNorm = norm(this.selfState?.dataSync() ?? []);
        }

        // --- Emotion Update ---
        let currentEmotionsTensor;
        try {
            currentEmotionsTensor = await this._updateEmotions(rawState, environmentContext);
        } catch (e) {
            console.error("Error updating emotions:", e);
            displayError(`TF Error during emotion prediction: ${e.message}`, false, 'error-message');
            // Recover by decaying previous emotions or resetting to zero
            if (this.prevEmotions && !this.prevEmotions.isDisposed) {
                const decayed = tf.tidy(()=> this.prevEmotions.mul(EMOTIONAL_DECAY_RATE).clipByValue(0,1));
                 tf.dispose(this.prevEmotions);
                 this.prevEmotions = tf.keep(decayed);
            } else {
                 this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            }
            currentEmotionsTensor = this.prevEmotions;
        }


        // --- Head Movement Prediction ---
        let hmLabel = "idle";
        let dominantEmotionName = 'Unknown';
        try {
            if (this.headMovementHead && currentEmotionsTensor && !currentEmotionsTensor.isDisposed) {
                const { label, dominantName } = await this._predictHeadMovement(currentEmotionsTensor, results.currentRihScore, results.currentAvgAffinity);
                hmLabel = label;
                dominantEmotionName = dominantName;
            } else {
                // Fallback logic if model or tensor is invalid
                if (this.latestRihScore > 0.7) hmLabel = "nod";
                else if ((results.currentAvgAffinity ?? 0) < 0.2) hmLabel = "shake";
                if (currentEmotionsTensor && !currentEmotionsTensor.isDisposed){
                     const emotionArrayFallback = currentEmotionsTensor.arraySync()[0];
                     const domIdxFallback = emotionArrayFallback.length > 0 ? emotionArrayFallback.indexOf(Math.max(...emotionArrayFallback)) : -1;
                     dominantEmotionName = emotionNames[domIdxFallback] || 'Unknown';
                }
            }
        } catch (e) {
             console.error("Error predicting head movement:", e);
             displayError(`TF Error during head movement prediction: ${e.message}`, false, 'error-message');
             hmLabel = "idle"; // Default on error
        }


        // --- Prepare Response ---
        const rihText = (this.latestRihScore ?? 0).toFixed(2);
        const affText = (results.currentAvgAffinity ?? 0).toFixed(2);
        const trustText = (this.latestTrustScore ?? 0).toFixed(2);
        const intText = (currentIntegration ?? 0.5).toFixed(2);
        const refText = (currentReflexivity ?? 0.5).toFixed(2);
        const cascadeVarText = (results.cascadeFeatures?.[0] ?? this.lastCascadeVariance).toFixed(2);
        const responseText = `R:${rihText} A:${affText} T:${trustText} CV:${cascadeVarText} I:${intText} Ψ:${refText} | Mood:${dominantEmotionName} | Act:${hmLabel}`;

        return {
            cascadeHistory: results.cascadeHistoryArrays || [],
            rihScore: this.latestRihScore ?? 0,
            affinities: this.latestAffinities || [],
            emotions: currentEmotionsTensor, // Return the kept tensor
            hmLabel: hmLabel,
            responseText: responseText,
            trustScore: this.latestTrustScore ?? 0.5,
            integration: currentIntegration ?? 0.5,
            reflexivity: currentReflexivity ?? 0.5,
            beliefNorm: beliefNormValue,
            feedbackNorm: feedbackNormValue, // Include if needed
            selfStateNorm: currentSelfStateNorm
        };
    }

    /** Internal helper to update emotions */
        // Inside SyntrometricAgent class in agent.js

    /** Internal helper to update emotions */
    async _updateEmotions(rawState, environmentContext) {
         if (!this.emotionalModule) {
              console.warn("Emotional module invalid. Cannot predict emotions.");
              // Return a kept zero tensor if module is missing
              return tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
         }
         if (!this.prevEmotions || this.prevEmotions.isDisposed) {
             console.warn("prevEmotions invalid. Resetting and returning zeros.");
             if(this.prevEmotions && !this.prevEmotions.isDisposed) tf.dispose(this.prevEmotions);
             this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Reset if invalid
             return tf.keep(this.prevEmotions.clone()); // Return clone of zeros
         }

         const coreStateForEmotion = (Array.isArray(rawState) ? rawState : zeros([Config.Agent.BASE_STATE_DIM])).slice(0, Config.DIMENSIONS);
         while(coreStateForEmotion.length < Config.DIMENSIONS) coreStateForEmotion.push(0); // Ensure correct length

         try {
             // Calculate new emotions within a tidy block
             const newEmotionsResult = tf.tidy(() => {
                 const stateTensor = tf.tensor([coreStateForEmotion], [1, Config.DIMENSIONS]); // Ensure shape [1, DIMENSIONS]
                 const rewardTensor = tf.tensor([[environmentContext.reward || 0]], [1, 1]);
                 const contextSignal = tf.tensor([[environmentContext.eventType ? 1 : 0]], [1, 1]); // Simple binary context signal

                 // Ensure prevEmotions has the correct shape [1, EMOTION_DIM] before concat
                 const prevEmotionsInput = this.prevEmotions.reshape([1, Config.Agent.EMOTION_DIM]);

                 const input = tf.concat([stateTensor, prevEmotionsInput, rewardTensor, contextSignal], 1); // Ensure axis is correct (1 for columns)

                 // Check input shape
                 const expectedInputDim = Config.DIMENSIONS + Config.Agent.EMOTION_DIM + 1 + 1;
                 if (input.shape[1] !== expectedInputDim) {
                     throw new Error(`Emotional module input dim mismatch: expected ${expectedInputDim}, got ${input.shape[1]}`);
                 }

                 // Predict and blend
                 const predictedEmotions = this.emotionalModule.predict(input);
                 const decayScalar = tf.scalar(EMOTIONAL_DECAY_RATE);
                 const blendedEmotions = prevEmotionsInput.mul(decayScalar) // Use reshaped prevEmotions
                     .add(predictedEmotions.mul(tf.scalar(1.0).sub(decayScalar)))
                     .clipByValue(0, 1); // Ensure emotions stay within [0, 1]

                 return blendedEmotions; // Return the result of tidy
             });

             // --- CRITICAL: Keep the result immediately after tidy ---
             const keptNewEmotions = tf.keep(newEmotionsResult);

             // --- Safely update the internal state for the *next* step ---
             // Dispose the old internal state tensor
             if (this.prevEmotions && !this.prevEmotions.isDisposed) {
                 tf.dispose(this.prevEmotions);
             }
             // Keep a *separate clone* for the internal state
             this.prevEmotions = tf.keep(keptNewEmotions.clone());

             // --- Return the kept tensor for the *current* step's result ---
             return keptNewEmotions;

         } catch (e) {
              // Handle errors during the prediction/tidy process
              console.error("Error during emotion prediction/tidy block:", e);
              displayError(`TF Error during emotion prediction: ${e.message}`, false, 'error-message');

              // Recover safely: Dispose potentially problematic prevEmotions and reset to zeros
              if (this.prevEmotions && !this.prevEmotions.isDisposed) {
                   try { tf.dispose(this.prevEmotions); } catch (disposeErr) { /* Ignore nested dispose error */ }
              }
              this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));

              // Return a *kept clone* of the zero tensor for the current step result
              return tf.keep(this.prevEmotions.clone());
         }
    } // End _updateEmotions

    // --- State Management & Cleanup ---
    getState() {
         if(typeof tf === 'undefined') return { version: "2.3.1", error: "TensorFlow not available" };

         try {
             const memoryArrays = this.memoryBuffer.map(entry => ({
                 timestamp: entry.timestamp,
                 beliefEmbedding: entry.beliefEmbedding && !entry.beliefEmbedding.isDisposed ? entry.beliefEmbedding.arraySync() : null
             }));
             const prevEmotionsArray = this.prevEmotions && !this.prevEmotions.isDisposed ? this.prevEmotions.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]);
             let selfStateArray = zeros([BELIEF_EMBEDDING_DIM]);
             if (this.selfState && !this.selfState.isDisposed) selfStateArray = Array.from(this.selfState.dataSync());
             const integrationVal = this.integrationParam && !this.integrationParam.isDisposed ? this.integrationParam.dataSync()[0] : 0.5;
             const reflexivityVal = this.reflexivityParam && !this.reflexivityParam.isDisposed ? this.reflexivityParam.dataSync()[0] : 0.5;

             const getWeightsSafe = (model) => {
                 if (!model || !model.getWeights) return null; // Return null if model invalid
                 try { return model.getWeights().map(w => w.arraySync()); }
                 catch (e) { console.error(`Error getting weights for ${model?.name || 'unknown model'}:`, e); return null; } // Return null on error
             };

             return {
                 version: "2.3.1",
                 prevEmotions: prevEmotionsArray,
                 memoryBuffer: memoryArrays, // Stores {timestamp, beliefEmbedding (array)}
                 lastRIH: this.lastRIH,
                 lastCascadeVariance: this.lastCascadeVariance,
                 latestTrustScore: this.latestTrustScore,
                 integrationParam: integrationVal,
                 reflexivityParam: reflexivityVal,
                 selfState: selfStateArray,
                 beliefNetworkWeights: getWeightsSafe(this.beliefNetwork),
                 cascadeInputLayerWeights: getWeightsSafe(this.cascadeInputLayer),
                 valueHeadWeights: getWeightsSafe(this.valueHead),
                 feedbackHeadWeights: getWeightsSafe(this.feedbackHead),
                 // Optional: Save weights for emotional/head models if they become trainable
                 // emotionalModuleWeights: getWeightsSafe(this.emotionalModule),
                 // headMovementHeadWeights: getWeightsSafe(this.headMovementHead),
             };
         } catch(e) {
             console.error("Error getting agent state:", e);
             return { version: "2.3.1", error: `Failed to get state: ${e.message}` };
         }
    }

    loadState(state) {
        if (!state || typeof state !== 'object' || typeof tf === 'undefined') {
             console.error("Invalid state object or TensorFlow not available for loading.");
             return;
        }
        console.log("Loading agent state V2.3...");
        if (state.version !== "2.3.1") { console.warn(`Loading state from different version (${state.version}). Compatibility not guaranteed.`); }
        if (state.error) { console.error(`Saved state contains error: ${state.error}. Aborting load.`); return; }

        // --- Full Cleanup and Reinitialization ---
        // Ensure clean slate before loading weights and parameters
        this.cleanup(); // Dispose existing TF resources and nullify members
        console.log("Agent resources cleaned before loading state.");

        try {
            // Re-initialize core JS modules
            this.enyphansyntrix = new Enyphansyntrix('continuous');
            this.affinitaetssyndrom = new Affinitaetssyndrom();
            this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2);
            this.reflexiveIntegration = new ReflexiveIntegration();

            // Re-initialize TF components with default structures
            // Weights and specific values will be loaded below
            this._reinitializeTfComponents(); // Creates new TF variables and models
            console.log("TF components re-initialized, ready for loading data.");

            // --- Load Data into Re-initialized Components ---
            const prevEmotionsArray = Array.isArray(state.prevEmotions) && state.prevEmotions.length === Config.Agent.EMOTION_DIM
                 ? state.prevEmotions
                 : zeros([Config.Agent.EMOTION_DIM]);
            this.prevEmotions.assign(tf.tensor([prevEmotionsArray], [1, Config.Agent.EMOTION_DIM]));

            // Load memory buffer
            if (Array.isArray(state.memoryBuffer)) {
                 state.memoryBuffer.forEach(memEntry => {
                     if (memEntry && memEntry.beliefEmbedding && Array.isArray(memEntry.beliefEmbedding) && memEntry.beliefEmbedding.length === BELIEF_EMBEDDING_DIM) {
                         try {
                             this.memoryBuffer.push({
                                 timestamp: memEntry.timestamp || Date.now(), // Use saved timestamp or now
                                 beliefEmbedding: tf.keep(tf.tensor(memEntry.beliefEmbedding, [BELIEF_EMBEDDING_DIM]))
                             });
                         } catch(e) { console.warn("Error creating tensor from loaded memory buffer array.", e); }
                     } else { console.warn("Skipping invalid memory item during load:", memEntry); }
                 });
                 // Ensure memory buffer doesn't exceed size limit after loading
                 while (this.memoryBuffer.length > this.memorySize) {
                      const removedEntry = this.memoryBuffer.shift();
                      if (removedEntry?.beliefEmbedding && !removedEntry.beliefEmbedding.isDisposed) {
                          tf.dispose(removedEntry.beliefEmbedding);
                      }
                 }
                 console.log(`Loaded ${this.memoryBuffer.length} items into memory buffer.`);
             } else { console.warn("Memory buffer missing or invalid in saved state."); }


            // Load scalar values
            this.lastRIH = typeof state.lastRIH === 'number' ? state.lastRIH : 0.0;
            this.lastCascadeVariance = typeof state.lastCascadeVariance === 'number' ? state.lastCascadeVariance : 0.0;
            this.latestTrustScore = typeof state.latestTrustScore === 'number' ? state.latestTrustScore : 1.0;

            // Load parameters
            const integrationVal = typeof state.integrationParam === 'number' ? state.integrationParam : 0.5;
            const reflexivityVal = typeof state.reflexivityParam === 'number' ? state.reflexivityParam : 0.5;
            this.integrationParam.assign(tf.scalar(integrationVal));
            this.reflexivityParam.assign(tf.scalar(reflexivityVal));

            // Load self-state
            const selfStateArray = Array.isArray(state.selfState) ? state.selfState : zeros([BELIEF_EMBEDDING_DIM]);
            if (selfStateArray.length === BELIEF_EMBEDDING_DIM) {
                this.selfState.assign(tf.tensor(selfStateArray, [BELIEF_EMBEDDING_DIM]));
            } else { console.warn(`Self-state dim mismatch on load (${selfStateArray.length} vs ${BELIEF_EMBEDDING_DIM}). Keeping re-initialized state.`); }

            // Load network weights safely
            console.log("Loading network weights...");
            const loadWeightsSafe = (model, weightsData, modelName) => {
                 if (!model) { console.warn(`Attempted to load weights for non-existent model: ${modelName}.`); return; }
                 if (!weightsData || !Array.isArray(weightsData)) { console.warn(`No valid weights data found for ${modelName} in saved state. Using initialized weights.`); return; }
                 try {
                     // Basic check: does number of weight tensors match?
                     if (weightsData.length === model.weights.length) {
                         model.setWeights(weightsData.map(w => tf.tensor(w))); // Assume w is array data
                         console.log(`Weights loaded successfully for ${modelName}.`);
                     } else {
                         console.warn(`Weight array count mismatch loading ${modelName}. Expected ${model.weights.length}, got ${weightsData.length}. Skipping.`);
                     }
                 } catch (loadErr) {
                     console.error(`Error setting weights for ${modelName}:`, loadErr);
                     displayError(`Error loading weights for ${modelName}: ${loadErr.message}`, false);
                 }
             };

            loadWeightsSafe(this.beliefNetwork, state.beliefNetworkWeights, 'beliefNetwork');
            loadWeightsSafe(this.cascadeInputLayer, state.cascadeInputLayerWeights, 'cascadeInputLayer');
            loadWeightsSafe(this.valueHead, state.valueHeadWeights, 'valueHead');
            loadWeightsSafe(this.feedbackHead, state.feedbackHeadWeights, 'feedbackHead');
            // Load emotional/head weights if they were saved
            // loadWeightsSafe(this.emotionalModule, state.emotionalModuleWeights, 'emotionalModule');
            // loadWeightsSafe(this.headMovementHead, state.headMovementHeadWeights, 'headMovementHead');


            // Reset transient state tracking
            this.latestAffinities = [];
            if (this.latestBeliefEmbedding && !this.latestBeliefEmbedding.isDisposed) tf.dispose(this.latestBeliefEmbedding);
            this.latestBeliefEmbedding = null;

            console.log("Agent state loaded successfully (V2.3).");

        } catch(loadError) {
            console.error("CRITICAL ERROR during agent state loading process:", loadError);
            displayError(`Agent Load Error: ${loadError.message}. Resetting agent state.`, true);
            this.cleanup(); // Ensure cleanup again on error
            console.warn("Agent reset due to loading error.");
            // Reset internal state variables
            this._set_tf_members_null();
            this.memoryBuffer = []; this.lastRIH = 0.0; this.lastCascadeVariance = 0.0; this.latestTrustScore = 1.0;
            this.latestAffinities = [];
            // Attempt to re-initialize core and TF components to a default state
            try {
                 this.enyphansyntrix = new Enyphansyntrix('continuous'); this.affinitaetssyndrom = new Affinitaetssyndrom();
                 this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2); this.reflexiveIntegration = new ReflexiveIntegration();
                 this._reinitializeTfComponents();
                 console.log("Agent re-initialized to default state after load error.");
            } catch(reinitError) { console.error("Failed to re-initialize agent after load error:", reinitError); }
        }
    }


    /** Re-initializes TF components to a default state. Assumes cleanup has been called. */
    _reinitializeTfComponents() {
         if (typeof tf === 'undefined') {
             console.error("Cannot re-initialize TF components: TensorFlow not available.");
             return;
         }
         console.log("Attempting to re-initialize TF components...");
         // Ensure members are null before creating new ones
         this._set_tf_members_null();

         try {
             // Recreate variables and models
             this.integrationParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentIntegrationParam'));
             this.reflexivityParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentReflexivityParam'));

             this.beliefNetwork = tf.sequential({ name: 'beliefNetwork'});
             this.beliefNetwork.add(tf.layers.dense({ units: Config.Agent.HIDDEN_DIM * 2, inputShape: [BELIEF_NETWORK_INPUT_DIM], activation: 'relu' }));
             this.beliefNetwork.add(tf.layers.dropout({ rate: 0.1 }));
             this.beliefNetwork.add(tf.layers.dense({ units: BELIEF_EMBEDDING_DIM, activation: 'tanh' }));

             this.cascadeInputLayer = tf.layers.dense({ units: CASCADE_INPUT_DIM, inputShape: [BELIEF_EMBEDDING_DIM], activation: 'tanh', name:'cascadeInputLayer' });
             this.valueHead = tf.layers.dense({ units: 1, inputShape: [BELIEF_EMBEDDING_DIM], name: 'valueHead'});
             this.feedbackHead = tf.layers.dense({ units: Config.DIMENSIONS, inputShape: [BELIEF_EMBEDDING_DIM], name: 'feedbackHead'});
             this.selfState = tf.keep(tf.variable(tf.randomNormal([BELIEF_EMBEDDING_DIM], 0, 0.1), true, 'agentSelfState')); // Reset self-state
             this.emotionalModule = this._buildEmotionalModel();
             this.headMovementHead = this._buildHeadMovementModel();
             this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Reset prev emotions
             const learningRate = Config?.RL?.LR ?? 0.001;
             this.optimizer = tf.train.adam(learningRate);

             // Validate after creation
             this._validateComponents();

             console.log("TF components re-initialized successfully.");
         } catch (e) {
             console.error("Error during TF component re-initialization:", e);
             displayError("Failed to recover agent state after load error. Simulation may be broken.", true);
             this._cleanupTfMembers(); // Cleanup partially created components
             this._set_tf_members_null(); // Ensure null state
         }
     }

    /** Cleans up ALL agent resources, TF and core modules */
     cleanup() {
         // console.log("Cleaning up ALL Agent resources (V2.3)..."); // Reduce noise
         // Cleanup TF members first
         this._cleanupTfMembers();
         // Nullify TF members
         this._set_tf_members_null();
         // Nullify core JS modules
         this.enyphansyntrix = null;
         this.affinitaetssyndrom = null;
         this.strukturkondensation = null;
         this.reflexiveIntegration = null;
         // console.log("Agent full cleanup complete."); // Reduce noise
     }

} // End of SyntrometricAgent class
