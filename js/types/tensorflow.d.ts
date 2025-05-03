// @ts-nocheck
declare module '@tensorflow/tfjs' {
  export * from '@tensorflow/tfjs-core';
  
  // Re-export the core types to ensure compatibility
  export type Tensor = import('@tensorflow/tfjs-core').Tensor;
  export type Scalar = import('@tensorflow/tfjs-core').Scalar;
  export type TensorLike = import('@tensorflow/tfjs-core').TensorLike;
  export type Rank = import('@tensorflow/tfjs-core').Rank;
  export type DataType = import('@tensorflow/tfjs-core').DataType;
  
  // Core functions
  export function tensor(values: TensorLike, shape?: number[], dtype?: DataType): Tensor;
  export function scalar(value: number, dtype?: DataType): Scalar;
  export function zeros(shape: number[], dtype?: DataType): Tensor;
  export function ones(shape: number[], dtype?: DataType): Tensor;
  export function randomNormal(shape: number[], mean?: number, stdDev?: number, dtype?: DataType): Tensor;
  
  // Memory management
  export function tidy<T>(fn: () => T): T;
  export function keep<T extends Tensor>(tensor: T): T;
  export function dispose(tensor: Tensor | Tensor[]): void;
  
  // Variables
  export function variable(initialValue: Tensor, trainable?: boolean, name?: string, dtype?: DataType): Tensor;
  
  // Modules
  export const train: any;
  export const layers: any;
}



