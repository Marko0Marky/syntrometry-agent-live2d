// js/agent.js

import { Config, emotionNames, HEAD_MOVEMENT_LABELS, NUM_HEAD_MOVEMENTS } from './config.js';
// Import updated core classes
import { Enyphansyntrix, Affinitaetssyndrom, Strukturkondensation, ReflexiveIntegration, Synkolator } from './syntrometry-core.js';
import { zeros, tensor, clamp, displayError, inspectTensor } from './utils.js'; // Assuming tf is global, Added inspectTensor

// --- Constants ---
// ... (Constants remain the same) ...
const NUM_GRAPH_FEATURES = 2;
const BELIEF_EMBEDDING_DIM = Config.Agent.HIDDEN_DIM || 64;
const BELIEF_NETWORK_INPUT_DIM = Config.DIMENSIONS + NUM_GRAPH_FEATURES + BELIEF_EMBEDDING_DIM;
const CASCADE_INPUT_DIM = Config.DIMENSIONS;
const EMOTIONAL_DECAY_RATE = 0.97;


/**
 * Represents the Syntrometric Agent V2.3...
 */
export class SyntrometricAgent {
    constructor() {
        // --- Initialize Core Syntrometry Modules FIRST ---
        // These are plain JS objects, less prone to async/init issues
        this.enyphansyntrix = new Enyphansyntrix('continuous');
        this.affinitaetssyndrom = new Affinitaetssyndrom();
        this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2);
        this.reflexiveIntegration = new ReflexiveIntegration();
        // --- End Core Module Init ---

        // V2 Features
        this.memorySize = Config.Agent.HISTORY_SIZE || 10;
        this.memoryBuffer = []; // Holds last N BELIEF EMBEDDING TENSORS
        this.lastRIH = 0.0;
        this.lastCascadeVariance = 0.0;
        this.latestTrustScore = 1.0;

        // --- Initialize TF Members ---
        this._set_tf_members_null(); // Nullify *only* TF members now

        // --- TF.js Models & Variables ---
        if (typeof tf === 'undefined') {
            console.error("CRITICAL: TensorFlow.js not loaded. Agent cannot initialize.");
            displayError("TensorFlow.js not loaded. Agent initialization failed.", true, 'error-message');
             // Ensure core modules are nulled if TF isn't available from the start
             this.enyphansyntrix = null; this.affinitaetssyndrom = null;
             this.strukturkondensation = null; this.reflexiveIntegration = null;
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
            const trainableVars = [ // Collect vars *before* optimizer creation
                 ...(this.beliefNetwork?.trainableWeights || []),
                 ...(this.cascadeInputLayer?.trainableWeights || []),
                 ...(this.valueHead?.trainableWeights || []),
                 ...(this.feedbackHead?.trainableWeights || [])
             ].filter(v => v != null);
            const learningRate = (Config && Config.RL && typeof Config.RL.LR === 'number') ? Config.RL.LR : 0.001;
            if (learningRate !== Config?.RL?.LR) {
                 console.warn(`Agent using default LR (${learningRate}) because Config.RL.LR was not found or invalid.`);
            }
             // Ensure trainableVars are collected before creating optimizer
            this.optimizer = tf.train.adam(learningRate);


             // --- Detailed Check for Initialization Failures ---
             const components = {
                 // Core modules initialized outside try block, should be valid unless TF failed earlier
                 enyphansyntrix: this.enyphansyntrix,
                 affinitaetssyndrom: this.affinitaetssyndrom,
                 strukturkondensation: this.strukturkondensation,
                 reflexiveIntegration: this.reflexiveIntegration,
                 // TF components
                 emotionalModule: this.emotionalModule,
                 headMovementHead: this.headMovementHead,
                 beliefNetwork: this.beliefNetwork,
                 cascadeInputLayer: this.cascadeInputLayer,
                 valueHead: this.valueHead,
                 feedbackHead: this.feedbackHead,
                 optimizer: this.optimizer,
                 integrationParam: this.integrationParam,
                 reflexivityParam: this.reflexivityParam,
                 selfState: this.selfState,
                 prevEmotions: this.prevEmotions,
             };
             const failedComponents = Object.entries(components)
                 .filter(([key, value]) => !value) // Find components that are null or falsy
                 .map(([key]) => key);

             if (failedComponents.length > 0) {
                 console.error("Failed to initialize components inside TF try block:", failedComponents);
                 throw new Error(`Agent component(s) failed initialization: ${failedComponents.join(', ')}`);
             }
             // --- End Detailed Check ---

             console.log("SyntrometricAgent V2.3 TF components initialized successfully.");

        } catch (tfError) { // Catch errors specifically from TF setup
            console.error("Error during TF model/optimizer setup in Agent:", tfError);
            displayError(`Agent TF Setup Error: ${tfError.message}`, true, 'error-message');
            // --- Cleanup only TF components on TF error ---
            this._cleanupTfMembers(); // Call specific TF cleanup
            this._set_tf_members_null(); // Nullify TF members
            // Do NOT nullify core modules here
            // The agent object will exist but TF parts will be unusable.
            return; // Stop constructor
        }

        // State Tracking initial values
        this.latestCascadeHistoryArrays = [];
        this.latestRihScore = 0;
        this.latestAffinities = [];
        // console.log("SyntrometricAgent V2.3 constructor finished."); // Less verbose log
    }

    /** Helper to nullify *only* TF-related members */
    _set_tf_members_null() {
        this.integrationParam = null; this.reflexivityParam = null; this.selfState = null;
        this.beliefNetwork = null; this.cascadeInputLayer = null; this.valueHead = null; this.feedbackHead = null;
        this.emotionalModule = null; this.headMovementHead = null; this.prevEmotions = null;
        this.optimizer = null;
        // DO NOT nullify core JS modules here:
        // this.enyphansyntrix = null; ... etc
    }

    /** Helper to dispose *only* TF-related members */
    _cleanupTfMembers() {
        if (typeof tf === 'undefined') return;
        console.log("Cleaning up Agent TF members...");
         const safeDispose = (item) => { // Local scope disposal helper
             if (!item) return;
             if (Array.isArray(item)) {
                 item.forEach(subItem => safeDispose(subItem));
             } else if (typeof item.dispose === 'function') {
                 if (item instanceof tf.LayersModel) {
                     item.weights.forEach(w => {
                         if (w.val && typeof w.val.isDisposed !== 'undefined' && !w.val.isDisposed) {
                             try { w.val.dispose(); } catch (e) { console.error("Dispose error (weight):", e, w.name); }
                         }
                     });
                 } else if (typeof item.isDisposed !== 'undefined' && !item.isDisposed) {
                     try { item.dispose(); } catch (e) { console.error("Dispose error (tensor/var):", e); }
                 }
             }
         };

         safeDispose(this.beliefNetwork?.weights);
         safeDispose(this.cascadeInputLayer?.weights);
         safeDispose(this.valueHead?.weights);
         safeDispose(this.feedbackHead?.weights);
         safeDispose(this.emotionalModule?.weights);
         safeDispose(this.headMovementHead?.weights);
         safeDispose(this.prevEmotions);
         safeDispose(this.selfState);
         safeDispose(this.integrationParam);
         safeDispose(this.reflexivityParam);
         safeDispose(this.memoryBuffer); // Disposes tensors inside the array
         this.memoryBuffer = []; // Clear array after disposing contents
         console.log("Agent TF members disposed.");
    }

    // --- TF Model Builders ---
    _buildEmotionalModel() { // ... unchanged ...
        if (typeof tf === 'undefined') return null;
        try {
            const model = tf.sequential({ name: 'emotionalModule' });
            const inputDim = Config.DIMENSIONS + Config.Agent.EMOTION_DIM + 1 + 1;
            model.add(tf.layers.dense({ units: 32, inputShape: [inputDim], activation: 'relu' }));
            model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
            model.add(tf.layers.dense({ units: Config.Agent.EMOTION_DIM, activation: 'sigmoid' }));
            // console.log("Emotional model built."); // Reduce logging
            return model;
        } catch (e) { console.error("Failed building emotional model:", e); return null; }
     }
    _buildHeadMovementModel() { // ... unchanged ...
        if (typeof tf === 'undefined') return null;
        try {
            const model = tf.sequential({ name: 'headMovementHead' });
            const inputDim = 1 + 1 + 1 + Config.Agent.EMOTION_DIM;
            model.add(tf.layers.dense({ units: 16, inputShape: [inputDim], activation: 'relu' }));
            model.add(tf.layers.dense({ units: NUM_HEAD_MOVEMENTS }));
            // console.log("Head movement model built."); // Reduce logging
            return model;
        } catch (e) { console.error("Failed building head movement model:", e); return null; }
    }

    // --- Core Methods (_updateMemory, _computeTrust, _learnParameters, _updateSelfState, process) ---
    // ... (These methods remain largely the same as the previous version with the robust checks) ...
    _updateMemory(beliefTensor) { // ... unchanged ...
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
    _computeTrust(currentBeliefEmbedding) { // ... unchanged ...
        if (typeof tf === 'undefined') return 0.5;
        if (!currentBeliefEmbedding || currentBeliefEmbedding.isDisposed || currentBeliefEmbedding.rank !== 1 || currentBeliefEmbedding.shape[0] !== BELIEF_EMBEDDING_DIM) {
            return 0.5;
        }
        if (this.memoryBuffer.length === 0) return 1.0;
        try {
            return tf.tidy(() => {
                const flatCurrent = currentBeliefEmbedding;
                const currentNorm = flatCurrent.norm();
                if (currentNorm.arraySync() < 1e-9) return 0.0;
                const similarities = this.memoryBuffer
                    .map(memTensor => {
                        if (!memTensor || memTensor.isDisposed || memTensor.rank !== 1 || memTensor.shape[0] !== BELIEF_EMBEDDING_DIM) return null;
                        const flatMem = memTensor;
                        const memNorm = flatMem.norm();
                        const normProd = currentNorm.mul(memNorm);
                        if (normProd.arraySync() < 1e-9) return tf.scalar(0);
                        return flatCurrent.dot(flatMem).div(normProd).clipByValue(-1, 1);
                    })
                    .filter(s => s !== null);
                if (similarities.length === 0) return 0.5;
                const avgSimilarity = tf.mean(tf.stack(similarities));
                const trust = avgSimilarity.add(1).div(2);
                return trust.arraySync();
            });
        } catch (e) { console.error("Error computing trust:", e); return 0.5; }
    }
    _learnParameters(trustScore, rihScore, cascadeVariance) { // ... unchanged ...
        if (typeof tf === 'undefined' || !this.integrationParam || !this.reflexivityParam || this.integrationParam.isDisposed || this.reflexivityParam.isDisposed) {
            return;
        }
        tf.tidy(() => {
            const learningRate = 0.006;
            let integrationDelta = 0.0, reflexivityDelta = 0.0;
            const rihChange = rihScore - this.lastRIH;
            const varianceChange = cascadeVariance - this.lastCascadeVariance;
            if ((rihScore > 0.7 && trustScore > 0.7) || (rihChange > 0.02 && trustScore > 0.6)) { integrationDelta += 1.0; reflexivityDelta -= 1.0; }
            else if (rihScore < 0.3 || trustScore < 0.4 || (rihChange < -0.03 && trustScore < 0.7)) { integrationDelta -= 1.0; reflexivityDelta += 1.2; }
            const highVarianceThreshold = 0.15, increasingVarianceThreshold = 0.01;
            if (cascadeVariance > highVarianceThreshold || varianceChange > increasingVarianceThreshold) { integrationDelta += 0.6 * clamp(cascadeVariance - highVarianceThreshold, 0, 1); reflexivityDelta += 0.4 * clamp(varianceChange, 0, 0.1); }
            else if (cascadeVariance < 0.02 && varianceChange <= 0) { reflexivityDelta += 0.3; }
            let currentIntegrationValue = 0.5, currentReflexivityValue = 0.5;
            try { currentIntegrationValue = this.integrationParam.dataSync()[0]; currentReflexivityValue = this.reflexivityParam.dataSync()[0]; } catch(e) { console.error("Error reading param values for decay:", e); }
            const decayFactor = 0.03;
            integrationDelta += (0.5 - currentIntegrationValue) * decayFactor; reflexivityDelta += (0.5 - currentReflexivityValue) * decayFactor;
            const newIntegration = this.integrationParam.add(tf.scalar(integrationDelta * learningRate));
            const newReflexivity = this.reflexivityParam.add(tf.scalar(reflexivityDelta * learningRate));
            this.integrationParam.assign(newIntegration.clipByValue(0.05, 0.95));
            this.reflexivityParam.assign(newReflexivity.clipByValue(0.05, 0.95));
            this.lastCascadeVariance = cascadeVariance;
        });
    }
    _updateSelfState(currentBeliefEmbedding, trustScore, integrationParamValue) { // ... unchanged ...
        if (typeof tf === 'undefined' || !this.selfState || this.selfState.isDisposed || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed) { return; }
        if (this.selfState.shape[0] !== currentBeliefEmbedding.shape[0]) {
             console.error(`Self-state update error: Dimension mismatch! Self-state (${this.selfState.shape[0]}) vs Belief (${currentBeliefEmbedding.shape[0]}).`);
             tf.dispose(this.selfState); this.selfState = tf.keep(tf.variable(tf.zeros([BELIEF_EMBEDDING_DIM]), true, 'agentSelfState')); console.warn("Self-state reset."); return;
         }
         tf.tidy(() => {
             const baseLearnRate = 0.1;
             const effectiveLearnRate = baseLearnRate * (0.5 + integrationParamValue);
             const effectiveDecay = clamp(1.0 - effectiveLearnRate, 0.85, 0.99);
             const trustFactor = tf.scalar(trustScore * effectiveLearnRate);
             const newState = this.selfState.mul(effectiveDecay).add(currentBeliefEmbedding.mul(trustFactor));
             this.selfState.assign(newState);
         });
    }

    async process(rawState, graphFeatures, environmentContext = { eventType: null, reward: 0 }) { // ... unchanged (uses robust pre-check now) ...

        // --- Rigorous Pre-Check ---
        const isTfReady = typeof tf !== 'undefined';
        const isBeliefNetValid = this.beliefNetwork && this.beliefNetwork instanceof tf.LayersModel && this.beliefNetwork.layers.length > 0;
        const isCascadeInputLayerValid = this.cascadeInputLayer && this.cascadeInputLayer instanceof tf.layers.Layer;
        const isValueHeadValid = this.valueHead && this.valueHead instanceof tf.layers.Layer;
        const isFeedbackHeadValid = this.feedbackHead && this.feedbackHead instanceof tf.layers.Layer;
        const areParamsValid = this.integrationParam && !this.integrationParam.isDisposed && this.reflexivityParam && !this.reflexivityParam.isDisposed;
        const isSelfStateValid = this.selfState && !this.selfState.isDisposed;
        const areCoreModulesValid = this.enyphansyntrix && this.strukturkondensation && this.reflexiveIntegration && this.affinitaetssyndrom;

        if (!isTfReady || !isBeliefNetValid || !isCascadeInputLayerValid || !isValueHeadValid || !isFeedbackHeadValid ||
            !areParamsValid || !isSelfStateValid || !areCoreModulesValid) {
             console.error("Agent Pre-Process Check Failed! Aborting step.", { isTfReady, isBeliefNetValid, beliefNetLayers: this.beliefNetwork?.layers?.length, isCascadeInputLayerValid, isValueHeadValid, isFeedbackHeadValid, areParamsValid, isSelfStateValid, areCoreModulesValid });
             displayError("Agent critical component invalid before processing step. Check console.", true, 'error-message');
             const defaultEmotions = tf?.zeros([1, Config.Agent.EMOTION_DIM]) || null; if (defaultEmotions) tf.keep(defaultEmotions);
             return { cascadeHistory: [], rihScore: 0, affinities: [], emotions: defaultEmotions, hmLabel: 'idle', responseText: "Error: Agent invalid.", integration: 0.5, reflexivity: 0.5, trustScore: 0.0, beliefNorm: 0, feedbackNorm: 0, selfStateNorm: 0 };
        }
        // --- End Rigorous Pre-Check ---

        let currentIntegration = 0.5, currentReflexivity = 0.5;
        try { if (!this.integrationParam.isDisposed) currentIntegration = this.integrationParam.dataSync()[0]; if (!this.reflexivityParam.isDisposed) currentReflexivity = this.reflexivityParam.dataSync()[0]; } catch (e) { console.error("Error reading agent parameters:", e); }

        let results = {}; let beliefNormValue = 0.0; let feedbackNormValue = 0.0; let currentSelfStateNorm = 0.0;

        try {
            results = tf.tidy(() => {
                if (!this.beliefNetwork || !this.cascadeInputLayer || !this.valueHead || !this.feedbackHead || !this.enyphansyntrix || !this.strukturkondensation || !this.reflexiveIntegration || !this.affinitaetssyndrom) { throw new Error("A required module or layer became invalid unexpectedly within tidy block!"); }
                let stateArray = Array.isArray(rawState) ? rawState.slice(0, Config.Agent.BASE_STATE_DIM) : zeros([Config.Agent.BASE_STATE_DIM]); while(stateArray.length < Config.Agent.BASE_STATE_DIM) stateArray.push(0);
                const coreStateTensor = tf.tensor(stateArray.slice(0, Config.DIMENSIONS)); const graphFeaturesTensor = tf.tensor(graphFeatures); const currentSelfState = this.selfState;
                const rihModulation = this.lastRIH * (currentReflexivity * 2 - 1); let modulatedInput = coreStateTensor.add(tf.scalar(rihModulation * 0.1)).clipByValue(-1, 1);
                const perturbationScale = clamp(0.005 + (1.0 - this.lastRIH) * 0.02 + currentReflexivity * 0.02, 0.001, 0.05); const perturbedInput = this.enyphansyntrix.apply(modulatedInput, perturbationScale);
                const beliefNetInput = tf.concat([ perturbedInput.reshape([1, Config.DIMENSIONS]), graphFeaturesTensor.reshape([1, NUM_GRAPH_FEATURES]), currentSelfState.reshape([1, BELIEF_EMBEDDING_DIM]) ], 1);
                if (beliefNetInput.shape[1] !== BELIEF_NETWORK_INPUT_DIM) { throw new Error(`Belief network input dim mismatch: expected ${BELIEF_NETWORK_INPUT_DIM}, got ${beliefNetInput.shape[1]}`); }
                const beliefEmbedding = this.beliefNetwork.apply(beliefNetInput).reshape([BELIEF_EMBEDDING_DIM]); const keptBeliefEmbedding = tf.keep(beliefEmbedding.clone());
                const cascadeInput = this.cascadeInputLayer.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([CASCADE_INPUT_DIM]); const cascadeHistoryTensors = this.strukturkondensation.process(cascadeInput); const cascadeHistoryArrays = cascadeHistoryTensors.map(t => t.arraySync()); const lastCascadeLevelTensor = cascadeHistoryTensors.length > 0 ? cascadeHistoryTensors[cascadeHistoryTensors.length - 1] : tf.tensor([]);
                const currentRihScore = this.reflexiveIntegration.compute(lastCascadeLevelTensor); const currentAffinities = [];
                if (cascadeHistoryTensors.length > 1) { for (let i = 0; i < cascadeHistoryTensors.length - 1; i++) { if (cascadeHistoryTensors[i]?.shape[0] > 0 && cascadeHistoryTensors[i+1]?.shape[0] > 0 && !cascadeHistoryTensors[i].isDisposed && !cascadeHistoryTensors[i+1].isDisposed) { try { const affinity = this.affinitaetssyndrom.compute(cascadeHistoryTensors[i], cascadeHistoryTensors[i+1]); currentAffinities.push(affinity); } catch (affError) { console.error(`Affinity Error L${i}: ${affError}`); currentAffinities.push(0); } } else { currentAffinities.push(0); } } }
                const currentAvgAffinity = currentAffinities.length > 0 ? currentAffinities.reduce((a, b) => a + b, 0) / currentAffinities.length : 0;
                const currentTrustScore = this._computeTrust(beliefEmbedding);
                let varFinal = 0.0, meanFinal = 0.0; if (lastCascadeLevelTensor.size > 1) { const moments = tf.moments(lastCascadeLevelTensor); varFinal = moments.variance.arraySync(); meanFinal = moments.mean.arraySync(); } else if (lastCascadeLevelTensor.size === 1) { meanFinal = lastCascadeLevelTensor.arraySync()[0]; } const cascadeFeatures = [clamp(varFinal, 0, 10), clamp(meanFinal, -10, 10)];
                const valuePred = this.valueHead.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([]); const feedbackSignalRaw = this.feedbackHead.apply(beliefEmbedding.reshape([1, BELIEF_EMBEDDING_DIM])).reshape([Config.DIMENSIONS]); const feedbackSignal = feedbackSignalRaw;
                return { keptBeliefEmbedding, cascadeHistoryTensors, cascadeHistoryArrays, lastCascadeLevelTensor: tf.keep(lastCascadeLevelTensor.clone()), currentRihScore: currentRihScore ?? 0, currentAffinities: currentAffinities, currentAvgAffinity: currentAvgAffinity ?? 0, currentTrustScore: currentTrustScore ?? 0.5, cascadeFeatures: cascadeFeatures, valuePred: tf.keep(valuePred.clone()), feedbackSignal: tf.keep(feedbackSignal.clone()) };
            });
        } catch (e) {
             console.error("Error during agent core processing (tidy block):", e); displayError(`Agent Processing Error: ${e.message}`, false, 'error-message');
             results = { keptBeliefEmbedding: null, cascadeHistoryTensors: [], lastCascadeLevelTensor: null, cascadeHistoryArrays:[], currentRihScore: this.lastRIH, currentAffinities: [], currentAvgAffinity: 0, currentTrustScore: this.latestTrustScore, cascadeFeatures: [this.lastCascadeVariance, 0], valuePred: tf.scalar(0), feedbackSignal: tf.zeros([Config.DIMENSIONS]) };
             tf.keep(results.valuePred); tf.keep(results.feedbackSignal);
        }

        this.latestRihScore = results.currentRihScore; this.latestAffinities = results.currentAffinities; this.latestTrustScore = results.currentTrustScore;
        beliefNormValue = results.keptBeliefEmbedding && !results.keptBeliefEmbedding.isDisposed ? results.keptBeliefEmbedding.norm().arraySync() : 0;
        feedbackNormValue = results.feedbackSignal && !results.feedbackSignal.isDisposed ? results.feedbackSignal.norm().arraySync() : 0;
        if (results.keptBeliefEmbedding && !results.keptBeliefEmbedding.isDisposed) { this._updateMemory(results.keptBeliefEmbedding); this._updateSelfState(results.keptBeliefEmbedding, results.currentTrustScore, currentIntegration); }
        if (this.selfState && !this.selfState.isDisposed) { currentSelfStateNorm = this.selfState.norm().arraySync(); } else { currentSelfStateNorm = 0.0; }
        this._learnParameters(results.currentTrustScore, results.currentRihScore, results.cascadeFeatures[0]);
        this.lastRIH = results.currentRihScore;

        let currentEmotions = this.prevEmotions; // ... Emotion logic unchanged ...
        try { if (this.emotionalModule && this.prevEmotions && !this.prevEmotions.isDisposed) { const coreStateForEmotion = (Array.isArray(rawState) ? rawState : zeros([Config.Agent.BASE_STATE_DIM])).slice(0, Config.DIMENSIONS); while(coreStateForEmotion.length < Config.DIMENSIONS) coreStateForEmotion.push(0); const emotionPrediction = await tf.tidy(() => { const stateTensor = tf.tensor(coreStateForEmotion, [1, Config.DIMENSIONS]); const rewardTensor = tf.tensor([[environmentContext.reward || 0]], [1, 1]); const contextSignal = tf.tensor([[environmentContext.eventType ? 1 : 0]], [1, 1]); const input = tf.concat([stateTensor, this.prevEmotions, rewardTensor, contextSignal], 1); const predictedEmotions = this.emotionalModule.predict(input); const decayScalar = tf.scalar(EMOTIONAL_DECAY_RATE); const blendedEmotions = this.prevEmotions.mul(decayScalar) .add(predictedEmotions.mul(tf.scalar(1.0).sub(decayScalar))) .clipByValue(0, 1); return blendedEmotions; }); tf.dispose(this.prevEmotions); this.prevEmotions = tf.keep(emotionPrediction); currentEmotions = this.prevEmotions; } else { console.warn("Emotional model or prevEmotions invalid. Applying decay only."); if (!this.prevEmotions || this.prevEmotions.isDisposed) { this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); } const decayedEmotions = tf.tidy(() => this.prevEmotions.mul(EMOTIONAL_DECAY_RATE).clipByValue(0,1)); tf.dispose(this.prevEmotions); this.prevEmotions = tf.keep(decayedEmotions); currentEmotions = this.prevEmotions; } } catch (e) { displayError(`TF Error during emotion prediction: ${e.message}`, false, 'error-message'); if (!this.prevEmotions || this.prevEmotions.isDisposed) { this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); } currentEmotions = this.prevEmotions; }

        let hmLabel = "idle"; let dominantEmotionName = 'Unknown'; // ... Head Movement logic unchanged ...
        try { if (this.headMovementHead && currentEmotions && !currentEmotions.isDisposed) { const emotionArray = currentEmotions.arraySync()[0]; const dominantEmotionIndex = emotionArray.length > 0 ? emotionArray.indexOf(Math.max(...emotionArray)) : -1; dominantEmotionName = emotionNames[dominantEmotionIndex] || 'Unknown'; if (dominantEmotionIndex !== -1) { const hmLogits = tf.tidy(() => { const rihTensor = tf.tensor([[this.latestRihScore]], [1, 1]); const avgAffinityTensor = tf.tensor([[results.currentAvgAffinity ?? 0]], [1, 1]); const dominantEmotionTensor = tf.tensor([[dominantEmotionIndex]], [1, 1]); const emotionTensorInput = currentEmotions.reshape([1, Config.Agent.EMOTION_DIM]); const input = tf.concat([rihTensor, avgAffinityTensor, dominantEmotionTensor, emotionTensorInput], 1); return this.headMovementHead.predict(input); }); if (hmLogits) { const hmIdx = hmLogits.argMax(1).arraySync()[0]; hmLabel = HEAD_MOVEMENT_LABELS[hmIdx] || "idle"; tf.dispose(hmLogits); } } } else { if (this.latestRihScore > 0.7) hmLabel = "nod"; else if ((results.currentAvgAffinity ?? 0) < 0.2) hmLabel = "shake"; else hmLabel = "idle"; if (currentEmotions && !currentEmotions.isDisposed){ const emotionArrayFallback = currentEmotions.arraySync()[0]; const domIdxFallback = emotionArrayFallback.length > 0 ? emotionArrayFallback.indexOf(Math.max(...emotionArrayFallback)) : -1; dominantEmotionName = emotionNames[domIdxFallback] || 'Unknown'; } } } catch (e) { displayError(`TF Error during head movement prediction: ${e.message}`, false, 'error-message'); hmLabel = "idle"; }

        if (results.keptBeliefEmbedding && !results.keptBeliefEmbedding.isDisposed) tf.dispose(results.keptBeliefEmbedding); // Dispose kept tensors
        if (results.lastCascadeLevelTensor && !results.lastCascadeLevelTensor.isDisposed) tf.dispose(results.lastCascadeLevelTensor);
        if (results.valuePred && !results.valuePred.isDisposed) tf.dispose(results.valuePred);
        if (results.feedbackSignal && !results.feedbackSignal.isDisposed) tf.dispose(results.feedbackSignal);
        results.cascadeHistoryTensors?.forEach(t => { if (t && !t.isDisposed) tf.dispose(t); });

        const rihText = (this.latestRihScore ?? 0).toFixed(2); const affText = (results.currentAvgAffinity ?? 0).toFixed(2); const trustText = (this.latestTrustScore ?? 0).toFixed(2); const intText = (currentIntegration ?? 0.5).toFixed(2); const refText = (currentReflexivity ?? 0.5).toFixed(2); const cascadeVarText = (results.cascadeFeatures[0] ?? 0).toFixed(2); const responseText = `V2.3 R:${rihText} A:${affText} T:${trustText} CV:${cascadeVarText} I:${intText} Ψ:${refText}. Mood:${dominantEmotionName}. Action:${hmLabel}.`;

        return { cascadeHistory: results.cascadeHistoryArrays || [], rihScore: this.latestRihScore ?? 0, affinities: this.latestAffinities || [], emotions: currentEmotions, hmLabel: hmLabel, responseText: responseText, trustScore: this.latestTrustScore ?? 0.5, integration: currentIntegration ?? 0.5, reflexivity: currentReflexivity ?? 0.5, beliefNorm: beliefNormValue, feedbackNorm: feedbackNormValue, selfStateNorm: currentSelfStateNorm };
    }

    // --- State Management & Cleanup ---
    getState() { // ... Unchanged from previous version ...
         if(typeof tf === 'undefined') return {}; const memoryArrays = this.memoryBuffer.map(tensor => tensor && !tensor.isDisposed ? tensor.arraySync() : []); const prevEmotionsArray = this.prevEmotions && !this.prevEmotions.isDisposed ? this.prevEmotions.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]); let selfStateArray = zeros([BELIEF_EMBEDDING_DIM]); try { if (this.selfState && !this.selfState.isDisposed) selfStateArray = Array.from(this.selfState.dataSync()); } catch (e) { console.error("Error getting selfState in getState:", e); } const integrationVal = this.integrationParam && !this.integrationParam.isDisposed ? this.integrationParam.dataSync()[0] : 0.5; const reflexivityVal = this.reflexivityParam && !this.reflexivityParam.isDisposed ? this.reflexivityParam.dataSync()[0] : 0.5; const getWeightsSafe = (model) => { if (!model) return []; try { return model.getWeights().map(w => w.arraySync()); } catch (e) { console.error(`Error getting weights for ${model.name}:`, e); return []; } }; return { version: "2.3.1", prevEmotions: prevEmotionsArray, memoryBuffer: memoryArrays, lastRIH: this.lastRIH, lastCascadeVariance: this.lastCascadeVariance, latestTrustScore: this.latestTrustScore, integrationParam: integrationVal, reflexivityParam: reflexivityVal, selfState: selfStateArray, beliefNetworkWeights: getWeightsSafe(this.beliefNetwork), cascadeInputLayerWeights: getWeightsSafe(this.cascadeInputLayer), valueHeadWeights: getWeightsSafe(this.valueHead), feedbackHeadWeights: getWeightsSafe(this.feedbackHead), };
    }

    loadState(state) { // ... Unchanged from previous version (calls cleanup and _reinitializeTfComponents) ...
        if (!state || typeof state !== 'object' || typeof tf === 'undefined') return; console.log("Loading agent state V2.3..."); if (state.version !== "2.3.1") { console.warn(`Loading state from different version (${state.version}). Compatibility not guaranteed.`); }
        this.cleanup(); this.memoryBuffer = []; // Ensure clear state
        try {
            this.enyphansyntrix = new Enyphansyntrix('continuous'); this.affinitaetssyndrom = new Affinitaetssyndrom(); this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2); this.reflexiveIntegration = new ReflexiveIntegration();
            this._reinitializeTfComponents();
            const prevEmotionsArray = Array.isArray(state.prevEmotions) ? state.prevEmotions : zeros([Config.Agent.EMOTION_DIM]); this.prevEmotions.assign(tf.tensor([prevEmotionsArray], [1, Config.Agent.EMOTION_DIM]));
            if (Array.isArray(state.memoryBuffer)) { state.memoryBuffer.forEach(memArray => { if (Array.isArray(memArray) && memArray.length === BELIEF_EMBEDDING_DIM) { try { this.memoryBuffer.push(tf.keep(tf.tensor(memArray, [BELIEF_EMBEDDING_DIM]))); } catch(e) { console.warn("Error creating tensor from memory buffer array on load.", e); } } else { console.warn(`Skipping invalid memory item during load: length ${memArray?.length}, expected ${BELIEF_EMBEDDING_DIM}`); } }); while (this.memoryBuffer.length > this.memorySize) { tf.dispose(this.memoryBuffer.shift()); } console.log(`Loaded ${this.memoryBuffer.length} items into memory buffer.`); } else { console.warn("Memory buffer missing or invalid in saved state.");}
            this.lastRIH = typeof state.lastRIH === 'number' ? state.lastRIH : 0.0; this.lastCascadeVariance = typeof state.lastCascadeVariance === 'number' ? state.lastCascadeVariance : 0.0; this.latestTrustScore = typeof state.latestTrustScore === 'number' ? state.latestTrustScore : 1.0;
            const integrationVal = typeof state.integrationParam === 'number' ? state.integrationParam : 0.5; const reflexivityVal = typeof state.reflexivityParam === 'number' ? state.reflexivityParam : 0.5; this.integrationParam.assign(tf.scalar(integrationVal)); this.reflexivityParam.assign(tf.scalar(reflexivityVal));
            const selfStateArray = Array.isArray(state.selfState) ? state.selfState : zeros([BELIEF_EMBEDDING_DIM]); if (selfStateArray.length === BELIEF_EMBEDDING_DIM) { this.selfState.assign(tf.tensor(selfStateArray, [BELIEF_EMBEDDING_DIM])); } else { console.warn(`Self-state dim mismatch on load (${selfStateArray.length} vs ${BELIEF_EMBEDDING_DIM}). Keeping reset state.`); }
            console.log("Loading network weights..."); const loadWeightsSafe = (model, weightsData) => { if (model && weightsData && Array.isArray(weightsData)) { try { if (weightsData.length === model.weights.length) { model.setWeights(weightsData.map(w => tf.tensor(w))); console.log(`Weights loaded for ${model.name}.`); } else { console.warn(`Weight mismatch loading ${model.name}. Expected ${model.weights.length}, got ${weightsData?.length}. Skipping.`); } } catch (loadErr) { console.error(`Error setting weights for ${model.name}:`, loadErr); displayError(`Error loading weights for ${model.name}: ${loadErr.message}`, false); } } else if (model && !weightsData) { console.warn(`No weights data found for ${model.name} in saved state. Using initialized weights.`); } else if (!model) { console.warn("Attempted to load weights for a non-existent model."); } };
            loadWeightsSafe(this.beliefNetwork, state.beliefNetworkWeights); loadWeightsSafe(this.cascadeInputLayer, state.cascadeInputLayerWeights); loadWeightsSafe(this.valueHead, state.valueHeadWeights); loadWeightsSafe(this.feedbackHead, state.feedbackHeadWeights);
            this.latestCascadeHistoryArrays = []; this.latestRihScore = this.lastRIH; this.latestAffinities = []; console.log("Agent state loaded (V2.3).");
        } catch(loadError) {
            console.error("CRITICAL ERROR during agent state loading:", loadError); displayError(`Agent Load Error: ${loadError.message}. Resetting agent state.`, true); this.cleanup(); console.warn("Agent reset due to loading error."); this._set_tf_members_null(); this.memoryBuffer = []; this.lastRIH = 0.0; this.lastCascadeVariance = 0.0; this.latestTrustScore = 1.0; this.latestCascadeHistoryArrays = []; this.latestRihScore = 0; this.latestAffinities = []; try { this.enyphansyntrix = new Enyphansyntrix('continuous'); this.affinitaetssyndrom = new Affinitaetssyndrom(); this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2); this.reflexiveIntegration = new ReflexiveIntegration(); this._reinitializeTfComponents(); } catch(reinitError) { console.error("Failed to re-initialize agent after load error:", reinitError); }
        }
    }

    _reinitializeTfComponents() { // ... Unchanged from previous version ...
         if (typeof tf === 'undefined') return; console.log("Attempting to re-initialize TF components..."); this.cleanup();
         try { this.integrationParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentIntegrationParam')); this.reflexivityParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentReflexivityParam')); this.beliefNetwork = tf.sequential({ name: 'beliefNetwork'}); this.beliefNetwork.add(tf.layers.dense({ units: BELIEF_EMBEDDING_DIM, inputShape: [BELIEF_NETWORK_INPUT_DIM], activation: 'relu' })); this.beliefNetwork.add(tf.layers.dense({ units: BELIEF_EMBEDDING_DIM, activation: 'tanh' })); this.cascadeInputLayer = tf.layers.dense({ units: CASCADE_INPUT_DIM, inputShape: [BELIEF_EMBEDDING_DIM], activation: 'tanh', name:'cascadeInputLayer' }); this.valueHead = tf.layers.dense({ units: 1, inputShape: [BELIEF_EMBEDDING_DIM], name: 'valueHead'}); this.feedbackHead = tf.layers.dense({ units: Config.DIMENSIONS, inputShape: [BELIEF_EMBEDDING_DIM], name: 'feedbackHead'}); this.selfState = tf.keep(tf.variable(tf.zeros([BELIEF_EMBEDDING_DIM]), true, 'agentSelfState')); this.emotionalModule = this._buildEmotionalModel(); this.headMovementHead = this._buildHeadMovementModel(); this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); const learningRate = Config?.RL?.LR ?? 0.001; this.optimizer = tf.train.adam(learningRate); console.log("TF components re-initialized successfully."); } catch (e) { console.error("Error during TF component re-initialization:", e); displayError("Failed to recover agent state after load error.", true); this.cleanup(); this._set_tf_members_null(); }
     }

    /** Cleans up ALL agent resources, TF and core modules */
     cleanup() {
         console.log("Cleaning up ALL Agent resources (V2.3)...");
         // Cleanup TF members first
         this._cleanupTfMembers();
         // Nullify TF members
         this._set_tf_members_null();
         // Nullify core modules (safe to do now)
         this.enyphansyntrix = null;
         this.affinitaetssyndrom = null;
         this.strukturkondensation = null;
         this.reflexiveIntegration = null;
         console.log("Agent full cleanup complete.");
     }

} // End of SyntrometricAgent class
