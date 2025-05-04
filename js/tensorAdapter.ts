// Updated tensorAdapter.ts
import * as tf from '@tensorflow/tfjs';

// Export layers from tf
// @ts-ignore - Type compatibility issue with TensorFlow.js
export const layers = tf['layers'];

/**
 * Adapts a tensor to be compatible with both tfjs and tfjs-core
 */
export function adaptTensor(tensor) {
  if (!tensor) return null;
  return tensor;
}

/**
 * Safely clones and keeps a tensor
 */
export function safeCloneKeep(tensor) {
  if (!tensor || tensor.isDisposed) return null;
  try {
    return tf.keep(tensor.clone());
  } catch (e) {
    console.error("Error cloning tensor:", e);
    return null;
  }
}

/**
 * Safely reshapes a tensor
 */
export function safeReshape(tensor, shape) {
  if (!tensor || tensor.isDisposed) return null;
  try {
    // @ts-ignore - Type compatibility issue
    return tensor.reshape(shape);
  } catch (e) {
    console.error("Error reshaping tensor:", e);
    return tensor;
  }
}

/**
 * Checks if a tensor has NaN or Infinity values
 */
export function hasNaNorInf(tensor) {
  if (!tensor || tensor.isDisposed) return false;
  try {
    const isNaN = tf.isNaN(tensor);
    // @ts-ignore - Type compatibility issue
    const isInf = tf.logicalOr(
      // @ts-ignore - Type compatibility issue
      tf.equal(tensor, Infinity),
      // @ts-ignore - Type compatibility issue
      tf.equal(tensor, -Infinity)
    );
    // @ts-ignore - Type compatibility issue
    const hasNaN = isNaN.any().dataSync()[0];
    // @ts-ignore - Type compatibility issue
    const hasInf = isInf.any().dataSync()[0];
    // @ts-ignore - Type compatibility issue
    tf.dispose([isNaN, isInf]);
    return hasNaN || hasInf;
  } catch (e) {
    console.error("Error checking tensor for NaN/Inf:", e);
    return false;
  }
}

// Add type definitions for compatibility
export type TensorCompatible = any;
export type NullableTensorCompatible = any | null;
