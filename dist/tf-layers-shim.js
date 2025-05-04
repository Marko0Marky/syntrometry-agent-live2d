// TensorFlow.js layers shim
// This script ensures tf.layers is available globally
(function() {
  console.log('Loading TensorFlow.js layers shim...');
  
  // Wait for TensorFlow.js to load
  function checkTfLoaded() {
    if (typeof tf !== 'undefined') {
      // If tf exists but layers doesn't, try to find it
      if (typeof tf.layers === 'undefined') {
        console.log('tf.layers not found, attempting to fix...');
        
        // Try to load layers from window.tf if available
        if (typeof window !== 'undefined' && typeof window.tf !== 'undefined' && typeof window.tf.layers !== 'undefined') {
          console.log('Found tf.layers in window.tf, attaching to global tf');
          tf.layers = window.tf.layers;
        } else {
          console.warn('Could not find tf.layers in any scope');
          
          // Try to load tfjs-layers directly
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-layers@4.21.0/dist/tf-layers.min.js';
          script.onload = function() {
            console.log('Loaded tfjs-layers directly');
            if (typeof tf !== 'undefined' && typeof window.tf !== 'undefined' && typeof window.tf.layers !== 'undefined') {
              tf.layers = window.tf.layers;
              console.log('Successfully attached layers to tf');
            }
          };
          script.onerror = function() {
            console.error('Failed to load tfjs-layers directly');
          };
          document.head.appendChild(script);
        }
      } else {
        console.log('tf.layers is available');
      }
    } else {
      // If tf is not defined yet, wait and try again
      console.log('Waiting for TensorFlow.js to load...');
      setTimeout(checkTfLoaded, 100);
    }
  }
  
  // Start checking
  checkTfLoaded();
})();
