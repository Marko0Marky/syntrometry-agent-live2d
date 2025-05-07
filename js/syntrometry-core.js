// js/syntrometry-core.js

import { Config } from './config.js';
import { zeros, tensor, clamp, displayError } from './utils.js'; // Assuming tf is global or correctly managed

/**
 * Represents the Enyphansyntrix, applying transformations to state tensors.
 * In 'continuous' mode, it adds controlled noise (perturbation).
 * In 'discrete' mode (less used now), it quantizes based on METRON_TAU.
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
     * For 'continuous', adds Gaussian noise scaled by perturbationScale.
     * For 'discrete', rounds values to multiples of METRON_TAU.
     * @param {tf.Tensor} stateTensor - Input tensor (should be 1D or reshaped).
     * @param {number} [perturbationScale=0.01] - The standard deviation of the noise to add (used only in 'continuous' mode).
     * @returns {tf.Tensor} - The transformed tensor, clipped to [-1, 1]. Returns zeros if TF not available or input invalid.
     */
    apply(stateTensor, perturbationScale = 0.01) {
        if (typeof tf === 'undefined') {
            console.error("[Enyphansyntrix] TensorFlow not available.");
            return tf.zeros([Config.DIMENSIONS]);
        }
        if (!(stateTensor instanceof tf.Tensor) || stateTensor.isDisposed) {
            // console.warn("[Enyphansyntrix] Invalid or disposed input tensor. Returning zero tensor."); // Noisy
            return tf.zeros([Config.DIMENSIONS]);
        }
         if (stateTensor.shape.length === 0 || stateTensor.shape[stateTensor.shape.length - 1] !== Config.DIMENSIONS) {
             // console.warn(`[Enyphansyntrix] Input tensor shape mismatch. Expected last dimension ${Config.DIMENSIONS}, got ${stateTensor.shape}. Returning zeros.`); // Noisy
             return tf.zeros([Config.DIMENSIONS]);
         }

        return tf.tidy(() => {
            if (this.type === 'discrete') {
                const tauScalar = tf.scalar(Config.METRON_TAU);
                const scaled = stateTensor.div(tauScalar);
                const rounded = tf.round(scaled);
                return rounded.mul(tauScalar).clipByValue(-1, 1);
            } else { 
                const noise = tf.randomNormal(stateTensor.shape, 0, perturbationScale);
                return stateTensor.add(noise).clipByValue(-1, 1);
            }
        });
    }
}

/**
 * Computes affinity (cosine similarity) between two syndromes or tensors.
 * Handles tensors of potentially different lengths by padding the shorter one.
 */
export class Affinitaetssyndrom {
    /**
     * Calculates the cosine similarity between two input tensors or arrays.
     * @param {tf.Tensor | number[]} syndromeA - The first input.
     * @param {tf.Tensor | number[]} syndromeB - The second input.
     * @returns {number} The affinity score (cosine similarity) between -1 and 1, or 0 on error/invalid input.
     */
    compute(syndromeA, syndromeB) {
        if (typeof tf === 'undefined') {
            console.error("[Affinitaetssyndrom] TensorFlow not available.");
            return 0;
        }

        try {
            return tf.tidy(() => {
                let tensorA = (syndromeA instanceof tf.Tensor) ? syndromeA : tensor(syndromeA);
                let tensorB = (syndromeB instanceof tf.Tensor) ? syndromeB : tensor(syndromeB);

                 if (!tensorA || tensorA.isDisposed || !tensorB || tensorB.isDisposed) {
                     // console.warn("[Affinitaetssyndrom] Invalid or disposed input tensors after conversion."); // Noisy
                     return tf.scalar(0);
                 }

                tensorA = tensorA.flatten();
                tensorB = tensorB.flatten();

                const lenA = tensorA.shape[0];
                const lenB = tensorB.shape[0];

                if (lenA === 0 || lenB === 0) return tf.scalar(0);

                const maxLength = Math.max(lenA, lenB);
                if (lenA < maxLength) {
                    tensorA = tf.pad(tensorA, [[0, maxLength - lenA]]);
                } else if (lenB < maxLength) {
                    tensorB = tf.pad(tensorB, [[0, maxLength - lenB]]);
                }

                const normA = tf.norm(tensorA);
                const normB = tf.norm(tensorB);
                const normProd = normA.mul(normB);

                if (normProd.arraySync() < 1e-9) {
                     return tf.scalar(0);
                }

                const dotProduct = tf.dot(tensorA, tensorB);
                const similarity = dotProduct.div(normProd).clipByValue(-1, 1);

                return similarity;
            }).arraySync();
        } catch (e) {
            // displayError(`TF Error in Affinitaetssyndrom compute: ${e.message}`, false); // Potentially noisy
            console.error("[Affinitaetssyndrom] Full error:", e);
            return 0;
        }
    }
}


/**
 * Represents a Synkolator, combining elements at a given stage using Tensors.
 * Implements the 'pyramidal' reduction rule (sliding window mean).
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
     * @param {tf.Tensor} elementsTensor - 1D Tensor of elements.
     * @returns {tf.Tensor} - 1D Tensor of resulting syndromes, or an empty tensor if input is invalid or too small.
     */
    apply(elementsTensor) {
         if (typeof tf === 'undefined') {
             console.error("[Synkolator] TensorFlow not available.");
             return tf.tensor([]);
         }
         if (!(elementsTensor instanceof tf.Tensor) || elementsTensor.isDisposed || elementsTensor.rank !== 1 || elementsTensor.shape[0] === 0) {
             return tf.tensor([]);
         }

        const numElements = elementsTensor.shape[0];

        if (this.type === 'pyramidal') {
            if (numElements < this.stage) {
                return tf.tensor([]);
            }

            return tf.tidy(() => {
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
        return tf.tensor([]);
    }
}

/**
 * Computes the Reflexive Integration Hierarchy (RIH) score from a Tensor.
 * RIH measures the coherence or integration of a system state representation.
 * Calculated as |mean| / sqrt(variance) of the input tensor elements, scaled and clamped.
 */
export class ReflexiveIntegration {
    /**
     * Calculates the RIH score for the given tensor.
     * @param {tf.Tensor} syndromesTensor - A 1D tensor representing the final level of a cascade or system state.
     * @returns {number} The RIH score, clamped between 0 and 1, or 0 if input is invalid or variance is near zero.
     */
    compute(syndromesTensor) {
        if (typeof tf === 'undefined') {
             console.error("[ReflexiveIntegration] TensorFlow not available.");
             return 0;
        }
        if (!(syndromesTensor instanceof tf.Tensor) || syndromesTensor.isDisposed) {
            return 0;
        }

        const flatTensor = syndromesTensor.flatten(); // Keep reference to dispose
        if (flatTensor.shape[0] < 2) {
            if (!flatTensor.isDisposed) tf.dispose(flatTensor); // Dispose manually
            return 0;
        }

        try {
            return tf.tidy(() => {
                const { mean, variance } = tf.moments(flatTensor);
                const varianceVal = variance.arraySync();

                if (varianceVal < 1e-9) {
                     return tf.scalar(0);
                }
                const rihScoreTensor = tf.abs(mean.div(tf.sqrt(variance)))
                                  .mul(tf.scalar(Config.RIH_SCALE))
                                  .clipByValue(0, 1);
                return rihScoreTensor;
            }).arraySync();
        } catch (e) {
            // displayError(`TF Error in ReflexiveIntegration: ${e.message}`, false); // Noisy
            console.error("[ReflexiveIntegration] Full error:", e);
            return 0;
        } finally {
             if (flatTensor && !flatTensor.isDisposed) tf.dispose(flatTensor); // Ensure disposal
        }
    }
}


/**
 * Processes the Structural Condensation cascade using Tensors.
 * Applies Synkolators iteratively across levels to reduce dimensionality.
 */
export class Strukturkondensation {
    constructor(levels = Config.CASCADE_LEVELS, synkolatorStage = Config.CASCADE_STAGE || 2) {
        this.levels = levels;
        this.synkolators = [];
        for (let i = 0; i < levels; i++) {
            this.synkolators.push(new Synkolator('pyramidal', synkolatorStage));
        }
    }

    /**
     * Processes an initial tensor through the cascade levels using Synkolators.
     * Returns an array of *kept, cloned* tensors representing the state at each level.
     * @param {tf.Tensor} initialElementsTensor - 1D Tensor of initial elements (e.g., from agent's belief projection).
     * @returns {tf.Tensor[]} - Array of kept Tensors (clones) representing elements at each level [level 0, level 1, ...]. Returns `[tf.tensor([])]` on invalid input.
     */
    process(initialElementsTensor) {
        if (typeof tf === 'undefined') {
             console.error("[Strukturkondensation] TensorFlow not available.");
             return [tf.tensor([])];
        }
        if (!(initialElementsTensor instanceof tf.Tensor) || initialElementsTensor.isDisposed || initialElementsTensor.rank !== 1) {
            // console.warn("[Strukturkondensation] Invalid or disposed initial tensor. Returning empty history."); // Noisy
             return [tf.tensor([])];
        }
         if (initialElementsTensor.shape[0] === 0) {
             return [tf.tensor([])];
         }

        // No tf.tidy here because we are explicitly keeping tensors for history
        let currentLevelTensor = initialElementsTensor.clone(); // Start with a clone
        const history = [tf.keep(currentLevelTensor.clone())]; // Keep the initial level

        for (let i = 0; i < this.levels; i++) {
            if (currentLevelTensor.shape[0] === 0 || !this.synkolators[i]) break;

            const synkolator = this.synkolators[i];
            const nextLevelTensorUnkept = synkolator.apply(currentLevelTensor); // This is tidied internally by synkolator

            // Dispose the tensor from the previous iteration
            // (it was either the initial input's clone or a result from previous loop)
            tf.dispose(currentLevelTensor);

            if (!nextLevelTensorUnkept || nextLevelTensorUnkept.isDisposed || nextLevelTensorUnkept.shape[0] === 0) {
                if (nextLevelTensorUnkept && !nextLevelTensorUnkept.isDisposed) tf.dispose(nextLevelTensorUnkept);
                history.push(tf.keep(tf.tensor([]))); // Keep an empty tensor placeholder
                currentLevelTensor = tf.tensor([]); // Ensure loop terminates
                break;
            }
            
            currentLevelTensor = nextLevelTensorUnkept; // Result of apply becomes input for next
            history.push(tf.keep(currentLevelTensor.clone())); // Keep a clone of it for history
        }

        // Dispose the final currentLevelTensor if it wasn't added to history as a clone or is just an empty tensor
        if (!history.includes(currentLevelTensor) && !currentLevelTensor.isDisposed && currentLevelTensor.shape[0] > 0) {
             tf.dispose(currentLevelTensor);
        } else if (currentLevelTensor.shape[0] === 0 && !currentLevelTensor.isDisposed){ // if it was an empty tensor set to break the loop
             tf.dispose(currentLevelTensor);
        }


        return history;
    }
}
