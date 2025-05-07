// js/agent.js

import { Config, emotionNames, HEAD_MOVEMENT_LABELS, NUM_HEAD_MOVEMENTS } from './config.js';
import { Enyphansyntrix, Affinitaetssyndrom, Strukturkondensation, ReflexiveIntegration } from './syntrometry-core.js'; // Synkolator is internal to Strukturkondensation
import { zeros, tensor, clamp, displayError, inspectTensor, norm } from './utils.js';

// Assumes tf is available globally

// --- Constants ---
const NUM_GRAPH_FEATURES = 2; // From Syntrometry visualization (varianceZ, avgDistToRih)
const BELIEF_EMBEDDING_DIM = Config.Agent?.HIDDEN_DIM ?? 64;
// Input: Core State (DIMENSIONS) + Graph Features (NUM_GRAPH_FEATURES) + Self State (BELIEF_EMBEDDING_DIM)
const BELIEF_NETWORK_INPUT_DIM = (Config?.DIMENSIONS ?? 12) + NUM_GRAPH_FEATURES + BELIEF_EMBEDDING_DIM;
// Input to Cascade: Projected from Belief Embedding
const CASCADE_INPUT_DIM = Config?.DIMENSIONS ?? 12; // Cascade operates on core dimension space
const EMOTIONAL_DECAY_RATE = 0.97; // How much previous emotion persists
const SELF_STATE_DECAY = 0.98; // How much previous self-state persists
const SELF_STATE_LEARN_RATE = 0.05; // Base learning rate for self-state update from belief

/**
 * Represents the Syntrometric Agent V2.3.
 * Integrates core Syntrometry concepts with TF.js models for belief formation,
 * emotional response, self-state modeling, and parameter self-tuning.
 */
export class SyntrometricAgent {
    constructor() {
        // --- Initialize Core Syntrometry Modules (Non-TF) ---
        this.enyphansyntrix = new Enyphansyntrix('continuous');
        this.affinitaetssyndrom = new Affinitaetssyndrom();
        this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2);
        this.reflexiveIntegration = new ReflexiveIntegration();

        // --- V2 Features & State Tracking ---
        this.memorySize = Config.Agent?.HISTORY_SIZE ?? 15;
        this.memoryBuffer = []; // Holds last N { timestamp: number, beliefEmbedding: tf.Tensor }
        this.lastRIH = 0.0;
        this.lastCascadeVariance = 0.0;
        this.latestTrustScore = 1.0;
        this.latestAffinities = []; // Cache affinities from last step
        this.latestCascadeHistoryArrays = []; // Cache history arrays for viz
        this.latestBeliefEmbedding = null; // Cache tensor clone for inspector

        // --- Initialize TF Members ---
        this._set_tf_members_null(); // Nullify TF members initially

        if (typeof tf === 'undefined') {
            console.error("CRITICAL: TensorFlow.js not loaded. Agent cannot initialize TF components.");
            displayError("TensorFlow.js not loaded. Agent initialization failed.", true, 'error-message');
            // Ensure core JS modules are also nulled if TF is fundamentally unavailable
            this.enyphansyntrix = null; this.affinitaetssyndrom = null;
            this.strukturkondensation = null; this.reflexiveIntegration = null;
            return; // Stop constructor
        }

        try {
            this._initializeTfComponents(); // Encapsulated TF setup
            this._validateComponents(); // Check if everything was created
            console.log("SyntrometricAgent V2.3 TF components initialized successfully.");
        } catch (tfError) {
            console.error("Error during TF setup in Agent constructor:", tfError);
            displayError(`Agent TF Setup Error: ${tfError.message}. Agent may be unstable.`, true, 'error-message');
            this._cleanupTfMembers(); // Attempt cleanup
            this._set_tf_members_null(); // Ensure null state
            // Core JS modules remain, but TF functionality is lost.
        }
    }

    /** Encapsulates the creation of all TF-related components. */
    _initializeTfComponents() {
        // --- Self-Learning Parameters ---
        this.integrationParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentIntegrationParam'));
        this.reflexivityParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentReflexivityParam'));

        // --- Belief Network ---
        this.beliefNetwork = tf.sequential({ name: 'beliefNetwork'});
        this.beliefNetwork.add(tf.layers.dense({ units: Config.Agent.HIDDEN_DIM * 2, inputShape: [BELIEF_NETWORK_INPUT_DIM], activation: 'relu' }));
        this.beliefNetwork.add(tf.layers.dropout({ rate: 0.1 }));
        this.beliefNetwork.add(tf.layers.dense({ units: BELIEF_EMBEDDING_DIM, activation: 'tanh' }));

        // --- Cascade Input Projection Layer ---
        this.cascadeInputLayer = tf.layers.dense({ units: CASCADE_INPUT_DIM, inputShape: [BELIEF_EMBEDDING_DIM], activation: 'tanh', name:'cascadeInputLayer' });

        // --- Value and Feedback Heads (Structure present, not actively trained) ---
        this.valueHead = tf.layers.dense({ units: 1, inputShape: [BELIEF_EMBEDDING_DIM], name: 'valueHead'});
        this.feedbackHead = tf.layers.dense({ units: Config.DIMENSIONS, inputShape: [BELIEF_EMBEDDING_DIM], name: 'feedbackHead'});

        // --- Self-State Model ---
        this.selfState = tf.keep(tf.variable(tf.randomNormal([BELIEF_EMBEDDING_DIM], 0, 0.1), true, 'agentSelfState'));

        // --- Emotion and Head Movement Models ---
        this.emotionalModule = this._buildEmotionalModel();
        this.headMovementHead = this._buildHeadMovementModel();

        // --- Previous Emotion State ---
        this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));

        // --- Optimizer ---
        const learningRate = Config?.RL?.LR ?? 0.001;
        this.optimizer = tf.train.adam(learningRate);
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
    }

    /** Helper to dispose *only* TF-related members */
    _cleanupTfMembers() {
        if (typeof tf === 'undefined') return;
        // console.log("Cleaning up Agent TF members...");
        const safeDispose = (item) => {
             if (!item) return;
             if (item === this.memoryBuffer) { // Special handling for memory buffer
                 item.forEach(memItem => safeDispose(memItem?.beliefEmbedding));
                 this.memoryBuffer = []; // Clear array
                 return;
             }
             if (item instanceof tf.LayersModel) {
                 item.weights.forEach(w => safeDispose(w?.val)); // Dispose weights' tensors
                 // Models themselves don't need disposal in the same way as tensors.
             } else if (item instanceof tf.Tensor && !item.isDisposed) {
                  try { item.dispose(); } catch (e) { console.error("Dispose error (tensor/var):", e); }
             }
        };

         safeDispose(this.beliefNetwork); // Disposes weights
         safeDispose(this.cascadeInputLayer); // Disposes weights
         safeDispose(this.valueHead); // Disposes weights
         safeDispose(this.feedbackHead); // Disposes weights
         safeDispose(this.emotionalModule); // Disposes weights
         safeDispose(this.headMovementHead); // Disposes weights
         safeDispose(this.prevEmotions); // Disposes tensor
         safeDispose(this.selfState); // Disposes variable tensor
         safeDispose(this.integrationParam); // Disposes variable tensor
         safeDispose(this.reflexivityParam); // Disposes variable tensor
         safeDispose(this.latestBeliefEmbedding); // Disposes cached tensor clone
         safeDispose(this.memoryBuffer); // Disposes tensors within the buffer

         this.optimizer = null; // Optimizer doesn't have a dispose method
         // console.log("Agent TF members disposed.");
    }

    // --- TF Model Builders ---
    _buildEmotionalModel() {
        if (typeof tf === 'undefined') return null;
        try {
            const model = tf.sequential({ name: 'emotionalModule' });
            const inputDim = (Config.DIMENSIONS || 12) + (Config.Agent.EMOTION_DIM || 6) + 1 + 1; // State + PrevEmotion + Reward + EventContext
            model.add(tf.layers.dense({ units: 32, inputShape: [inputDim], activation: 'relu' }));
            model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
            model.add(tf.layers.dense({ units: Config.Agent.EMOTION_DIM || 6, activation: 'sigmoid' }));
            return model;
        } catch (e) { console.error("Failed building emotional model:", e); return null; }
     }

    _buildHeadMovementModel() {
        if (typeof tf === 'undefined') return null;
        try {
            const model = tf.sequential({ name: 'headMovementHead' });
            const inputDim = 1 + 1 + 1 + (Config.Agent.EMOTION_DIM || 6); // RIH + Affinity + DominantEmotionIdx + EmotionsVector
            model.add(tf.layers.dense({ units: 16, inputShape: [inputDim], activation: 'relu' }));
            model.add(tf.layers.dense({ units: NUM_HEAD_MOVEMENTS })); // Output logits
            return model;
        } catch (e) { console.error("Failed building head movement model:", e); return null; }
    }

    // --- Core Methods ---

    /** Adds the latest belief embedding tensor to the memory buffer, maintaining size. */
    _updateMemory(beliefTensor) {
        if (typeof tf === 'undefined' || !beliefTensor || beliefTensor.isDisposed) return;
        if (beliefTensor.rank !== 1 || beliefTensor.shape[0] !== BELIEF_EMBEDDING_DIM) {
             // console.warn(`[Agent Memory] Invalid belief tensor shape: ${beliefTensor.shape}. Skipping update.`); // Noisy
             return;
        }
        this.memoryBuffer.push({ timestamp: Date.now(), beliefEmbedding: tf.keep(beliefTensor.clone()) });
        while (this.memoryBuffer.length > this.memorySize) {
            const oldEntry = this.memoryBuffer.shift();
            if (oldEntry?.beliefEmbedding && !oldEntry.beliefEmbedding.isDisposed) {
                tf.dispose(oldEntry.beliefEmbedding);
            }
        }
    }

    /** Computes a trust score based on the similarity of the current belief to recent beliefs in memory. */
    _computeTrust(currentBeliefEmbedding) {
        if (typeof tf === 'undefined' || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed) return 0.5;
        if (currentBeliefEmbedding.rank !== 1 || currentBeliefEmbedding.shape[0] !== BELIEF_EMBEDDING_DIM) return 0.5;
        if (this.memoryBuffer.length === 0) return 1.0;

        let avgSimilarityValue = 0.5; // Default trust
        try {
            tf.tidy(() => { // Use tidy for intermediate tensors
                const flatCurrent = currentBeliefEmbedding;
                const currentNorm = flatCurrent.norm();
                if (currentNorm.arraySync() < 1e-9) return; // Keep default avgSimilarityValue

                const validSimilarities = this.memoryBuffer
                    .map(memEntry => {
                        const memTensor = memEntry?.beliefEmbedding;
                        if (!memTensor || memTensor.isDisposed || memTensor.rank !== 1 || memTensor.shape[0] !== BELIEF_EMBEDDING_DIM) return null;
                        const flatMem = memTensor;
                        const memNorm = flatMem.norm();
                        const normProd = currentNorm.mul(memNorm);
                        if (normProd.arraySync() < 1e-9) return tf.scalar(0);
                        return flatCurrent.dot(flatMem).div(normProd).clipByValue(-1, 1);
                    })
                    .filter(s => s !== null);

                if (validSimilarities.length === 0) return; // Keep default

                const avgSimilarity = tf.mean(tf.stack(validSimilarities));
                const trust = avgSimilarity.add(1).div(2); // Convert similarity [-1, 1] to trust [0, 1]
                avgSimilarityValue = trust.arraySync(); // Extract JS value
            });
        } catch (e) {
            console.error("Error computing trust:", e);
            avgSimilarityValue = 0.5; // Fallback on error
        }
        return clamp(avgSimilarityValue, 0, 1); // Ensure clamped result
    }


    /** Heuristically adjusts integration and reflexivity parameters based on performance metrics. */
    _learnParameters(trustScore, rihScore, cascadeVariance) {
        if (typeof tf === 'undefined' || !this.integrationParam || !this.reflexivityParam || this.integrationParam.isDisposed || this.reflexivityParam.isDisposed) {
            return;
        }

        // Get current values safely
        const { newIntegration, newReflexivity } = tf.tidy(() => {
            const learningRate = Config.RL?.PARAM_LEARN_RATE ?? 0.006;
            const decayFactor = Config.RL?.PARAM_DECAY ?? 0.03;
            let integrationDelta = 0.0;
            let reflexivityDelta = 0.0;

            const rihChange = rihScore - this.lastRIH;
            const varianceChange = cascadeVariance - this.lastCascadeVariance;

            // --- Heuristic Rules (as before) ---
            if ((rihScore > 0.7 && trustScore > 0.7) || (rihChange > 0.02 && trustScore > 0.6)) {
                integrationDelta += 1.0; reflexivityDelta -= 1.0;
            } else if (rihScore < 0.3 || trustScore < 0.4 || (rihChange < -0.03 && trustScore < 0.7)) {
                integrationDelta -= 1.0; reflexivityDelta += 1.2;
            }
            const highVarianceThreshold = 0.15; const increasingVarianceThreshold = 0.01;
            if (cascadeVariance > highVarianceThreshold || varianceChange > increasingVarianceThreshold) {
                integrationDelta += 0.6 * clamp(cascadeVariance - highVarianceThreshold, 0, 1);
                reflexivityDelta += 0.4 * clamp(varianceChange, 0, 0.1);
            } else if (cascadeVariance < 0.02 && varianceChange <= 0) {
                reflexivityDelta += 0.3;
            }
            // Mean reversion
            // FIX: Access variables directly inside tidy
            const currentIntegrationValue = this.integrationParam.dataSync()[0]; 
            const currentReflexivityValue = this.reflexivityParam.dataSync()[0];
            integrationDelta += (0.5 - currentIntegrationValue) * decayFactor;
            reflexivityDelta += (0.5 - currentReflexivityValue) * decayFactor;

            // Calculate new values
            const updatedIntegration = this.integrationParam.add(tf.scalar(integrationDelta * learningRate)).clipByValue(0.05, 0.95);
            const updatedReflexivity = this.reflexivityParam.add(tf.scalar(reflexivityDelta * learningRate)).clipByValue(0.05, 0.95);

            return { newIntegration: updatedIntegration, newReflexivity: updatedReflexivity };
        });

        // Assign new values outside tidy block
        this.integrationParam.assign(newIntegration);
        this.reflexivityParam.assign(newReflexivity);

        // Dispose intermediate tensors created by tidy
        tf.dispose(newIntegration);
        tf.dispose(newReflexivity);

        // Update last values for next step's calculation
        this.lastCascadeVariance = cascadeVariance;
    }


    /** Updates the agent's self-state based on the current belief, trust, and integration parameter. */
    _updateSelfState(currentBeliefEmbedding, trustScore, integrationParamValue) {
        if (typeof tf === 'undefined' || !this.selfState || this.selfState.isDisposed || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed) {
             // console.warn("[Agent SelfState] Update skipped due to invalid tensor/parameter."); // Noisy
             return;
         }

         // Perform update using assign outside tidy, but calculate newState inside
         const newState = tf.tidy(() => {
             const effectiveLearnRate = SELF_STATE_LEARN_RATE * (0.5 + integrationParamValue);
             const trustFactor = tf.scalar(trustScore * effectiveLearnRate);
             // FIX: Access selfState directly inside tidy
             const prevStateTensor = this.selfState;
             return prevStateTensor.mul(SELF_STATE_DECAY).add(currentBeliefEmbedding.mul(trustFactor));
         });
         this.selfState.assign(newState); // Assign the result
         tf.dispose(newState); // Dispose the intermediate tensor returned by tidy
    }

    /** Exposes the latest belief embedding safely (returns a clone or null). Caller must dispose. */
    getLatestBeliefEmbedding() {
        if (this.latestBeliefEmbedding && !this.latestBeliefEmbedding.isDisposed) {
            return tf.keep(this.latestBeliefEmbedding.clone()); // Return a kept clone
        }
        return null;
    }


    /**
     * Processes the current environment state and context, returning the agent's response.
     */
    async process(rawState, graphFeatures, environmentContext = { eventType: null, reward: 0 }) {
        // --- Pre-Check ---
        const isTfReady = typeof tf !== 'undefined';
        const componentsValid = !(!this.beliefNetwork || !this.cascadeInputLayer ||
                                !this.integrationParam || this.integrationParam.isDisposed || !this.reflexivityParam || this.reflexivityParam.isDisposed ||
                                !this.selfState || this.selfState.isDisposed || !this.prevEmotions || this.prevEmotions.isDisposed ||
                                !this.enyphansyntrix || !this.strukturkondensation || !this.reflexiveIntegration || !this.affinitaetssyndrom ||
                                !this.emotionalModule || !this.headMovementHead);

        if (!isTfReady || !componentsValid) {
             console.error("Agent Pre-Process Check Failed! Aborting step.", { isTfReady, componentsValid });
             displayError("Agent critical component invalid before processing step. Simulation may halt.", true, 'error-message');
             const defaultEmotions = isTfReady ? tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])) : null;
             return {
                 cascadeHistory: [], rihScore: 0, affinities: [], emotions: defaultEmotions, hmLabel: 'idle',
                 responseText: "Error: Agent component invalid.", integration: 0.5, reflexivity: 0.5,
                 trustScore: 0.0, beliefNorm: 0, feedbackNorm: 0, selfStateNorm: 0
             };
        }
        // --- End Pre-Check ---

        let currentIntegration = 0.5, currentReflexivity = 0.5;
        try {
            if (!this.integrationParam.isDisposed) currentIntegration = this.integrationParam.dataSync()[0];
            if (!this.reflexivityParam.isDisposed) currentReflexivity = this.reflexivityParam.dataSync()[0];
        } catch (e) { console.error("Error reading agent parameters:", e); }

        let results = {};
        let beliefNormValue = 0.0, feedbackNormValue = 0.0, currentSelfStateNorm = 0.0;
        let keptBeliefForUpdates = null; // Tensor kept specifically for memory/self-state updates

        try {
            // --- Core Cognitive Loop ---
             const processOutputs = tf.tidy(() => { // Use tidy for the main processing block
                // 1. Prepare Input State
                const baseStateDim = Config.Agent?.BASE_STATE_DIM ?? 18;
                const coreDim = Config.DIMENSIONS ?? 12;
                let stateArray = Array.isArray(rawState) ? rawState.slice(0, baseStateDim) : zeros([baseStateDim]);
                while(stateArray.length < baseStateDim) stateArray.push(0);

                const coreStateTensor = tf.tensor(stateArray.slice(0, coreDim)); // Shape [coreDim]
                const graphFeaturesTensor = tf.tensor(graphFeatures); // Shape [NUM_GRAPH_FEATURES]
                const currentSelfState = this.selfState; // Shape [BELIEF_EMBEDDING_DIM]

                // 2. Input Modulation & Perturbation (Enyphansyntrix)
                const rihModulation = this.lastRIH * (currentReflexivity * 2 - 1);
                let modulatedInput = coreStateTensor.add(tf.scalar(rihModulation * 0.1)).clipByValue(-1, 1);
                const perturbationScale = clamp(0.005 + (1.0 - this.lastRIH) * 0.02 + currentReflexivity * 0.02, 0.001, 0.05);
                const perturbedInput = this.enyphansyntrix.apply(modulatedInput, perturbationScale); // Shape [coreDim]

                // 3. Belief Formation
                const beliefNetInput = tf.concat([
                    perturbedInput.reshape([1, coreDim]),
                    graphFeaturesTensor.reshape([1, NUM_GRAPH_FEATURES]),
                    currentSelfState.reshape([1, BELIEF_EMBEDDING_DIM])
                ], 1);
                if (beliefNetInput.shape[1] !== BELIEF_NETWORK_INPUT_DIM) {
                     throw new Error(`Belief network input dim mismatch: expected ${BELIEF_NETWORK_INPUT_DIM}, got ${beliefNetInput.shape[1]}`);
                }
                const beliefEmbedding = this.beliefNetwork.apply(beliefNetInput).reshape([BELIEF_EMBEDDING_DIM]); // Shape [BELIEF_EMBEDDING_DIM]

                // --- Keep a clone of the belief embedding *outside* the tidy scope ---
                // This is crucial for updating memory and self-state later.
                keptBeliefForUpdates = tf.keep(beliefEmbedding.clone());

                // 4. Cascade Processing (Strukturkondensation)
                const cascadeInput = this.cascadeInputLayer.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([CASCADE_INPUT_DIM]);
                const cascadeHistoryTensors = this.strukturkondensation.process(cascadeInput); // Returns array of kept tensors
                const cascadeHistoryArrays = cascadeHistoryTensors.map(t => t.arraySync()); // JS arrays for output
                const lastCascadeLevelTensor = cascadeHistoryTensors.length > 0 ? cascadeHistoryTensors[cascadeHistoryTensors.length - 1] : tf.tensor([]);

                // 5. Compute RIH & Affinities
                const currentRihScore = this.reflexiveIntegration.compute(lastCascadeLevelTensor);
                const currentAffinities = [];
                if (cascadeHistoryTensors.length > 1) {
                    for (let i = 0; i < cascadeHistoryTensors.length - 1; i++) {
                        if (cascadeHistoryTensors[i]?.shape[0] > 0 && cascadeHistoryTensors[i+1]?.shape[0] > 0 && !cascadeHistoryTensors[i].isDisposed && !cascadeHistoryTensors[i+1].isDisposed) {
                            currentAffinities.push(this.affinitaetssyndrom.compute(cascadeHistoryTensors[i], cascadeHistoryTensors[i+1]));
                        } else { currentAffinities.push(0); }
                    }
                }
                const currentAvgAffinity = currentAffinities.length > 0 ? currentAffinities.reduce((a, b) => a + b, 0) / currentAffinities.length : 0;

                // 6. Compute Trust Score (Needs beliefEmbedding, calculation done outside tidy using kept tensor)

                // 7. Extract Cascade Features
                let varFinal = 0.0, meanFinal = 0.0;
                if (lastCascadeLevelTensor.size > 1) {
                    const moments = tf.moments(lastCascadeLevelTensor);
                    varFinal = moments.variance.arraySync(); meanFinal = moments.mean.arraySync();
                } else if (lastCascadeLevelTensor.size === 1) { meanFinal = lastCascadeLevelTensor.arraySync()[0]; }
                const cascadeFeatures = [clamp(varFinal, 0, 10), clamp(meanFinal, -10, 10)];

                // 8. Value/Feedback Prediction (optional, keep structure)
                const valuePred = this.valueHead.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([]);
                const feedbackSignal = this.feedbackHead.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([Config.DIMENSIONS]);

                // Dispose intermediate cascade tensors (they were kept by process)
                cascadeHistoryTensors.forEach(t => tf.dispose(t));

                // Return JS values needed outside tidy
                return {
                    cascadeHistoryArrays,
                    currentRihScore: currentRihScore ?? 0,
                    currentAffinities,
                    currentAvgAffinity: currentAvgAffinity ?? 0,
                    cascadeFeatures,
                    // Tensors like valuePred, feedbackSignal are disposed by tidy unless kept explicitly
                    // We keep the belief embedding outside using keptBeliefForUpdates
                    beliefNorm: beliefEmbedding.norm().arraySync(), // Calculate norm inside tidy for efficiency
                    feedbackNorm: feedbackSignal.norm().arraySync(),
                    selfStateNorm: currentSelfState.norm().arraySync()
                };
            }); // End tf.tidy for core processing

            // --- Post-Tidy Updates ---
            // Assign results from tidy block
            results = processOutputs;
            beliefNormValue = results.beliefNorm ?? 0.0;
            feedbackNormValue = results.feedbackNorm ?? 0.0;
            currentSelfStateNorm = results.selfStateNorm ?? 0.0;

            // Compute trust score using the kept belief embedding
            results.currentTrustScore = this._computeTrust(keptBeliefForUpdates);

            // Store results for state tracking and visualization
            this.latestRihScore = results.currentRihScore;
            this.latestAffinities = results.currentAffinities;
            this.latestTrustScore = results.currentTrustScore;
            this.latestCascadeHistoryArrays = results.cascadeHistoryArrays;

            // Update memory and self-state using the kept belief embedding
            if (keptBeliefForUpdates && !keptBeliefForUpdates.isDisposed) {
                this._updateMemory(keptBeliefForUpdates);
                this._updateSelfState(keptBeliefForUpdates, results.currentTrustScore, currentIntegration);

                // Cache the latest belief embedding (dispose previous if exists)
                if (this.latestBeliefEmbedding && !this.latestBeliefEmbedding.isDisposed) tf.dispose(this.latestBeliefEmbedding);
                this.latestBeliefEmbedding = tf.keep(keptBeliefForUpdates.clone()); // Keep another clone for inspector
            } else {
                console.warn("Kept belief tensor invalid after tidy block.");
            }

            // Learn/Adjust integration/reflexivity parameters
            this._learnParameters(results.currentTrustScore, results.currentRihScore, results.cascadeFeatures[0]);

            // Update history for next step's calculations
            this.lastRIH = results.currentRihScore;

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
             beliefNormValue = 0; feedbackNormValue = 0;
             try { currentSelfStateNorm = norm(this.selfState?.dataSync() ?? []); } catch { currentSelfStateNorm = 0;}

        } finally {
            // --- Dispose the tensor kept for updates ---
             if (keptBeliefForUpdates && !keptBeliefForUpdates.isDisposed) {
                  tf.dispose(keptBeliefForUpdates);
             }
        }

        // --- Emotion Update ---
        let currentEmotionsTensor; // This will hold the KEPT tensor returned by _updateEmotions
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
                 if (this.prevEmotions && !this.prevEmotions.isDisposed) tf.dispose(this.prevEmotions); // Dispose if needed
                 this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            }
            currentEmotionsTensor = tf.keep(this.prevEmotions.clone()); // Return a clone of the fallback
        }


        // --- Head Movement Prediction ---
        let hmLabel = "idle";
        let dominantEmotionName = 'Unknown';
        try {
            // Pass the current kept emotion tensor to prediction function
            if (this.headMovementHead && currentEmotionsTensor && !currentEmotionsTensor.isDisposed) {
                const { label, dominantName } = await this._predictHeadMovement(currentEmotionsTensor, results.currentRihScore, results.currentAvgAffinity);
                hmLabel = label;
                dominantEmotionName = dominantName;
            } else { // Fallback logic
                if (results.currentRihScore > 0.7) hmLabel = "nod";
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
             hmLabel = "idle";
        }

        // --- Prepare Response ---
        const rihText = (results.currentRihScore ?? 0).toFixed(2);
        const affText = (results.currentAvgAffinity ?? 0).toFixed(2);
        const trustText = (results.currentTrustScore ?? 0).toFixed(2);
        const intText = (currentIntegration ?? 0.5).toFixed(2);
        const refText = (currentReflexivity ?? 0.5).toFixed(2);
        const cascadeVarText = (results.cascadeFeatures?.[0] ?? this.lastCascadeVariance).toFixed(2);
        const responseText = `R:${rihText} A:${affText} T:${trustText} CV:${cascadeVarText} I:${intText} Ψ:${refText} | Mood:${dominantEmotionName} | Act:${hmLabel}`;

        return {
            cascadeHistory: results.cascadeHistoryArrays || [],
            rihScore: results.currentRihScore ?? 0,
            affinities: results.currentAffinities || [],
            emotions: currentEmotionsTensor, // Return the kept tensor from _updateEmotions
            hmLabel: hmLabel,
            responseText: responseText,
            trustScore: results.currentTrustScore ?? 0.5,
            integration: currentIntegration ?? 0.5,
            reflexivity: currentReflexivity ?? 0.5,
            beliefNorm: beliefNormValue,
            // feedbackNorm: feedbackNormValue, // Optional
            selfStateNorm: currentSelfStateNorm
        };
    }

    /** Internal helper to update emotions */
    async _updateEmotions(rawState, environmentContext) {
        if (!this.emotionalModule) {
             console.warn("Emotional module invalid. Cannot predict emotions.");
             return tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }
        if (!this.prevEmotions || this.prevEmotions.isDisposed) {
            console.warn("prevEmotions invalid. Resetting.");
            if(this.prevEmotions && !this.prevEmotions.isDisposed) tf.dispose(this.prevEmotions);
            this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        const coreDim = Config.DIMENSIONS || 12;
        const emoDim = Config.Agent.EMOTION_DIM || 6;
        const coreStateForEmotion = (Array.isArray(rawState) ? rawState : zeros([coreDim + emoDim])).slice(0, coreDim);
        while(coreStateForEmotion.length < coreDim) coreStateForEmotion.push(0);

        let newEmotionsResult; // Will hold the kept result
        try {
            const intermediateResult = tf.tidy(() => {
                const stateTensor = tf.tensor([coreStateForEmotion], [1, coreDim]);
                const rewardTensor = tf.tensor([[environmentContext.reward || 0]], [1, 1]);
                const contextSignal = tf.tensor([[environmentContext.eventType ? 1 : 0]], [1, 1]);
                const prevEmotionsInput = this.prevEmotions.reshape([1, emoDim]);

                const input = tf.concat([stateTensor, prevEmotionsInput, rewardTensor, contextSignal], 1);

                const expectedInputDim = coreDim + emoDim + 1 + 1;
                if (input.shape[1] !== expectedInputDim) {
                    throw new Error(`Emotional module input dim mismatch: expected ${expectedInputDim}, got ${input.shape[1]}`);
                }

                const predictedEmotions = this.emotionalModule.predict(input);
                const decayScalar = tf.scalar(EMOTIONAL_DECAY_RATE);
                const blendedEmotions = prevEmotionsInput.mul(decayScalar)
                    .add(predictedEmotions.mul(tf.scalar(1.0).sub(decayScalar)))
                    .clipByValue(0, 1);

                return blendedEmotions; // Return the result of tidy
            });

            // --- Keep the result immediately after tidy ---
            newEmotionsResult = tf.keep(intermediateResult);

            // --- Safely update the internal state for the *next* step ---
            if (this.prevEmotions && !this.prevEmotions.isDisposed) { tf.dispose(this.prevEmotions); }
            this.prevEmotions = tf.keep(newEmotionsResult.clone()); // Keep a *separate clone* for internal state

        } catch (e) {
             console.error("Error during emotion prediction/tidy block:", e);
             displayError(`TF Error during emotion prediction: ${e.message}`, false, 'error-message');
             // Dispose potentially problematic prevEmotions and reset to zeros
             if (this.prevEmotions && !this.prevEmotions.isDisposed) tf.dispose(this.prevEmotions);
             this.prevEmotions = tf.keep(tf.zeros([1, emoDim]));
             // Return a *kept clone* of the zero tensor for the current step result
             newEmotionsResult = tf.keep(this.prevEmotions.clone());
        }
        // --- Return the kept tensor for the *current* step's result ---
        return newEmotionsResult;
   }

     /** Internal helper to predict head movement */
     async _predictHeadMovement(currentEmotionsTensor, rihScore, avgAffinity) {
         let hmLabel = "idle";
         let dominantEmotionName = "Unknown";
         const emoDim = Config.Agent.EMOTION_DIM || 6;

         if (!this.headMovementHead || !currentEmotionsTensor || currentEmotionsTensor.isDisposed) {
             return { label: hmLabel, dominantName: dominantEmotionName };
         }

         const emotionArray = currentEmotionsTensor.arraySync()[0];
         const dominantEmotionIndex = emotionArray.length > 0 ? emotionArray.indexOf(Math.max(...emotionArray)) : -1;
         dominantEmotionName = emotionNames[dominantEmotionIndex] || 'Unknown';

         if (dominantEmotionIndex !== -1) {
             let hmLogits = null;
             try {
                 hmLogits = tf.tidy(() => {
                     const rihTensor = tf.tensor([[rihScore]], [1, 1]);
                     const avgAffinityTensor = tf.tensor([[avgAffinity ?? 0]], [1, 1]);
                     const dominantEmotionTensor = tf.tensor([[dominantEmotionIndex]], [1, 1]);
                     const emotionTensorInput = currentEmotionsTensor.reshape([1, emoDim]);

                     const input = tf.concat([rihTensor, avgAffinityTensor, dominantEmotionTensor, emotionTensorInput], 1);

                     const expectedInputDim = 1 + 1 + 1 + emoDim;
                     if (input.shape[1] !== expectedInputDim) {
                         throw new Error(`Head movement model input dim mismatch: expected ${expectedInputDim}, got ${input.shape[1]}`);
                     }
                     return this.headMovementHead.predict(input);
                 });

                 const hmIdx = hmLogits.argMax(1).arraySync()[0];
                 hmLabel = HEAD_MOVEMENT_LABELS[hmIdx] || "idle";

             } catch (e) {
                  console.error("Error during head movement prediction tidy:", e);
                  hmLabel = "idle"; // Default on error
             } finally {
                 if (hmLogits && !hmLogits.isDisposed) tf.dispose(hmLogits); // Dispose tensor returned by predict
             }
         }
         return { label: hmLabel, dominantName: dominantEmotionName };
     }


    // --- State Management & Cleanup ---
    getState() {
         if(typeof tf === 'undefined') return { version: "2.3.1", error: "TensorFlow not available" };

         try {
             const memoryArrays = this.memoryBuffer.map(entry => ({
                 timestamp: entry.timestamp,
                 beliefEmbedding: entry.beliefEmbedding && !entry.beliefEmbedding.isDisposed ? entry.beliefEmbedding.arraySync() : null
             })).filter(e => e.beliefEmbedding !== null); // Filter out entries where tensor was invalid

             const prevEmotionsArray = this.prevEmotions && !this.prevEmotions.isDisposed ? this.prevEmotions.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]);
             let selfStateArray = zeros([BELIEF_EMBEDDING_DIM]);
             if (this.selfState && !this.selfState.isDisposed) selfStateArray = Array.from(this.selfState.dataSync());
             const integrationVal = this.integrationParam && !this.integrationParam.isDisposed ? this.integrationParam.dataSync()[0] : 0.5;
             const reflexivityVal = this.reflexivityParam && !this.reflexivityParam.isDisposed ? this.reflexivityParam.dataSync()[0] : 0.5;

             // Helper to safely get weights as serializable arrays
             const getWeightsSafe = (model) => {
                 if (!model || typeof model.getWeights !== 'function') return null;
                 try {
                     return model.getWeights().map(w => ({ shape: w.shape, data: w.arraySync() })); // Save shape and data
                 } catch (e) {
                     console.error(`Error getting weights for ${model?.name || 'unknown model'}:`, e);
                     return null; // Return null on error
                 }
             };

             return {
                 version: "2.3.1",
                 prevEmotions: prevEmotionsArray,
                 memoryBuffer: memoryArrays, // Stores {timestamp, beliefEmbedding (array)}
                 lastRIH: this.lastRIH,
                 lastCascadeVariance: this.lastCascadeVariance,
                 latestTrustScore: this.latestTrustScore,
                 integrationParam: integrationVal, // Save current value
                 reflexivityParam: reflexivityVal, // Save current value
                 selfState: selfStateArray, // Save current value
                 beliefNetworkWeights: getWeightsSafe(this.beliefNetwork),
                 cascadeInputLayerWeights: getWeightsSafe(this.cascadeInputLayer),
                 valueHeadWeights: getWeightsSafe(this.valueHead),
                 feedbackHeadWeights: getWeightsSafe(this.feedbackHead),
                 emotionalModuleWeights: getWeightsSafe(this.emotionalModule),
                 headMovementHeadWeights: getWeightsSafe(this.headMovementHead),
                 // NOTE: Optimizer state is generally NOT saved/loaded this way easily.
             };
         } catch(e) {
             console.error("Error getting agent state:", e);
             return { version: "2.3.1", error: `Failed to get state: ${e.message}` };
         }
    }

    /** Ensures agent has a minimal valid TF state if other operations fail. */
    _ensureDefaultTfState() {
        console.warn("Ensuring agent has a default TF state due to prior error.");
        this._cleanupTfMembers();
        this._set_tf_members_null();
        try {
            this._initializeTfComponents(); // Recreate TF components
        } catch (e) {
            console.error("CRITICAL: Failed to set agent to default TF state.", e);
            displayError("Agent recovery failed. TensorFlow components are likely unusable.", true);
        }
    }

    /** Loads state, ensuring proper cleanup and re-initialization. */
    loadState(state) {
        if (!state || typeof state !== 'object') {
            console.error("Agent loadState: Invalid state object provided.");
            if (typeof tf !== 'undefined') this._ensureDefaultTfState();
            return;
        }
        if (typeof tf === 'undefined') {
            console.error("Agent loadState: TensorFlow not available. Cannot load TF-dependent state.");
            this.lastRIH = typeof state.lastRIH === 'number' ? state.lastRIH : 0.0; // Load non-TF state if possible
            return;
        }

        console.log("Loading agent state V2.3...");
        if (state.version !== "2.3.1") {
            console.warn(`Agent loadState: Loading state from different version (${state.version}). Compatibility not guaranteed.`);
            // Attempt to load anyway, but might fail.
        }
        if (state.error) {
            console.error(`Agent loadState: Saved state contains error: ${state.error}. Attempting reset.`);
            this._ensureDefaultTfState();
            return;
        }

        // 1. Full cleanup of existing TF resources
        this._cleanupTfMembers();
        this._set_tf_members_null();

        // 2. Re-initialize core JS modules (if they have state needing reset)
        this.enyphansyntrix = new Enyphansyntrix('continuous');
        this.affinitaetssyndrom = new Affinitaetssyndrom();
        this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2);
        this.reflexiveIntegration = new ReflexiveIntegration();

        // 3. Re-initialize TF components to their default structures
        try {
            this._initializeTfComponents(); // Create new variables and models
        } catch (reinitError) {
            console.error("CRITICAL: Failed to re-initialize TF components during loadState. Agent will be unstable.", reinitError);
            displayError("Agent core re-initialization failed during load. Agent is likely broken.", true);
            return; // Cannot proceed
        }

        // 4. Load data into the newly re-initialized components
        try {
            const emoDim = Config.Agent.EMOTION_DIM || 6;
            const prevEmotionsArray = (Array.isArray(state.prevEmotions) && state.prevEmotions.length === emoDim)
                ? state.prevEmotions
                : zeros([emoDim]);
            if (this.prevEmotions) this.prevEmotions.assign(tf.tensor([prevEmotionsArray], [1, emoDim]));

            this.memoryBuffer = []; // Clear existing buffer
            if (Array.isArray(state.memoryBuffer)) {
                state.memoryBuffer.forEach(memEntry => {
                    if (memEntry && memEntry.beliefEmbedding && Array.isArray(memEntry.beliefEmbedding) && memEntry.beliefEmbedding.length === BELIEF_EMBEDDING_DIM) {
                        try {
                            this.memoryBuffer.push({
                                timestamp: memEntry.timestamp || Date.now(),
                                beliefEmbedding: tf.keep(tf.tensor(memEntry.beliefEmbedding, [BELIEF_EMBEDDING_DIM]))
                            });
                        } catch(e) { console.warn("Error creating tensor from loaded memory buffer item.", e); }
                    }
                });
                while (this.memoryBuffer.length > this.memorySize) { // Prune excess
                    const oldest = this.memoryBuffer.shift();
                    if (oldest?.beliefEmbedding && !oldest.beliefEmbedding.isDisposed) { tf.dispose(oldest.beliefEmbedding); }
                }
            }

            // Load scalar values
            this.lastRIH = typeof state.lastRIH === 'number' ? state.lastRIH : 0.0;
            this.lastCascadeVariance = typeof state.lastCascadeVariance === 'number' ? state.lastCascadeVariance : 0.0;
            this.latestTrustScore = typeof state.latestTrustScore === 'number' ? state.latestTrustScore : 1.0;

            // Load TF variable values
            const integrationVal = typeof state.integrationParam === 'number' ? state.integrationParam : 0.5;
            const reflexivityVal = typeof state.reflexivityParam === 'number' ? state.reflexivityParam : 0.5;
            if (this.integrationParam) this.integrationParam.assign(tf.scalar(integrationVal));
            if (this.reflexivityParam) this.reflexivityParam.assign(tf.scalar(reflexivityVal));

            const selfStateArray = (Array.isArray(state.selfState) && state.selfState.length === BELIEF_EMBEDDING_DIM)
                ? state.selfState
                : zeros([BELIEF_EMBEDDING_DIM]);
            if (this.selfState) this.selfState.assign(tf.tensor(selfStateArray, [BELIEF_EMBEDDING_DIM]));

            // Helper to safely load weights
            const loadWeightsSafe = (model, weightsData, modelName) => {
                 if (!model || !weightsData || !Array.isArray(weightsData)) {
                     console.warn(`Skipping weight loading for ${modelName}: Invalid model or weights data.`);
                     return;
                 }
                 try {
                     // Ensure weightsData has the expected structure { shape: number[], data: number[] }
                     const tensors = weightsData.map(w => {
                         if (!w || !w.shape || !w.data) throw new Error("Invalid weight structure in saved state.");
                         return tf.tensor(w.data, w.shape);
                     });
                     model.setWeights(tensors);
                     tensors.forEach(t => tf.dispose(t)); // Dispose temporary tensors
                 } catch (e) {
                     console.error(`Failed to load ${modelName} weights:`, e);
                     // Optionally try to reset model? Or leave it with initial weights.
                 }
            };

            // Load model weights
            loadWeightsSafe(this.beliefNetwork, state.beliefNetworkWeights, 'beliefNetwork');
            loadWeightsSafe(this.cascadeInputLayer, state.cascadeInputLayerWeights, 'cascadeInputLayer');
            loadWeightsSafe(this.valueHead, state.valueHeadWeights, 'valueHead');
            loadWeightsSafe(this.feedbackHead, state.feedbackHeadWeights, 'feedbackHead');
            loadWeightsSafe(this.emotionalModule, state.emotionalModuleWeights, 'emotionalModule');
            loadWeightsSafe(this.headMovementHead, state.headMovementHeadWeights, 'headMovementHead');

            // Reset transient state
            this.latestAffinities = [];
            if (this.latestBeliefEmbedding && !this.latestBeliefEmbedding.isDisposed) tf.dispose(this.latestBeliefEmbedding);
            this.latestBeliefEmbedding = null;
            this.latestCascadeHistoryArrays = [];

            console.log("Agent state loaded successfully into re-initialized components (V2.3).");
        } catch(loadDataError) {
            console.error("Error populating agent components from loaded state:", loadDataError);
            displayError(`Agent Data Load Error: ${loadDataError.message}. Agent state may be inconsistent.`, true);
            // Agent was re-initialized, but populating it failed. Reset to default.
            this._ensureDefaultTfState();
        }
    }


    /** Cleans up ALL agent resources, TF and core modules */
     cleanup() {
         console.log("Cleaning up Agent resources (V2.3)...");
         this._cleanupTfMembers(); // Dispose TF resources
         this._set_tf_members_null(); // Nullify TF references
         // Nullify core JS module references
         this.enyphansyntrix = null;
         this.affinitaetssyndrom = null;
         this.strukturkondensation = null;
         this.reflexiveIntegration = null;
         console.log("Agent full cleanup complete.");
     }

} // End of SyntrometricAgent class
