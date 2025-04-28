// js/agent.js

import { Config, emotionNames, HEAD_MOVEMENT_LABELS, NUM_HEAD_MOVEMENTS } from './config.js';
// Import updated core classes
import { Enyphansyntrix, Affinitaetssyndrom, Strukturkondensation, ReflexiveIntegration, Synkolator } from './syntrometry-core.js';
import { zeros, tensor, clamp, displayError } from './utils.js'; // Assuming tf is global

/**
 * Represents the Syntrometric Agent V2.1, processing state and generating responses
 * with memory, RIH recursion, Enyphansyntrix perturbations, self-learning params, and trust.
 */
export class SyntrometricAgent {
    constructor() {
        // Core Syntrometry Modules
        this.enyphansyntrix = new Enyphansyntrix('continuous');
        this.affinitaetssyndrom = new Affinitaetssyndrom();
        // Pass synkolator stage from config to Strukturkondensation
        this.strukturkondensation = new Strukturkondensation(Config.CASCADE_LEVELS, Config.CASCADE_STAGE || 2);
        this.reflexiveIntegration = new ReflexiveIntegration();

        // --- V2/V2.1 Features ---
        this.memorySize = Config.Agent.HISTORY_SIZE || 10;
        this.memoryBuffer = []; // Holds last N processed state TENSORS (input to cascade)
        this.lastRIH = 0.0; // Stores the RIH score from the previous step
        this.latestTrustScore = 1.0; // Start with high trust

        // Self-Learning Parameters (kept persistent) - Ensure tf exists before creating
        if (typeof tf !== 'undefined') {
            this.integrationParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentIntegrationParam')); // Trainable, start mid-range
            this.reflexivityParam = tf.keep(tf.variable(tf.scalar(Math.random() * 0.5 + 0.25), true, 'agentReflexivityParam')); // Trainable, start mid-range

            // Self-State Model (simple representation, kept persistent)
            const initialSelfStateShape = [Config.DIMENSIONS]; // Represents core dimensions' internal model
            this.selfState = tf.keep(tf.variable(tf.zeros(initialSelfStateShape), true, 'agentSelfState')); // Trainable? Maybe just adaptive for now.

             // Agent's previous emotional state (managed tensor)
             if (this.prevEmotions) tf.dispose(this.prevEmotions); // Dispose if exists from previous instance
             this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Keep initial zero tensor

        } else {
            // Handle case where TF is missing during construction
            this.integrationParam = null;
            this.reflexivityParam = null;
            this.selfState = null;
            this.prevEmotions = null;
            console.error("TensorFlow.js not available during Agent construction.");
        }


        // Simple TF.js models for emotional response and head movement (keep for now)
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


         // Store latest calculated values (results of processing)
         this.latestCascadeHistoryArrays = []; // Store arrays for easy access/saving
         this.latestRihScore = 0;
         this.latestAffinities = [];
    }

    // --- TF Model Builders ---
    _buildEmotionalModel() {
        if (typeof tf === 'undefined') return null;
        const model = tf.sequential();
        const inputDim = Config.Agent.BASE_STATE_DIM + Config.Agent.EMOTION_DIM + 1 + 1; // state + prev_emo + reward + context
        model.add(tf.layers.dense({ units: 32, inputShape: [inputDim], activation: 'relu' }));
        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
        model.add(tf.layers.dense({ units: Config.Agent.EMOTION_DIM, activation: 'sigmoid' }));
        console.log("Emotional model built.");
        return model;
     }
    _buildHeadMovementModel() {
        if (typeof tf === 'undefined') return null;
        const model = tf.sequential();
        const inputDim = 1 + 1 + 1 + Config.Agent.EMOTION_DIM; // RIH + AvgAff + DomEmoIdx + EmoState
        model.add(tf.layers.dense({ units: 16, inputShape: [inputDim], activation: 'relu' }));
        model.add(tf.layers.dense({ units: NUM_HEAD_MOVEMENTS })); // Output logits
        console.log("Head movement model built.");
        return model;
    }

    /**
     * Updates the agent's memory buffer with the latest processed state tensor.
     * Manages buffer size and tensor disposal.
     * @param {tf.Tensor} stateTensor The 1D tensor representing the processed state to remember.
     */
    _updateMemory(stateTensor) {
        if (!(stateTensor instanceof tf.Tensor) || stateTensor.isDisposed) {
            console.warn("Attempted to add invalid tensor to memory.");
            return;
        }
        if (typeof tf === 'undefined') return; // Need TF to keep/dispose

        // Add new tensor (keep it)
        this.memoryBuffer.push(tf.keep(stateTensor.clone())); // Keep a clone

        // If buffer exceeds size, remove the oldest tensor and dispose it
        if (this.memoryBuffer.length > this.memorySize) {
            const oldTensor = this.memoryBuffer.shift(); // Remove oldest tensor from start
            if (oldTensor && !oldTensor.isDisposed) {
                tf.dispose(oldTensor); // Dispose the removed tensor
            }
        }
    }

    /**
     * Computes a trust score based on similarity between current state (before cascade) and memory.
     * @param {tf.Tensor} currentPerturbedInput - The tensor representing the current modulated & perturbed state (input to cascade).
     * @returns {number} Trust score (0-1).
     */
    _computeTrust(currentPerturbedInput) {
        if (this.memoryBuffer.length === 0 || !currentPerturbedInput || currentPerturbedInput.isDisposed) {
            return 1.0; // Assume full trust if no memory or invalid input
        }
        if (typeof tf === 'undefined') return 0.5; // Cannot compute without TF

        try {
            return tf.tidy(() => {
                // --- Use currentPerturbedInput directly ---
                const flatCurrent = currentPerturbedInput.flatten(); // Should have size DIMENSIONS
                // ------------------------------------------
                const currentNorm = flatCurrent.norm().arraySync();
                if (currentNorm === 0) return 0.0; // Zero vector has zero trust

                const similarities = this.memoryBuffer.map(memTensor => {
                    if (!memTensor || memTensor.isDisposed) return tf.scalar(0);
                    // Memory buffer stores flattened tensors of size DIMENSIONS
                    const flatMem = memTensor; // Already correct shape
                    const memNorm = flatMem.norm().arraySync();
                    const normProd = currentNorm * memNorm;
                    if (normProd === 0) return tf.scalar(0); // Avoid division by zero
                    // *** Dimensions should now match (DIMENSIONS vs DIMENSIONS) ***
                    return flatCurrent.dot(flatMem).div(normProd).clipByValue(-1, 1);
                });

                if (similarities.length === 0) return 1.0; // Should not happen if buffer > 0, but safety check

                // Average the similarity scores
                const avgSimilarity = tf.mean(tf.stack(similarities));
                // Map similarity [-1, 1] to trust score [0, 1]
                const trust = avgSimilarity.add(1).div(2);
                return trust.arraySync(); // Return scalar value
            });
        } catch (e) {
            console.error("Error computing trust:", e);
            displayError(`TF Error computing trust: ${e.message}`, false); // Display specific error
            return 0.5; // Default to neutral trust on error
        }
    }

    /**
     * Heuristic learning rule for self-adjusting parameters based on trust.
     */
    _learnParameters(trustScore) {
        if (typeof tf === 'undefined' || !this.integrationParam || !this.reflexivityParam || this.integrationParam.isDisposed || this.reflexivityParam.isDisposed) {
            return; // Cannot learn without TF or valid params
        }

        tf.tidy(() => {
            const learningRate = 0.005; // How quickly parameters adapt
            // Trust deviation: positive if trust > 0.5, negative if trust < 0.5
            const trustDelta = tf.scalar(trustScore - 0.5);

            // If trust is high (>0.5), increase integration, decrease reflexivity (more stable/integrated)
            // If trust is low (<0.5), decrease integration, increase reflexivity (more exploratory/less integrated)
            const newIntegration = this.integrationParam.add(trustDelta.mul(learningRate));
            const newReflexivity = this.reflexivityParam.sub(trustDelta.mul(learningRate)); // Opposite adjustment

            // Assign updated values, clipped between 0 and 1
            this.integrationParam.assign(newIntegration.clipByValue(0.05, 0.95)); // Keep within reasonable bounds
            this.reflexivityParam.assign(newReflexivity.clipByValue(0.05, 0.95)); // Keep within reasonable bounds
        });
    }

    /**
     * Updates the internal self-state model based on current processing and trust.
     * @param {tf.Tensor} processedStateTensor - The tensor representing the current internal state (e.g., final cascade level).
     * @param {number} trustScore - The calculated trust in the current state vs memory.
     */
    _updateSelfState(processedStateTensor, trustScore) {
         if (typeof tf === 'undefined' || !this.selfState || this.selfState.isDisposed || !processedStateTensor || processedStateTensor.isDisposed) {
             return; // Cannot update without TF or valid tensors
         }

         tf.tidy(() => {
             const decayRate = 0.95; // How much the old self-state persists
             const learningRate = 0.1; // How much the new state influences
             const trustFactor = tf.scalar(trustScore * learningRate); // Learn more when trust is high

             // Ensure shapes match for broadcasting/element-wise ops
             let alignedProcessedState = processedStateTensor.flatten();
             const selfStateShape = this.selfState.shape[0]; // Should be DIMENSIONS
             const processedStateShape = alignedProcessedState.shape[0]; // Can vary

             // Pad or slice the processed state to match the self-state dimension
             if (processedStateShape < selfStateShape) {
                 alignedProcessedState = tf.pad(alignedProcessedState, [[0, selfStateShape - processedStateShape]]);
             } else if (processedStateShape > selfStateShape) {
                 alignedProcessedState = alignedProcessedState.slice(0, selfStateShape);
             }

             const newState = this.selfState.mul(decayRate).add(alignedProcessedState.mul(trustFactor));
             this.selfState.assign(newState); // Update the variable
         });
    }


    // Processes the current state and generates agent responses (V2.1 Logic)
    async process(rawState, environmentContext = { eventType: null, reward: 0 }) {

        if (typeof tf === 'undefined') {
             console.error("TensorFlow.js not available for agent processing.");
             const defaultEmotions = tf.zeros([1, Config.Agent.EMOTION_DIM]); // Need TF here for dummy tensor
             return { cascadeHistory: [], rihScore: 0, affinities: [], emotions: defaultEmotions, hmLabel: 'idle', responseText: "Error: TF not available.", integration: 0.5, reflexivity: 0.5, trustScore: 0.0 };
        }

        // --- Read internal params FIRST and provide defaults ---
        let currentIntegration = 0.5; // Default value
        let currentReflexivity = 0.5; // Default value
        try {
            if (this.integrationParam && !this.integrationParam.isDisposed) {
                currentIntegration = this.integrationParam.dataSync()[0];
            } else { console.warn("Agent integrationParam missing or disposed during read."); }
            if (this.reflexivityParam && !this.reflexivityParam.isDisposed) {
                currentReflexivity = this.reflexivityParam.dataSync()[0];
            } else { console.warn("Agent reflexivityParam missing or disposed during read."); }
        } catch (e) {
            console.error("Error reading agent parameters:", e);
        }
        // --- End Param Reading ---

        let results = {}; // Define results object outside tidy scope

        try { // Add try block around the main tidy operation
            results = tf.tidy(() => {
                // 1. Prepare Input Tensor
                const stateArray = (Array.isArray(rawState) ? rawState : zeros([Config.Agent.BASE_STATE_DIM])).slice(0, Config.Agent.BASE_STATE_DIM);
                while(stateArray.length < Config.Agent.BASE_STATE_DIM) stateArray.push(0); // Pad if needed
                const coreStateTensor = tf.tensor(stateArray.slice(0, Config.DIMENSIONS));

                // 2. Recursive Reflexivity
                const rihModulation = this.lastRIH * (currentReflexivity * 2 - 1);
                let modulatedInput = coreStateTensor.add(tf.scalar(rihModulation * 0.1));
                modulatedInput = modulatedInput.clipByValue(-1, 1);

                // 3. Enyphansyntrix Perturbation
                const perturbationScale = clamp(0.005 + (1.0 - this.lastRIH) * 0.02 + currentReflexivity * 0.02, 0.001, 0.05);
                const perturbedInput = this.enyphansyntrix.apply(modulatedInput, perturbationScale);
                const keptPerturbedInput = tf.keep(perturbedInput.clone()); // Keep this version (size DIMENSIONS)

                // 4. Structural Condensation
                const cascadeHistoryTensors = this.strukturkondensation.process(perturbedInput); // Process the perturbed input
                cascadeHistoryTensors.forEach(t => tf.keep(t)); // Keep intermediates for now
                // Store arrays immediately, handle potential disposal if tidy fails
                const cascadeHistoryArrays = cascadeHistoryTensors.map(t => t.arraySync());

                // 5. Calculate RIH
                const lastCascadeLevelTensor = cascadeHistoryTensors.length > 0 ? cascadeHistoryTensors[cascadeHistoryTensors.length - 1] : tf.tensor([]); // Handle empty cascade result
                const currentRihScore = this.reflexiveIntegration.compute(lastCascadeLevelTensor);

                // 6. Calculate Affinities
                const currentAffinities = [];
                 if (cascadeHistoryTensors.length > 1) {
                    for (let i = 0; i < cascadeHistoryTensors.length - 1; i++) {
                        if (cascadeHistoryTensors[i]?.shape[0] > 0 && cascadeHistoryTensors[i+1]?.shape[0] > 0 && !cascadeHistoryTensors[i].isDisposed && !cascadeHistoryTensors[i+1].isDisposed) {
                             try { // Add inner try-catch for robustness
                                currentAffinities.push(this.affinitaetssyndrom.compute(cascadeHistoryTensors[i], cascadeHistoryTensors[i+1]));
                            } catch (affError) {
                                console.error(`Error computing affinity between levels ${i} and ${i+1}:`, affError);
                                currentAffinities.push(0); // Default on error
                            }
                        } else { currentAffinities.push(0); }
                    }
                }
                const currentAvgAffinity = currentAffinities.length > 0 ? currentAffinities.reduce((a, b) => a + b, 0) / currentAffinities.length : 0;

                // 7. Compute Trust using the input to the cascade
                const currentTrustScore = this._computeTrust(perturbedInput); // Pass perturbedInput

                // --- Keep necessary results ---
                return {
                    keptPerturbedInput, // This IS the perturbedInput, kept for memory update
                    cascadeHistoryTensors, // Return tensors to be disposed outside
                    cascadeHistoryArrays, // Return arrays for immediate use
                    lastCascadeLevelTensor: tf.keep(lastCascadeLevelTensor.clone()), // Keep for self-state update
                    currentRihScore: currentRihScore ?? 0,
                    currentAffinities: currentAffinities,
                    currentAvgAffinity: currentAvgAffinity ?? 0,
                    currentTrustScore: currentTrustScore ?? 0.5
                };
            }); // End of tf.tidy

            // Store cascade history arrays *after* tidy succeeded
            this.latestCascadeHistoryArrays = results.cascadeHistoryArrays;

        } catch (e) {
            console.error("Error during agent core processing (tidy block):", e);
            displayError(`Agent Processing Error: ${e.message}`, false, 'error-message');
            // Assign default values if tidy failed completely
            results = {
                keptPerturbedInput: null, cascadeHistoryTensors: [], lastCascadeLevelTensor: null,
                currentRihScore: this.lastRIH, // Use previous RIH on error
                currentAffinities: [], currentAvgAffinity: 0,
                currentTrustScore: this.latestTrustScore // Use previous Trust on error
            };
            this.latestCascadeHistoryArrays = []; // Clear history on error
        }

        // --- Update Persistent State & Learn (Outside Tidy) ---
        this.lastRIH = results.currentRihScore;
        this.latestRihScore = results.currentRihScore;
        this.latestAffinities = results.currentAffinities;
        this.latestTrustScore = results.currentTrustScore;

        if (results.keptPerturbedInput && !results.keptPerturbedInput.isDisposed) { // Check validity before use
            this._updateMemory(results.keptPerturbedInput);
        }
        if (results.lastCascadeLevelTensor && !results.lastCascadeLevelTensor.isDisposed) { // Check validity before use
             this._updateSelfState(results.lastCascadeLevelTensor, results.currentTrustScore);
        }
        this._learnParameters(results.currentTrustScore);

        // Dispose temporary tensors kept from tidy that are no longer needed
        if (results.keptPerturbedInput && !results.keptPerturbedInput.isDisposed) tf.dispose(results.keptPerturbedInput);
        if (results.lastCascadeLevelTensor && !results.lastCascadeLevelTensor.isDisposed) tf.dispose(results.lastCascadeLevelTensor);
        results.cascadeHistoryTensors?.forEach(t => { if (t && !t.isDisposed) tf.dispose(t); });


        // --- Emotional Module ---
        let currentEmotions = this.prevEmotions; // Default to previous if something goes wrong
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
                // Fallback logic
                console.warn("Emotional model or prevEmotions not available/valid. Applying decay.");
                if (!this.prevEmotions || this.prevEmotions.isDisposed) {
                    this.prevEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
                }
                 const decayedEmotions = tf.tidy(() => this.prevEmotions.mul(0.98).clipByValue(0,1));
                 tf.dispose(this.prevEmotions);
                 this.prevEmotions = tf.keep(decayedEmotions);
                 currentEmotions = this.prevEmotions;
            }
        } catch (e) {
            displayError(`TF Error during emotion prediction: ${e.message}`, false, 'error-message');
            console.error("Emotion Prediction Error:", e);
            // Ensure currentEmotions holds a valid reference
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
                 dominantEmotionName = emotionNames[dominantEmotionIndex] || 'Unknown'; // Get name here

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
                 // Fallback logic if model/emotions unavailable
                 if (this.latestRihScore > 0.7) hmLabel = "nod";
                 else if ((results.currentAvgAffinity ?? 0) < 0.2) hmLabel = "shake";
                 else hmLabel = "idle";
             }
        } catch (e) {
             displayError(`TF Error during head movement prediction: ${e.message}`, false, 'error-message');
             console.error("Head Movement Error:", e);
             hmLabel = "idle";
        }

        // Generate text response (provide defaults for undefined values)
        const rihText = (this.latestRihScore ?? 0).toFixed(2);
        const affText = (results.currentAvgAffinity ?? 0).toFixed(2);
        const trustText = (this.latestTrustScore ?? 0).toFixed(2);
        const intText = (currentIntegration ?? 0.5).toFixed(2); // Use value read at start
        const refText = (currentReflexivity ?? 0.5).toFixed(2); // Use value read at start

        const responseText = `Processed V2.1. RIH:${rihText} Aff:${affText} Trust:${trustText} I:${intText} Ψ:${refText}. Feel:${dominantEmotionName}.`;

        // Return results
        return {
            cascadeHistory: this.latestCascadeHistoryArrays,
            rihScore: this.latestRihScore ?? 0,
            affinities: this.latestAffinities || [],
            emotions: currentEmotions, // Return the persistent tensor
            hmLabel: hmLabel,
            responseText: responseText,
            trustScore: this.latestTrustScore ?? 0.5,
            integration: currentIntegration ?? 0.5, // Return JS value read at start
            reflexivity: currentReflexivity ?? 0.5 // Return JS value read at start
        };
    }


    getState() {
        // Ensure TF is available before accessing sync methods
        if(typeof tf === 'undefined') return {};

        const memoryArrays = this.memoryBuffer.map(tensor =>
            tensor && !tensor.isDisposed ? tensor.arraySync() : []
        );
        const prevEmotionsArray = this.prevEmotions && !this.prevEmotions.isDisposed
            ? this.prevEmotions.arraySync()[0]
            : zeros([Config.Agent.EMOTION_DIM]);
        const selfStateArray = this.selfState && !this.selfState.isDisposed
            ? this.selfState.dataSync() // Use dataSync for variable tensor
            : zeros([Config.DIMENSIONS]);
        const integrationVal = this.integrationParam && !this.integrationParam.isDisposed
            ? this.integrationParam.dataSync()[0]
            : 0.5;
        const reflexivityVal = this.reflexivityParam && !this.reflexivityParam.isDisposed
            ? this.reflexivityParam.dataSync()[0]
            : 0.5;

        return {
            prevEmotions: prevEmotionsArray,
            memoryBuffer: memoryArrays,
            lastRIH: this.lastRIH,
            latestTrustScore: this.latestTrustScore,
            integrationParam: integrationVal, // Save JS value
            reflexivityParam: reflexivityVal, // Save JS value
            selfState: Array.from(selfStateArray), // Ensure standard array
        };
    }


    loadState(state) {
        if (!state || typeof state !== 'object' || typeof tf === 'undefined') return;

        // --- Dispose existing tensors ---
        if (this.prevEmotions && !this.prevEmotions.isDisposed) tf.dispose(this.prevEmotions);
        if (this.selfState && !this.selfState.isDisposed) tf.dispose(this.selfState);
        if (this.integrationParam && !this.integrationParam.isDisposed) tf.dispose(this.integrationParam);
        if (this.reflexivityParam && !this.reflexivityParam.isDisposed) tf.dispose(this.reflexivityParam);
        this.memoryBuffer.forEach(tensor => { if (tensor && !tensor.isDisposed) tf.dispose(tensor); });
        this.memoryBuffer = [];
        // --- End Disposal ---

        // Load previous emotions
        const prevEmotionsArray = Array.isArray(state.prevEmotions) ? state.prevEmotions : zeros([Config.Agent.EMOTION_DIM]);
        this.prevEmotions = tf.keep(tf.tensor([prevEmotionsArray], [1, Config.Agent.EMOTION_DIM]));

        // Load memory buffer
        if (Array.isArray(state.memoryBuffer)) {
            state.memoryBuffer.forEach(memArray => {
                 if (Array.isArray(memArray) && memArray.length > 0) {
                     const expectedShape = [Config.DIMENSIONS]; // Assuming memory stores core dimensions
                     const paddedArray = [...memArray].slice(0, expectedShape[0]);
                     while(paddedArray.length < expectedShape[0]) paddedArray.push(0);
                     const memTensor = tf.tensor(paddedArray);
                     this.memoryBuffer.push(tf.keep(memTensor));
                 }
            });
            while (this.memoryBuffer.length > this.memorySize) {
                 const oldTensor = this.memoryBuffer.shift();
                 if (oldTensor && !oldTensor.isDisposed) tf.dispose(oldTensor);
            }
        }

        // Load last RIH and Trust
        this.lastRIH = typeof state.lastRIH === 'number' ? state.lastRIH : 0.0;
        this.latestTrustScore = typeof state.latestTrustScore === 'number' ? state.latestTrustScore : 1.0;

        // Load Self-Learning Parameters (Load JS value, create new variable)
        const integrationVal = typeof state.integrationParam === 'number' ? state.integrationParam : 0.5;
        const reflexivityVal = typeof state.reflexivityParam === 'number' ? state.reflexivityParam : 0.5;
        this.integrationParam = tf.keep(tf.variable(tf.scalar(integrationVal), true, 'agentIntegrationParam'));
        this.reflexivityParam = tf.keep(tf.variable(tf.scalar(reflexivityVal), true, 'agentReflexivityParam'));

        // Load Self-State (Load array, create new variable)
        const selfStateArray = Array.isArray(state.selfState) ? state.selfState : zeros([Config.DIMENSIONS]);
        const paddedSelfState = [...selfStateArray].slice(0, Config.DIMENSIONS);
        while (paddedSelfState.length < Config.DIMENSIONS) paddedSelfState.push(0);
        this.selfState = tf.keep(tf.variable(tf.tensor(paddedSelfState), true, 'agentSelfState'));

        // Reset latest calculated values
        this.latestCascadeHistoryArrays = [];
        this.latestRihScore = 0;
        this.latestAffinities = [];

        console.log("Agent state loaded (V2.1).");
    }


     cleanup() {
         console.log("Cleaning up Agent tensors (V2.1)...");
         if (typeof tf === 'undefined') return; // Cannot clean up if TF is not loaded

         // Dispose TF models safely
         if (this.emotionalModule?.dispose) { try { this.emotionalModule.dispose(); } catch(e){ console.error("Error disposing emotionalModule:",e);}}
         if (this.headMovementHead?.dispose) { try { this.headMovementHead.dispose(); } catch(e){ console.error("Error disposing headMovementHead:",e);}}
         // Dispose tf.variable tensors safely
         if (this.prevEmotions && !this.prevEmotions.isDisposed) { try { tf.dispose(this.prevEmotions); } catch(e){ console.error("Error disposing prevEmotions:",e);}}
         if (this.selfState && !this.selfState.isDisposed) { try { tf.dispose(this.selfState); } catch(e){ console.error("Error disposing selfState:",e);}}
         if (this.integrationParam && !this.integrationParam.isDisposed) { try { tf.dispose(this.integrationParam); } catch(e){ console.error("Error disposing integrationParam:",e);}}
         if (this.reflexivityParam && !this.reflexivityParam.isDisposed) { try { tf.dispose(this.reflexivityParam); } catch(e){ console.error("Error disposing reflexivityParam:",e);}}
         // Dispose memory buffer tensors safely
         this.memoryBuffer.forEach(tensor => { if (tensor && !tensor.isDisposed) { try { tf.dispose(tensor); } catch(e){ console.error("Error disposing tensor in memoryBuffer:",e);}} });

         // Nullify references
         this.emotionalModule = null;
         this.headMovementHead = null;
         this.prevEmotions = null;
         this.selfState = null;
         this.integrationParam = null;
         this.reflexivityParam = null;
         this.memoryBuffer = [];
         console.log("Agent TensorFlow tensors disposed (V2.1).");
     }
}
