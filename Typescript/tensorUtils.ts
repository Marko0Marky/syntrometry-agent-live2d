// Consolidated tensor utilities

import * as tf from '@tensorflow/tfjs';
import type { Tensor, Scalar, TypedArray } from '@tensorflow/tfjs-core';

/**
 * Safely disposes a tensor if it exists and isn't already disposed
 */
export function safeDispose(tensor: tf.Tensor | null): void {
  if (tensor && !tensor.isDisposed) {
    tensor.dispose();
  }
}

/**
 * Converts a tensor to array synchronously (use only when tensor is ready)
 */
export function tensorToArray(tensor: tf.Tensor | null): number[] {
  if (!tensor || tensor.isDisposed) return [];
  try {
    // Fix the Array.from issue by using type assertion
    const data = tensor.dataSync();
    return Array.from(data as unknown as ArrayLike<number>);
  } catch (e) {
    console.error("Error converting tensor to array:", e);
    return [];
  }
}

/**
 * Converts a tensor to array asynchronously (safer for backend tensors)
 */
export async function tensorToArrayAsync(tensor: tf.Tensor | null): Promise<number[]> {
  if (!tensor || tensor.isDisposed) return [];
  try {
    // Fix the data() method issue by using a type assertion
    // and using the correct method available in TensorFlow.js
    const data = await (tensor as any).array();
    return data.flat();
  } catch (e) {
    console.error("Error converting tensor to array async:", e);
    return [];
  }
}

/**
 * Checks if a tensor contains NaN or Infinity values
 */
export function containsNaNOrInf(tensor: tf.Tensor | null): boolean {
  if (!tensor || tensor.isDisposed) return false;
  try {
    const data = tensor.dataSync();
    // Fix the Array.from issue with type assertion
    return Array.from(data as unknown as ArrayLike<number>).some(val => !isFinite(val));
  } catch (e) {
    console.error("Error checking tensor for NaN/Inf:", e);
    return false;
  }
}

/**
 * Creates a TensorFlow.js tensor from various data types.
 * Includes basic error handling and validation.
 * Returns the created tensor, or null if creation fails.
 * @param data Data to create tensor from (array, TypedArray, number, boolean, etc.).
 * @param shape Optional tensor shape.
 * @param dtype Optional data type.
 * @returns A new tf.Tensor or null.
 */
export function createTensor(data: tf.TensorLike, shape?: number[], dtype?: tf.DataType): Tensor | null {
    if (typeof tf === 'undefined' || typeof tf.tensor !== 'function') {
        console.error("TensorFlow (tf) is undefined or not fully loaded in createTensor()");
        return null;
    }
    try {
        // Basic validation
        if (data === undefined || data === null) {
            if (!shape) {
                console.error("Cannot create tensor: Data is null/undefined and no shape provided.");
                return null;
            }
            console.warn("Creating tensor with null/undefined data and shape:", shape, ". Using tf.zeros instead.");
            return tf.zeros(shape, dtype);
        }

        // Create the tensor
        const newTensor = tf.tensor(data, shape, dtype);

        // Optional: Immediately check for NaN/Inf after creation if desired
        // if (containsNaNOrInf(newTensor)) {
        //     console.error("Newly created tensor contains NaN or Inf:", data, shape, dtype);
        //     safeDispose(newTensor);
        //     return null;
        // }

        return newTensor;

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`TensorFlow Error creating tensor: ${message}`, { data_type: typeof data, shape, dtype, error: e });
        return null;
    }
}

/**
 * Checks if a tensor contains any NaN or Infinity values
 * @param tensor The tensor to check
 * @returns A boolean indicating if the tensor contains NaN or Infinity
 */
export function hasNaNorInf(tensor: tf.Tensor): boolean {
  if (!tensor || tensor.isDisposed) return false;
  try {
    const data = tensor.dataSync();
    // Check each value in the tensor
    for (let i = 0; i < data.length; i++) {
      if (!Number.isFinite(data[i])) {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("Error checking tensor for NaN/Inf:", e);
    return false;
  }
}

// Add this function to convert between tensor types
export function convertTensorType<T extends tf.Tensor>(tensor: tf.Tensor): T {
  return tensor as unknown as T;
}

// Use this when you need to convert between tensor types
// Example: convertTensorType<tf.Tensor<tf.Rank>>(numberTensor)

