// js/syntrometry-core.js

import { Config } from './config.js';
import { zeros, tensor, clamp, displayError } from './utils.js';

/**
 * Represents the Enyphansyntrix, applying transformations to state vectors.
 */
export class Enyphansyntrix {
    constructor(type = 'discrete') {
        this.type = type;
    }

    apply(state) {
        if (!Array.isArray(state)) {
            console.warn("[Enyphansyntrix] Invalid state input. Expected Array.");
            return zeros([Config.Agent.BASE_STATE_DIM]); // Return zero state on error
        }
        // Ensure state has expected size, pad if needed before applying transformations
        const paddedState = [...state];
        while(paddedState.length < Config.Agent.BASE_STATE_DIM) {
            paddedState.push(0);
        }

        if (this.type === 'discrete') {
            return paddedState.slice(0, Config.Agent.BASE_STATE_DIM).map(x => Math.round(x / Config.METRON_TAU) * Config.METRON_TAU);
        } else {
            // Continuous adds noise/perturbation
            return paddedState.slice(0, Config.Agent.BASE_STATE_DIM).map(x => x + (Math.random() - 0.5) * Config.METRON_TAU * 0.5);
        }
    }
}

/**
 * Computes affinity/similarity between syndromes or tensors.
 */
export class Affinitaetssyndrom {
    compute(syndromeA, syndromeB) {
        if (typeof tf === 'undefined') {
             // console.warn("[Affinitaetssyndrom] TensorFlow.js not loaded.");
             return 0; // Return scalar 0
        }

        try {
            return tf.tidy(() => {
                let tensorA = (syndromeA instanceof tf.Tensor) ? syndromeA : tensor(Array.isArray(syndromeA) ? syndromeA : [syndromeA]);
                let tensorB = (syndromeB instanceof tf.Tensor) ? syndromeB : tensor(Array.isArray(syndromeB) ? syndromeB : [syndromeB]);

                 if (!tensorA || !tensorB) { // Check if tensor creation failed
                     console.warn("[Affinitaetssyndrom] Tensor creation failed.");
                     tf.dispose([tensorA, tensorB]); // Dispose any partial tensors
                     return 0; // Return scalar 0
                 }

                if (tensorA.rank === 0) tensorA = tensor1d([tensorA.arraySync()]); // Ensure rank 1
                if (tensorB.rank === 0) tensorB = tensor1d([tensorB.arraySync()]); // Ensure rank 1

                 if (tensorA.rank < 1 || tensorB.rank < 1) {
                     //console.warn("[Affinitaetssyndrom] Invalid tensor ranks:", tensorA.rank, tensorB.rank);
                     tf.dispose([tensorA, tensorB]);
                     return 0; // Return scalar 0
                 }

                tensorA = tensorA.rank === 1 ? tensorA : tensorA.flatten();
                tensorB = tensorB.rank === 1 ? tensorB : tensorB.flatten();

                // Pad shorter tensor with zeros to match lengths
                const maxLength = Math.max(tensorA.shape[0], tensorB.shape[0]);
                if (tensorA.shape[0] < maxLength) {
                    const padLength = maxLength - tensorA.shape[0];
                    tensorA = tf.pad(tensorA, [[0, padLength]]);
                } else if (tensorB.shape[0] < maxLength) {
                    const padLength = maxLength - tensorB.shape[0];
                    tensorB = tf.pad(tensorB, [[0, padLength]]);
                }

                const normA = tf.norm(tensorA);
                const normB = tf.norm(tensorB);

                const normAValue = normA.arraySync();
                const normBValue = normB.arraySync();

                if (normAValue === 0 || normBValue === 0) {
                    //console.warn("[Affinitaetssyndrom] Zero norm detected.");
                    tf.dispose([tensorA, tensorB, normA, normB]);
                    return 0; // Return scalar 0
                }

                const dotProduct = tf.dot(tensorA, tensorB);
                const similarityTensor = dotProduct.div(tf.mul(normA, normB)).clipByValue(-1, 1); // Cosine similarity
                const similarityValue = similarityTensor.arraySync(); // Get the scalar value

                tf.dispose([tensorA, tensorB, normA, normB, dotProduct, similarityTensor]); // Dispose tensors
                 return similarityValue; // Return the scalar value
            });
        } catch (e) {
            displayError(`TF Error in Affinitaetssyndrom compute: ${e.message}`, false);
            console.error("[Affinitaetssyndrom] Full error:", e);
            return 0; // Return scalar 0 on error
        }
    }
}

/**
 * Represents a Synkolator, combining elements at a given stage.
 */
export class Synkolator {
    constructor(type = 'pyramidal', stage = 2) {
        this.type = type; // 'pyramidal' or 'average'
        this.stage = stage; // Number of elements to combine per step (for pyramidal)
    }

    // Applies the synkolation rule to a level of elements
    apply(elements) {
        if (!Array.isArray(elements) || elements.length === 0) return [];

        if (this.type === 'pyramidal') {
            const syndromes = [];
            // Check if enough elements exist to form at least one group
            if (elements.length < this.stage) {
                // Cannot form a full group, return an average if elements exist
                if (elements.length > 0) {
                    const avg = elements.reduce((a, b) => a + b, 0) / elements.length;
                    return [avg]; // Return just the average
                }
                return []; // No elements, return empty
            }

            for (let i = 0; i < elements.length - (this.stage - 1); i++) {
                let sum = 0;
                for(let j = 0; j < this.stage; j++) {
                    sum += elements[i + j];
                }
                syndromes.push(sum / this.stage); // Average of the group
            }

            return syndromes;

        } else if (this.type === 'average') {
            // Simple average of all elements
            const avg = elements.reduce((a, b) => a + b, 0) / elements.length;
            return [avg];
        }
        console.warn(`Unknown Synkolator type: ${this.type}. Returning empty.`);
        return [];
    }
}

/**
 * Computes the Reflexive Integration Hierarchy (RIH) score.
 */
export class ReflexiveIntegration {
    compute(syndromesArray) {
         if (typeof tf === 'undefined') {
             // console.warn("[ReflexiveIntegration] TensorFlow.js not loaded.");
             return 0; // Return scalar 0
         }
         if (!Array.isArray(syndromesArray) || syndromesArray.length < 2) {
             // console.warn("[ReflexiveIntegration] Input array too small for variance calculation.");
             return 0; // Need at least 2 elements for variance
         }

        try {
            return tf.tidy(() => {
                const syndromesTensor = tensor(syndromesArray, [syndromesArray.length]); // Ensure tensor is created correctly
                 if (!syndromesTensor) {
                     console.warn("[ReflexiveIntegration] Tensor creation failed.");
                     return 0; // Return scalar 0
                 }

                const mean = tf.mean(syndromesTensor);
                const variance = tf.moments(syndromesTensor).variance;
                const varianceVal = variance.arraySync();

                // Avoid division by zero or very small variance
                if (varianceVal < 1e-9) {
                     tf.dispose([syndromesTensor, mean, variance]);
                     return 0; // Return scalar 0
                }

                // RIH formula approximation: |mean / sqrt(variance)| * scale
                // Clip the result between 0 and 1
                const rihScoreTensor = tf.abs(mean.div(tf.sqrt(variance))).mul(Config.RIH_SCALE).clipByValue(0, 1);
                const rihScoreValue = rihScoreTensor.arraySync(); // Get the scalar value

                tf.dispose([syndromesTensor, mean, variance, rihScoreTensor]); // Clean up tensors
                return rihScoreValue; // Return the scalar value
            });
        } catch (e) {
            displayError(`TF Error in ReflexiveIntegration: ${e.message}`, false);
            return 0; // Return scalar 0 on error
        }
    }
}

/**
 * Processes the Structural Condensation cascade.
 */
export class Strukturkondensation {
    constructor(levels, synkolatorStage = 2) {
        this.levels = levels;
        this.synkolators = [];
        // Create a synkolator for each level
        for (let i = 0; i < levels; i++) {
            this.synkolators.push(new Synkolator('pyramidal', synkolatorStage));
        }
    }

    // Processes initial elements through the cascade levels
    process(initialElements) {
        // Ensure initial elements are an array
        if (!Array.isArray(initialElements) || initialElements.length === 0) {
            return [initialElements || []]; // Return initial state as the only history level
        }

        let currentLevelElements = [...initialElements];
        const history = [currentLevelElements]; // Keep track of elements at each level

        for (let i = 0; i < this.levels; i++) {
            const synkolator = this.synkolators[i];

            // Apply the synkolator rule to get elements for the next level
            const nextLevelElements = synkolator.apply(currentLevelElements);

            // If the next level is empty, stop the cascade
            if (!nextLevelElements || nextLevelElements.length === 0) {
                 // Optionally push an empty array to history to mark the end level
                history.push([]);
                break;
            }

            history.push(nextLevelElements); // Add the new level to history
            currentLevelElements = nextLevelElements; // Set current elements to the new level
        }

        // Ensure the history has at least one level (the initial state)
        if (history.length === 0 && initialElements.length > 0) {
            history.push([...initialElements]);
        } else if (history.length === 0) {
             history.push([]); // Push an empty initial state if input was empty
        }

        return history;
    }
}
