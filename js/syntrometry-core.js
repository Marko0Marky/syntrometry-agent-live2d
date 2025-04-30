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
            return tf.zeros([Config.DIMENSIONS]); // Return shape matching expected core dimensions
        }
        if (!(stateTensor instanceof tf.Tensor) || stateTensor.isDisposed) {
            console.warn("[Enyphansyntrix] Invalid or disposed input tensor. Returning zero tensor.");
            return tf.zeros([Config.DIMENSIONS]);
        }
         // Ensure input tensor has the expected dimensionality (Config.DIMENSIONS)
         if (stateTensor.shape.length === 0 || stateTensor.shape[stateTensor.shape.length - 1] !== Config.DIMENSIONS) {
             console.warn(`[Enyphansyntrix] Input tensor shape mismatch. Expected last dimension ${Config.DIMENSIONS}, got ${stateTensor.shape}. Returning zeros.`);
             return tf.zeros([Config.DIMENSIONS]);
         }

        return tf.tidy(() => {
            if (this.type === 'discrete') {
                const tauScalar = tf.scalar(Config.METRON_TAU);
                const scaled = stateTensor.div(tauScalar);
                const rounded = tf.round(scaled);
                return rounded.mul(tauScalar).clipByValue(-1, 1); // Clip after quantization
            } else { // Continuous mode (default)
                const noise = tf.randomNormal(stateTensor.shape, 0, perturbationScale);
                // Add noise and clip to maintain bounds [-1, 1]
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
                // Ensure inputs are valid tensors
                let tensorA = (syndromeA instanceof tf.Tensor) ? syndromeA : tensor(syndromeA); // Use utils.tensor for array conversion
                let tensorB = (syndromeB instanceof tf.Tensor) ? syndromeB : tensor(syndromeB);

                 if (!tensorA || tensorA.isDisposed || !tensorB || tensorB.isDisposed) {
                     console.warn("[Affinitaetssyndrom] Invalid or disposed input tensors after conversion.");
                     return tf.scalar(0); // Return tensor 0
                 }

                // Flatten tensors to 1D for consistent processing
                tensorA = tensorA.flatten();
                tensorB = tensorB.flatten();

                const lenA = tensorA.shape[0];
                const lenB = tensorB.shape[0];

                // Handle empty tensors
                if (lenA === 0 || lenB === 0) return tf.scalar(0);

                // Pad the shorter tensor with zeros to match the length of the longer one
                const maxLength = Math.max(lenA, lenB);
                if (lenA < maxLength) {
                    tensorA = tf.pad(tensorA, [[0, maxLength - lenA]]);
                } else if (lenB < maxLength) {
                    tensorB = tf.pad(tensorB, [[0, maxLength - lenB]]);
                }

                // Calculate norms
                const normA = tf.norm(tensorA);
                const normB = tf.norm(tensorB);
                const normProd = normA.mul(normB);

                // Avoid division by zero or near-zero norms
                if (normProd.arraySync() < 1e-9) {
                     return tf.scalar(0);
                }

                // Calculate cosine similarity: dot(A, B) / (norm(A) * norm(B))
                const dotProduct = tf.dot(tensorA, tensorB);
                const similarity = dotProduct.div(normProd).clipByValue(-1, 1); // Clip to [-1, 1] range

                return similarity; // Return the similarity tensor
            }).arraySync(); // Extract the JS number value
        } catch (e) {
            displayError(`TF Error in Affinitaetssyndrom compute: ${e.message}`, false);
            console.error("[Affinitaetssyndrom] Full error:", e);
            return 0; // Return scalar 0 on error
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
        this.stage = Math.max(2, stage); // Ensure stage is at least 2

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
         // Validate input tensor
         if (!(elementsTensor instanceof tf.Tensor) || elementsTensor.isDisposed || elementsTensor.rank !== 1 || elementsTensor.shape[0] === 0) {
             // console.warn("[Synkolator] Invalid input tensor. Returning empty tensor."); // Reduce noise
             return tf.tensor([]);
         }

        const numElements = elementsTensor.shape[0];

        // Handle based on type
        if (this.type === 'pyramidal') {
            // Need at least 'stage' elements for pyramidal reduction
            if (numElements < this.stage) {
                // If fewer elements than stage, Heim's original definition is ambiguous.
                // Returning mean might be reasonable, but empty aligns better with strict stage requirement.
                // Let's return empty to indicate the stage couldn't be fully applied.
                return tf.tensor([]);
                // Alternative: return tf.mean(elementsTensor).reshape([1]);
            }

            // Use tf.tidy for intermediate slices and means
            return tf.tidy(() => {
                const syndromes = [];
                // Sliding window of size 'stage'
                for (let i = 0; i <= numElements - this.stage; i++) {
                    const slice = elementsTensor.slice(i, this.stage);
                    syndromes.push(tf.mean(slice)); // Calculate mean of the slice
                }
                // Stack the computed means into a single tensor
                return (syndromes.length > 0) ? tf.stack(syndromes) : tf.tensor([]);
            });

        } else if (this.type === 'average') {
            // Simple averaging of all elements
            return tf.mean(elementsTensor).reshape([1]);
        }

        // Should not be reached if constructor defaults correctly
        console.warn(`[Synkolator] Unknown type in apply: ${this.type}. Returning empty tensor.`);
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
            // console.warn("[ReflexiveIntegration] Invalid or disposed input tensor."); // Reduce noise
            return 0;
        }

        // Ensure tensor is 1D and has enough elements for variance calculation
        const flatTensor = syndromesTensor.flatten();
        if (flatTensor.shape[0] < 2) { // Need at least 2 elements for variance
            if (!flatTensor.isDisposed) tf.dispose(flatTensor);
            return 0; // Return 0 if not enough elements
        }

        try {
            // Use tf.tidy to manage intermediate tensors (mean, variance)
            return tf.tidy(() => {
                const { mean, variance } = tf.moments(flatTensor); // Calculates mean and variance
                const varianceVal = variance.arraySync();

                // Avoid division by zero or instability with very small variance
                if (varianceVal < 1e-9) {
                     return tf.scalar(0); // Return tensor 0
                }

                // RIH = abs(mean / stddev) * scale, clamped to [0, 1]
                // stddev = sqrt(variance)
                const rihScoreTensor = tf.abs(mean.div(tf.sqrt(variance)))
                                  .mul(tf.scalar(Config.RIH_SCALE)) // Apply scaling factor
                                  .clipByValue(0, 1); // Clamp the result

                return rihScoreTensor; // Return the final tensor
            }).arraySync(); // Extract the JS number
        } catch (e) {
            displayError(`TF Error in ReflexiveIntegration: ${e.message}`, false);
            console.error("[ReflexiveIntegration] Full error:", e);
            return 0; // Return scalar 0 on error
        } finally {
            // Ensure flatTensor is disposed if it wasn't already (tidy should handle it, but be safe)
             if (flatTensor && !flatTensor.isDisposed) tf.dispose(flatTensor);
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
            // Each level uses a Synkolator (currently all pyramidal with the same stage)
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
            console.warn("[Strukturkondensation] Invalid or disposed initial tensor. Returning empty history.");
             return [tf.tensor([])];
        }
         if (initialElementsTensor.shape[0] === 0) {
             // console.warn("[Strukturkondensation] Initial tensor is empty."); // Reduce noise
             return [tf.tensor([])];
         }

        // Use tf.tidy for the overall process to manage intermediate tensors
        return tf.tidy(() => {
            let currentLevelTensor = initialElementsTensor.clone(); // Start with a clone of the input
            // Keep the initial level tensor (level 0)
            const history = [tf.keep(currentLevelTensor.clone())];

            for (let i = 0; i < this.levels; i++) {
                // Stop if current level is empty or no more synkolators
                if (currentLevelTensor.shape[0] === 0 || !this.synkolators[i]) break;

                const synkolator = this.synkolators[i];
                // Apply the synkolator for this level (Synkolator.apply handles its own tidying)
                const nextLevelTensor = synkolator.apply(currentLevelTensor);

                // Dispose the tensor from the previous iteration *unless* it was the initial input
                if (currentLevelTensor !== initialElementsTensor && !currentLevelTensor.isDisposed) {
                     tf.dispose(currentLevelTensor);
                }

                // Check if the synkolation resulted in a valid tensor
                if (!nextLevelTensor || nextLevelTensor.isDisposed || nextLevelTensor.shape[0] === 0) {
                    // If synkolation stops or results in empty, add an empty kept tensor and break
                    if (nextLevelTensor && !nextLevelTensor.isDisposed) tf.dispose(nextLevelTensor);
                    history.push(tf.keep(tf.tensor([])));
                    currentLevelTensor = tf.tensor([]); // Set current to empty to stop loop
                    break;
                }

                // Update current level and add a kept clone to history
                currentLevelTensor = nextLevelTensor; // The result of apply becomes the input for the next level
                history.push(tf.keep(currentLevelTensor.clone()));
            }

             // Dispose the final `currentLevelTensor` if it wasn't the input tensor and wasn't disposed in the loop
            if (currentLevelTensor !== initialElementsTensor && !currentLevelTensor.isDisposed) {
                 tf.dispose(currentLevelTensor);
            }

            return history; // Return the array of kept tensors
        });
    }
}
