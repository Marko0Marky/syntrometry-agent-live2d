// @ts-nocheck
import * as tf from '@tensorflow/tfjs';
/**
 * Helper function to safely cast TensorFlow.js tensors to the correct type
 * to work around TypeScript compatibility issues between @tensorflow/tfjs and @tensorflow/tfjs-core
 */
export function asTensor(tensor) {
    return tensor;
}
/**
 * Helper function to safely cast typed arrays to number arrays
 */
export function asNumberArray(array) {
    return Array.from(array);
}
/**
 * Helper function to safely keep a tensor with proper typing
 */
export function keepTensor(tensor) {
    return tf.keep(tensor);
}
//# sourceMappingURL=typeUtils.js.map