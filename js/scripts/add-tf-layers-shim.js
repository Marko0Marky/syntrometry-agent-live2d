// js/scripts/add-tf-layers-shim.js
// Script to add a TensorFlow.js layers shim to index.html

const fs = require('fs');
const path = require('path');

// Add TensorFlow.js layers shim to index.html
function addTfLayersShim() {
  const filePath = path.join(__dirname, '..', '..', 'index.html');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if the shim is already added
    if (content.includes('tf-layers-shim.js')) {
      console.log('TensorFlow.js layers shim already added to index.html');
      return true;
    }
    
    // Create the shim script
    const shimPath = path.join(__dirname, '..', '..', 'js', 'tf-layers-shim.js');
    const shimContent = `// TensorFlow.js layers shim
// This script ensures tf.layers is available globally
(function() {
  console.log('Loading TensorFlow.js layers shim...');
  
  // Wait for TensorFlow.js to load
  function checkTfLoaded() {
    if (typeof tf !== 'undefined') {
      // If tf exists but layers doesn't, try to find it
      if (typeof tf.layers === 'undefined') {
        console.log('tf.layers not found, attempting to fix...');
        
        // Try to load layers from tfjs-layers if available
        if (typeof window.tf !== 'undefined' && typeof window.tf.layers !== 'undefined') {
          console.log('Found tf.layers in window.tf, attaching to global tf');
          tf.layers = window.tf.layers;
        } else {
          console.warn('Could not find tf.layers in any scope');
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
`;
    
    // Write the shim file
    fs.writeFileSync(shimPath, shimContent, 'utf8');
    console.log('Created TensorFlow.js layers shim at js/tf-layers-shim.js');
    
    // Add the script tag to index.html
    const scriptTag = '<script src="js/tf-layers-shim.js"></script>';
    
    // Find the position to insert the script tag (after TensorFlow.js scripts)
    const tfScriptPos = content.lastIndexOf('tensorflow');
    if (tfScriptPos !== -1) {
      const scriptEndPos = content.indexOf('</script>', tfScriptPos);
      if (scriptEndPos !== -1) {
        const insertPos = scriptEndPos + 9; // After </script>
        content = content.slice(0, insertPos) + '\n    ' + scriptTag + content.slice(insertPos);
      }
    } else {
      // If no TensorFlow.js script found, add before the app.js script
      const appScriptPos = content.indexOf('app.js');
      if (appScriptPos !== -1) {
        const scriptStartPos = content.lastIndexOf('<script', appScriptPos);
        if (scriptStartPos !== -1) {
          content = content.slice(0, scriptStartPos) + scriptTag + '\n    ' + content.slice(scriptStartPos);
        }
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Added TensorFlow.js layers shim to index.html');
    return true;
  } catch (error) {
    console.error('Error adding TensorFlow.js layers shim:', error);
    return false;
  }
}

// Run the fix
addTfLayersShim();