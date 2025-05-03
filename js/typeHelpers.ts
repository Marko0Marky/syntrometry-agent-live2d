// @ts-nocheck
// js/typeHelpers.ts

import * as tf from '@tensorflow/tfjs';
import { Tensor } from '@tensorflow/tfjs-core';
import { AgentProcessResponse, EnvStepResult } from './appTypes.js';

/**
 * Helper functions for type casting in app.ts
 */

/**
 * Cast a value to a number, with a default value if the cast fails
 */
export function asNumber(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number') {
    return value;
  }
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Cast a value to a string
 */
export function asString(value: unknown, defaultValue: string = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  return String(value) || defaultValue;
}

/**
 * Cast a value to a boolean
 */
export function asBoolean(value: unknown, defaultValue: boolean = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return Boolean(value) || defaultValue;
}

/**
 * Create an EnvStepResult object
 */
export function createEnvStepResult(
  state: Tensor | null,
  reward: number,
  done: boolean,
  context: string,
  eventType: string | null
): EnvStepResult {
  return {
    state,
    reward,
    done,
    context,
    eventType
  };
}

/**
 * Create a safe AgentProcessResponse with default values
 */
export function createSafeAgentResponse(
  emotions: Tensor,
  headMovement: any,
  headMovementProbs: number[]
): AgentProcessResponse {
  return {
    emotions,
    headMovement,
    headMovementProbs,
    rihScore: 0,
    affinities: [],
    integration: 0,
    reflexivity: 0,
    trustScore: 1.0,
    beliefNorm: 0,
    selfStateNorm: 0
  };
}

/**
 * Safely access properties of potentially null objects
 */
export function safeGet<T, K extends keyof T>(obj: T | null, key: K, defaultValue: T[K]): T[K] {
  if (obj === null || obj === undefined) {
    return defaultValue;
  }
  return obj[key] !== undefined ? obj[key] : defaultValue;
}