// @ts-nocheck
// --- START OF FILE tensorUtils.ts ---
// Consolidated tensor utilities
import * as tf from '@tensorflow/tfjs';
/**
 * Safely disposes a tensor if it exists and isn't already disposed
 */
export function safeDispose(tensor) {
    if (tensor && !tensor.isDisposed) {
        tensor.dispose();
    }
}
/**
 * Converts a tensor to array synchronously (use only when tensor is ready)
 */
export function tensorToArray(tensor) {
    if (!tensor || tensor.isDisposed)
        return [];
    try {
        return Array.from(tensor.dataSync());
    }
    catch (e) {
        console.error("Error converting tensor to array:", e);
        return [];
    }
}
/**
 * Converts a tensor to array asynchronously (safer for backend tensors)
 */
export async function tensorToArrayAsync(tensor) {
    if (!tensor || tensor.isDisposed)
        return [];
    try {
        const data = await tensor.data();
        return Array.from(data);
    }
    catch (e) {
        console.error("Error converting tensor to array async:", e);
        return [];
    }
}
/**
 * Checks if a tensor contains NaN or Infinity values
 */
export function containsNaNOrInf(tensor) {
    if (!tensor || tensor.isDisposed)
        return false;
    try {
        const data = tensor.dataSync();
        return Array.from(data).some(val => !isFinite(val));
    }
    catch (e) {
        console.error("Error checking tensor for NaN/Inf:", e);
        return false;
    }
}
/**
 * Creates a TensorFlow.js tensor from various data types.
 * Includes basic error handling and validation.
 * Returns the created tensor, or null if creation fails.
 * @param data Data to create tensor from (array, TypedArray, number, boolean, etc.).
 * @param shape Optional tensor shape.
 * @param dtype Optional data type.
 * @returns A new tf.Tensor or null.
 */
export function createTensor(data, shape, dtype) {
    if (typeof tf === 'undefined' || typeof tf.tensor !== 'function') {
        console.error("TensorFlow (tf) is undefined or not fully loaded in createTensor()");
        return null;
    }
    try {
        // Basic validation
        if (data === undefined || data === null) {
            if (!shape) {
                console.error("Cannot create tensor: Data is null/undefined and no shape provided.");
                return null;
            }
            console.warn("Creating tensor with null/undefined data and shape:", shape, ". Using tf.zeros instead.");
            return tf.zeros(shape, dtype);
        }
        // Create the tensor
        const newTensor = tf.tensor(data, shape, dtype);
        // Optional: Immediately check for NaN/Inf after creation if desired
        // if (await containsNaNOrInf(newTensor)) {
        //     console.error("Newly created tensor contains NaN or Inf:", data, shape, dtype);
        //     safeDispose(newTensor);
        //     return null;
        // }
        return newTensor;
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`TensorFlow Error creating tensor: ${message}`, { data_type: typeof data, shape, dtype, error: e });
        return null;
    }
}
// --- END OF FILE tensorUtils.ts ---
//# sourceMappingURL=tensorUtils.js.map