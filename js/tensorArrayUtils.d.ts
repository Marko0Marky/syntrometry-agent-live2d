/**
 * Type declarations for tensorArrayUtils.js
 */

import * as tf from '@tensorflow/tfjs';

/**
 * Converts a tensor to an array of numbers
 * @param tensor The tensor to convert
 * @returns An array of numbers or null if conversion fails
 */
export function tensorDataToArray(tensor: tf.Tensor): number[] | null;

/**
 * Converts a tensor to a flat array of numbers
 * @param tensor The tensor to convert
 * @returns A flat array of numbers
 */
export function tensorToArray(tensor: tf.Tensor): number[];

/**
 * Checks if a tensor contains NaN or Infinity values
 * @param tensor The tensor to check
 * @returns True if the tensor contains NaN or Infinity values
 */
export function hasNaNorInf(tensor: tf.Tensor): boolean;