import * as tf from '@tensorflow/tfjs';
export function asTensor(tensor) {
    // Check if it's already a tensor
    if (tensor && typeof tensor.dataSync === 'function') {
        return tensor; // Just return the tensor, this is only for type casting
    }
    // If it's not a tensor but a tensor-like value, convert it
    try {
        return tf.tensor(tensor);
    }
    catch (e) {
        console.error("Failed to convert to tensor:", e);
        return tf.tensor([]);
    }
}
export function asNullableTensor(tensor) {
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
    }
    catch (e) {
        console.error("Failed to convert to tensor:", e);
        return null;
    }
}
/**
 * Check if a value is a tensor
 */
export function isTensor(value) {
    return value !== null && value !== undefined &&
        typeof value === 'object' && 'dataSync' in value;
}
/**
 * Converts a value to a number tensor
 */
export function asNumberTensor(value) {
    if (isTensor(value)) {
        return value;
    }
    // Use tf.tensor to convert non-tensor values
    return tf.tensor(value);
}
/**
 * Safely converts a value to a Tensor
 */
export function asRankTensor(value) {
    if (!value)
        return tf.zeros([1]);
    if (isTensor(value)) {
        return value;
    }
    return tf.tensor(value);
}
/**
 * Safely converts a nullable value to a Tensor or null
 */
export function asNullableRankTensor(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return asRankTensor(value);
}
/**
 * Converts a Variable to a Tensor
 */
export function asVariable(value) {
    return value;
}
/**
 * Safely converts any tensor-like data to a format suitable for Live2D
 */
export function toLive2DFormat(data) {
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
    const numArray = Array.from(data).map(Number);
    // Return as tensor
    return tf.tensor(numArray);
}
/**
 * Safely converts any tensor data to a number array
 * This is specifically designed to work with Live2D functions
 */
export function toNumberArray(data) {
    // Handle null/undefined
    if (data === null || data === undefined)
        return [];
    // Handle tensor
    if (isTensor(data)) {
        data = data.dataSync();
    }
    // Convert to array with explicit number conversion
    try {
        // First try with Array.from
        return Array.from(data).map(Number);
    }
    catch (e) {
        // Fallback to manual conversion if Array.from fails
        const result = [];
        for (let i = 0; i < data.length; i++) {
            result.push(Number(data[i]));
        }
        return result;
    }
}
/**
 * Non-null tensor assertion (similar to TypeScript's non-null assertion)
 */
export function asNonNullTensor(tensor) {
    if (tensor === null || tensor === undefined) {
        console.warn("Null tensor encountered where non-null was expected");
        return tf.zeros([1]); // Return empty tensor as fallback
    }
    return tensor;
}
/**
 * Converts a value to a nullable number tensor
 */
export function asNullableNumberTensor(value) {
    if (value === null || value === undefined) {
        return null;
    }
    return asNumberTensor(value);
}
export function asEnvStepResult(result) {
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
export function arrayToTensor(array) {
    return tf.tensor(array);
}
