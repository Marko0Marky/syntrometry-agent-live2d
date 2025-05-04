// js/scripts/fix-tf-layers-detection.js
// Script to fix TensorFlow.js layers detection

const fs = require('fs');
const path = require('path');

// Fix TensorFlow.js layers detection in app.ts
function fixTfLayersDetection() {
  const filePath = path.join(__dirname, '..', 'app.ts');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Find the isTensorFlowReady function
    const functionRegex = /function isTensorFlowReady\([^)]*\)\s*{[^}]*}/s;
    const match = content.match(functionRegex);
    
    if (!match) {
      console.error('Could not find isTensorFlowReady function in app.ts');
      return false;
    }
    
    // Replace the function with an improved version
    const improvedFunction = `function isTensorFlowReady(tfInstance) {
    if (!tfInstance) return false;
    
    // Check for essential functions
    const hasLayers = typeof tfInstance.layers !== 'undefined';
    const hasKeep = typeof tfInstance.keep === 'function';
    const hasZeros = typeof tfInstance.zeros === 'function';
    
    // Log what's missing for debugging
    if (!hasLayers || !hasKeep || !hasZeros) {
        console.log("TensorFlow.js is missing essential functions:", {
            hasLayers, hasKeep, hasZeros
        });
        
        // Try to access layers through window.tf if available
        if (!hasLayers && typeof window !== 'undefined' && window.tf && window.tf.layers) {
            console.log("Found tf.layers in window.tf, using that instead");
            // Attach layers to the provided instance
            tfInstance.layers = window.tf.layers;
            return true;
        }
        
        return false;
    }
    
    return true;
}`;
    
    // Replace the function
    content = content.replace(functionRegex, improvedFunction);
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed TensorFlow.js layers detection in app.ts');
    
    // Now fix the dist/app.js file if it exists
    const distFilePath = path.join(__dirname, '..', '..', 'dist', 'app.js');
    if (fs.existsSync(distFilePath)) {
      let distContent = fs.readFileSync(distFilePath, 'utf8');
      
      // Find the isTensorFlowReady function in the compiled JS
      const distFunctionRegex = /function isTensorFlowReady\([^)]*\)\s*{[^}]*}/s;
      const distMatch = distContent.match(distFunctionRegex);
      
      if (distMatch) {
        // Replace with compiled version of our improved function
        const compiledFunction = `function isTensorFlowReady(tfInstance) {
    if (!tfInstance)
        return false;
    // Check for essential functions
    const hasLayers = typeof tfInstance.layers !== 'undefined';
    const hasKeep = typeof tfInstance.keep === 'function';
    const hasZeros = typeof tfInstance.zeros === 'function';
    // Log what's missing for debugging
    if (!hasLayers || !hasKeep || !hasZeros) {
        console.log("TensorFlow.js is missing essential functions:", {
            hasLayers, hasKeep, hasZeros
        });
        // Try to access layers through window.tf if available
        if (!hasLayers && typeof window !== 'undefined' && window.tf && window.tf.layers) {
            console.log("Found tf.layers in window.tf, using that instead");
            // Attach layers to the provided instance
            tfInstance.layers = window.tf.layers;
            return true;
        }
        return false;
    }
    return true;
}`;
        
        // Replace the function
        distContent = distContent.replace(distFunctionRegex, compiledFunction);
        
        fs.writeFileSync(distFilePath, distContent, 'utf8');
        console.log('Fixed TensorFlow.js layers detection in dist/app.js');
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error fixing TensorFlow.js layers detection:', error);
    return false;
  }
}

// Run the fix
fixTfLayersDetection();