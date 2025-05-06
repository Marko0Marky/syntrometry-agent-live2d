// js/syntrometry-core.js

import * as tf from '@tensorflow/tfjs'; // Use consistent TFJS import
import { Config } from './config.js';
import { zeros, clamp, displayError } from './utils.js'; // Renamed tensor util
import { safeDispose, safeGetScalar, containsNaNOrInf } from './tensorUtils.js'; // Import helpers

/**
 * Represents the Enyphansyntrix, applying transformations to state tensors.
 */
export class Enyphansyntrix {
    constructor(type = 'continuous') {
        this.type = type;
        if (type !== 'continuous' && type !== 'discrete') {
            console.warn(`[Enyphansyntrix] Unknown type "${type}". Defaulting to "continuous".`);
            this.type = 'continuous';
        }
    }

    /**
     * Applies transformation based on the configured type.
     * 'continuous': adds Gaussian noise scaled by perturbationScale.
     * 'discrete': rounds values to multiples of METRON_TAU.
     * @param {tf.Tensor} stateTensor - Input tensor (expected 1D).
     * @param {number} [perturbationScale=0.01] - Std deviation for noise (continuous mode).
     * @returns {tf.Tensor} - Transformed tensor (1D), clipped to [-1, 1]. Returns zeros on error.
     */
    apply(stateTensor, perturbationScale = 0.01) {
        if (typeof tf === 'undefined') {
            console.error("[Enyphansyntrix] TensorFlow not available.");
            return tf.zeros([Config.DIMENSIONS]);
        }
        if (!(stateTensor instanceof tf.Tensor) || stateTensor.isDisposed) {
            console.warn("[Enyphansyntrix] Invalid or disposed input tensor. Returning zeros.");
            return tf.zeros([Config.DIMENSIONS]);
        }
        // Expecting 1D tensor of length DIMENSIONS
        const expectedShape = [Config.DIMENSIONS];
        if (stateTensor.rank !== 1 || stateTensor.shape[0] !== expectedShape[0]) {
             console.warn(`[Enyphansyntrix] Input tensor shape mismatch. Expected ${expectedShape}, got ${stateTensor.shape}. Returning zeros.`);
             return tf.zeros(expectedShape);
        }

        try {
            return tf.tidy(() => {
                if (this.type === 'discrete') {
                    const tauScalar = tf.scalar(Config.METRON_TAU);
                    return stateTensor.div(tauScalar).round().mul(tauScalar).clipByValue(-1, 1);
                } else { // Continuous mode
                    const noise = tf.randomNormal(stateTensor.shape, 0, perturbationScale);
                    return stateTensor.add(noise).clipByValue(-1, 1);
                }
            });
        } catch (e) {
             console.error("[Enyphansyntrix] Error during apply:", e);
             return tf.zeros(expectedShape); // Return zeros on error
        }
    }
}

/**
 * Computes affinity (cosine similarity) between two syndromes (tensors).
 */
export class Affinitaetssyndrom {
    /**
     * Calculates cosine similarity. Handles potential shape mismatches by padding.
     * @param {tf.Tensor | number[]} syndromeA - First input.
     * @param {tf.Tensor | number[]} syndromeB - Second input.
     * @returns {number} Affinity score [-1, 1], or 0 on error/invalid input.
     */
    compute(syndromeA, syndromeB) {
        if (typeof tf === 'undefined') {
            console.error("[Affinitaetssyndrom] TensorFlow not available.");
            return 0;
        }

        let result = 0;
        try {
            const similarityScalar = tf.tidy(() => {
                let tensorA = (syndromeA instanceof tf.Tensor) ? syndromeA : createTensorUtil(syndromeA);
                let tensorB = (syndromeB instanceof tf.Tensor) ? syndromeB : createTensorUtil(syndromeB);

                if (!tensorA || tensorA.isDisposed || !tensorB || tensorB.isDisposed) {
                    console.warn("[Affinitaetssyndrom] Invalid/disposed input tensors.");
                    return tf.scalar(0);
                }

                tensorA = tensorA.flatten(); // Ensure 1D
                tensorB = tensorB.flatten();

                const lenA = tensorA.shape[0];
                const lenB = tensorB.shape[0];
                if (lenA === 0 || lenB === 0) return tf.scalar(0); // Handle empty tensors

                const maxLength = Math.max(lenA, lenB);
                if (lenA < maxLength) tensorA = tf.pad(tensorA, [[0, maxLength - lenA]]);
                if (lenB < maxLength) tensorB = tf.pad(tensorB, [[0, maxLength - lenB]]);

                const normA = tf.norm(tensorA);
                const normB = tf.norm(tensorB);
                const normProd = tf.mul(normA, normB);

                if (safeGetScalar(normProd, 0) < 1e-9) return tf.scalar(0);

                const dotProduct = tf.dot(tensorA, tensorB);
                return dotProduct.div(normProd).clipByValue(-1, 1);
            });
            result = safeGetScalar(similarityScalar, 0); // Get JS number
            safeDispose(similarityScalar); // Dispose the scalar returned by tidy
        } catch (e) {
            displayError(`TF Error in Affinitaetssyndrom compute: ${e.message}`, false);
            console.error("[Affinitaetssyndrom] Full error:", e);
            result = 0;
        }
        return result;
    }
}

/**
 * Represents a Synkolator, combining elements at a given stage using Tensors.
 */
export class Synkolator {
    constructor(type = 'pyramidal', stage = Config.CASCADE_STAGE) {
        this.type = type;
        this.stage = Math.max(2, stage); // Ensure stage >= 2
        if (type !== 'pyramidal' && type !== 'average') {
            console.warn(`[Synkolator] Unsupported type "${type}". Defaulting to "pyramidal".`);
            this.type = 'pyramidal';
        }
    }

    /**
     * Applies the synkolation rule (e.g., sliding window mean).
     * @param {tf.Tensor} elementsTensor - 1D Tensor of elements.
     * @returns {tf.Tensor} - 1D Tensor of resulting syndromes. Returns empty tensor if input invalid or too small for the stage.
     */
    apply(elementsTensor) {
        if (typeof tf === 'undefined') {
            console.error("[Synkolator] TensorFlow not available.");
            return tf.tensor([]);
        }
        if (!(elementsTensor instanceof tf.Tensor) || elementsTensor.isDisposed || elementsTensor.rank !== 1) {
            // console.warn("[Synkolator] Invalid input tensor. Returning empty tensor.");
            return tf.tensor([]);
        }
        const numElements = elementsTensor.shape[0];
        if (numElements === 0) return tf.tensor([]);

        try {
            if (this.type === 'pyramidal') {
                if (numElements < this.stage) {
                    return tf.tensor([]); // Cannot apply stage if not enough elements
                }
                // Use tf.tidy for intermediate operations
                return tf.tidy(() => {
                    // Efficient sliding window average using conv1d might be complex to set up.
                    // Simple loop is clearer for now.
                    const syndromes = [];
                    for (let i = 0; i <= numElements - this.stage; i++) {
                        const slice = elementsTensor.slice(i, this.stage);
                        syndromes.push(tf.mean(slice));
                    }
                    return (syndromes.length > 0) ? tf.stack(syndromes) : tf.tensor([]);
                });
            } else if (this.type === 'average') {
                return tf.mean(elementsTensor).reshape([1]);
            }
        } catch (e) {
             console.error("[Synkolator] Error during apply:", e);
             return tf.tensor([]); // Return empty on error
        }
        // Fallback (shouldn't be reached)
        return tf.tensor([]);
    }
}

/**
 * Computes the Reflexive Integration Hierarchy (RIH) score from a Tensor.
 */
export class ReflexiveIntegration {
    /**
     * Calculates the RIH score.
     * @param {tf.Tensor} syndromesTensor - A 1D tensor (e.g., final cascade level).
     * @returns {number} RIH score [0, 1], or 0 on error/invalid input.
     */
    compute(syndromesTensor) {
        if (typeof tf === 'undefined') {
            console.error("[ReflexiveIntegration] TensorFlow not available.");
            return 0;
        }
        if (!(syndromesTensor instanceof tf.Tensor) || syndromesTensor.isDisposed) {
            // console.warn("[ReflexiveIntegration] Invalid input tensor.");
            return 0;
        }
        const flatTensor = syndromesTensor.flatten(); // Ensure 1D
        if (flatTensor.shape[0] < 2) {
            safeDispose(flatTensor);
            return 0; // Variance undefined for < 2 elements
        }

        let rihScore = 0;
        try {
            const rihScalar = tf.tidy(() => {
                const { mean, variance } = tf.moments(flatTensor);
                const varianceVal = safeGetScalar(variance, 0);
                if (varianceVal < 1e-9) return tf.scalar(0); // Avoid division by zero

                const stddev = tf.sqrt(variance);
                return tf.abs(mean.div(stddev))
                         .mul(tf.scalar(Config.RIH_SCALE))
                         .clipByValue(0, 1);
            });
            rihScore = safeGetScalar(rihScalar, 0); // Get JS number
            safeDispose(rihScalar); // Dispose the scalar
        } catch (e) {
            displayError(`TF Error in ReflexiveIntegration: ${e.message}`, false);
            console.error("[ReflexiveIntegration] Full error:", e);
            rihScore = 0;
        } finally {
            safeDispose(flatTensor); // Dispose the flattened tensor
        }
        return rihScore;
    }
}

/**
 * Processes the Structural Condensation cascade using Tensors.
 */
export class Strukturkondensation {
    constructor(levels = Config.CASCADE_LEVELS, synkolatorStage = Config.CASCADE_STAGE) {
        this.levels = levels;
        this.synkolators = [];
        for (let i = 0; i < levels; i++) {
            this.synkolators.push(new Synkolator('pyramidal', synkolatorStage));
        }
    }

    /**
     * Processes an initial tensor through the cascade levels.
     * Returns an array of *intermediate, non-kept* tensors representing the state at each level.
     * The caller (e.g., agent.js) is responsible for managing these tensors (e.g., within its own tf.tidy).
     * @param {tf.Tensor} initialElementsTensor - 1D Tensor (e.g., from belief projection).
     * @returns {tf.Tensor[]} - Array of intermediate Tensors [level 0, level 1, ...]. Returns `[tf.tensor([])]` on invalid input.
     */
    process(initialElementsTensor) {
        if (typeof tf === 'undefined') {
            console.error("[Strukturkondensation] TensorFlow not available.");
            return [tf.tensor([])];
        }
        if (!(initialElementsTensor instanceof tf.Tensor) || initialElementsTensor.isDisposed || initialElementsTensor.rank !== 1) {
            console.warn("[Strukturkondensation] Invalid or disposed initial tensor. Returning empty history.");
            return [tf.tensor([])];
        }
        if (initialElementsTensor.shape[0] === 0) {
            return [tf.tensor([])];
        }

        const history = [];
        let currentLevelTensor = initialElementsTensor; // Start with the input tensor directly
        history.push(currentLevelTensor); // Add initial tensor (level 0)

        for (let i = 0; i < this.levels; i++) {
            if (!this.synkolators[i]) break; // Should not happen if constructor is correct

            const synkolator = this.synkolators[i];
            const nextLevelTensor = synkolator.apply(currentLevelTensor); // Get the next level tensor

            // Check if synkolation stopped or produced invalid tensor
            if (!nextLevelTensor || nextLevelTensor.isDisposed || nextLevelTensor.shape[0] === 0) {
                safeDispose(nextLevelTensor); // Dispose if invalid but not disposed
                break; // Stop cascade if reduction fails or yields empty
            }

            history.push(nextLevelTensor); // Add the new intermediate tensor to history
            currentLevelTensor = nextLevelTensor; // Update for next iteration
        }

        // Note: Tensors in 'history' are intermediates created by Synkolator.apply (likely within its own tidy).
        // The agent's main tidy block will manage them.
        return history;
    }
}