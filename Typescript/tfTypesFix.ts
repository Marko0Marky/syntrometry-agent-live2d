/**
 * This file provides type fixes for TensorFlow.js
 */
import * as tf from '@tensorflow/tfjs';
import type { Tensor, Rank } from '@tensorflow/tfjs-core';

// Type guard to check if a value is a TensorFlow.js Tensor
export function isTensor(value: any): value is Tensor {
  return value !== null && 
         typeof value === 'object' && 
         'shape' in value && 
         'rank' in value && 
         'dtype' in value &&
         typeof value.dataSync === 'function';
}

// Ensure a value is a tensor (convert if needed)
export function ensureTensor(value: any): Tensor {
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

// Ensure a value is a tensor or null
export function ensureNullableTensor(value: any): Tensor | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (isTensor(value) && !value.isDisposed) {
    return value;
  }
  try {
    return tf.tensor(value);
  } catch (e) {
    console.error("Failed to convert to tensor:", e);
    return null;
  }
}

// Ensure environment step result is valid
export function ensureValidStepResult(result: any): { 
  state: Tensor, 
  reward: number, 
  done: boolean, 
  context: string, 
  eventType: string | null 
} | null {
  if (!result) return null;
  
  return {
    state: ensureTensor(result.state || []),
    reward: typeof result.reward === 'number' ? result.reward : 0,
    done: !!result.done,
    context: result.context || '',
    eventType: result.eventType || null
  };
}