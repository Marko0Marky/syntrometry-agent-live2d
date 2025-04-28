// js/syntrometry-core.js

import { Config } from './config.js';
import { zeros, tensor, clamp, displayError } from './utils.js'; // Assuming tf is global or correctly managed

/**
 * Represents the Enyphansyntrix, applying transformations to state tensors.
 * Now accepts a perturbation scale.
 */
export class Enyphansyntrix {
    constructor(type = 'continuous') { // Defaulting to continuous for perturbation
        this.type = type;
    }

    /**
     * Applies transformation, potentially adding noise.
     * @param {tf.Tensor} stateTensor - Input tensor (should be 1D or reshaped).
     * @param {number} [perturbationScale=0.01] - The standard deviation of the noise to add.
     * @returns {tf.Tensor} - The transformed tensor.
     */
    apply(stateTensor, perturbationScale = 0.01) {
        if (!(stateTensor instanceof tf.Tensor)) {
            console.warn("[Enyphansyntrix] Invalid input. Expected tf.Tensor. Returning zero tensor.");
            // Ensure consistent return shape based on config if input is invalid
            const expectedShape = [Config.DIMENSIONS]; // Expecting core dimensions input here now
            return tf.zeros(expectedShape);
        }

        if (this.type === 'discrete') {
            // Discretization logic using METRON_TAU
            return tf.tidy(() => {
                const scaled = stateTensor.div(tf.scalar(Config.METRON_TAU));
                const rounded = tf.round(scaled);
                return rounded.mul(tf.scalar(Config.METRON_TAU)).clipByValue(-1, 1); // Clip after operation
            });
        } else {
            // Continuous: Add scaled noise
            return tf.tidy(() => {
                const noise = tf.randomNormal(stateTensor.shape, 0, perturbationScale);
                // Add noise and clip to maintain bounds [-1, 1]
                return stateTensor.add(noise).clipByValue(-1, 1);
            });
        }
    }
}

/**
 * Computes affinity/similarity between syndromes or tensors.
 * (No changes needed here from previous version)
 */
export class Affinitaetssyndrom {
    compute(syndromeA, syndromeB) {
        if (typeof tf === 'undefined') return 0;
        try {
            return tf.tidy(() => {
                // Ensure inputs are tensors and flattened
                let tensorA = (syndromeA instanceof tf.Tensor) ? syndromeA.flatten() : tf.tensor(Array.isArray(syndromeA) ? syndromeA : [syndromeA]).flatten();
                let tensorB = (syndromeB instanceof tf.Tensor) ? syndromeB.flatten() : tf.tensor(Array.isArray(syndromeB) ? syndromeB : [syndromeB]).flatten();

                if (!tensorA || !tensorB || tensorA.isDisposed || tensorB.isDisposed) {
                    console.warn("[Affinitaetssyndrom] Invalid or disposed tensor input.");
                    return 0;
                }

                // Pad shorter tensor
                const lenA = tensorA.shape[0];
                const lenB = tensorB.shape[0];
                const maxLength = Math.max(lenA, lenB);

                if (lenA === 0 || lenB === 0) return 0; // Handle empty tensors

                if (lenA < maxLength) {
                    tensorA = tf.pad(tensorA, [[0, maxLength - lenA]]);
                } else if (lenB < maxLength) {
                    tensorB = tf.pad(tensorB, [[0, maxLength - lenB]]);
                }

                const normA = tf.norm(tensorA);
                const normB = tf.norm(tensorB);
                const normProd = normA.mul(normB).arraySync();

                if (normProd === 0) return 0; // Avoid division by zero

                const dotProduct = tf.dot(tensorA, tensorB);
                const similarity = dotProduct.div(normProd).clipByValue(-1, 1).arraySync();
                return similarity;
            });
        } catch (e) {
            displayError(`TF Error in Affinitaetssyndrom compute: ${e.message}`, false);
            console.error("[Affinitaetssyndrom] Full error:", e);
            return 0;
        }
    }
}


/**
 * Represents a Synkolator, combining elements at a given stage.
 * Now operates on Tensors.
 */
export class Synkolator {
    constructor(type = 'pyramidal', stage = Config.CASCADE_STAGE || 2) { // Use config or default
        this.type = type; // 'pyramidal' or 'average'
        this.stage = stage; // Number of elements to combine per step
    }

    /**
     * Applies the synkolation rule to a tensor representing a level of elements.
     * @param {tf.Tensor} elementsTensor - 1D Tensor of elements.
     * @returns {tf.Tensor} - 1D Tensor of resulting syndromes, or empty tensor.
     */
    apply(elementsTensor) {
         if (!(elementsTensor instanceof tf.Tensor) || elementsTensor.rank !== 1 || elementsTensor.shape[0] === 0) {
             // console.warn("[Synkolator] Invalid input tensor. Returning empty tensor.");
             return tf.tensor([]); // Return empty tensor
         }

        const numElements = elementsTensor.shape[0];

        if (this.type === 'pyramidal') {
            // If not enough elements for a full stage, return average (as a tensor)
            if (numElements < this.stage) {
                return tf.mean(elementsTensor).reshape([1]);
            }

            // Use slicing and stacking for efficient pyramidal average
            const syndromes = [];
            for (let i = 0; i <= numElements - this.stage; i++) {
                const slice = elementsTensor.slice(i, this.stage);
                syndromes.push(tf.mean(slice)); // Calculate mean for the slice
            }
            if (syndromes.length === 0) return tf.tensor([]); // Handle edge case
            // Stack the individual mean tensors into a single tensor
            return tf.stack(syndromes);

        } else if (this.type === 'average') {
            // Simple average of all elements, returned as a 1-element tensor
            return tf.mean(elementsTensor).reshape([1]);
        }

        console.warn(`[Synkolator] Unknown type: ${this.type}. Returning empty tensor.`);
        return tf.tensor([]);
    }
}

/**
 * Computes the Reflexive Integration Hierarchy (RIH) score from a Tensor.
 * (No major changes needed, but ensure input handling is robust)
 */
export class ReflexiveIntegration {
    compute(syndromesTensor) {
        if (typeof tf === 'undefined') return 0;
        if (!(syndromesTensor instanceof tf.Tensor) || syndromesTensor.isDisposed) {
            // console.warn("[ReflexiveIntegration] Invalid or disposed tensor input.");
            return 0;
        }
        // Ensure tensor is 1D and has enough elements
        const flatTensor = syndromesTensor.flatten();
        if (flatTensor.shape[0] < 2) {
            // console.warn("[ReflexiveIntegration] Input tensor too small for variance calculation.");
            tf.dispose(flatTensor); // Dispose the flattened tensor
            return 0;
        }

        try {
            return tf.tidy(() => {
                const { mean, variance } = tf.moments(flatTensor);
                const varianceVal = variance.arraySync();

                if (varianceVal < 1e-9) return 0; // Avoid division by zero

                const rihScore = tf.abs(mean.div(tf.sqrt(variance)))
                                  .mul(tf.scalar(Config.RIH_SCALE))
                                  .clipByValue(0, 1)
                                  .arraySync();
                return rihScore;
            });
        } catch (e) {
            // Dispose the tensor manually if tidy fails mid-computation
            if (!flatTensor.isDisposed) tf.dispose(flatTensor);
            displayError(`TF Error in ReflexiveIntegration: ${e.message}`, false);
            return 0;
        }
    }
}


/**
 * Processes the Structural Condensation cascade using Tensors.
 */
export class Strukturkondensation {
    constructor(levels = Config.CASCADE_LEVELS, synkolatorStage = Config.CASCADE_STAGE || 2) {
        this.levels = levels;
        this.synkolators = [];
        for (let i = 0; i < levels; i++) {
            // Synkolator stage could potentially vary per level in more complex models
            this.synkolators.push(new Synkolator('pyramidal', synkolatorStage));
        }
    }

    /**
     * Processes an initial tensor through the cascade levels.
     * @param {tf.Tensor} initialElementsTensor - 1D Tensor of initial elements.
     * @returns {tf.Tensor[]} - Array of Tensors representing elements at each level.
     */
    process(initialElementsTensor) {
        if (!(initialElementsTensor instanceof tf.Tensor) || initialElementsTensor.rank !== 1) {
            console.warn("[Strukturkondensation] Invalid initial tensor. Returning empty history.");
             return [tf.tensor([])]; // Return history with empty tensor
        }

        let currentLevelTensor = initialElementsTensor;
        const history = [currentLevelTensor]; // Store tensors

        for (let i = 0; i < this.levels; i++) {
            if (!this.synkolators[i] || currentLevelTensor.shape[0] === 0) break; // Stop if no synkolator or empty level

            const synkolator = this.synkolators[i];
            // Apply the synkolator rule to get elements for the next level
            const nextLevelTensor = synkolator.apply(currentLevelTensor);

            // If the next level tensor is empty or disposed, stop
            if (!nextLevelTensor || nextLevelTensor.isDisposed || nextLevelTensor.shape[0] === 0) {
                if (nextLevelTensor && !nextLevelTensor.isDisposed) tf.dispose(nextLevelTensor); // Dispose if created but empty
                history.push(tf.tensor([])); // Add empty tensor to history
                break;
            }

            history.push(nextLevelTensor);
            currentLevelTensor = nextLevelTensor; // Current level becomes the input for the next iteration
        }

        return history; // Returns array of Tensors
    }
}

