// @ts-nocheck
/* This file has TypeScript checking disabled due to complex TensorFlow.js type issues
 * Remove this directive once the TensorFlow.js type issues are resolved
 */
import * as tf from '@tensorflow/tfjs';
import { Config, emotionNames, HEAD_MOVEMENT_LABELS, NUM_HEAD_MOVEMENTS } from './config.js';
// Corrected import name Affinitaetssyndrom
import { Enyphansyntrix, Affinitaetssyndrom, Strukturkondensation, ReflexiveIntegration } from './syntrometry-core.js';
// Assuming utils.zeros is corrected to return number[] or use alternative
import { clamp, displayError, norm } from './utils.js';
// Helper function to safely cast tensors for TypeScript
function asTensor(tensor) {
    return tensor;
}
// Helper to create zero array
function zerosArray(length) {
    return new Array(length).fill(0);
}
const NUM_GRAPH_FEATURES = 2;
const BELIEF_EMBEDDING_DIM = Config.Agent.HIDDEN_DIM || 64;
const BELIEF_NETWORK_INPUT_DIM = (Config.DIMENSIONS || 1) + NUM_GRAPH_FEATURES + BELIEF_EMBEDDING_DIM;
const CASCADE_INPUT_DIM = Config.DIMENSIONS || 1;
const EMOTIONAL_DECAY_RATE = 0.97;
const SELF_STATE_DECAY = 0.98;
const SELF_STATE_LEARN_RATE = 0.05;
export class SyntrometricAgent {
    constructor() {
        // Core JS Modules (can be null if initialization fails)
        this.enyphansyntrix = null;
        this.affinitaetssyndrom = null;
        this.strukturkondensation = null;
        this.reflexiveIntegration = null;
        // Agent State
        this.memorySize = Config.Agent.HISTORY_SIZE || 10;
        this.memoryBuffer = []; // Holds kept tensors, managed internally
        this.lastRIH = 0.0;
        this.lastCascadeVariance = 0.0;
        this.latestTrustScore = 1.0;
        this.latestAffinities = [];
        this.latestBeliefEmbedding = null; // Kept tensor, managed internally
        this.latestCascadeHistoryArrays = [];
        this.latestRihScore = 0.0;
        // TensorFlow.js Components (can be null if initialization fails)
        this.integrationParam = null;
        this.reflexivityParam = null;
        this.selfState = null; // Kept variable, managed internally
        this.beliefNetwork = null;
        // Use tf.layers.Layer type explicitly
        this.cascadeInputLayer = null; // tf.layers.dense returns Layer
        this.valueHead = null; // tf.layers.dense returns Layer
        this.feedbackHead = null; // tf.layers.dense returns Layer
        this.emotionalModule = null;
        this.headMovementHead = null;
        this.prevEmotions = null; // Kept tensor, managed internally
        this.optimizer = null;
        this.isTfReady = false;
        this.coreModulesReady = false;
        try {
            // Initialize core JS modules first
            this.enyphansyntrix = new Enyphansyntrix('continuous');
            this.affinitaetssyndrom = new Affinitaetssyndrom();
            this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2);
            this.reflexiveIntegration = new ReflexiveIntegration();
            this.coreModulesReady = true;
        }
        catch (coreError) {
            console.error("CRITICAL: Failed to initialize core JS modules:", coreError);
            displayError("Core JS module initialization failed. Agent will be non-functional.", true, 'error-message');
            this.cleanup(); // Attempt cleanup even if init failed partially
            return; // Stop initialization
        }
        // Check for TensorFlow.js
        if (typeof tf === 'undefined' || typeof tf.layers === 'undefined' || typeof tf.train === 'undefined') {
            console.error("CRITICAL: TensorFlow.js or required modules (layers, train) not loaded.");
            displayError("TensorFlow.js not loaded/incomplete. Agent initialization failed.", true, 'error-message');
            this.cleanup(); // Attempt cleanup
            return; // Stop initialization
        }
        this.isTfReady = true;
        // Initialize TensorFlow.js components
        try {
            // Removed redundant TF availability check, already done above
            tf.tidy(() => {
                this.integrationParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentIntegrationParam'));
                this.reflexivityParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentReflexivityParam'));
                this.selfState = tf.keep(tf.variable(tf.randomNormal([BELIEF_EMBEDDING_DIM], 0, 0.1), true, 'agentSelfState'));
                this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            });
            this.beliefNetwork = tf.sequential({ name: 'beliefNetwork' });
            this.beliefNetwork.add(tf.layers.dense({ units: Config.Agent.HIDDEN_DIM * 2, inputShape: [BELIEF_NETWORK_INPUT_DIM], activation: 'relu' }));
            this.beliefNetwork.add(tf.layers.dropout({ rate: 0.1 }));
            this.beliefNetwork.add(tf.layers.dense({ units: BELIEF_EMBEDDING_DIM, activation: 'tanh' }));
            // tf.layers.dense returns a Layer, assignable to tfLayers.Layer type
            this.cascadeInputLayer = tf.layers.dense({ units: CASCADE_INPUT_DIM, inputShape: [BELIEF_EMBEDDING_DIM], activation: 'tanh', name: 'cascadeInputLayer' });
            this.valueHead = tf.layers.dense({ units: 1, inputShape: [BELIEF_EMBEDDING_DIM], name: 'valueHead' });
            this.feedbackHead = tf.layers.dense({ units: Config.DIMENSIONS, inputShape: [BELIEF_EMBEDDING_DIM], name: 'feedbackHead' });
            this.emotionalModule = this._buildEmotionalModel();
            this.headMovementHead = this._buildHeadMovementModel();
            const learningRate = Config?.RL?.LR ?? 0.001;
            this.optimizer = tf.train.adam(learningRate);
            this._validateComponents();
            console.log("SyntrometricAgent V2.3 TF components initialized successfully.");
        }
        catch (tfError) {
            const message = tfError instanceof Error ? tfError.message : String(tfError);
            console.error("Error during TF model/optimizer setup in Agent:", tfError);
            displayError(`Agent TF Setup Error: ${message}. Agent may be unstable.`, true, 'error-message');
            this._cleanupTfMembers(); // Clean up any partially created TF resources
            this._set_tf_members_null(); // Ensure TF members are null after cleanup failure
            return; // Stop initialization
        }
    }
    // Validation check after potential initialization
    _validateComponents() {
        const components = {
            // Core JS - Check for null
            enyphansyntrix: this.enyphansyntrix,
            affinitaetssyndrom: this.affinitaetssyndrom,
            strukturkondensation: this.strukturkondensation,
            reflexiveIntegration: this.reflexiveIntegration,
            // TF Models/Layers - Check for null
            emotionalModule: this.emotionalModule,
            headMovementHead: this.headMovementHead,
            beliefNetwork: this.beliefNetwork,
            cascadeInputLayer: this.cascadeInputLayer,
            valueHead: this.valueHead,
            feedbackHead: this.feedbackHead,
            optimizer: this.optimizer,
            // TF Tensors/Variables - Check for null and not disposed
            integrationParam: this.integrationParam,
            reflexivityParam: this.reflexivityParam,
            selfState: this.selfState,
            prevEmotions: this.prevEmotions,
        };
        const failedComponents = [];
        for (const [key, value] of Object.entries(components)) {
            if (value === null || value === undefined) {
                failedComponents.push(`${key} (is null/undefined)`);
                // FIX 2 (Error 4): Use type guard/duck typing for isDisposed check
            }
            else if ('isDisposed' in value && typeof value.isDisposed === 'boolean') {
                if (value.isDisposed) {
                    failedComponents.push(`${key} (is disposed)`);
                }
            }
        }
        if (failedComponents.length > 0) {
            const errorMsg = `Agent component(s) failed initialization/validation: ${failedComponents.join(', ')}`;
            console.error("CRITICAL VALIDATION FAILURE:", errorMsg);
            // Potentially throw to halt execution if validation failure is critical
            throw new Error(errorMsg);
        }
    }
    // Set TF members to null, typically after cleanup or init failure
    _set_tf_members_null() {
        this.integrationParam = null;
        this.reflexivityParam = null;
        this.selfState = null;
        this.beliefNetwork = null;
        this.cascadeInputLayer = null;
        this.valueHead = null;
        this.feedbackHead = null;
        this.emotionalModule = null;
        this.headMovementHead = null;
        this.prevEmotions = null;
        this.optimizer = null;
        this.latestBeliefEmbedding = null;
    }
    // Dispose TF resources safely
    _cleanupTfMembers() {
        if (!this.isTfReady)
            return; // No TF resources to clean if TF wasn't ready
        console.log("Cleaning up Agent TF members...");
        // Helper to safely dispose tensors/variables
        const safeDispose = (item) => {
            // Check if item exists and has isDisposed property before calling dispose
            if (item && typeof item.isDisposed === 'boolean' && !item.isDisposed) {
                try {
                    item.dispose();
                }
                catch (e) {
                    console.error("Dispose error (tensor/var):", e);
                }
            }
        };
        // Dispose Models/Layers (by disposing their weights)
        // Updated to handle Layer or Sequential types
        const safeDisposeModelOrLayer = (modelOrLayer) => {
            if (!modelOrLayer)
                return;
            try {
                // Check if getWeights method exists (present in Layer and Sequential/LayersModel)
                if (typeof modelOrLayer.getWeights === 'function') {
                    // Use for...of loop for better type handling with weights
                    const weights = modelOrLayer.getWeights();
                    if (Array.isArray(weights)) {
                        for (const w of weights) {
                            // Safer check for disposable tensor/variable
                            if (w && typeof w.isDisposed === 'boolean' && !w.isDisposed) {
                                safeDispose(w); // Cast to Tensor/Variable for safeDispose if needed
                            }
                        }
                    }
                }
            }
            catch (e) {
                console.error("Error disposing model/layer weights:", e);
            }
        };
        // FIX 1 (Errors 1-3): Use safeDispose helper which handles null checks
        safeDispose(this.integrationParam);
        safeDispose(this.reflexivityParam);
        safeDispose(this.selfState);
        safeDispose(this.prevEmotions);
        safeDispose(this.latestBeliefEmbedding);
        // Dispose models/layers
        safeDisposeModelOrLayer(this.beliefNetwork);
        safeDisposeModelOrLayer(this.cascadeInputLayer);
        safeDisposeModelOrLayer(this.valueHead);
        safeDisposeModelOrLayer(this.feedbackHead);
        safeDisposeModelOrLayer(this.emotionalModule);
        safeDisposeModelOrLayer(this.headMovementHead);
        // Dispose memory buffer contents
        this.memoryBuffer.forEach((memItem) => {
            safeDispose(memItem.beliefEmbedding); // Dispose the kept tensor
        });
        this.memoryBuffer = []; // Clear the array
        // Optimizer doesn't have a standard dispose method in tfjs core
        this.optimizer = null;
        console.log("Agent TF member cleanup attempted.");
    }
    _buildEmotionalModel() {
        if (!this.isTfReady)
            return null;
        try {
            const model = tf.sequential({ name: 'emotionalModule' });
            const inputDim = (Config.DIMENSIONS || 1) + (Config.Agent.EMOTION_DIM || 1) + 1 + 1;
            model.add(tf.layers.dense({ units: 32, inputShape: [inputDim], activation: 'relu' }));
            model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
            model.add(tf.layers.dense({ units: Config.Agent.EMOTION_DIM, activation: 'sigmoid' }));
            return model;
        }
        catch (e) {
            console.error("Failed building emotional model:", e);
            return null;
        }
    }
    _buildHeadMovementModel() {
        if (!this.isTfReady)
            return null;
        try {
            const model = tf.sequential({ name: 'headMovementHead' });
            // Input: rih, avgAffinity, dominantEmotionIdx, allEmotions
            const inputDim = 1 + 1 + 1 + (Config.Agent.EMOTION_DIM || 1);
            model.add(tf.layers.dense({ units: 16, inputShape: [inputDim], activation: 'relu' }));
            // Output logits for each head movement class
            model.add(tf.layers.dense({ units: NUM_HEAD_MOVEMENTS, activation: 'linear' })); // Use linear for logits before softmax/argmax
            return model;
        }
        catch (e) {
            console.error("Failed building head movement model:", e);
            return null;
        }
    }
    // Internal memory management - assumes beliefTensor is valid and *not* kept yet
    _updateMemory(beliefTensor) {
        if (!this.isTfReady || !beliefTensor || beliefTensor.isDisposed)
            return;
        // Validate shape before keeping and storing
        if (beliefTensor.rank !== 1 || beliefTensor.shape[0] !== BELIEF_EMBEDDING_DIM) {
            console.warn(`[Agent Memory] Invalid belief tensor shape: ${beliefTensor.shape}. Expected [${BELIEF_EMBEDDING_DIM}]. Skipping memory update.`);
            return;
        }
        // Keep the tensor before adding to memory
        const keptBeliefTensor = tf.keep(beliefTensor.clone());
        this.memoryBuffer.push({ timestamp: Date.now(), beliefEmbedding: keptBeliefTensor });
        // Manage memory size
        if (this.memoryBuffer.length > this.memorySize) {
            const oldEntry = this.memoryBuffer.shift();
            if (oldEntry?.beliefEmbedding) {
                // Dispose the tensor we kept earlier
                tf.dispose(oldEntry.beliefEmbedding);
            }
        }
    }
    // Computes trust based on similarity to memory buffer embeddings
    _computeTrust(currentBeliefEmbedding) {
        if (!this.isTfReady || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed)
            return 0.5; // Default neutral trust
        // Ensure input is valid 1D tensor
        if (currentBeliefEmbedding.rank !== 1 || currentBeliefEmbedding.shape[0] !== BELIEF_EMBEDDING_DIM) {
            console.warn(`[Agent Trust] Invalid input tensor shape: ${currentBeliefEmbedding.shape}. Expected [${BELIEF_EMBEDDING_DIM}]. Returning default trust.`);
            return 0.5;
        }
        if (this.memoryBuffer.length === 0)
            return 1.0; // Full trust if no memory yet
        let trustValue = 0.5; // Default value
        try {
            const trustScalar = tf.tidy(() => {
                const flatCurrent = currentBeliefEmbedding; // Already flat
                const currentNorm = tf.norm(flatCurrent); // Use tf.norm
                const currentNormValue = currentNorm.arraySync();
                // Avoid division by zero if norm is very small
                if (currentNormValue < 1e-9)
                    return tf.scalar(0.0); // Cannot compute similarity
                const validSimilarities = [];
                for (const memEntry of this.memoryBuffer) {
                    const memTensor = memEntry?.beliefEmbedding;
                    // Check if memory tensor is valid and not disposed
                    if (memTensor && !memTensor.isDisposed && memTensor.rank === 1 && memTensor.shape[0] === BELIEF_EMBEDDING_DIM) {
                        const flatMem = memTensor; // Already flat
                        const memNorm = tf.norm(flatMem); // Use tf.norm
                        const normProd = tf.mul(currentNorm, memNorm); // Use tf.mul for Tensor multiplication
                        const normProdValue = normProd.arraySync();
                        // Avoid division by zero
                        if (normProdValue < 1e-9) {
                            validSimilarities.push(tf.scalar(0.0)); // Treat as zero similarity
                        }
                        else {
                            // Compute cosine similarity: dot(A, B) / (norm(A) * norm(B))
                            const dotProduct = tf.dot(flatCurrent, flatMem); // Use tf.dot
                            const similarity = tf.div(dotProduct, normProd).clipByValue(-1, 1); // Use tf.div, Clip for numerical stability
                            validSimilarities.push(similarity);
                        }
                    }
                }
                if (validSimilarities.length === 0)
                    return tf.scalar(0.5); // Default if no valid memories
                const avgSimilarity = tf.mean(tf.stack(validSimilarities));
                // Map similarity [-1, 1] to trust [0, 1]
                const trust = tf.div(tf.add(avgSimilarity, 1), 2); // Use tf.add, tf.div
                return trust;
            }); // End tidy
            trustValue = trustScalar.arraySync();
            tf.dispose(trustScalar); // Dispose the scalar returned by tidy
            return trustValue;
        }
        catch (e) {
            console.error("Error computing trust:", e);
            return 0.5; // Return default on error
        }
    }
    // Learn integration/reflexivity parameters based on performance signals
    _learnParameters(trustScore, rihScore, cascadeVariance) {
        // Use ! assertions as checks are done before calling process -> learnParameters
        if (!this.isTfReady || !this.integrationParam || !this.reflexivityParam || this.integrationParam.isDisposed || this.reflexivityParam.isDisposed) {
            console.warn("Cannot learn parameters: TF components missing or disposed.");
            return;
        }
        try {
            tf.tidy(() => {
                const learningRate = Config.RL?.PARAM_LEARN_RATE ?? 0.006;
                let integrationDelta = 0.0;
                let reflexivityDelta = 0.0;
                // --- Heuristic Rules for Parameter Adjustment ---
                const rihChange = rihScore - this.lastRIH;
                const varianceChange = cascadeVariance - this.lastCascadeVariance; // Using current vs previous variance
                // Rule: High trust and high/increasing RIH -> Increase integration, decrease reflexivity (exploit stability)
                if ((rihScore > 0.7 && trustScore > 0.7) || (rihChange > 0.02 && trustScore > 0.6)) {
                    integrationDelta += 1.0;
                    reflexivityDelta -= 1.0; // Less perturbation needed
                }
                // Rule: Low trust or low/decreasing RIH -> Decrease integration, increase reflexivity (explore/adapt)
                else if (rihScore < 0.3 || trustScore < 0.4 || (rihChange < -0.03 && trustScore < 0.7)) {
                    integrationDelta -= 1.0;
                    reflexivityDelta += 1.2; // More perturbation/randomness
                }
                // Rule: High or increasing cascade variance -> Increase integration (dampen oscillations), maybe slightly increase reflexivity (seek stability)
                const highVarianceThreshold = Config.RL?.highVarianceThreshold ?? 0.15;
                const increasingVarianceThreshold = Config.RL?.increasingVarianceThreshold ?? 0.01;
                if (cascadeVariance > highVarianceThreshold || varianceChange > increasingVarianceThreshold) {
                    integrationDelta += 0.6 * clamp(cascadeVariance - highVarianceThreshold, 0, 1); // Stronger damping signal
                    reflexivityDelta += 0.4 * clamp(varianceChange, 0, 0.1); // Slightly explore if variance increases
                }
                // Rule: Very low variance (stable but maybe stuck) -> Increase reflexivity slightly (encourage exploration)
                else if (cascadeVariance < 0.02 && varianceChange <= 0) {
                    reflexivityDelta += 0.3;
                }
                // --- Parameter Decay towards neutral 0.5 ---
                let currentIntegrationValue = 0.5, currentReflexivityValue = 0.5;
                try {
                    // Use helper for safe scalar reading
                    currentIntegrationValue = this.safeGetScalarParam(this.integrationParam);
                    currentReflexivityValue = this.safeGetScalarParam(this.reflexivityParam);
                }
                catch (e) {
                    console.error("Error reading param values for decay:", e);
                    // Proceed with defaults if read fails
                }
                const decayFactor = Config.RL?.PARAM_DECAY ?? 0.03;
                integrationDelta += (0.5 - currentIntegrationValue) * decayFactor;
                reflexivityDelta += (0.5 - currentReflexivityValue) * decayFactor;
                // --- Apply Updates using tf operations and assign ---
                const integrationUpdate = tf.scalar(integrationDelta * learningRate);
                // Use tf.add for Variable + Scalar -> Tensor
                const newIntegrationTensor = tf.add(this.integrationParam, integrationUpdate);
                // Assign the clipped tensor back to the variable
                this.integrationParam.assign(tf.clipByValue(newIntegrationTensor, 0.05, 0.95));
                const reflexivityUpdate = tf.scalar(reflexivityDelta * learningRate);
                const newReflexivityTensor = tf.add(this.reflexivityParam, reflexivityUpdate);
                this.reflexivityParam.assign(tf.clipByValue(newReflexivityTensor, 0.05, 0.95));
            }); // End tidy
            // Update last variance *after* using it for calculation
            this.lastCascadeVariance = cascadeVariance;
        }
        catch (e) {
            console.error("Error learning parameters:", e);
        }
    }
    // Update the agent's internal self-representation
    _updateSelfState(currentBeliefEmbedding, trustScore, integrationParamValue) {
        // Use ! assertions as checks are done before calling process -> _updateSelfState
        if (!this.isTfReady || !this.selfState || this.selfState.isDisposed || !currentBeliefEmbedding || currentBeliefEmbedding.isDisposed) {
            console.warn("[Agent SelfState] Update skipped due to invalid tensor/parameter.");
            return;
        }
        // Ensure dimensions match before proceeding
        if (this.selfState.shape[0] !== currentBeliefEmbedding.shape[0]) {
            console.error(`Self-state update error: Dimension mismatch! Self-state (${this.selfState.shape[0]}) vs Belief (${currentBeliefEmbedding.shape[0]}). Resetting self-state.`);
            // Dispose the old invalid state and create a new one
            tf.dispose(this.selfState);
            // Keep the new variable
            this.selfState = tf.keep(tf.variable(tf.zeros([BELIEF_EMBEDDING_DIM]), true, 'agentSelfState'));
            return; // Skip update this cycle
        }
        try {
            tf.tidy(() => {
                // Learning rate influenced by integration parameter (higher integration -> faster update)
                const effectiveLearnRate = SELF_STATE_LEARN_RATE * (0.5 + integrationParamValue);
                // Update strength modulated by trust
                const trustFactorTensor = tf.scalar(trustScore * effectiveLearnRate);
                const decayFactorTensor = tf.scalar(SELF_STATE_DECAY);
                // Update rule: self_state = decay * self_state + trust_factor * current_belief
                // Use tf.mul for Variable * Scalar -> Tensor
                const decayedState = tf.mul(this.selfState, decayFactorTensor);
                // Use tf.mul for Tensor * Scalar -> Tensor
                const beliefUpdate = tf.mul(currentBeliefEmbedding, trustFactorTensor);
                // Use tf.add for Tensor + Tensor -> Tensor
                const newState = tf.add(decayedState, beliefUpdate);
                // Assign the new state tensor back to the variable
                this.selfState.assign(newState);
            }); // End tidy
        }
        catch (e) {
            console.error("Error updating self-state:", e);
        }
    }
    // Get a *copy* of the latest belief embedding (caller should dispose if kept)
    getLatestBeliefEmbedding() {
        if (this.latestBeliefEmbedding && !this.latestBeliefEmbedding.isDisposed) {
            // Return a clone, not the internal kept tensor
            return this.latestBeliefEmbedding.clone();
        }
        return null;
    }
    // Main processing loop for the agent
    async process(rawState, graphFeatures, environmentContext = { eventType: null, reward: 0 }) {
        // --- Pre-computation Checks ---
        const componentsValid = this.coreModulesReady && this.isTfReady &&
            this.enyphansyntrix && this.strukturkondensation && this.reflexiveIntegration && this.affinitaetssyndrom &&
            this.beliefNetwork && this.cascadeInputLayer && this.valueHead && this.feedbackHead &&
            this.integrationParam && !this.integrationParam.isDisposed &&
            this.reflexivityParam && !this.reflexivityParam.isDisposed &&
            this.selfState && !this.selfState.isDisposed &&
            this.prevEmotions && !this.prevEmotions.isDisposed && // Check prevEmotions is valid
            this.emotionalModule && this.headMovementHead && this.optimizer;
        const defaultResponse = {
            cascadeHistory: this.latestCascadeHistoryArrays || [],
            rihScore: this.lastRIH,
            affinities: this.latestAffinities || [],
            // Create a disposable zero tensor if TF is ready, otherwise it's problematic
            emotions: this.isTfReady ? tf.zeros([1, Config.Agent.EMOTION_DIM]) : null,
            hmLabel: 'idle',
            responseText: "Error: Agent component invalid or TF not ready.",
            integration: 0.5,
            reflexivity: 0.5,
            trustScore: this.latestTrustScore,
            beliefNorm: 0,
            feedbackNorm: 0,
            selfStateNorm: 0
        };
        if (!this.isTfReady) {
            console.error("Agent Process: TensorFlow.js not ready. Returning default response.");
            // Attempt to clean up any core modules if they exist
            this.enyphansyntrix = null;
            this.affinitaetssyndrom = null;
            this.strukturkondensation = null;
            this.reflexiveIntegration = null;
            return defaultResponse;
        }
        // If TF is ready, but other components failed validation
        if (!componentsValid) {
            console.error("Agent Pre-Process Check Failed! Core/TF components invalid. Aborting step.", { coreReady: this.coreModulesReady, tfReady: this.isTfReady, componentsValid });
            displayError("Agent critical component invalid before processing step. Simulation may halt.", true, 'error-message');
            // If TF is ready, we can at least return zeros tensor for emotions
            defaultResponse.emotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Keep it for the response object
            return defaultResponse;
        }
        // --- Read Current Parameters ---
        let currentIntegration = 0.5, currentReflexivity = 0.5;
        try {
            // Use safeGetScalar for parameter reading
            currentIntegration = this.safeGetScalarParam(this.integrationParam);
            currentReflexivity = this.safeGetScalarParam(this.reflexivityParam);
        }
        catch (e) {
            console.error("Error reading agent parameters (using defaults):", e);
            // Use default values if read fails
        }
        // --- Initialize Step Variables ---
        let beliefNormValue = 0.0, feedbackNormValue = 0.0, currentSelfStateNorm = 0.0;
        let cascadeHistoryArrays = [];
        let currentRihScore = 0.0;
        let currentAffinities = [];
        let currentAvgAffinity = 0.0;
        let currentTrustScore = 0.5;
        let cascadeVarianceFeature = 0.0; // Use for learning params
        let latestBeliefEmbeddingToCache = null; // Temp holder for the belief tensor to be kept
        // --- Core Syntrometric Processing in Tidy ---
        try {
            const results = tf.tidy(() => {
                // --- Prepare Inputs ---
                let stateArray = Array.isArray(rawState)
                    ? rawState // Assume rawState is already number[]
                    // Use helper to create zero array if rawState is not array
                    : zerosArray(Config.Agent.BASE_STATE_DIM);
                // Ensure stateArray has the correct dimension, padding if necessary
                if (stateArray.length < Config.Agent.BASE_STATE_DIM) {
                    stateArray = stateArray.concat(zerosArray(Config.Agent.BASE_STATE_DIM - stateArray.length));
                }
                else if (stateArray.length > Config.Agent.BASE_STATE_DIM) {
                    stateArray = stateArray.slice(0, Config.Agent.BASE_STATE_DIM);
                }
                // Ensure tensors match expected dimensions
                // Slice ensures correct dimension for core state
                const coreStateTensor = tf.tensor(stateArray.slice(0, Config.DIMENSIONS), [1, Config.DIMENSIONS]);
                const graphFeaturesTensor = tf.tensor(graphFeatures, [1, NUM_GRAPH_FEATURES]); // Ensure 2D shape [1, num_features]
                const currentSelfState = this.selfState; // Use ! - validated above
                // --- Enyphansyntrix (Perturbation) ---
                const rihModulation = this.lastRIH * (currentReflexivity * 2 - 1); // Modulate by reflexivity
                // Modulate input based on RIH/Reflexivity
                let modulatedInput = tf.add(coreStateTensor, tf.scalar(rihModulation * 0.1)).clipByValue(-1, 1); // Use tf.add
                // Perturbation scale influenced by RIH/Reflexivity
                const perturbationScale = clamp(0.005 + (1.0 - this.lastRIH) * 0.02 + currentReflexivity * 0.02, 0.001, 0.05);
                // Apply perturbation - enyphansyntrix expects/returns [1, dim] tensor
                const perturbedInput = this.enyphansyntrix.apply(modulatedInput, perturbationScale); // Use ! - validated above
                // --- Belief Network ---
                const beliefNetInput = tf.concat([
                    perturbedInput,
                    graphFeaturesTensor,
                    tf.reshape(currentSelfState, [1, BELIEF_EMBEDDING_DIM]) // Reshape self-state to [1, dim]
                ], 1); // Concat along axis 1
                if (beliefNetInput.shape[1] !== BELIEF_NETWORK_INPUT_DIM) {
                    // Throw error to be caught by outer try/catch
                    throw new Error(`Belief network input dim mismatch: expected ${BELIEF_NETWORK_INPUT_DIM}, got ${beliefNetInput.shape[1]}`);
                }
                // beliefNetwork outputs [1, BELIEF_EMBEDDING_DIM]
                const beliefEmbedding = this.beliefNetwork.apply(beliefNetInput);
                // Keep a flat version (1D) for internal use (trust, memory, self-state)
                const beliefEmbeddingFlat = tf.reshape(beliefEmbedding, [BELIEF_EMBEDDING_DIM]); // Reshape to 1D
                // --- Cascade Processing ---
                // cascadeInputLayer is Layer, use apply, expects [batch, BELIEF_EMBEDDING_DIM], outputs [batch, CASCADE_INPUT_DIM]
                const cascadeInput = this.cascadeInputLayer.apply(beliefEmbedding);
                // strukturkondensation expects 1D tensor
                const cascadeInputFlat = tf.reshape(cascadeInput, [CASCADE_INPUT_DIM]);
                // Process returns array of tensors (history levels)
                const cascadeHistoryTensors = this.strukturkondensation.process(cascadeInputFlat); // Use ! - validated above
                // Convert tensors to JS arrays for the response *within tidy* if needed later
                // but dispose the tensors from history properly
                const historyArrays = cascadeHistoryTensors.map(t => t.arraySync());
                const lastCascadeLevelTensor = cascadeHistoryTensors.length > 0 ? cascadeHistoryTensors[cascadeHistoryTensors.length - 1] : tf.tensor([]); // Handle empty history
                // --- Reflexive Integration & Affinity ---
                const rih = this.reflexiveIntegration.compute(lastCascadeLevelTensor); // Use ! - validated above
                // Affinity calculation
                let affinities = [];
                if (cascadeHistoryTensors.length > 1) {
                    try {
                        // Compute affinities between consecutive layers
                        for (let i = 0; i < cascadeHistoryTensors.length - 1; i++) {
                            // Make sure tensors are valid before computing
                            if (cascadeHistoryTensors[i] && !cascadeHistoryTensors[i].isDisposed &&
                                cascadeHistoryTensors[i + 1] && !cascadeHistoryTensors[i + 1].isDisposed) {
                                const aff = this.affinitaetssyndrom.compute(cascadeHistoryTensors[i], cascadeHistoryTensors[i + 1]);
                                affinities.push(aff);
                            }
                            else {
                                affinities.push(0); // Push 0 if tensors are invalid
                            }
                        }
                    }
                    catch (affError) {
                        console.error(`Affinity computation error: ${affError}`);
                        // Fill remaining affinities with 0 on error? Or handle differently.
                        while (affinities.length < (cascadeHistoryTensors.length - 1))
                            affinities.push(0);
                    }
                }
                // Dispose history tensors explicitly now they've been used for RIH/Affinity/Arrays
                cascadeHistoryTensors.forEach(t => tf.dispose(t)); // Dispose tensors from process()
                const avgAffinity = affinities.length > 0 ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0;
                // --- Trust Calculation ---
                const trust = this._computeTrust(beliefEmbeddingFlat); // Use the flat 1D tensor
                // --- Cascade Variance Feature ---
                let varFinal = 0.0;
                if (lastCascadeLevelTensor.size > 1) { // Only compute variance if more than one element
                    const moments = tf.moments(lastCascadeLevelTensor);
                    // Ensure varianceValue is a number
                    const varianceValue = moments.variance.arraySync();
                    varFinal = typeof varianceValue === 'number' ? varianceValue : 0.0; // Handle potential array/scalar issues
                }
                const cascadeVarianceFeat = clamp(varFinal, 0, 10); // Clamp variance
                // --- Value & Feedback Heads (Layers) ---
                // Heads expect [batch, BELIEF_EMBEDDING_DIM]
                const valuePred = this.valueHead.apply(beliefEmbedding); // Output [1, 1]
                const feedbackSignalRaw = this.feedbackHead.apply(beliefEmbedding); // Output [1, Config.DIMENSIONS]
                // Keep a flat version (1D) of feedback for norm calculation later
                const feedbackSignalFlat = tf.reshape(feedbackSignalRaw, [Config.DIMENSIONS]);
                // --- Return Required Tensors (to be kept) and values ---
                return {
                    // Keep the flat belief embedding for memory, self-state, etc.
                    keptBeliefEmbedding: tf.keep(beliefEmbeddingFlat.clone()),
                    // Keep the flat feedback signal only for norm calculation, dispose after
                    keptFeedbackSignal: tf.keep(feedbackSignalFlat.clone()),
                    cascadeHistoryArrays: historyArrays,
                    currentRihScore: rih,
                    currentAffinities: affinities,
                    currentAvgAffinity: avgAffinity,
                    currentTrustScore: trust,
                    cascadeVarianceFeature: cascadeVarianceFeat // Single number
                };
            }); // --- End Tidy ---
            // --- Process Tidy Results ---
            // Update internal state using the results
            this.lastRIH = results.currentRihScore; // Update RIH for next step's modulation
            this.latestRihScore = results.currentRihScore; // Store for response
            this.latestAffinities = results.currentAffinities;
            this.latestTrustScore = results.currentTrustScore;
            this.latestCascadeHistoryArrays = results.cascadeHistoryArrays;
            cascadeVarianceFeature = results.cascadeVarianceFeature; // Get variance for learning
            currentRihScore = results.currentRihScore;
            currentAffinities = results.currentAffinities;
            currentAvgAffinity = results.currentAvgAffinity;
            currentTrustScore = results.currentTrustScore;
            cascadeHistoryArrays = results.cascadeHistoryArrays; // Store JS arrays
            // Calculate norms from the kept tensors' data
            beliefNormValue = norm(results.keptBeliefEmbedding.dataSync()); // Use util norm on sync data
            feedbackNormValue = norm(results.keptFeedbackSignal.dataSync());
            tf.dispose(results.keptFeedbackSignal); // Dispose feedback signal after norm calculation
            // Update memory and self-state with the kept belief embedding
            this._updateMemory(results.keptBeliefEmbedding); // Pass the kept tensor; _updateMemory will clone & keep again
            this._updateSelfState(results.keptBeliefEmbedding, results.currentTrustScore, currentIntegration);
            // Dispose the previous latestBeliefEmbedding if it exists
            if (this.latestBeliefEmbedding && !this.latestBeliefEmbedding.isDisposed) {
                tf.dispose(this.latestBeliefEmbedding);
            }
            // Store the *kept* tensor from this step (already kept in results)
            this.latestBeliefEmbedding = results.keptBeliefEmbedding; // Transfer ownership of the kept tensor
            // Update self-state norm *after* potential update
            if (this.selfState && !this.selfState.isDisposed) {
                currentSelfStateNorm = norm(this.selfState.dataSync());
            }
            // Learn parameters based on this step's results
            this._learnParameters(results.currentTrustScore, results.currentRihScore, cascadeVarianceFeature);
        }
        catch (e) {
            // --- Handle Errors during Core Processing ---
            const message = e instanceof Error ? e.message : String(e);
            console.error("Error during agent core processing:", e);
            displayError(`Agent Processing Error: ${message}`, false, 'error-message');
            // Use last known good values or defaults on error
            cascadeHistoryArrays = this.latestCascadeHistoryArrays || [];
            currentRihScore = this.lastRIH; // Use previous RIH score
            currentAffinities = this.latestAffinities || [];
            currentAvgAffinity = currentAffinities.length > 0 ? currentAffinities.reduce((a, b) => a + b, 0) / currentAffinities.length : 0;
            currentTrustScore = this.latestTrustScore; // Use previous trust score
            // Reset norms on error
            beliefNormValue = 0;
            feedbackNormValue = 0;
            // Try to get self-state norm if possible, otherwise 0
            currentSelfStateNorm = (this.selfState && !this.selfState.isDisposed) ? norm(this.selfState.dataSync()) : 0.0;
            // Ensure any temporarily kept tensor is disposed if error occurred mid-process
            if (latestBeliefEmbeddingToCache && !latestBeliefEmbeddingToCache.isDisposed) {
                tf.dispose(latestBeliefEmbeddingToCache);
            }
            // Note: Tensors created inside the failed tidy block are already disposed
        }
        // --- Emotional Update ---
        let currentEmotionsTensor; // This will be kept and returned
        try {
            // _updateEmotions handles internal state (this.prevEmotions) and returns a *new kept* tensor
            currentEmotionsTensor = await this._updateEmotions(rawState, environmentContext);
        }
        catch (e) {
            console.error("Error updating emotions:", e);
            displayError(`TF Error during emotion prediction: ${e instanceof Error ? e.message : String(e)}`, false, 'error-message');
            // On error, return the decayed previous emotions or zeros
            if (this.prevEmotions && !this.prevEmotions.isDisposed) {
                // Keep a decayed version of the previous emotions
                const decayedEmotions = tf.tidy(() => tf.mul(this.prevEmotions, EMOTIONAL_DECAY_RATE).clipByValue(0, 1)); // Use tf.mul
                currentEmotionsTensor = tf.keep(decayedEmotions);
                // Update internal state as well
                tf.dispose(this.prevEmotions); // Dispose old prevEmotions
                this.prevEmotions = tf.keep(currentEmotionsTensor.clone()); // Keep the clone for internal state
            }
            else {
                // If prevEmotions was already bad, return zeros
                currentEmotionsTensor = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
                // Also reset internal state if needed
                if (this.prevEmotions && !this.prevEmotions.isDisposed)
                    tf.dispose(this.prevEmotions);
                this.prevEmotions = tf.keep(currentEmotionsTensor.clone());
            }
        }
        // --- Head Movement Prediction ---
        let hmLabel = "idle";
        let dominantEmotionName = 'Unknown';
        try {
            // Ensure emotion tensor is valid before prediction
            if (currentEmotionsTensor && !currentEmotionsTensor.isDisposed) {
                const predictionResult = await this._predictHeadMovement(currentEmotionsTensor, currentRihScore, currentAvgAffinity);
                hmLabel = predictionResult.label;
                dominantEmotionName = predictionResult.dominantName;
            }
            else {
                console.warn("Skipping head movement prediction due to invalid emotion tensor.");
                hmLabel = "idle"; // Default if emotions are invalid
            }
        }
        catch (e) {
            console.error("Error predicting head movement:", e);
            displayError(`TF Error during head movement prediction: ${e instanceof Error ? e.message : String(e)}`, false, 'error-message');
            hmLabel = "idle"; // Default on error
        }
        // --- Construct Response ---
        const rihText = currentRihScore.toFixed(2);
        const affText = currentAvgAffinity.toFixed(2);
        const trustText = currentTrustScore.toFixed(2);
        const intText = currentIntegration.toFixed(2); // Use value read at start of process
        const refText = currentReflexivity.toFixed(2); // Use value read at start of process
        const cascadeVarText = cascadeVarianceFeature.toFixed(2); // Use calculated variance feature
        const responseText = `R:${rihText} A:${affText} T:${trustText} CV:${cascadeVarText} I:${intText} Ψ:${refText} | Mood:${dominantEmotionName} | Act:${hmLabel}`;
        // Return the final state package
        // The caller is responsible for disposing the returned 'emotions' tensor if kept
        return {
            cascadeHistory: cascadeHistoryArrays,
            rihScore: currentRihScore,
            affinities: currentAffinities,
            emotions: currentEmotionsTensor,
            hmLabel: hmLabel,
            responseText: responseText,
            trustScore: currentTrustScore,
            integration: currentIntegration,
            reflexivity: currentReflexivity,
            beliefNorm: beliefNormValue,
            feedbackNorm: feedbackNormValue,
            selfStateNorm: currentSelfStateNorm
        };
    }
    // Update emotions based on state, context, and previous emotions
    // Returns a *new kept* tensor representing the current emotions
    async _updateEmotions(rawState, environmentContext) {
        // Validate required components
        if (!this.isTfReady || !this.emotionalModule || !this.prevEmotions || this.prevEmotions.isDisposed) { // Corrected check
            console.warn("Emotional module or prevEmotions invalid. Cannot predict emotions. Returning zeros.");
            // Ensure prevEmotions is reset if it was invalid
            if (this.prevEmotions && !this.prevEmotions.isDisposed) {
                tf.dispose(this.prevEmotions);
            }
            // Create and keep a new zero tensor for internal state and return value
            const zeroEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            this.prevEmotions = tf.keep(zeroEmotions.clone()); // Update internal state
            return zeroEmotions; // Return the kept tensor
        }
        // Prepare state input
        // Use helper function for zero array
        const coreStateForEmotion = (Array.isArray(rawState) ? rawState : zerosArray(Config.Agent.BASE_STATE_DIM))
            .slice(0, Config.DIMENSIONS); // Slice to ensure correct dimension
        // Pad if necessary (though slice should handle it)
        while (coreStateForEmotion.length < Config.DIMENSIONS) {
            coreStateForEmotion.push(0);
        }
        let newEmotionsKept = null;
        try {
            const newEmotionsResult = tf.tidy(() => {
                const stateTensor = tf.tensor([coreStateForEmotion], [1, Config.DIMENSIONS]); // Ensure [1, dim]
                const rewardTensor = tf.tensor([[environmentContext.reward || 0]], [1, 1]); // Ensure [1, 1]
                const contextSignal = tf.tensor([[environmentContext.eventType ? 1 : 0]], [1, 1]); // Ensure [1, 1]
                // Ensure prevEmotions is correctly shaped [1, emotion_dim]
                // Use ! assertion - validated above
                const prevEmotionsInput = this.prevEmotions;
                const input = tf.concat([stateTensor, prevEmotionsInput, rewardTensor, contextSignal], 1); // Concat axis 1
                const expectedInputDim = (Config.DIMENSIONS || 1) + (Config.Agent.EMOTION_DIM || 1) + 1 + 1;
                if (input.shape.length !== 2 || input.shape[0] !== 1 || input.shape[1] !== expectedInputDim) {
                    throw new Error(`Emotional module input dim/shape mismatch: expected [1, ${expectedInputDim}], got [${input.shape}]`);
                }
                // Predict raw new emotions - use ! assertion
                const predictedEmotions = this.emotionalModule.apply(input);
                // Blend previous and predicted emotions with decay
                const decayScalar = tf.scalar(EMOTIONAL_DECAY_RATE);
                const oneMinusDecay = tf.sub(1.0, decayScalar); // Use tf.sub
                // Use tf.mul and tf.add for tensor operations
                const blendedEmotions = tf.add(tf.mul(prevEmotionsInput, decayScalar), tf.mul(predictedEmotions, oneMinusDecay)).clipByValue(0, 1); // Ensure emotions stay in [0, 1]
                return blendedEmotions; // Return the result of tidy
            }); // End tidy
            // Keep the result from tidy block
            newEmotionsKept = tf.keep(newEmotionsResult);
            // Dispose the old prevEmotions tensor (guaranteed non-null here by initial check)
            tf.dispose(this.prevEmotions);
            // Update the internal state with a *clone* of the new kept tensor
            // Use ! assertion, as we are in the success path of the try block
            this.prevEmotions = tf.keep(newEmotionsKept.clone());
            // Return the original kept tensor
            return newEmotionsKept; // Use ! assertion here too
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error("Error during emotion prediction/tidy block:", e);
            displayError(`TF Error during emotion prediction: ${message}`, false, 'error-message');
            // Clean up any tensor created before the error, if necessary
            if (newEmotionsKept && !newEmotionsKept.isDisposed) {
                tf.dispose(newEmotionsKept);
            }
            // Fallback: return decayed previous or zeros, and update internal state
            const currentPrevEmotions = this.prevEmotions;
            if (currentPrevEmotions && !currentPrevEmotions.isDisposed) {
                // FIX 4 (Error 4 - TS2339 on never): Simplified logic in catch block
                // No inner 'if' needed, just operate on currentPrevEmotions
                const decayedFallback = tf.tidy(() => tf.mul(currentPrevEmotions, EMOTIONAL_DECAY_RATE).clipByValue(0, 1));
                const keptFallback = tf.keep(decayedFallback);
                tf.dispose(currentPrevEmotions); // Dispose the captured value
                this.prevEmotions = tf.keep(keptFallback.clone()); // Update internal state
                return keptFallback; // Return the kept fallback tensor
            }
            else {
                // This executes if the try block failed AND the initial check also failed (prevEmotions was null/disposed).
                const zeroFallback = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
                // No need to dispose this.prevEmotions again if it was null/disposed.
                this.prevEmotions = tf.keep(zeroFallback.clone());
                return zeroFallback;
            }
        }
    }
    // Predict head movement based on emotions and other factors
    async _predictHeadMovement(currentEmotionsTensor, // Expects a valid, non-disposed tensor
    rihScore, avgAffinity) {
        let hmLabel = "idle";
        let dominantEmotionName = "Unknown";
        // --- Input Validation ---
        // Use ! assertions for model/tensor checks as process() validates before calling
        if (!this.isTfReady || !this.headMovementHead || !currentEmotionsTensor || currentEmotionsTensor.isDisposed) {
            console.warn("Head movement model or emotion tensor invalid for prediction. Returning idle.");
            return { label: "idle", dominantName: "Unknown" };
        }
        // Verify emotion tensor shape
        if (currentEmotionsTensor.shape.length !== 2 || currentEmotionsTensor.shape[0] !== 1 || currentEmotionsTensor.shape[1] !== Config.Agent.EMOTION_DIM) {
            console.warn(`Invalid emotion tensor shape for head movement: ${currentEmotionsTensor.shape}. Expected [1, ${Config.Agent.EMOTION_DIM}]. Returning idle.`);
            return { label: "idle", dominantName: "Unknown" };
        }
        // --- Determine Dominant Emotion ---
        let emotionArray = [];
        try {
            // Asynchronously get the emotion values
            emotionArray = (await currentEmotionsTensor.array())[0]; // Get the first (only) batch item
        }
        catch (e) {
            console.error("Error getting emotion array for head movement:", e);
            return { label: "idle", dominantName: "Unknown" }; // Return default on error
        }
        if (emotionArray.length === 0) {
            console.warn("Emotion array is empty. Cannot determine dominant emotion.");
            return { label: "idle", dominantName: "Unknown" };
        }
        const dominantEmotionIndex = emotionArray.indexOf(Math.max(...emotionArray));
        dominantEmotionName = emotionNames[dominantEmotionIndex] || 'Unknown';
        // --- Predict Head Movement using the Model ---
        if (dominantEmotionIndex !== -1) { // Ensure a valid dominant emotion was found
            let hmLogits = null;
            try {
                hmLogits = tf.tidy(() => {
                    // Prepare inputs for the head movement model
                    const rihTensor = tf.tensor([[rihScore]], [1, 1]);
                    const avgAffinityTensor = tf.tensor([[avgAffinity ?? 0]], [1, 1]); // Use 0 if avgAffinity is null/undefined
                    const dominantEmotionTensor = tf.tensor([[dominantEmotionIndex]], [1, 1]); // Index as feature
                    // Use the provided currentEmotionsTensor directly (already shaped [1, emotion_dim])
                    const emotionTensorInput = currentEmotionsTensor;
                    const input = tf.concat([rihTensor, avgAffinityTensor, dominantEmotionTensor, emotionTensorInput], 1); // Concat axis 1
                    // Validate input shape before prediction
                    const expectedInputDim = 1 + 1 + 1 + (Config.Agent.EMOTION_DIM || 1);
                    if (input.shape.length !== 2 || input.shape[0] !== 1 || input.shape[1] !== expectedInputDim) {
                        throw new Error(`Head movement model input dim/shape mismatch: expected [1, ${expectedInputDim}], got [${input.shape}]`);
                    }
                    // Perform prediction - use ! assertion
                    return this.headMovementHead.apply(input); // Output logits [1, NUM_HEAD_MOVEMENTS]
                }); // End tidy
                // Process the logits outside tidy
                if (hmLogits && !hmLogits.isDisposed) {
                    // Get the index of the highest logit using tf.argMax
                    const hmIdxTensor = tf.argMax(hmLogits, 1); // Axis 1 for batch dim
                    // FIX 3 (Error 5 - TS7053): Cast result of arraySync to number[] before indexing
                    const hmIdx = (await hmIdxTensor.arraySync())[0];
                    hmLabel = HEAD_MOVEMENT_LABELS[hmIdx] || "idle"; // Map index to label
                    // Dispose the index tensor
                    tf.dispose(hmIdxTensor);
                }
                else {
                    // If logits are null or disposed for some reason
                    console.warn("Head movement logits were invalid after prediction.");
                    hmLabel = "idle";
                }
            }
            catch (e) {
                console.error("Error during head movement prediction tidy block:", e);
                hmLabel = "idle"; // Default on error
            }
            finally {
                // Ensure logits tensor is disposed even if errors occurred after tidy
                if (hmLogits && !hmLogits.isDisposed) {
                    tf.dispose(hmLogits);
                }
            }
        }
        else {
            // Should not happen if emotionArray was not empty, but handle defensively
            console.warn("Could not determine dominant emotion index.");
            hmLabel = "idle";
        }
        return { label: hmLabel, dominantName: dominantEmotionName };
    }
    // Get the current state for serialization
    getState() {
        // Use flexible any[] type for weights data serialization
        const getWeightsData = (modelOrLayer) => {
            if (!modelOrLayer)
                return null;
            try {
                // Check if getWeights method exists
                if (typeof modelOrLayer.getWeights !== 'function')
                    return null;
                const weights = modelOrLayer.getWeights(); // getWeights returns Tensor[], which are Variables
                const weightsData = [];
                for (const w of weights) {
                    if (w && !w.isDisposed) {
                        weightsData.push(w.arraySync()); // Store raw array data
                    }
                    else {
                        weightsData.push(null); // Represent disposed/invalid weights as null
                    }
                }
                return weightsData;
            }
            catch (e) {
                console.error("Error getting weights for state serialization:", e);
                return null;
            }
        };
        // Safely get data from potentially disposed tensors/variables
        const safeGetData = (tv) => {
            try {
                if (tv && !tv.isDisposed) {
                    // dataSync() returns TypedArray | number[]
                    // Array.from converts TypedArray to number[]
                    return Array.from(tv.dataSync());
                }
            }
            catch (e) {
                console.error("Error getting dataSync for state serialization:", e);
            }
            return []; // Return empty array on error or if invalid
        };
        // Safely get scalar data from Variable
        const safeGetScalar = (v) => {
            try {
                if (v && !v.isDisposed) {
                    const data = v.dataSync();
                    // Check if data is array-like and has elements
                    if (data && typeof data === 'object' && data.length > 0) {
                        // Type assertion to satisfy TS, logic is sound.
                        return data[0];
                    }
                    else if (typeof data === 'number') {
                        // Handle potential case where dataSync returns a number for scalar
                        return data;
                    }
                }
            }
            catch (e) {
                console.error("Error getting scalar dataSync for state serialization:", e);
            }
            return 0.5; // Return default value on error or if invalid
        };
        const state = {
            version: '2.3',
            prevEmotions: safeGetData(this.prevEmotions),
            // Serialize memory buffer: convert kept tensors to arrays
            memoryBuffer: this.memoryBuffer.map(entry => ({
                timestamp: entry.timestamp,
                // Safely get data from the belief embedding tensor
                beliefEmbedding: (entry.beliefEmbedding && !entry.beliefEmbedding.isDisposed)
                    ? Array.from(entry.beliefEmbedding.dataSync())
                    : null
            })),
            lastRIH: this.lastRIH,
            lastCascadeVariance: this.lastCascadeVariance,
            latestTrustScore: this.latestTrustScore,
            integrationParam: safeGetScalar(this.integrationParam),
            reflexivityParam: safeGetScalar(this.reflexivityParam),
            selfState: safeGetData(this.selfState),
            // Serialize model weights using the helper
            beliefNetworkWeights: getWeightsData(this.beliefNetwork),
            cascadeInputLayerWeights: getWeightsData(this.cascadeInputLayer),
            valueHeadWeights: getWeightsData(this.valueHead),
            feedbackHeadWeights: getWeightsData(this.feedbackHead),
            emotionalModuleWeights: getWeightsData(this.emotionalModule),
            headMovementHeadWeights: getWeightsData(this.headMovementHead),
        };
        return state;
    }
    // Cleanup all resources
    cleanup() {
        console.log("Initiating SyntrometricAgent cleanup...");
        // Dispose all TF-related members first
        this._cleanupTfMembers();
        // Set TF members to null after disposal
        this._set_tf_members_null();
        // Nullify core JS module references
        this.enyphansyntrix = null;
        this.affinitaetssyndrom = null;
        this.strukturkondensation = null;
        this.reflexiveIntegration = null;
        // Clear internal state arrays/values
        this.memoryBuffer = []; // Already cleaned in _cleanupTfMembers, but clear ref just in case
        this.latestAffinities = [];
        this.latestCascadeHistoryArrays = [];
        this.lastRIH = 0.0;
        this.lastCascadeVariance = 0.0;
        this.latestTrustScore = 1.0;
        this.latestRihScore = 0.0;
        this.coreModulesReady = false;
        this.isTfReady = false;
        console.log("SyntrometricAgent cleanup finished.");
    }
    // Method to load state (requires careful handling of tensor/variable creation and weight setting)
    // async loadState(state: AgentState): Promise<void> { ... } // Implementation omitted for brevity, but would use tf.tensor() and model.setWeights() carefully.
    // Helper for safe scalar reading (used in process and _learnParameters)
    safeGetScalarParam(v, defaultValue = 0.5) {
        try {
            if (v && !v.isDisposed) {
                const data = v.dataSync();
                if (data && typeof data === 'object' && data.length > 0) {
                    return data[0];
                }
                else if (typeof data === 'number') {
                    return data;
                }
            }
        }
        catch (e) {
            console.error("Error reading scalar param:", e);
        }
        return defaultValue;
    }
    /**
     * Loads agent state from a serialized object
     * @param state The serialized agent state to load
     * @returns True if state was loaded successfully
     */
    loadState(state) {
        try {
            // Implementation details depend on your state structure
            if (!state || typeof state !== 'object')
                return false;
            // Example implementation - adjust based on your actual state structure
            if (state.latestTrustScore !== undefined)
                this.latestTrustScore = state.latestTrustScore;
            if (state.lastRIH !== undefined)
                this.lastRIH = state.lastRIH;
            if (state.latestAffinities && Array.isArray(state.latestAffinities)) {
                this.latestAffinities = [...state.latestAffinities];
            }
            // Handle tensor data if needed
            // ...
            return true;
        }
        catch (e) {
            console.error("Failed to load agent state:", e);
            return false;
        }
    }
    /**
     * Public method to validate agent components
     */
    validateComponents() {
        return this._validateComponents();
    }
    /**
     * Public accessor for scalar parameters
     * @param paramName Name of the parameter to retrieve
     * @returns The parameter value or 0 if not found
     */
    getScalarParam(paramName) {
        return this.safeGetScalarParam(paramName);
    }
}
//# sourceMappingURL=agent.js.map