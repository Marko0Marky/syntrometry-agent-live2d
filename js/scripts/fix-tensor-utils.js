// js/scripts/fix-tensor-utils.js
// Script to fix missing exports in tensorUtils.js

const fs = require('fs');
const path = require('path');

// Fix tensorUtils.js exports
function fixTensorUtilsExports() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'tensorUtils.js');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Create a completely new file with all the necessary functions
    const newContent = `// js/tensorUtils.ts
// Consolidated utility functions for tensor operations and type handling
import * as tf from '@tensorflow/tfjs';

// ===== TYPE CASTING HELPERS =====
/**
 * Helper function to safely cast TensorFlow.js tensors to the correct type
 * to work around TypeScript compatibility issues between @tensorflow/tfjs and @tensorflow/tfjs-core
 */
export function asTensor(tensor) {
    return tensor;
}

/**
 * Helper function for nullable tensors
 */
export function asNullableTensor(tensor) {
    return tensor;
}

/**
 * Helper function to ensure a tensor is non-null
 */
export function asNonNullTensor(tensor) {
    if (!tensor) {
        throw new Error('Expected non-null tensor but received null/undefined');
    }
    return tensor;
}

/**
 * Helper function to cast to number tensor
 */
export function asNumberTensor(tensor) {
    return tensor;
}

/**
 * Safely disposes a tensor or array of tensors
 */
export function safeDispose(tensors) {
    if (!tensors) return;
    
    if (Array.isArray(tensors)) {
        tensors.forEach(t => {
            if (t && !t.isDisposed && typeof t.dispose === 'function') {
                try {
                    t.dispose();
                } catch (e) {
                    console.error("Error disposing tensor:", e);
                }
            }
        });
    } else if (tensors && !tensors.isDisposed && typeof tensors.dispose === 'function') {
        try {
            tensors.dispose();
        } catch (e) {
            console.error("Error disposing tensor:", e);
        }
    }
}

/**
 * Runs operations in tf.tidy and returns properly typed result with error handling
 */
export function tidyTensor(fn) {
    try {
        return tf.tidy(fn);
    } catch (e) {
        console.error("Error in tidyTensor:", e);
        // Return a default tensor
        return tf.tensor([0]);
    }
}

// ===== TENSOR CONVERSION UTILITIES =====

/**
 * Converts a tensor to an array synchronously with error handling
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
 * Converts a tensor to an array asynchronously with error handling
 */
export async function tensorToArrayAsync(tensor) {
    if (!tensor || tensor.isDisposed)
        return [];
    try {
        const data = await tensor.array();
        return Array.isArray(data) ? data.flat(Infinity).map(Number) : [Number(data)];
    }
    catch (e) {
        console.error("Error converting tensor to array asynchronously:", e);
        // Fall back to synchronous method
        return tensorToArray(tensor);
    }
}

/**
 * Converts tensor data to number array
 */
export function toNumberArray(tensor) {
    const arr = tensorToArray(tensor);
    return arr ? arr.map(Number) : [];
}

/**
 * Converts any tensor-like data to a format suitable for Live2D
 */
export function toLive2DFormat(data) {
    // If null/undefined, return empty array
    if (data === null || data === undefined) {
        return [];
    }
    // If already a tensor, convert it to array
    if (isTensor(data)) {
        return tensorToArray(data);
    }
    // If it has dataSync (tensor-like), extract data
    if (data && typeof data.dataSync === 'function') {
        try {
            const syncData = data.dataSync();
            return Array.from(syncData).map(Number);
        }
        catch (e) {
            console.error("Error extracting data from tensor-like object:", e);
            return [];
        }
    }
    // Convert to array and ensure all elements are numbers
    try {
        return Array.from(data).map(Number);
    }
    catch (e) {
        console.error("Error converting data to Live2D format:", e);
        return [];
    }
}

/**
 * Type guard to check if a value is a TensorFlow.js Tensor
 */
export function isTensor(value) {
    return value !== null &&
        typeof value === 'object' &&
        'shape' in value &&
        'rank' in value &&
        'dtype' in value &&
        typeof value.dataSync === 'function';
}

/**
 * Checks if a tensor contains NaN or Infinity values
 */
export function containsNaNOrInf(tensor) {
    if (!tensor || tensor.isDisposed)
        return false;
    try {
        const data = tensor.dataSync();
        return Array.from(data).some(val => isNaN(val) || !isFinite(val));
    }
    catch (e) {
        console.error("Error checking tensor for NaN/Inf:", e);
        return false;
    }
}

// Add any other functions from the original file that we need to preserve
`;
    
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Fixed exports in tensorUtils.js');
    return true;
  } catch (error) {
    console.error('Error fixing tensorUtils.js exports:', error);
    return false;
  }
}

// Run the fix
fixTensorUtilsExports();

