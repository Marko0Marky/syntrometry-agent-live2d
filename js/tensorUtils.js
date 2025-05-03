// js/tensorUtils.js - Create this file if it doesn't exist
import * as tf from '@tensorflow/tfjs';
import type { Tensor, TypedArray } from '@tensorflow/tfjs-core';

/**
 * Safely disposes a tensor if it exists and is not already disposed
 */
export function safeDispose(tensor: Tensor | null): void {
  if (tensor && !tensor.isDisposed) {
    tensor.dispose();
  }
}

/**
 * Converts a tensor to an array synchronously
 */
export function tensorToArray(tensor: Tensor | null): number[] {
  if (!tensor || tensor.isDisposed) return [];
  
  try {
    return Array.from(tensor.dataSync());
  } catch (e) {
    console.error("Error converting tensor to array:", e);
    return [];
  }
}

/**
 * Converts a tensor to an array asynchronously
 */
export async function tensorToArrayAsync(tensor: Tensor | null): Promise<number[]> {
  if (!tensor || tensor.isDisposed) return [];
  
  try {
    const data = await tensor.array();
    return Array.isArray(data) ? data.flat(Infinity) as number[] : [Number(data)];
  } catch (e) {
    console.error("Error converting tensor to array async:", e);
    return [];
  }
}

/**
 * Checks if a tensor contains NaN or Infinity values
 */
export function containsNaNOrInf(tensor: Tensor | null): boolean {
  if (!tensor || tensor.isDisposed) return false;
  
  try {
    const data = tensor.dataSync();
    return Array.from(data).some(val => isNaN(val) || !isFinite(val));
  } catch (e) {
    console.error("Error checking tensor for NaN/Inf:", e);
    return false;
  }
}

/**
 * Creates a tensor from data with proper error handling
 */
export function createTensor(data: TensorLike, shape?: number[]): Tensor | null {
  try {
    return tf.tensor(data, shape);
  } catch (e) {
    console.error("Error creating tensor:", e);
    return null;
  }
}