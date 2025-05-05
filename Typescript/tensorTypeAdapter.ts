import * as tf from '@tensorflow/tfjs';
import { Tensor, Rank, Variable } from '@tensorflow/tfjs-core';

/**
 * This file provides type adapter functions to handle tensor type compatibility issues
 * between Tensor<Rank> and Tensor<number> without changing runtime behavior
 */

// Basic tensor type adapter
export function adaptTensor<T extends Tensor>(tensor: Tensor | null): T | null {
  return tensor as (T | null);
}

// Convert to number tensor
export function toNumberTensor(tensor: Tensor | null): Tensor | null {
  return tensor;
}

// Convert to rank tensor
export function toRankTensor(tensor: Tensor | null): Tensor | null {
  return tensor;
}

// Convert variable to tensor
export function variableToTensor(variable: Variable | null): Tensor | null {
  return variable as unknown as (Tensor | null);
}

// Convert environment step result
export interface EnvStepResult {
  state: Tensor;
  reward: number;
  done: boolean;
  context: string;
  eventType: string | null;
}

export function adaptEnvStepResult(result: any): EnvStepResult {
  return result as EnvStepResult;
}

// Apply tensor type adapter to a function
export function adaptFunction<T, R>(
  fn: (arg: T) => R,
  adapter: (arg: any) => T
): (arg: any) => R {
  return (arg: any) => fn(adapter(arg));
}