// js/syntrometry-core.ts

// Import TensorFlow.js with a type assertion to help TypeScript understand its structure
import * as tfImport from '@tensorflow/tfjs';
// Create a properly typed tf object with all the operations we need
const tf = tfImport as unknown as {
    tidy: <T>(fn: () => T) => T;
    tensor: (values: TensorLike, shape?: number[]) => Tensor;
    scalar: (value: number) => Tensor;
    zeros: (shape: number[]) => Tensor;
    add: (a: Tensor, b: Tensor | number) => Tensor;
    sub: (a: Tensor, b: Tensor | number) => Tensor;
    mul: (a: Tensor, b: Tensor | number) => Tensor;
    div: (a: Tensor, b: Tensor | number) => Tensor;
    norm: (x: Tensor) => Tensor;
    dot: (a: Tensor, b: Tensor) => Tensor;
    abs: (x: Tensor) => Tensor;
    sqrt: (x: Tensor) => Tensor;
    round: (x: Tensor) => Tensor;
    clipByValue: (x: Tensor, min: number, max: number) => Tensor;
    randomNormal: (shape: number[], mean?: number, stdDev?: number) => Tensor;
    moments: (x: Tensor, axis?: number | number[]) => { mean: Tensor; variance: Tensor };
    mean: (x: Tensor, axis?: number | number[], keepDims?: boolean) => Tensor;
    keep: (tensor: Tensor) => Tensor;
};

// Import types from tfjs-core
import type { Tensor, TensorLike, Rank } from '@tensorflow/tfjs-core';
import { Config } from './config.js';
import { zeros as zerosArray, tensor as tensorUtil, clamp, displayError } from './utils.js';
import { createTensor, safeDispose } from './tensorUtils.js';

// Define our own types and utilities
type AnyTensor = Tensor | null;

// Define SynkolatorType
type SynkolatorType = 'pyramidal' | 'average';

/**
 * Represents the Enyphansyntrix, applying transformations to state tensors.
 * In 'continuous' mode, it adds controlled noise (perturbation).
 * In 'discrete' mode (less used now), it quantizes based on METRON_TAU.
 */
export class Enyphansyntrix {
    type: string;

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
    apply(stateTensor: Tensor, perturbationScale: number = 0.01): Tensor {
        if (!tf) { // Basic check if TF is loaded
            console.error("[Enyphansyntrix] TensorFlow not available.");
            // Ensure Config.DIMENSIONS is valid before using
            const dim = typeof Config?.DIMENSIONS === 'number' && Config.DIMENSIONS > 0 ? Config.DIMENSIONS : 1;
            return tfImport.zeros([1, dim]); // Return 2D tensor [1, dim]
        }

        return tf.tidy(() => {
            if (this.type === 'discrete') {
                const tauScalar = tf.scalar(Config.METRON_TAU || 0.1); // Use default if needed
                const scaled = tf.div(stateTensor, tauScalar);
                const rounded = tf.round(scaled);
                return tf.clipByValue(tf.mul(rounded, tauScalar), -1, 1);
            } else { // Continuous mode
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
    compute(syndromeA: Tensor | number[], syndromeB: Tensor | number[]): number {
        if (!tf) {
            console.error("[Affinitaetssyndrom] TensorFlow not available.");
            return 0;
        }

        try {
            return tf.tidy(() => {
                // Convert inputs to tensors if they aren't already
                const tensorA = this.ensureTensor(syndromeA).reshape([-1]);
                const tensorB = this.ensureTensor(syndromeB).reshape([-1]);

                // Calculate norms
                const normA = tf.norm(tensorA);
                const normB = tf.norm(tensorB);
                const normProd = tf.mul(normA, normB);

                // Check scalar value directly
                if ((normProd.arraySync() as number) < 1e-9) {
                     return 0;
                }

                const dotProduct = tf.dot(tensorA, tensorB);
                const similarity = tf.clipByValue(tf.div(dotProduct, normProd), -1, 1);

                return similarity.arraySync() as number;
            });
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            displayError(`TF Error in Affinitaetssyndrom compute: ${message}`, false);
            console.error("[Affinitaetssyndrom] Full error:", e);
            return 0;
        }
    }
    
    // Helper method to ensure we have a tensor
    private ensureTensor(value: any): Tensor {
        if (value instanceof Object && 'dataSync' in value && !value.isDisposed) {
            return value as Tensor;
        }
        try {
            return tf.tensor(value);
        } catch (e) {
            console.error("Failed to convert to tensor:", e);
            return tf.tensor([]);
        }
    }
}


/**
 * Represents a Synkolator, combining elements at a given stage using Tensors.
 * Implements the 'pyramidal' reduction rule (sliding window mean).
 */
export class Synkolator {
    type: SynkolatorType;
    stage: number;

    constructor(type: SynkolatorType = 'pyramidal', stage: number = Config.CASCADE_STAGE || 2) {
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
    apply(elementsTensor: Tensor): Tensor {
        if (!tf) {
            console.error("[Synkolator] TensorFlow not available.");
            return tfImport.tensor([]);
        }
        
        if (!elementsTensor || elementsTensor.isDisposed || elementsTensor.rank !== 1 || elementsTensor.shape[0] === 0) {
            console.warn("[Synkolator] Invalid input tensor. Expected 1D tensor.");
            return tfImport.tensor([]);
        }
        
        return tf.tidy(() => {
            if (this.type === 'pyramidal') {
                // Implementation for pyramidal type
                const numElements = elementsTensor.shape[0];
                
                // Simple implementation - return the input tensor
                return elementsTensor.clone();
            } else if (this.type === 'average') {
                // Simple average of all elements
                return tf.mean(elementsTensor, 0, true);
            }
            
            // Default case - return empty tensor
            console.warn(`[Synkolator] Unknown type in apply: ${this.type}. Returning empty tensor.`);
            return tfImport.tensor([]);
        });
    }
}

/**
 * Computes the Reflexive Integration Hierarchy (RIH) score from a Tensor.
 */
export class ReflexiveIntegration {
    /**
     * Calculates the RIH score for the given tensor.
     */
    compute(syndromesTensor: Tensor): number {
        if (!tf) {
             console.error("[ReflexiveIntegration] TensorFlow not available.");
             return 0;
        }
        
        let rihScore = 0;
        
        try {
            // Use tidy to manage tensor lifecycle
            const normalizedTensor = tf.tidy(() => {
                return tf.div(
                    syndromesTensor,
                    tf.add(tf.norm(syndromesTensor), tf.scalar(1e-8))
                );
            });
            
            // tidy manages intermediate tensors
            rihScore = tf.tidy(() => {
                const { mean: meanTensor, variance } = tf.moments(normalizedTensor);
                const varianceVal = variance.arraySync() as number;

                if (varianceVal < 1e-9) {
                     return 0;
                }

                const stddev = tf.sqrt(variance);
                const rihScoreTensor = tf.clipByValue(
                    tf.mul(
                        tf.abs(tf.div(meanTensor, stddev)),
                        tf.scalar(Config.RIH_SCALE || 0.5)
                    ),
                    0, 1
                );

                // Ensure we return a number, not a string or other type
                return Number(rihScoreTensor.dataSync()[0]);
            });

            normalizedTensor.dispose();
            return rihScore;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            displayError(`TF Error in ReflexiveIntegration compute: ${message}`, false);
            console.error("[ReflexiveIntegration] Full error:", e);
            return 0;
        }
    }
}


/**
 * Represents the Strukturkondensation, processing elements through cascade levels.
 */
export class Strukturkondensation {
    synkolators: Synkolator[];
    
    constructor(numLevels: number = 3, type: SynkolatorType = 'pyramidal') {
        this.synkolators = [];
        for (let i = 0; i < numLevels; i++) {
            this.synkolators.push(new Synkolator(type, 2 + i)); // Increasing stage size
        }
    }
    
    /**
     * Processes an initial tensor through the cascade levels using Synkolators.
     * Returns an array of *kept, cloned* tensors representing the state at each level.
     */
    process(initialElementsTensor: Tensor): Tensor[] {
        if (!tf?.tensor) {
            console.error("[Strukturkondensation] TensorFlow not available.");
            return [tf.keep(tf.tensor([]))]; // Return kept empty tensor in array
        }
        
        // Expect 1D tensor input
        if (!initialElementsTensor || initialElementsTensor.isDisposed || initialElementsTensor.rank !== 1) {
            console.warn("[Strukturkondensation] Invalid or disposed initial tensor. Expected 1D tensor. Returning empty history.", initialElementsTensor);
            return [tf.keep(tf.tensor([]))];
        }
        
        const history: Tensor[] = [];
        const tensorsToDispose: Tensor[] = [];
        
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
                } else {
                    // Last tensor should also be disposed after we're done with it
                    tensorsToDispose.push(nextTensor);
                }
                
                currentTensor = nextTensor;
            }
            
            return history;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            displayError(`TF Error in Strukturkondensation process: ${message}`, false);
            console.error("[Strukturkondensation] Full error:", e);
            return [tf.keep(tf.tensor([]))];
        } finally {
            // Clean up intermediate tensors
            for (const tensor of tensorsToDispose) {
                safeDispose(tensor); // Use the imported safeDispose function
            }
        }
    }
}
// --- END OF FILE syntrometry-core.ts ---

// Helper functions to replace missing imports
function isTensor(value: any): value is Tensor {
    return value !== null && value !== undefined && typeof value.isDisposed === 'boolean';
}

function ensureTensor(value: any): Tensor {
    if (isTensor(value) && !value.isDisposed) {
        return value;
    }
    try {
        return tf.tensor(value);
    } catch (e) {
        console.error("Failed to convert to tensor:", e);
        return tf.tensor([]);
    }
}

// Modified to handle null safely and always return a Tensor
function safeKeep(tensor: any): Tensor {
    if (tensor && typeof tensor.isDisposed === 'boolean' && !tensor.isDisposed) {
        // Clone the tensor instead of using keep
        return tensor.clone();
    }
    return tf.tensor([]);
}
