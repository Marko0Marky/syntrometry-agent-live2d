// js/agent.js

import { Config, emotionNames, HEAD_MOVEMENT_LABELS, NUM_HEAD_MOVEMENTS } from './config.js';
// Import updated core classes
import { Enyphansyntrix, Affinitaetssyndrom, Strukturkondensation, ReflexiveIntegration, Synkolator } from './syntrometry-core.js';
import { zeros, tensor, clamp, displayError } from './utils.js'; // Assuming tf is global

// --- Constants ---
const NUM_GRAPH_FEATURES = 2; // Number of features from calculateGraphFeatures [varZ, avgDist]
const BELIEF_EMBEDDING_DIM = Config.Agent.HIDDEN_DIM || 64; // Output size of the belief network
// Input dim for belief network: CoreState + GraphFeatures + SelfState
const BELIEF_NETWORK_INPUT_DIM = Config.DIMENSIONS + NUM_GRAPH_FEATURES + BELIEF_EMBEDDING_DIM;
// Cascade input layer maps BELIEF_EMBEDDING_DIM -> DIMENSIONS for cascade input
const CASCADE_INPUT_DIM = Config.DIMENSIONS;


/**
 * Represents the Syntrometric Agent V2.3, processing state and generating responses
 * with memory, RIH recursion, Enyphansyntrix perturbations, self-learning params, trust, self-state,
 * belief network, and heuristic intrinsic rewards.
 */
export class SyntrometricAgent {
    constructor() {
        // Core Syntrometry Modules
        this.enyphansyntrix = new Enyphansyntrix('continuous');
        this.affinitaetssyndrom = new Affinitaetssyndrom();
        // Cascade processes tensors of size CASCADE_INPUT_DIM (e.g., 12)
        this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2);
        this.reflexiveIntegration = new ReflexiveIntegration();

        // V2 Features
        this.memorySize = Config.Agent.HISTORY_SIZE || 10;
        this.memoryBuffer = []; // Holds last N BELIEF EMBEDDING TENSORS
        this.lastRIH = 0.0;
        this.latestTrustScore = 1.0;

        // --- Initialize TF Members ---
        this._set_tf_members_null(); // Start with nulls

        // --- TF.js Models & Variables ---
        if (typeof tf === 'undefined') {
            console.error("CRITICAL: TensorFlow.js not loaded. Agent cannot initialize.");
            return; // Stop constructor
        }

        try {
            // Self-Learning Parameters
            this.integrationParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentIntegrationParam'));
            this.reflexivityParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentReflexivityParam'));

            // Belief Network
            this.beliefNetwork = tf.sequential({ name: 'beliefNetwork'});
            this.beliefNetwork.add(tf.layers.dense({ units: BELIEF_EMBEDDING_DIM, inputShape: [BELIEF_NETWORK_INPUT_DIM], activation: 'relu' }));
            this.beliefNetwork.add(tf.layers.dense({ units: BELIEF_EMBEDDING_DIM, activation: 'tanh' }));

            // Cascade Input Projection Layer
            this.cascadeInputLayer = tf.layers.dense({ units: CASCADE_INPUT_DIM, inputShape: [BELIEF_EMBEDDING_DIM], activation: 'tanh', name:'cascadeInputLayer' });

            // Value and Feedback Heads
            this.valueHead = tf.layers.dense({ units: 1, inputShape: [BELIEF_EMBEDDING_DIM], name: 'valueHead'});
            this.feedbackHead = tf.layers.dense({ units: Config.DIMENSIONS, inputShape: [BELIEF_EMBEDDING_DIM], name: 'feedbackHead'});

            // Self-State Model
            this.selfState = tf.keep(tf.variable(tf.zeros([BELIEF_EMBEDDING_DIM]), true, 'agentSelfState'));

            // Emotion/HM Models
            this.emotionalModule = this._buildEmotionalModel();
            this.headMovementHead = this._buildHeadMovementModel();

            // Previous Emotion State
            this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));

            // Optimizer
            const trainableVars = [
                ...(this.beliefNetwork?.trainableWeights || []),
                ...(this.cascadeInputLayer?.trainableWeights || []),
                ...(this.valueHead?.trainableWeights || []),
                ...(this.feedbackHead?.trainableWeights || [])
            ].filter(v => v != null);

            const learningRate = (Config && Config.RL && typeof Config.RL.LR === 'number') ? Config.RL.LR : 0.001;
            if (learningRate !== Config?.RL?.LR) {
                 console.warn("Agent using default LR (0.001) because Config.RL.LR was not found or invalid.");
            }
            this.optimizer = tf.train.adam(learningRate);

             if (!this.emotionalModule || !this.headMovementHead || !this.beliefNetwork ||
                 !this.cascadeInputLayer || !this.valueHead || !this.feedbackHead || !this.optimizer) {
                 throw new Error("One or more core TF components failed to initialize.");
             }

        } catch (tfError) {
            console.error("Error during TF model/optimizer setup in Agent:", tfError);
            displayError(`Agent TF Setup Error: ${tfError.message}`, true);
            this._set_tf_members_null();
            return;
        }

        // State Tracking
        this.latestCascadeHistoryArrays = [];
        this.latestRihScore = 0;
        this.latestAffinities = [];
        console.log("ConsciousAgent V2.3 initialized with Belief Network and Self-State input.");
    }

    // Helper to nullify TF members on error or init
     _set_tf_members_null() {
        this.integrationParam = null; this.reflexivityParam = null; this.selfState = null;
        this.beliefNetwork = null; this.cascadeInputLayer = null; this.valueHead = null; this.feedbackHead = null;
        this.emotionalModule = null; this.headMovementHead = null; this.prevEmotions = null;
        this.optimizer = null;
    }

    // --- TF Model Builders ---
    _buildEmotionalModel() {
        if (typeof tf === 'undefined') return null;
        try {
            const model = tf.sequential();
            const inputDim = Config.Agent.BASE_STATE_DIM + Config.Agent.EMOTION_DIM + 1 + 1;
            model.add(tf.layers.dense({ units: 32, inputShape: [inputDim], activation: 'relu' }));
            model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
            model.add(tf.layers.dense({ units: Config.Agent.EMOTION_DIM, activation: 'sigmoid' }));
            console.log("Emotional model built.");
            return model;
        } catch (e) { console.error("Failed building emotional model:", e); return null; }
     }
    _buildHeadMovementModel() {
        if (typeof tf === 'undefined') return null;
        try {
            const model = tf.sequential();
            const inputDim = 1 + 1 + 1 + Config.Agent.EMOTION_DIM;
            model.add(tf.layers.dense({ units: 16, inputShape: [inputDim], activation: 'relu' }));
            model.add(tf.layers.dense({ units: NUM_HEAD_MOVEMENTS }));
            console.log("Head movement model built.");
            return model;
        } catch (e) { console.error("Failed building head movement model:", e); return null; }
    }

    /**
     * Updates memory buffer with BELIEF EMBEDDING tensors.
     * @param {tf.Tensor} beliefTensor The 1D belief embedding tensor to remember.
     */
    _updateMemory(beliefTensor) {
        if (typeof tf === 'undefined') return;
        if (!(beliefTensor instanceof tf.Tensor) || beliefTensor.isDisposed || beliefTensor.rank !== 1 || beliefTensor.shape[0] !== BELIEF_EMBEDDING_DIM) {
            return;
        }
        this.memoryBuffer.push(tf.keep(beliefTensor.clone()));
        if (this.memoryBuffer.length > this.memorySize) {
            const oldTensor = this.memoryBuffer.shift();
            if (oldTensor && !oldTensor.isDisposed) tf.dispose(oldTensor);
        }
    }

    /**
     * Computes trust score based on similarity between current belief and memory beliefs.
     * @param {tf.Tensor} currentBeliefEmbedding - The current belief embedding tensor.
     * @returns {number} Trust score (0-1).
     */
    _computeTrust(currentBeliefEmbedding) {
        if (this.memoryBuffer.length === 0 || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed) return 1.0;
        if (typeof tf === 'undefined') return 0.5;

        try {
            return tf.tidy(() => {
                const flatCurrent = currentBeliefEmbedding.flatten();
                const currentNorm = flatCurrent.norm().arraySync();
                if (currentNorm === 0) return 0.0;

                const similarities = this.memoryBuffer.map(memTensor => {
                    if (!memTensor || memTensor.isDisposed || memTensor.shape[0] !== BELIEF_EMBEDDING_DIM) return tf.scalar(0);
                    const flatMem = memTensor;
                    const normProd = currentNorm * flatMem.norm().arraySync();
                    if (normProd < 1e-9) return tf.scalar(0);
                    return flatCurrent.dot(flatMem).div(normProd).clipByValue(-1, 1);
                });

                const validSimilarities = similarities.filter(s => s.size > 0);
                if (validSimilarities.length === 0) return 1.0;

                const avgSimilarity = tf.mean(tf.stack(validSimilarities));
                const trust = avgSimilarity.add(1).div(2);
                return trust.arraySync();
            });
        } catch (e) { console.error("Error computing trust:", e); return 0.5; }
    }

    /**
     * Heuristic learning rule for self-adjusting parameters based on trust and RIH.
     * @param {number} trustScore The agent's current trust score (0-1).
     * @param {number} rihScore The agent's current RIH score (0-1).
     * @param {number} cascadeVariance The variance of the final cascade level.
     */
    _learnParameters(trustScore, rihScore, cascadeVariance) {
        // Ensure TF is loaded and parameters are valid, non-disposed tf.variable objects
        if (typeof tf === 'undefined' || !this.integrationParam || !this.reflexivityParam || this.integrationParam.isDisposed || this.reflexivityParam.isDisposed) {
            // console.warn("Parameter learning skipped: TF not ready or params invalid."); // Optional warning
            return;
        }

        tf.tidy(() => {
            const learningRate = 0.005;
            let integrationDelta = 0.0;
            let reflexivityDelta = 0.0;

            // --- Heuristic Rules based on Trust and RIH ---
            // High RIH (>0.7) & High Trust (>0.7): System is stable and predictable.
            // Enhance stability: Increase Integration (I), Decrease Reflexivity (Psi)
            if (rihScore > 0.7 && trustScore > 0.7) {
                integrationDelta += 1.0; // Encourage more integration
                reflexivityDelta -= 1.0; // Reduce self-feedback/noise sensitivity
            }
            // Low RIH (<0.3) OR Low Trust (<0.4): System is unstable or unpredictable.
            // Encourage exploration/adaptation: Decrease Integration (I), Increase Reflexivity (Psi)
            else if (rihScore < 0.3 || trustScore < 0.4) {
                integrationDelta -= 1.0; // Discourage strong integration if unstable/untrusted
                reflexivityDelta += 1.0; // Increase self-feedback/noise sensitivity for adaptation
            }

            // --- Cascade Variance Influence ---
            // High variance suggests poor condensation/information loss
            // -> Increase Integration slightly to try and improve condensation
            if (cascadeVariance > 0.1) { // Threshold for "high" variance (needs tuning)
                integrationDelta += 0.5 * clamp(cascadeVariance, 0, 1); // Increase I proportionally, capped
            }

            // --- Add slight decay towards center (0.5) ---
            // This prevents parameters from getting stuck at the limits indefinitely
            let currentIntegrationValue = 0.5; // Default fallback
            let currentReflexivityValue = 0.5; // Default fallback
            try {
                 // *** CORRECTED: Get JS value using dataSync() ***
                 currentIntegrationValue = this.integrationParam.dataSync()[0];
                 currentReflexivityValue = this.reflexivityParam.dataSync()[0];
            } catch(e) {
                 console.error("Error reading param values for decay in _learnParameters:", e);
                 // Use defaults if read fails
            }
            integrationDelta += (0.5 - currentIntegrationValue) * 0.05; // Nudge towards 0.5
            reflexivityDelta += (0.5 - currentReflexivityValue) * 0.05; // Nudge towards 0.5
            // ************************************************

            // --- Apply deltas to calculate new parameter values ---
            // Note: We are adding reflexivityDelta now
            const newIntegration = this.integrationParam.add(tf.scalar(integrationDelta * learningRate));
            const newReflexivity = this.reflexivityParam.add(tf.scalar(reflexivityDelta * learningRate));

            // --- Assign updated values, clipped to valid range ---
            this.integrationParam.assign(newIntegration.clipByValue(0.05, 0.95));
            this.reflexivityParam.assign(newReflexivity.clipByValue(0.05, 0.95));
        }); // End tf.tidy
    }


     /**
     * Updates the internal self-state model based on current belief embedding and trust.
     * Now uses internal Integration Param to modulate update rate.
     * @param {tf.Tensor} currentBeliefEmbedding - The current belief embedding.
     * @param {number} trustScore - The calculated trust score.
     * @param {number} integrationParamValue - The current value of the agent's integration parameter.
     */
    _updateSelfState(currentBeliefEmbedding, trustScore, integrationParamValue) {
         if (typeof tf === 'undefined' || !this.selfState || this.selfState.isDisposed || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed) return;
         if (this.selfState.shape[0] !== currentBeliefEmbedding.shape[0]) { console.error("Self-state/belief dim mismatch!"); return; }

         tf.tidy(() => {
             const baseDecay = 0.95;
             const baseLearnRate = 0.1;
             const effectiveLearnRate = baseLearnRate * (0.5 + integrationParamValue);
             // Ensure decay doesn't go below a minimum threshold
             const effectiveDecay = clamp(1.0 - effectiveLearnRate, 0.85, 0.99);
             const trustFactor = tf.scalar(trustScore * effectiveLearnRate);

             const newState = this.selfState.mul(effectiveDecay).add(currentBeliefEmbedding.mul(trustFactor));
             this.selfState.assign(newState);
         });
    }


    // Processes the current state and generates agent responses (V2.3 Logic)
    async process(rawState, graphFeatures, environmentContext = { eventType: null, reward: 0 }) {

        if (typeof tf === 'undefined' || !this.beliefNetwork || !this.integrationParam || !this.reflexivityParam || !this.selfState) {
             console.error("TF.js not available or agent not fully initialized for processing.");
             const defaultEmotions = tf?.zeros([1, Config.Agent.EMOTION_DIM]) || null;
             return { cascadeHistory: [], rihScore: 0, affinities: [], emotions: defaultEmotions, hmLabel: 'idle', responseText: "Error: Agent not ready.", integration: 0.5, reflexivity: 0.5, trustScore: 0.0, beliefNorm: 0, feedbackNorm: 0 };
        }

        // --- Read internal params FIRST ---
        let currentIntegration = 0.5, currentReflexivity = 0.5;
        try {
            if (!this.integrationParam.isDisposed) currentIntegration = this.integrationParam.dataSync()[0];
            if (!this.reflexivityParam.isDisposed) currentReflexivity = this.reflexivityParam.dataSync()[0];
        } catch (e) { console.error("Error reading agent parameters:", e); }

        let results = {};
        let beliefNormValue = 0.0;
        let feedbackNormValue = 0.0;

        try {
            results = tf.tidy(() => {
                // 1. Prepare Inputs
                const stateArray = (Array.isArray(rawState) ? rawState : zeros([Config.Agent.BASE_STATE_DIM])).slice(0, Config.Agent.BASE_STATE_DIM);
                while(stateArray.length < Config.Agent.BASE_STATE_DIM) stateArray.push(0);
                const coreStateTensor = tf.tensor(stateArray.slice(0, Config.DIMENSIONS));
                const graphFeaturesTensor = tf.tensor(graphFeatures);
                const currentSelfState = this.selfState; // Use variable directly

                // 2. Recursive Reflexivity
                const rihModulation = this.lastRIH * (currentReflexivity * 2 - 1);
                let modulatedInput = coreStateTensor.add(tf.scalar(rihModulation * 0.1)).clipByValue(-1, 1);

                // 3. Enyphansyntrix Perturbation
                const perturbationScale = clamp(0.005 + (1.0 - this.lastRIH) * 0.02 + currentReflexivity * 0.02, 0.001, 0.05);
                const perturbedInput = this.enyphansyntrix.apply(modulatedInput, perturbationScale);

                // 4. Belief Network Processing
                const beliefNetInput = tf.concat([
                    perturbedInput.reshape([1, Config.DIMENSIONS]),
                    graphFeaturesTensor.reshape([1, NUM_GRAPH_FEATURES]),
                    currentSelfState.reshape([1, BELIEF_EMBEDDING_DIM])
                ], 1);
                 if (beliefNetInput.shape[1] !== BELIEF_NETWORK_INPUT_DIM) { throw new Error(`Belief network input dim mismatch: expected ${BELIEF_NETWORK_INPUT_DIM}, got ${beliefNetInput.shape[1]}`); }
                const beliefEmbedding = this.beliefNetwork.apply(beliefNetInput).reshape([BELIEF_EMBEDDING_DIM]);
                const keptBeliefEmbedding = tf.keep(beliefEmbedding.clone());

                // 5. Project Belief for Cascade & Run Cascade
                const cascadeInput = this.cascadeInputLayer.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([CASCADE_INPUT_DIM]);
                const cascadeHistoryTensors = this.strukturkondensation.process(cascadeInput);
                cascadeHistoryTensors.forEach(t => tf.keep(t));
                const cascadeHistoryArrays = cascadeHistoryTensors.map(t => t.arraySync());
                const lastCascadeLevelTensor = cascadeHistoryTensors.length > 0 ? cascadeHistoryTensors[cascadeHistoryTensors.length - 1] : tf.tensor([]);

                // 6. Calculate RIH & Affinities
                const currentRihScore = this.reflexiveIntegration.compute(lastCascadeLevelTensor);
                const currentAffinities = [];
                if (cascadeHistoryTensors.length > 1) {
                    for (let i = 0; i < cascadeHistoryTensors.length - 1; i++) {
                         if (cascadeHistoryTensors[i]?.shape[0] > 0 && cascadeHistoryTensors[i+1]?.shape[0] > 0 && !cascadeHistoryTensors[i].isDisposed && !cascadeHistoryTensors[i+1].isDisposed) {
                             try { currentAffinities.push(this.affinitaetssyndrom.compute(cascadeHistoryTensors[i], cascadeHistoryTensors[i+1])); }
                             catch (affError) { console.error(`Affinity Error L${i}: ${affError}`); currentAffinities.push(0); }
                         } else { currentAffinities.push(0); }
                     }
                 }
                const currentAvgAffinity = currentAffinities.length > 0 ? currentAffinities.reduce((a, b) => a + b, 0) / currentAffinities.length : 0;

                // 7. Compute Trust
                const currentTrustScore = this._computeTrust(beliefEmbedding);

                // 8. Calculate Cascade Features
                let varFinal = 0.0, meanFinal = 0.0;
                if (lastCascadeLevelTensor.size > 1) {
                     const moments = tf.moments(lastCascadeLevelTensor);
                     varFinal = moments.variance.arraySync(); meanFinal = moments.mean.arraySync();
                } else if (lastCascadeLevelTensor.size === 1) { meanFinal = lastCascadeLevelTensor.arraySync()[0]; }
                const cascadeFeatures = [clamp(varFinal, 0, 10), clamp(meanFinal, -10, 10)];

                // 9. Value & Feedback Heads
                const valuePred = this.valueHead.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([]);
                const feedbackSignalRaw = this.feedbackHead.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([Config.DIMENSIONS]);
                const feedbackSignal = feedbackSignalRaw;

                return {
                    keptBeliefEmbedding, cascadeHistoryTensors, cascadeHistoryArrays,
                    lastCascadeLevelTensor: tf.keep(lastCascadeLevelTensor.clone()),
                    currentRihScore: currentRihScore ?? 0, currentAffinities: currentAffinities,
                    currentAvgAffinity: currentAvgAffinity ?? 0, currentTrustScore: currentTrustScore ?? 0.5,
                    cascadeFeatures: cascadeFeatures, valuePred: tf.keep(valuePred.clone()),
                    feedbackSignal: tf.keep(feedbackSignal.clone())
                };
            }); // End of tf.tidy

        } catch (e) {
             console.error("Error during agent core processing (tidy block):", e);
             displayError(`Agent Processing Error: ${e.message}`, false, 'error-message');
             results = { keptBeliefEmbedding: null, cascadeHistoryTensors: [], lastCascadeLevelTensor: null, cascadeHistoryArrays:[], currentRihScore: this.lastRIH, currentAffinities: [], currentAvgAffinity: 0, currentTrustScore: this.latestTrustScore, cascadeFeatures: [0,0], valuePred: tf.scalar(0), feedbackSignal: tf.zeros([Config.DIMENSIONS]) };
             tf.keep(results.valuePred); tf.keep(results.feedbackSignal);
        }

        // --- Update Persistent State & Learn ---
        this.lastRIH = results.currentRihScore;
        this.latestRihScore = results.currentRihScore;
        this.latestAffinities = results.currentAffinities;
        this.latestTrustScore = results.currentTrustScore;

        // --- Calculate norms BEFORE disposing ---
         beliefNormValue = results.keptBeliefEmbedding && !results.keptBeliefEmbedding.isDisposed
                            ? results.keptBeliefEmbedding.norm().arraySync()
                            : 0;
         feedbackNormValue = results.feedbackSignal && !results.feedbackSignal.isDisposed
                             ? results.feedbackSignal.norm().arraySync()
                             : 0;
        // ---------------------------------------

        if (results.keptBeliefEmbedding) this._updateMemory(results.keptBeliefEmbedding);
        if (results.keptBeliefEmbedding) this._updateSelfState(results.keptBeliefEmbedding, results.currentTrustScore, currentIntegration);
        this._learnParameters(results.currentTrustScore, results.currentRihScore, results.cascadeFeatures[0]);

        // Dispose kept tensors from tidy AFTER calculations and updates
        if (results.keptBeliefEmbedding && !results.keptBeliefEmbedding.isDisposed) tf.dispose(results.keptBeliefEmbedding);
        if (results.lastCascadeLevelTensor && !results.lastCascadeLevelTensor.isDisposed) tf.dispose(results.lastCascadeLevelTensor);
        if (results.valuePred && !results.valuePred.isDisposed) tf.dispose(results.valuePred);
        if (results.feedbackSignal && !results.feedbackSignal.isDisposed) tf.dispose(results.feedbackSignal);
        results.cascadeHistoryTensors?.forEach(t => { if (t && !t.isDisposed) tf.dispose(t); });


        // --- Emotional Module ---
        let currentEmotions = this.prevEmotions;
        try {
            if (this.emotionalModule && this.prevEmotions && !this.prevEmotions.isDisposed) {
                 const fullStateArray = (Array.isArray(rawState) ? rawState : zeros([Config.Agent.BASE_STATE_DIM])).slice(0, Config.Agent.BASE_STATE_DIM);
                 while(fullStateArray.length < Config.Agent.BASE_STATE_DIM) fullStateArray.push(0);
                const emotionPrediction = await tf.tidy(() => {
                    const stateTensor = tf.tensor(fullStateArray, [1, Config.Agent.BASE_STATE_DIM]);
                    const rewardTensor = tf.tensor([[environmentContext.reward || 0]], [1, 1]);
                    const contextSignal = tf.tensor([[environmentContext.eventType ? 1 : 0]], [1, 1]);
                    const input = tf.concat([stateTensor, this.prevEmotions, rewardTensor, contextSignal], 1);
                    const predictedEmotions = this.emotionalModule.predict(input);
                    const blendFactorValue = 0.8 - (currentIntegration * 0.3);
                    const blendFactor = tf.scalar(clamp(blendFactorValue, 0.1, 0.9));
                    const blendedEmotions = this.prevEmotions.mul(blendFactor).add(predictedEmotions.mul(tf.scalar(1.0).sub(blendFactor))).clipByValue(0, 1);
                    return blendedEmotions;
                 });
                 tf.dispose(this.prevEmotions);
                 this.prevEmotions = tf.keep(emotionPrediction);
                 currentEmotions = this.prevEmotions;
            } else {
                 console.warn("Emotional model or prevEmotions invalid. Applying decay.");
                 if (!this.prevEmotions || this.prevEmotions.isDisposed) { this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); }
                 const decayedEmotions = tf.tidy(() => this.prevEmotions.mul(0.98).clipByValue(0,1));
                 tf.dispose(this.prevEmotions);
                 this.prevEmotions = tf.keep(decayedEmotions);
                 currentEmotions = this.prevEmotions;
             }
        } catch (e) {
             displayError(`TF Error during emotion prediction: ${e.message}`, false, 'error-message');
             if (!this.prevEmotions || this.prevEmotions.isDisposed) { this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); }
             currentEmotions = this.prevEmotions;
        }


        // --- Head Movement Head ---
        let hmLabel = "idle";
        let dominantEmotionName = 'Unknown';
        try {
             if (this.headMovementHead && currentEmotions && !currentEmotions.isDisposed) {
                 const emotionArray = currentEmotions.arraySync()[0];
                 const dominantEmotionIndex = emotionArray.length > 0 ? emotionArray.indexOf(Math.max(...emotionArray)) : -1;
                 dominantEmotionName = emotionNames[dominantEmotionIndex] || 'Unknown';

                 if (dominantEmotionIndex !== -1) {
                     const hmLogits = tf.tidy(() => {
                         const rihTensor = tf.tensor([[this.latestRihScore]], [1, 1]);
                         const avgAffinityTensor = tf.tensor([[results.currentAvgAffinity ?? 0]], [1, 1]);
                         const dominantEmotionTensor = tf.tensor([[dominantEmotionIndex]], [1, 1]);
                         const emotionTensorInput = currentEmotions.reshape([1, Config.Agent.EMOTION_DIM]);
                         const input = tf.concat([rihTensor, avgAffinityTensor, dominantEmotionTensor, emotionTensorInput], 1);
                         return this.headMovementHead.predict(input);
                      });
                     if (hmLogits) {
                         const hmIdx = hmLogits.argMax(1).arraySync()[0];
                         hmLabel = HEAD_MOVEMENT_LABELS[hmIdx] || "idle";
                         tf.dispose(hmLogits);
                     }
                 }
             } else {
                 if (this.latestRihScore > 0.7) hmLabel = "nod";
                 else if ((results.currentAvgAffinity ?? 0) < 0.2) hmLabel = "shake";
                 else hmLabel = "idle";
             }
        } catch (e) {
             displayError(`TF Error during head movement prediction: ${e.message}`, false, 'error-message');
             hmLabel = "idle";
        }


        // --- Generate text response ---
        const rihText = (this.latestRihScore ?? 0).toFixed(2);
        const affText = (results.currentAvgAffinity ?? 0).toFixed(2);
        const trustText = (this.latestTrustScore ?? 0).toFixed(2);
        const intText = (currentIntegration ?? 0.5).toFixed(2);
        const refText = (currentReflexivity ?? 0.5).toFixed(2);
        const cascadeVarText = (results.cascadeFeatures[0] ?? 0).toFixed(2);

        const responseText = `V2.3 R:${rihText} A:${affText} T:${trustText} CV:${cascadeVarText} I:${intText} Ψ:${refText}. F:${dominantEmotionName}.`;

        // Return results
        return {
            cascadeHistory: results.cascadeHistoryArrays || [],
            rihScore: this.latestRihScore ?? 0,
            affinities: this.latestAffinities || [],
            emotions: currentEmotions,
            hmLabel: hmLabel,
            responseText: responseText,
            trustScore: this.latestTrustScore ?? 0.5,
            integration: currentIntegration ?? 0.5,
            reflexivity: currentReflexivity ?? 0.5,
            beliefNorm: beliefNormValue, // Use calculated value
            feedbackNorm: feedbackNormValue // Use calculated value
        };
    }


    getState() {
        if(typeof tf === 'undefined') return {};
        const memoryArrays = this.memoryBuffer.map(tensor =>
            tensor && !tensor.isDisposed ? tensor.arraySync() : []
        );
        const prevEmotionsArray = this.prevEmotions && !this.prevEmotions.isDisposed ? this.prevEmotions.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]);

        let selfStateArray = zeros([BELIEF_EMBEDDING_DIM]); // Default if disposed/missing
        try { if (this.selfState && !this.selfState.isDisposed) selfStateArray = Array.from(this.selfState.dataSync()); }
        catch (e) { console.error("Error getting selfState in getState:", e); }

        const integrationVal = this.integrationParam && !this.integrationParam.isDisposed ? this.integrationParam.dataSync()[0] : 0.5;
        const reflexivityVal = this.reflexivityParam && !this.reflexivityParam.isDisposed ? this.reflexivityParam.dataSync()[0] : 0.5;

        const getWeightsSafe = (model) => {
            try { return model ? model.getWeights().map(w => w.arraySync()) : []; }
            catch (e) { console.error(`Error getting weights for ${model?.name}:`, e); return []; }
        };

        return {
            prevEmotions: prevEmotionsArray,
            memoryBuffer: memoryArrays,
            lastRIH: this.lastRIH,
            latestTrustScore: this.latestTrustScore,
            integrationParam: integrationVal,
            reflexivityParam: reflexivityVal,
            selfState: selfStateArray, // Saved as standard array
            beliefNetworkWeights: getWeightsSafe(this.beliefNetwork),
            cascadeInputLayerWeights: getWeightsSafe(this.cascadeInputLayer),
            valueHeadWeights: getWeightsSafe(this.valueHead),
            feedbackHeadWeights: getWeightsSafe(this.feedbackHead),
        };
    }


    loadState(state) {
        if (!state || typeof state !== 'object' || typeof tf === 'undefined') return;
        console.log("Loading agent state V2.3...");
        // --- Dispose existing tensors ---
        if (this.prevEmotions && !this.prevEmotions.isDisposed) tf.dispose(this.prevEmotions);
        if (this.selfState && !this.selfState.isDisposed) tf.dispose(this.selfState);
        if (this.integrationParam && !this.integrationParam.isDisposed) tf.dispose(this.integrationParam);
        if (this.reflexivityParam && !this.reflexivityParam.isDisposed) tf.dispose(this.reflexivityParam);
        this.memoryBuffer.forEach(tensor => { if (tensor && !tensor.isDisposed) tf.dispose(tensor); });
        this.memoryBuffer = [];

        try { // Wrap loading in try-catch
            // Load previous emotions
            const prevEmotionsArray = Array.isArray(state.prevEmotions) ? state.prevEmotions : zeros([Config.Agent.EMOTION_DIM]);
            this.prevEmotions = tf.keep(tf.tensor([prevEmotionsArray], [1, Config.Agent.EMOTION_DIM]));

            // Load memory buffer (belief embeddings)
            if (Array.isArray(state.memoryBuffer)) {
                state.memoryBuffer.forEach(memArray => {
                     if (Array.isArray(memArray) && memArray.length === BELIEF_EMBEDDING_DIM) {
                         try { this.memoryBuffer.push(tf.keep(tf.tensor(memArray))); }
                         catch(e) { console.warn("Error creating tensor from memory buffer array on load."); }
                     }
                });
                while (this.memoryBuffer.length > this.memorySize) { tf.dispose(this.memoryBuffer.shift()); }
                console.log(`Loaded ${this.memoryBuffer.length} items into memory buffer.`);
            } else { console.warn("Memory buffer missing or invalid in saved state.");}

            // Load last RIH and Trust
            this.lastRIH = typeof state.lastRIH === 'number' ? state.lastRIH : 0.0;
            this.latestTrustScore = typeof state.latestTrustScore === 'number' ? state.latestTrustScore : 1.0;

            // Load Self-Learning Parameters
            const integrationVal = typeof state.integrationParam === 'number' ? state.integrationParam : 0.5;
            const reflexivityVal = typeof state.reflexivityParam === 'number' ? state.reflexivityParam : 0.5;
            this.integrationParam = tf.keep(tf.variable(tf.scalar(integrationVal), true, 'agentIntegrationParam'));
            this.reflexivityParam = tf.keep(tf.variable(tf.scalar(reflexivityVal), true, 'agentReflexivityParam'));

            // Load Self-State
            const selfStateArray = Array.isArray(state.selfState) ? state.selfState : zeros([BELIEF_EMBEDDING_DIM]);
            if (selfStateArray.length === BELIEF_EMBEDDING_DIM) {
                this.selfState = tf.keep(tf.variable(tf.tensor(selfStateArray), true, 'agentSelfState'));
            } else {
                 console.warn(`Self-state dim mismatch on load (${selfStateArray.length} vs ${BELIEF_EMBEDDING_DIM}). Resetting.`);
                 this.selfState = tf.keep(tf.variable(tf.zeros([BELIEF_EMBEDDING_DIM]), true, 'agentSelfState'));
            }

            // --- Load Network Weights ---
            console.log("Loading network weights...");
            const loadWeightsSafe = (model, weightsData) => {
                 if (model && weightsData && Array.isArray(weightsData)) {
                    try {
                        if (weightsData.length === model.weights.length) {
                             model.setWeights(weightsData.map(w => tf.tensor(w)));
                             console.log(`Weights loaded for ${model.name}.`);
                        } else {
                             console.warn(`Weight mismatch loading ${model.name}. Expected ${model.weights.length}, got ${weightsData?.length}. Skipping.`);
                        }
                    } catch (loadErr) {
                        console.error(`Error setting weights for ${model.name}:`, loadErr);
                    }
                 } else if (model && !weightsData) {
                     console.warn(`No weights data found for ${model.name} in saved state. Using initialized weights.`);
                 } else if (!model) {
                     console.warn("Attempted to load weights for a non-existent model.");
                 }
             };
            loadWeightsSafe(this.beliefNetwork, state.beliefNetworkWeights);
            loadWeightsSafe(this.cascadeInputLayer, state.cascadeInputLayerWeights);
            loadWeightsSafe(this.valueHead, state.valueHeadWeights);
            loadWeightsSafe(this.feedbackHead, state.feedbackHeadWeights);

            // Reset latest calculated values
            this.latestCascadeHistoryArrays = []; this.latestRihScore = 0; this.latestAffinities = [];
            console.log("Agent state loaded (V2.3).");

        } catch(loadError) {
            console.error("CRITICAL ERROR during agent state loading:", loadError);
            displayError(`Agent Load Error: ${loadError.message}. Resetting agent state.`, true);
            this.cleanup();
            this._set_tf_members_null();
            this.memoryBuffer = [];
            this.lastRIH = 0.0; this.latestTrustScore = 1.0;
            this.latestCascadeHistoryArrays = []; this.latestRihScore = 0; this.latestAffinities = [];
            try { this.constructor(); } catch(reinitError) { console.error("Failed to re-initialize agent after load error:", reinitError); }
        }
    }


     cleanup() {
         console.log("Cleaning up Agent tensors (V2.3)...");
         if (typeof tf === 'undefined') return;
         const safeDispose = (item) => {
             if (item) {
                 if (typeof item.dispose === 'function' && !(item.isDisposedInternal ?? item.isDisposed) ) {
                     try { item.dispose(); } catch (e) { console.error("Dispose error:", e); }
                 } else if (Array.isArray(item)) { item.forEach(subItem => safeDispose(subItem)); }
             }
         };
         safeDispose(this.emotionalModule); safeDispose(this.headMovementHead);
         safeDispose(this.beliefNetwork); safeDispose(this.cascadeInputLayer);
         safeDispose(this.valueHead); safeDispose(this.feedbackHead);
         safeDispose(this.prevEmotions); safeDispose(this.selfState);
         safeDispose(this.integrationParam); safeDispose(this.reflexivityParam);
         safeDispose(this.memoryBuffer);

         this._set_tf_members_null();
         this.memoryBuffer = [];
         console.log("Agent TensorFlow tensors disposed (V2.3).");
     }
}
