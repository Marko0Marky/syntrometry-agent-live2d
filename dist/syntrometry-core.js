// @ts-nocheck
// js/syntrometry-core.ts
import * as tf from '@tensorflow/tfjs';
import { Config } from './config.js';
import { displayError } from './utils.js';
// Only import what's actually available in tensorUtils.js
import { safeDispose } from './tensorUtils.js';
// Helper functions to replace missing imports
function isTensor(value) {
    return value !== null && value !== undefined && typeof value.isDisposed === 'boolean';
}
function ensureTensor(value) {
    if (isTensor(value) && !value.isDisposed) {
        return value;
    }
    try {
        return tf.tensor(value);
    }
    catch (e) {
        console.error("Failed to convert to tensor:", e);
        return tf.tensor([]);
    }
}
// Modified to handle null safely and always return a Tensor
function safeKeep(tensor) {
    if (tensor && typeof tensor.isDisposed === 'boolean' && !tensor.isDisposed) {
        return tf.keep(tensor.clone());
    }
    return tf.keep(tf.tensor([]));
}
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
     */
    apply(stateTensor, perturbationScale = 0.01) {
        // tf is now imported
        if (!tf?.tensor) { // Basic check if TF is loaded
            console.error("[Enyphansyntrix] TensorFlow not available.");
            // Ensure Config.DIMENSIONS is valid before using
            const dim = typeof Config?.DIMENSIONS === 'number' && Config.DIMENSIONS > 0 ? Config.DIMENSIONS : 1;
            return tf.zeros([1, dim]); // Return 2D tensor [1, dim]
        }
        return tf.tidy(() => {
            if (this.type === 'discrete') {
                const tauScalar = tf.scalar(Config.METRON_TAU || 0.1); // Use default if needed
                const scaled = tf.div(stateTensor, tauScalar);
                const rounded = tf.round(scaled);
                return tf.clipByValue(tf.mul(rounded, tauScalar), -1, 1);
            }
            else { // Continuous mode
                const noise = tf.randomNormal(stateTensor.shape, 0, perturbationScale);
                return tf.clipByValue(tf.add(stateTensor, noise), -1, 1);
            }
        });
    }
}
/**
 * Computes affinity (cosine similarity) between two syndromes or tensors.
 */
export class Affinitaetssyndrom {
    /**
     * Calculates the cosine similarity between two input tensors or arrays.
     */
    compute(syndromeA, syndromeB) {
        if (!tf?.tensor) {
            console.error("[Affinitaetssyndrom] TensorFlow not available.");
            return 0;
        }
        try {
            // tf.tidy will manage disposal of intermediate tensors
            return tf.tidy(() => {
                // Convert inputs to tensors
                const tensorA_internal = ensureTensor(syndromeA);
                const tensorB_internal = ensureTensor(syndromeB);
                // If tensors have different sizes, pad the smaller one
                let tensorA = tensorA_internal;
                let tensorB = tensorB_internal;
                if (tensorA.shape[0] < tensorB.shape[0]) {
                    const padSize = tensorB.shape[0] - tensorA.shape[0];
                    tensorA = tf.pad(tensorA, [[0, padSize]]);
                }
                else if (tensorB.shape[0] < tensorA.shape[0]) {
                    const padSize = tensorA.shape[0] - tensorB.shape[0];
                    tensorB = tf.pad(tensorB, [[0, padSize]]);
                }
                const normA = tf.norm(tensorA);
                const normB = tf.norm(tensorB);
                const normProd = tf.mul(normA, normB);
                // Check scalar value directly
                if (normProd.arraySync() < 1e-9) {
                    return 0;
                }
                const dotProduct = tf.dot(tensorA, tensorB);
                const similarity = tf.clipByValue(tf.div(dotProduct, normProd), -1, 1);
                return similarity.arraySync();
            });
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            displayError(`TF Error in Affinitaetssyndrom compute: ${message}`, false);
            console.error("[Affinitaetssyndrom] Full error:", e);
            return 0;
        }
    }
}
/**
 * Represents a Synkolator, combining elements at a given stage using Tensors.
 */
export class Synkolator {
    constructor(type = 'pyramidal', stage = Config.CASCADE_STAGE || 2) {
        this.type = type;
        this.stage = Math.max(2, stage);
        if (type !== 'pyramidal' && type !== 'average') {
            console.warn(`[Synkolator] Unsupported type "${type}". Defaulting to "pyramidal".`);
            this.type = 'pyramidal';
        }
    }
    /**
     * Applies the synkolation rule to a tensor representing a level of elements.
     */
    apply(elementsTensor) {
        if (!tf?.tensor) {
            console.error("[Synkolator] TensorFlow not available.");
            return tf.tensor([]); // Return empty tensor instead of null
        }
        if (!elementsTensor || elementsTensor.isDisposed || elementsTensor.rank !== 1 || elementsTensor.shape[0] === 0) {
            console.warn("[Synkolator] Invalid input tensor. Expected 1D tensor.", elementsTensor);
            return tf.tensor([]); // Return empty tensor instead of null
        }
        return tf.tidy(() => {
            if (this.type === 'pyramidal') {
                // Implementation for pyramidal type
                const numElements = elementsTensor.shape[0];
                // Simple implementation - return the input tensor
                return elementsTensor.clone();
            }
            else if (this.type === 'average') {
                // Simple average of all elements
                return tf.mean(elementsTensor, 0, true);
            }
            // Default case - return empty tensor instead of null
            console.warn(`[Synkolator] Unknown type in apply: ${this.type}. Returning empty tensor.`);
            return tf.tensor([]);
        });
    }
}
/**
 * Represents the ReflexiveIntegration, computing RIH scores from syndromes.
 */
export class ReflexiveIntegration {
    /**
     * Computes the Reflexive Integration Harmonic (RIH) score for a syndrome tensor.
     */
    compute(syndromesTensor) {
        if (!tf?.tensor) {
            console.error("[ReflexiveIntegration] TensorFlow not available.");
            return 0;
        }
        if (!syndromesTensor || syndromesTensor.isDisposed) {
            console.warn("[ReflexiveIntegration] Invalid input tensor.", syndromesTensor);
            return 0;
        }
        let rihScore = 0;
        let localFlatTensor = null;
        try {
            // Use tf.tidy to manage tensor lifecycle
            const normalizedTensor = tf.tidy(() => {
                return tf.div(syndromesTensor, tf.add(tf.norm(syndromesTensor), tf.scalar(1e-8)));
            });
            // tf.tidy manages intermediate tensors (mean, variance, sqrt, abs, etc.)
            rihScore = tf.tidy(() => {
                const { mean, variance } = tf.moments(normalizedTensor);
                const varianceVal = variance.arraySync();
                if (varianceVal < 1e-9) {
                    return 0;
                }
                const stddev = tf.sqrt(variance);
                const rihScoreTensor = tf.clipByValue(tf.mul(tf.abs(tf.div(mean, stddev)), tf.scalar(Config.RIH_SCALE || 0.5)), 0, 1);
                return rihScoreTensor.dataSync()[0];
            });
            normalizedTensor.dispose();
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            displayError(`TF Error in ReflexiveIntegration compute: ${message}`, false);
            console.error("[ReflexiveIntegration] Full error:", e);
        }
        finally {
            safeDispose(localFlatTensor); // Use the imported safeDispose function
        }
        return rihScore;
    }
}
/**
 * Represents the Strukturkondensation, processing elements through cascade levels.
 */
export class Strukturkondensation {
    constructor(numLevels = 3, type = 'pyramidal') {
        this.synkolators = [];
        for (let i = 0; i < numLevels; i++) {
            this.synkolators.push(new Synkolator(type, 2 + i)); // Increasing stage size
        }
    }
    /**
     * Processes an initial tensor through the cascade levels using Synkolators.
     * Returns an array of *kept, cloned* tensors representing the state at each level.
     */
    process(initialElementsTensor) {
        if (!tf?.tensor) {
            console.error("[Strukturkondensation] TensorFlow not available.");
            return [tf.keep(tf.tensor([]))]; // Return kept empty tensor in array
        }
        // Expect 1D tensor input
        if (!initialElementsTensor || initialElementsTensor.isDisposed || initialElementsTensor.rank !== 1) {
            console.warn("[Strukturkondensation] Invalid or disposed initial tensor. Expected 1D tensor. Returning empty history.", initialElementsTensor);
            return [tf.keep(tf.tensor([]))];
        }
        const history = [];
        const tensorsToDispose = [];
        try {
            // Add initial tensor to history (kept/cloned)
            history.push(tf.keep(initialElementsTensor.clone()));
            // Process through each level
            let currentTensor = initialElementsTensor;
            for (let i = 0; i < this.synkolators.length; i++) {
                const nextTensor = this.synkolators[i].apply(currentTensor);
                history.push(tf.keep(nextTensor.clone())); // Keep a copy for history
                // If not the last iteration, store for disposal
                if (i < this.synkolators.length - 1) {
                    tensorsToDispose.push(nextTensor);
                }
                else {
                    // Last tensor should also be disposed after we're done with it
                    tensorsToDispose.push(nextTensor);
                }
                currentTensor = nextTensor;
            }
            return history;
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            displayError(`TF Error in Strukturkondensation process: ${message}`, false);
            console.error("[Strukturkondensation] Full error:", e);
            return [tf.keep(tf.tensor([]))];
        }
        finally {
            // Clean up intermediate tensors
            for (const tensor of tensorsToDispose) {
                safeDispose(tensor); // Use the imported safeDispose function
            }
        }
    }
}
// --- END OF FILE syntrometry-core.ts ---
//# sourceMappingURL=syntrometry-core.js.map