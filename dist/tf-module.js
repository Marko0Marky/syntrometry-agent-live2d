// This module exports the global tf object as an ES module
// It will be used when code tries to import from @tensorflow/tfjs

// Check if TensorFlow.js is loaded globally
if (typeof window.tf === 'undefined') {
  console.error('TensorFlow.js is not loaded globally. Make sure it loads before any module imports.');
  throw new Error('TensorFlow.js not loaded globally');
}

// Log TensorFlow.js version and available modules
console.log(`TensorFlow.js version: ${window.tf.version.tfjs}`);
console.log(`TensorFlow.js modules available:`, {
  layers: typeof window.tf.layers !== 'undefined',
  data: typeof window.tf.data !== 'undefined',
  browser: typeof window.tf.browser !== 'undefined',
  train: typeof window.tf.train !== 'undefined'
});

// Export the global tf object as default
const tf = window.tf;
export default tf;

// Export common TensorFlow functions and classes
export const tensor = window.tf.tensor;
export const zeros = window.tf.zeros;
export const ones = window.tf.ones;
export const scalar = window.tf.scalar;
export const tidy = window.tf.tidy;
export const dispose = window.tf.dispose;
export const keep = window.tf.keep;
export const memory = window.tf.memory;
export const Tensor = window.tf.Tensor;

// Export common operations
export const add = window.tf.add;
export const sub = window.tf.sub;
export const mul = window.tf.mul;
export const div = window.tf.div;
export const pow = window.tf.pow;
export const sqrt = window.tf.sqrt;
export const sum = window.tf.sum;
export const mean = window.tf.mean;
export const max = window.tf.max;
export const min = window.tf.min;
export const argMax = window.tf.argMax;
export const argMin = window.tf.argMin;
export const concat = window.tf.concat;
export const stack = window.tf.stack;
export const unstack = window.tf.unstack;
export const reshape = window.tf.reshape;
export const cast = window.tf.cast;
export const oneHot = window.tf.oneHot;
export const where = window.tf.where;
export const greater = window.tf.greater;
export const greaterEqual = window.tf.greaterEqual;
export const less = window.tf.less;
export const lessEqual = window.tf.lessEqual;
export const equal = window.tf.equal;
export const notEqual = window.tf.notEqual;
export const logicalAnd = window.tf.logicalAnd;
export const logicalOr = window.tf.logicalOr;
export const logicalNot = window.tf.logicalNot;

// Export namespaces
export const layers = window.tf.layers || {};
export const browser = window.tf.browser || {};
export const data = window.tf.data || {};
export const train = window.tf.train || {};
export const util = window.tf.util || {};
export const io = window.tf.io || {};
export const serialization = window.tf.serialization || {};
export const version = window.tf.version || {};

// Add tensor1d to the exports
export const tensor1d = function(values, dtype) {
  return window.tf.tensor(values, [values.length], dtype);
};

// Make sure it's also available on the exported tf object
if (!window.tf.tensor1d) {
  window.tf.tensor1d = function(values, dtype) {
    return window.tf.tensor(values, [values.length], dtype);
  };
}

console.log('TensorFlow.js module exports created');




