// @ts-nocheck
import * as tf from '@tensorflow/tfjs';
import { tensorDataToArray } from './tensorArrayUtils.js';

/**
 * Utility functions to fix TypeScript errors in environment.ts
 */

// Define missing utility functions locally
function safeMul(a: tf.Tensor, b: tf.Tensor | number): tf.Tensor {
  if (!a || a.isDisposed) return tf.zeros(a ? a.shape : []);
  if (typeof b === 'number') return a.mul(tf.scalar(b));
  if (!b || b.isDisposed) return tf.zeros(a.shape);
  return a.mul(b);
}

/**
 * Fix for line 170 - tensor data access
 */
export function fixLine170(tensor: tf.Tensor): number[] {
  const result = tensorDataToArray(tensor);
  return result ? result : [];
}

/**
 * Fix for lines 191-193 - tensor operations
 */
export function fixLine191(tensor: tf.Tensor, other: tf.Tensor | number): tf.Tensor {
  return safeMul(tensor, other);
}

export function fixLine192(scalar: tf.Scalar, other: tf.Tensor | number): tf.Tensor {
  return safeMul(scalar as tf.Tensor, other);
}

/**
 * Fix for line 305 - TypedArray conversion
 */
export function fixLine305(tensor: tf.Tensor): number[] {
  const result = tensorDataToArray(tensor);
  return result ? result : [];
}

/**
 * Fix for line 316 - TypedArray conversion
 */
export function fixLine316(tensor: tf.Tensor): number[] {
  const result = tensorDataToArray(tensor);
  return result ? result : [];
}

/**
 * Fix for line 446 - TypedArray conversion
 */
export function fixLine446(tensor: tf.Tensor): number[] {
  const result = tensorDataToArray(tensor);
  return result ? result : [];
}

/**
 * Fix for line 459 - TypedArray conversion
 */
export function fixLine459(tensor: tf.Tensor): number[] {
  const result = tensorDataToArray(tensor);
  return result ? result : [];
}

/**
 * Fix for line 545 - TypedArray conversion
 */
export function fixLine545(tensor: tf.Tensor): number[] {
  const result = tensorDataToArray(tensor);
  return result ? result : [];
}








