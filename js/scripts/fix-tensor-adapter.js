// js/scripts/fix-tensor-adapter.js
// Script to fix tensorAdapter.js

const fs = require('fs');
const path = require('path');

// Fix tensorAdapter.js
function fixTensorAdapter() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'tensorAdapter.js');
  try {
    const newContent = `// Updated tensorAdapter.js
import * as tf from '@tensorflow/tfjs';

// Export layers from tf
export const layers = tf.layers || tf['layers'];

/**
 * Adapts a tensor to be compatible with both tfjs and tfjs-core
 */
export function adaptTensor(tensor) {
  if (!tensor) return null;
  return tensor;
}

/**
 * Adapts a nullable tensor
 */
export function adaptNullableTensor(tensor) {
  return adaptTensor(tensor);
}

/**
 * Safely clones and keeps a tensor
 */
export function safeCloneKeep(tensor) {
  if (!tensor || tensor.isDisposed) return null;
  try {
    return tf.keep(tensor.clone());
  } catch (e) {
    console.error("Error cloning tensor:", e);
    return null;
  }
}

/**
 * Safely reshapes a tensor
 */
export function safeReshape(tensor, newShape) {
  if (!tensor || tensor.isDisposed) return null;
  try {
    return tensor.reshape(newShape);
  } catch (e) {
    console.error("Error reshaping tensor:", e);
    // Try to create a new tensor with the desired shape
    try {
      const data = tensor.dataSync();
      return tf.tensor(Array.from(data), newShape);
    } catch (e2) {
      console.error("Error creating new tensor with shape:", e2);
      return null;
    }
  }
}
`;
    
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Fixed tensorAdapter.js');
    return true;
  } catch (error) {
    console.error('Error fixing tensorAdapter.js:', error);
    return false;
  }
}

// Run the fix
fixTensorAdapter();
