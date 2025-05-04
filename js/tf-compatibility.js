/**
 * TensorFlow.js Compatibility Layer
 * This file adds compatibility for older TF.js code with newer TF.js versions
 */
(function() {
  console.log("Loading TensorFlow.js compatibility layer...");
  
  // Wait for TF to be available
  function initCompatibility() {
    if (typeof window.tf === 'undefined') {
      console.log("Waiting for TensorFlow.js to load...");
      setTimeout(initCompatibility, 100);
      return;
    }
    
    console.log("Adding TensorFlow.js compatibility functions");
    
    // Add randomUniform compatibility
    if (typeof window.tf.randomUniform === 'undefined' && 
        typeof window.tf.random !== 'undefined' && 
        typeof window.tf.random.uniform !== 'undefined') {
      window.tf.randomUniform = function() {
        return window.tf.random.uniform.apply(null, arguments);
      };
      console.log("Added tf.randomUniform compatibility function");
    }
    
    // Add sequential compatibility
    if (typeof window.tf.sequential === 'undefined' && 
        typeof window.tf.layers !== 'undefined' && 
        typeof window.tf.layers.sequential !== 'undefined') {
      window.tf.sequential = function() {
        return window.tf.layers.sequential.apply(null, arguments);
      };
      console.log("Added tf.sequential compatibility function");
    }
  }
  
  // Start initialization
  initCompatibility();
})();