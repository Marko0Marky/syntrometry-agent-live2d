// Add this to your existing tf-layers-shim.js file
console.log("Loading TensorFlow.js layers shim...");

// Ensure TensorFlow.js is available globally
if (typeof window.tf === 'undefined') {
    console.error("TensorFlow.js not found!");
} else {
    // Make sure randomUniform is available
    if (typeof window.tf.randomUniform === 'undefined' && typeof window.tf.random !== 'undefined' && typeof window.tf.random.uniform !== 'undefined') {
        window.tf.randomUniform = window.tf.random.uniform;
        console.log("Added tf.randomUniform compatibility function");
    }
    
    // Make sure sequential is available
    if (typeof window.tf.sequential === 'undefined' && typeof window.tf.layers !== 'undefined' && typeof window.tf.layers.sequential !== 'undefined') {
        window.tf.sequential = window.tf.layers.sequential;
        console.log("Added tf.sequential compatibility function");
    }
    
    console.log("tf.layers is available:", typeof window.tf.layers !== 'undefined');
}