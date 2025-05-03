// @ts-nocheck
import * as tf from '@tensorflow/tfjs';
import type { Tensor } from '@tensorflow/tfjs-core';

/**
 * Helper function to safely cast TensorFlow.js tensors to the correct type
 * to work around TypeScript compatibility issues between @tensorflow/tfjs and @tensorflow/tfjs-core
 */
export function asTensor<T extends tf.Tensor>(tensor: T): Tensor {
    return tensor as unknown as Tensor;
}

/**
 * Helper function to safely cast typed arrays to number arrays
 */
export function asNumberArray(array: Float32Array | Int32Array | Uint8Array): number[] {
    return Array.from(array);
}

/**
 * Helper function to safely keep a tensor with proper typing
 */
export function keepTensor<T extends tf.Tensor>(tensor: T): Tensor {
    return tf.keep(tensor) as unknown as Tensor;
}