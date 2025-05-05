// Simple test script to verify TensorFlow.js functionality
console.log("Running TensorFlow.js test...");

function testTensorFlow() {
  if (typeof tf === 'undefined') {
    console.error("TensorFlow.js is not loaded");
    return false;
  }
  
  console.log("TensorFlow.js version:", tf.version.tfjs);
  
  try {
    // Test tensor creation
    const tensor1 = tf.tensor2d([[1, 2], [3, 4]]);
    console.log("Created tensor2d:", tensor1.shape);
    
    // Test variable creation
    const variable1 = tf.variable(tensor1);
    console.log("Created variable:", variable1.shape);
    
    // Test sequential model
    const model = tf.sequential();
    model.add(tf.layers.dense({units: 1, inputShape: [1]}));
    console.log("Created sequential model");
    
    // Test optimizer
    const optimizer = tf.train.adam(0.1);
    console.log("Created adam optimizer");
    
    // Clean up
    tensor1.dispose();
    variable1.dispose();
    
    console.log("All TensorFlow.js tests passed!");
    return true;
  } catch (error) {
    console.error("TensorFlow.js test failed:", error);
    return false;
  }
}

// Run the test when the script loads
window.addEventListener('load', function() {
  setTimeout(() => {
    const result = testTensorFlow();
    if (result) {
      console.log("TensorFlow.js is fully functional");
    } else {
      console.error("TensorFlow.js is not fully functional");
    }
  }, 1000); // Wait a second to ensure everything is loaded
});

// Export the test function
window.testTensorFlow = testTensorFlow;