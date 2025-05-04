// js/scripts/add-tf-shim-to-dist.js
// Script to add a TensorFlow.js layers shim to the dist folder

const fs = require('fs');
const path = require('path');

// Create the TensorFlow.js layers shim
function createTfLayersShim() {
  const shimPath = path.join(__dirname, '..', '..', 'dist', 'tf-layers-shim.js');
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
`;
  
  try {
    fs.writeFileSync(shimPath, shimContent, 'utf8');
    console.log('Created TensorFlow.js layers shim at dist/tf-layers-shim.js');
    return true;
  } catch (error) {
    console.error('Error creating TensorFlow.js layers shim:', error);
    return false;
  }
}

// Add the shim script to index.html in the dist folder
function addShimToIndexHtml() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'index.html');
  try {
    if (!fs.existsSync(filePath)) {
      console.error('index.html not found in dist folder');
      return false;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if the shim is already added
    if (content.includes('tf-layers-shim.js')) {
      console.log('TensorFlow.js layers shim already added to index.html');
      return true;
    }
    
    // Add the script tag to index.html
    const scriptTag = '<script src="tf-layers-shim.js"></script>';
    
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
    console.error('Error adding TensorFlow.js layers shim to index.html:', error);
    return false;
  }
}

// Run the script
function main() {
  const shimCreated = createTfLayersShim();
  if (!shimCreated) {
    console.error('Failed to create TensorFlow.js layers shim');
    return;
  }
  
  const shimAdded = addShimToIndexHtml();
  if (!shimAdded) {
    console.error('Failed to add TensorFlow.js layers shim to index.html');
    return;
  }
  
  console.log('Successfully added TensorFlow.js layers shim');
}

main();