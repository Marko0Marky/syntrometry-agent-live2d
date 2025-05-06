import * as tf from '@tensorflow/tfjs';
/**
 * Utility functions for handling TensorFlow.js tensors
 */
// Function to safely cast any tensor
export function castTensor(tensor) {
    if (!tensor)
        return null;
    return tensor;
}
// Function to ensure a value is a tensor
export function ensureTensor(value) {
    if (value instanceof Object && 'dataSync' in value) {
        // It's already a tensor-like object
        return value;
    }
    try {
        // Try to convert to tensor
        return tf.tensor(value);
    }
    catch (e) {
        console.error("Failed to convert to tensor:", e);
        // Return empty tensor as fallback
        return tf.tensor([]);
    }
}
// Function to create a tensor from various input types
export function createTensor(value) {
    if (value instanceof Object && 'dataSync' in value) {
        // It's already a tensor-like object
        return value;
    }
    try {
        return tf.tensor(value);
    }
    catch (e) {
        console.error("Failed to create tensor:", e);
        return tf.tensor([]);
    }
}
// Function to safely keep a tensor (prevent disposal)
export function safeKeep(tensor) {
    if (!tensor) {
        return tf.tensor([]);
    }
    if (tensor instanceof Object && 'kept' in tensor) {
        tensor.kept = true;
    }
    return tensor;
}
// Function to safely dispose a tensor
export function safeDispose(tensor) {
    if (!tensor)
        return;
    if (tensor instanceof Object &&
        'dispose' in tensor &&
        typeof tensor.dispose === 'function' &&
        'isDisposed' in tensor) {
        if (!tensor.isDisposed) {
            tensor.dispose();
        }
    }
}
// Function to check if a value is a tensor
export function isTensor(value) {
    return value instanceof Object &&
        'dataSync' in value &&
        'shape' in value &&
        'dtype' in value;
}
// Function to safely handle Chart.js dataset
export function safeGetDataset(context) {
    return context && context.dataset ? context.dataset : {};
}
