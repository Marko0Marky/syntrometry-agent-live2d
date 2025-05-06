// js/tensorUtils.js - Utility functions for working with TensorFlow.js tensors

// Use the global tf object
const tf = window.tf;

/**
 * Creates a TensorFlow.js tensor from various data types.
 * Includes basic error handling and validation.
 * Returns the created tensor, or null if creation fails.
 * @param {any} data - Data to create tensor from (array, TypedArray, number, boolean, etc.)
 * @param {number[]} [shape] - Optional tensor shape
 * @param {string} [dtype] - Optional data type
 * @returns {tf.Tensor|null} - A new tf.Tensor or null
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
        return newTensor;
    } catch (e) {
        console.error(`Error creating tensor: ${e.message}`, { data_type: typeof data, shape, dtype });
        return null;
    }
}

/**
 * Safely disposes a tensor, checking if it exists and isn't already disposed.
 * @param {tf.Tensor|null} tensor - The tensor to dispose
 * @returns {boolean} - True if successfully disposed, false otherwise
 */
export function safeDispose(tensor) {
    if (!tensor) {
        return false;
    }
    
    try {
        if (tensor.isDisposed) {
            return false;
        }
        tensor.dispose();
        return true;
    } catch (e) {
        console.error("Error disposing tensor:", e);
        return false;
    }
}

/**
 * Converts a tensor to a JavaScript array.
 * @param {tf.Tensor|null} tensor - The tensor to convert
 * @returns {Array|null} - The tensor data as a JavaScript array, or null if conversion fails
 */
export function tensorToArray(tensor) {
    if (!tensor || tensor.isDisposed) {
        return null;
    }
    
    try {
        return tensor.arraySync();
    } catch (e) {
        console.error("Error converting tensor to array:", e);
        return null;
    }
}

/**
 * Asynchronously converts a tensor to a JavaScript array.
 * @param {tf.Tensor|null} tensor - The tensor to convert
 * @returns {Promise<Array|null>} - Promise resolving to the tensor data as a JavaScript array, or null if conversion fails
 */
export function tensorToArrayAsync(tensor) {
    if (!tensor || tensor.isDisposed) {
        return Promise.resolve(null);
    }
    
    try {
        return tensor.array();
    } catch (e) {
        console.error("Error converting tensor to array asynchronously:", e);
        return Promise.resolve(null);
    }
}

/**
 * Safely reshapes a tensor, handling errors.
 * @param {tf.Tensor|null} tensor - The tensor to reshape
 * @param {number[]} newShape - The new shape
 * @returns {tf.Tensor|null} - The reshaped tensor, or null if reshaping fails
 */
export function safeReshape(tensor, newShape) {
    if (!tensor || tensor.isDisposed) {
        return null;
    }
    
    try {
        return tensor.reshape(newShape);
    } catch (e) {
        console.error(`Error reshaping tensor from ${tensor.shape} to ${newShape}:`, e);
        return null;
    }
}

/**
 * Safely extracts a scalar value from a tensor.
 * @param {tf.Tensor|null} tensor - The tensor to extract from (should be a scalar)
 * @param {number} defaultValue - Default value to return if extraction fails
 * @returns {number} - The scalar value or the default value
 */
export function safeGetScalar(tensor, defaultValue = 0) {
    if (!tensor || tensor.isDisposed) {
        return defaultValue;
    }
    
    try {
        // Check if it's a scalar tensor
        if (tensor.rank !== 0) {
            console.warn(`Expected scalar tensor, got rank ${tensor.rank}`);
            return defaultValue;
        }
        
        return tensor.dataSync()[0];
    } catch (e) {
        console.error("Error getting scalar value:", e);
        return defaultValue;
    }
}

/**
 * Checks if a tensor contains NaN or Infinity values.
 * @param {tf.Tensor|null} tensor - The tensor to check
 * @returns {boolean} - True if the tensor contains NaN or Infinity, false otherwise
 */
export function containsNaNOrInf(tensor) {
    if (!tensor || tensor.isDisposed) {
        return false;
    }
    
    try {
        // Get the data as a typed array
        const data = tensor.dataSync();
        
        // Check for NaN or Infinity
        for (let i = 0; i < data.length; i++) {
            if (isNaN(data[i]) || !isFinite(data[i])) {
                return true;
            }
        }
        
        return false;
    } catch (e) {
        console.error("Error checking tensor for NaN/Inf:", e);
        return false;
    }
}

/**
 * Checks if a tensor is valid (exists, not disposed, and has the expected shape).
 * @param {tf.Tensor|null} tensor - The tensor to check
 * @param {number[]} [expectedShape] - Optional expected shape
 * @returns {boolean} - True if the tensor is valid, false otherwise
 */
export function isValidTensor(tensor, expectedShape) {
    if (!tensor || tensor.isDisposed) {
        return false;
    }
    
    if (expectedShape) {
        // Check if shapes match
        if (tensor.shape.length !== expectedShape.length) {
            return false;
        }
        
        for (let i = 0; i < tensor.shape.length; i++) {
            // -1 in expectedShape means any size is acceptable for that dimension
            if (expectedShape[i] !== -1 && tensor.shape[i] !== expectedShape[i]) {
                return false;
            }
        }
    }
    
    return true;
}

/**
 * Checks if a tensor contains any NaN or Infinity values
 * @param {tf.Tensor} tensor The tensor to check
 * @returns {boolean} A boolean indicating if the tensor contains NaN or Infinity
 */
export function hasNaNorInf(tensor) {
  if (!tensor || tensor.isDisposed) return false;
  try {
    const data = tensor.dataSync();
    // Check each value in the tensor
    for (let i = 0; i < data.length; i++) {
      if (!Number.isFinite(data[i])) {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("Error checking tensor for NaN/Inf:", e);
    return false;
  }
}

