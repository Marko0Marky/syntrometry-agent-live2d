// js/types/tensorflow-unified.d.ts
// Consolidated type definitions for TensorFlow.js

// Import the core types from TensorFlow.js
import * as tf from '@tensorflow/tfjs';
import { Tensor, TensorLike, TypedArray, DataType } from '@tensorflow/tfjs-core';

// Extend the TensorFlow namespace with any missing types or fixes
declare module '@tensorflow/tfjs' {
  // Add any missing types or overrides here
  
  // Fix for tf.keep to properly maintain generic types
  export function keep<T extends Tensor>(tensor: T): T;
  
  // Fix for tensor equality operations
  export function equal(a: Tensor|TensorLike, b: Tensor|TensorLike): Tensor;
  
  // Fix for logical operations
  export function logicalOr(a: Tensor|TensorLike, b: Tensor|TensorLike): Tensor;
  
  // Fix for tensor creation
  export function tensor(values: TensorLike, shape?: number[], dtype?: DataType): Tensor;
  
  // Fix for zeros creation
  export function zeros(shape: number[], dtype?: DataType): Tensor;
  
  // Add any other missing type definitions here
}

// Export additional types that might be needed across the application
export interface ExtendedTensor extends Tensor {
  // Add any additional properties or methods needed
}

export interface TensorMap {
  [key: string]: Tensor;
}

// Add any other type definitions needed for your application