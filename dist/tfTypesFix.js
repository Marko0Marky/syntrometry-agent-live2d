/**
 * This file provides type fixes for TensorFlow.js
 */
import * as tf from '@tensorflow/tfjs';
// Type guard to check if a value is a TensorFlow.js Tensor
export function isTensor(value) {
    return value !== null &&
        typeof value === 'object' &&
        'shape' in value &&
        'rank' in value &&
        'dtype' in value &&
        typeof value.dataSync === 'function';
}
// Ensure a value is a tensor (convert if needed)
export function ensureTensor(value) {
    if (isTensor(value) && !value.isDisposed) {
        return value;
    }
    try {
        return tf.tensor(value);
    }
    catch (e) {
        console.error("Failed to convert to tensor:", e);
        return tf.tensor([]);
    }
}
// Ensure a value is a tensor or null
export function ensureNullableTensor(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (isTensor(value) && !value.isDisposed) {
        return value;
    }
    try {
        return tf.tensor(value);
    }
    catch (e) {
        console.error("Failed to convert to tensor:", e);
        return null;
    }
}
// Ensure environment step result is valid
export function ensureValidStepResult(result) {
    if (!result)
        return null;
    return {
        state: ensureTensor(result.state || []),
        reward: typeof result.reward === 'number' ? result.reward : 0,
        done: !!result.done,
        context: result.context || '',
        eventType: result.eventType || null
    };
}
