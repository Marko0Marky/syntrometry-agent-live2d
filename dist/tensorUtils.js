// Consolidated tensor utilities
import * as tf from '@tensorflow/tfjs';
/**
 * Utility functions for working with TensorFlow.js tensors
 */

/**
 * Safely disposes a tensor if it exists and is not already disposed
 * @param {tf.Tensor|null} tensor - The tensor to dispose
 */
export function safeDispose(tensor) {
  if (tensor && !tensor.isDisposed) {
    try {
      tensor.dispose();
    } catch (e) {
      console.warn("Error disposing tensor:", e);
    }
  }
}

/**
 * Converts a tensor to a JavaScript array synchronously
 * @param {tf.Tensor|null} tensor - The tensor to convert
 * @returns {number[]|null} - The array data or null if tensor is invalid
 */
export function tensorToArray(tensor) {
  if (!tensor || tensor.isDisposed) {
    return null;
  }
  
  try {
    return Array.from(tensor.dataSync());
  } catch (e) {
    console.error("Error converting tensor to array:", e);
    return null;
  }
}

/**
 * Converts a tensor to a JavaScript array asynchronously
 * @param {tf.Tensor|null} tensor - The tensor to convert
 * @returns {Promise<number[]|null>} - Promise resolving to array data or null
 */
export async function tensorToArrayAsync(tensor) {
  if (!tensor || tensor.isDisposed) {
    return null;
  }
  
  try {
    const data = await tensor.data();
    return Array.from(data);
  } catch (e) {
    console.error("Error converting tensor to array asynchronously:", e);
    return null;
  }
}

/**
 * Checks if a tensor contains NaN or Infinity values
 * @param {tf.Tensor|null} tensor - The tensor to check
 * @returns {boolean} - True if tensor contains NaN or Infinity
 */
export function containsNaNOrInf(tensor) {
  if (!tensor || tensor.isDisposed) {
    return false;
  }
  
  try {
    const data = tensor.dataSync();
    return Array.from(data).some(val => isNaN(val) || !isFinite(val));
  } catch (e) {
    console.error("Error checking tensor for NaN/Inf:", e);
    return true; // Assume problematic if we can't check
  }
}

/**
 * Checks if a tensor has NaN values
 * @param {tf.Tensor|null} tensor - The tensor to check
 * @returns {boolean} - True if tensor has NaN values
 */
export function hasNaNorInf(tensor) {
  return containsNaNOrInf(tensor);
}
// Add this function to convert between tensor types
export function convertTensorType(tensor) {
    return tensor;
}
// Use this when you need to convert between tensor types
// Example: convertTensorType<tf.Tensor<tf.Rank>>(numberTensor)

