import * as tf from '@tensorflow/tfjs';
import type { Tensor, TensorLike } from '@tensorflow/tfjs-core';

/**
 * Utility functions for handling tensor type conversions
 * These functions help bridge the gap between different tensor types
 */

// Type aliases for tensor compatibility
export type TensorCompatible = Tensor | number[] | number[][] | number[][][] | number | boolean[] | boolean[][] | boolean;
export type NullableTensorCompatible = TensorCompatible | null | undefined;

/**
 * Helper function to safely cast between tensor types for TypeScript
 * This doesn't actually do anything at runtime - it just helps TypeScript
 * understand the type relationships
 */
export function asTensor<T extends Tensor>(tensor: T): T;
export function asTensor(tensor: Tensor): Tensor;
export function asTensor(tensor: any): any {
  // Check if it's already a tensor
  if (tensor && typeof tensor.dataSync === 'function') {
    return tensor; // Just return the tensor, this is only for type casting
  }
  // If it's not a tensor but a tensor-like value, convert it
  try {
    return tf.tensor(tensor);
  } catch (e) {
    console.error("Failed to convert to tensor:", e);
    return tf.tensor([]);
  }
}

/**
 * Helper function to safely cast between tensor types for TypeScript
 * Handles null values
 */
export function asNullableTensor<T extends Tensor>(tensor: T | null): T | null;
export function asNullableTensor(tensor: Tensor | null): Tensor | null;
export function asNullableTensor(tensor: any): any {
  if (tensor === null || tensor === undefined) {
    return null;
  }
  // Check if it's already a tensor
  if (typeof tensor.dataSync === 'function') {
    return tensor; // Just return the tensor, this is only for type casting
  }
  // If it's not a tensor but a tensor-like value, convert it
  try {
    return tf.tensor(tensor);
  } catch (e) {
    console.error("Failed to convert to tensor:", e);
    return null;
  }
}

/**
 * Check if a value is a tensor
 */
export function isTensor(value: any): value is Tensor {
  return value !== null && value !== undefined && 
         typeof value === 'object' && 'dataSync' in value;
}

/**
 * Converts a value to a number tensor
 */
export function asNumberTensor(value: any): Tensor {
  if (isTensor(value)) {
    return value;
  }
  // Use tf.tensor to convert non-tensor values
  return tf.tensor(value);
}

/**
 * Safely converts a value to a Tensor
 */
export function asRankTensor(value: TensorCompatible): Tensor {
  if (!value) return tf.zeros([1]);
  if (isTensor(value)) {
    return value;
  }
  return tf.tensor(value);
}

/**
 * Safely converts a nullable value to a Tensor or null
 */
export function asNullableRankTensor(value: NullableTensorCompatible): Tensor | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asRankTensor(value);
}

/**
 * Converts a Variable to a Tensor
 */
export function asVariable(value: any): Tensor {
  return value as Tensor;
}



/**
 * Safely converts any tensor-like data to a format suitable for Live2D
 */
export function toLive2DFormat(data: any): Tensor {
    // If null/undefined, return empty tensor
    if (data === null || data === undefined) {
        return tf.tensor([]);
    }
    
    // If already a tensor, return it
    if (isTensor(data)) {
        return data;
    }
    
    // If it has dataSync (tensor-like), extract data
    if (data && typeof data.dataSync === 'function') {
        data = data.dataSync();
    }
    
    // Convert to array and ensure all elements are numbers
    const numArray = Array.from(data as any).map(Number);
    
    // Return as tensor
    return tf.tensor(numArray);
}

/**
 * Safely converts any tensor data to a number array
 * This is specifically designed to work with Live2D functions
 */
export function toNumberArray(data: any): number[] {
    // Handle null/undefined
    if (data === null || data === undefined) return [];
    
    // Handle tensor
    if (isTensor(data)) {
        data = data.dataSync();
    }
    
    // Convert to array with explicit number conversion
    try {
        // First try with Array.from
        return Array.from(data as any).map(Number);
    } catch (e) {
        // Fallback to manual conversion if Array.from fails
        const result: number[] = [];
        for (let i = 0; i < (data as any).length; i++) {
            result.push(Number(data[i]));
        }
        return result;
    }
}

/**
 * Non-null tensor assertion (similar to TypeScript's non-null assertion)
 */
export function asNonNullTensor(tensor: Tensor | null | undefined): Tensor {
  if (tensor === null || tensor === undefined) {
    console.warn("Null tensor encountered where non-null was expected");
    return tf.zeros([1]); // Return empty tensor as fallback
  }
  return tensor;
}

/**
 * Converts a value to a nullable number tensor
 */
export function asNullableNumberTensor(value: any): Tensor | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asNumberTensor(value);
}

/**
 * Convert environment step result to proper type
 */
export interface EnvStepResult {
  state: Tensor;
  reward: number;
  done: boolean;
  context: string;
  eventType: string | null;
}

export function asEnvStepResult(result: any): EnvStepResult {
  if (!result) {
    return {
      state: tf.zeros([1]),
      reward: 0,
      done: false,
      context: "",
      eventType: null
    };
  }
  
  return {
    state: isTensor(result.state) ? result.state : tf.tensor(result.state || []),
    reward: typeof result.reward === 'number' ? result.reward : 0,
    done: !!result.done,
    context: result.context || "",
    eventType: result.eventType || null
  };
}

/**
 * Convert array to tensor
 */
export function arrayToTensor(array: number[] | number[][] | number[][][]): Tensor {
  return tf.tensor(array);
}



