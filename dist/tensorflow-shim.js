// This shim ensures TensorFlow.js is properly loaded with all required modules
// It should be loaded before any other module scripts

console.log("TensorFlow.js shim initializing...");

// Check if TensorFlow is already loaded
if (typeof tf === 'undefined') {
  console.warn("TensorFlow.js not found, creating placeholder until fully loaded");
  // Create a placeholder tf object that will be replaced when the real one loads
  window.tf = {};
}

// Function to load TensorFlow.js from CDN if not already loaded
async function loadTensorFlow() {
  if (typeof tf.tensor2d === 'function') {
    console.log("TensorFlow.js already properly loaded");
    return true;
  }
  
  console.log("Loading TensorFlow.js from CDN...");
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.21.0/dist/tf.min.js";
    script.async = true;
    
    script.onload = () => {
      console.log("TensorFlow.js loaded from CDN successfully");
      // Verify it loaded correctly
      if (typeof tf === 'object' && typeof tf.tensor2d === 'function') {
        console.log("TensorFlow.js core functions verified");
        resolve(true);
      } else {
        console.error("TensorFlow.js loaded but core functions are missing");
        reject(new Error("TensorFlow.js loaded but core functions are missing"));
      }
    };
    
    script.onerror = () => {
      console.error("Failed to load TensorFlow.js from CDN");
      reject(new Error("Failed to load TensorFlow.js from CDN"));
    };
    
    document.head.appendChild(script);
  });
}

// Function to verify TensorFlow.js capabilities
function verifyTensorFlowCapabilities() {
  if (typeof tf === 'undefined') {
    console.error("TensorFlow.js is not loaded");
    return false;
  }
  
  const capabilities = {
    tensor: typeof tf.tensor === 'function',
    tensor1d: typeof tf.tensor1d === 'function',
    tensor2d: typeof tf.tensor2d === 'function',
    variable: typeof tf.variable === 'function',
    layers: typeof tf.layers !== 'undefined',
    sequential: typeof tf.sequential === 'function',
    train: typeof tf.train !== 'undefined',
    adam: typeof tf.train?.adam === 'function',
    tidy: typeof tf.tidy === 'function',
    dispose: typeof tf.dispose === 'function'
  };
  
  const missingCapabilities = Object.entries(capabilities)
    .filter(([_, available]) => !available)
    .map(([name]) => name);
  
  if (missingCapabilities.length > 0) {
    console.error("TensorFlow.js is missing capabilities:", missingCapabilities.join(', '));
    return false;
  }
  
  console.log("TensorFlow.js capabilities verified successfully");
  return true;
}

// Export functions for use in other modules
window.loadTensorFlow = loadTensorFlow;
window.verifyTensorFlowCapabilities = verifyTensorFlowCapabilities;

// Auto-load TensorFlow.js when this script loads
loadTensorFlow().then(() => {
  console.log("TensorFlow.js auto-loaded successfully");
  verifyTensorFlowCapabilities();
}).catch(error => {
  console.error("Error auto-loading TensorFlow.js:", error);
});


