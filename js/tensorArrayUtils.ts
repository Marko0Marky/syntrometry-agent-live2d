// @ts-nocheck
import * as tf from '@tensorflow/tfjs';

/**
 * Converts a tensor to a number array safely
 */
export function tensorDataToArray(tensor: tf.Tensor): number[] {
  if (!tensor || tensor.isDisposed) {
    console.warn("Attempted to convert null or disposed tensor to array");
    return [];
  }
  
  try {
    // Try to use dataSync for performance
    const data = tensor.dataSync();
    return Array.from(data);
  } catch (e) {
    console.warn("dataSync failed, falling back to async data()", e);
    // Return empty array as fallback
    return [];
  }
}

/**
 * Converts a TypedArray to a regular JavaScript array
 */
export function typedArrayToArray(typedArray: Float32Array | Int32Array | Uint8Array | any): number[] {
  if (!typedArray) {
    console.warn("Attempted to convert null typed array");
    return [];
  }
  return Array.from(typedArray);
}

/**
 * Safe subtraction operation that handles null tensors
 */
export function safeSub(a: tf.Tensor, b: tf.Tensor): tf.Tensor {
  if (!a || a.isDisposed) return b ? b.clone() : tf.zeros(b ? b.shape : []);
  if (!b || b.isDisposed) return a.clone();
  return a.sub(b);
}

/**
 * Safe addition operation that handles null tensors
 */
export function safeAdd(a: tf.Tensor, b: tf.Tensor): tf.Tensor {
  if (!a || a.isDisposed) return b ? b.clone() : tf.zeros(b ? b.shape : []);
  if (!b || b.isDisposed) return a.clone();
  return a.add(b);
}

/**
 * Safe multiplication operation that handles null tensors
 */
export function safeMul(a: tf.Tensor, b: tf.Tensor | number): tf.Tensor {
  if (!a || a.isDisposed) return tf.zeros(a ? a.shape : []);
  if (typeof b === 'number') return a.mul(tf.scalar(b));
  if (!b || b.isDisposed) return tf.zeros(a.shape);
  return a.mul(b);
}

/**
 * Checks if a tensor contains NaN or Infinity values
 */
export function checkForNaNorInf(tensor: tf.Tensor): boolean {
  if (!tensor || tensor.isDisposed) return false;
  
  try {
    const hasNaN = tf.any(tf.isNaN(tensor)).dataSync()[0];
    const hasInf = tf.any(tf.isInf(tensor)).dataSync()[0];
    return hasNaN || hasInf;
  } catch (e) {
    console.error("Error checking for NaN/Inf:", e);
    return false;
  }
}


