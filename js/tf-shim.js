// tf-shim.js - Provides TensorFlow.js compatibility layer
console.log("Loading TensorFlow.js shim...");

// Check if real TensorFlow is available
const realTf = window.tf;

// Create a minimal shim if real TensorFlow isn't available
const tfShim = {
    // Core tensor operations
    keep: function(tensor) {
        if (realTf && realTf.keep) return realTf.keep(tensor);
        return tensor; // Just return the tensor if no real keep function
    },
    
    zeros: function(shape) {
        if (realTf && realTf.zeros) return realTf.zeros(shape);
        // Create a simple tensor-like object with zeros
        const size = Array.isArray(shape) ? shape.reduce((a, b) => a * b, 1) : shape;
        return {
            shape: Array.isArray(shape) ? shape : [shape],
            size: size,
            dataSync: function() { return new Float32Array(size).fill(0); },
            clone: function() { return this; },
            isDisposed: false
        };
    },
    
    // Layers API stub
    layers: {
        dense: function() { return {}; }
    },
    
    // Signal that this is a shim
    isShim: true
};

// Export either the real TensorFlow or our shim
export default realTf || tfShim;