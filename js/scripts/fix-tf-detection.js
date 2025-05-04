// js/scripts/fix-tf-detection.js
// Script to fix TensorFlow.js detection in app.js

const fs = require('fs');
const path = require('path');

// Helper functions
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    return false;
  }
}

// Fix TensorFlow.js detection in app.js
function fixTfDetection() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'app.js');
  const content = readFile(filePath);
  if (!content) return false;

  // Find the isTensorFlowReady function
  const functionRegex = /function isTensorFlowReady\(\)[^{]*{[\s\S]*?}/;
  const functionMatch = content.match(functionRegex);
  
  if (!functionMatch) {
    console.error("Could not find isTensorFlowReady function");
    return false;
  }
  
  // Replace with improved function
  const improvedFunction = `function isTensorFlowReady() {
    // First check if tf is defined globally
    if (typeof tf === 'undefined') {
        console.warn("TensorFlow.js not found in module scope");
        return false;
    }
    
    // Ensure essential functions exist
    const hasLayers = typeof tf.layers !== 'undefined';
    const hasKeep = typeof tf.keep === 'function';
    const hasZeros = typeof tf.zeros === 'function';
    
    // If layers is missing but we have the global tf object with layers
    if (!hasLayers && typeof window !== 'undefined' && 
        typeof window.tf !== 'undefined' && 
        typeof window.tf.layers !== 'undefined') {
        console.log("Using layers from global TensorFlow.js");
        tf.layers = window.tf.layers;
        return true;
    }
    
    if (!hasLayers || !hasKeep || !hasZeros) {
        console.warn("TensorFlow.js is missing essential functions:", 
            {hasLayers, hasKeep, hasZeros});
        return false;
    }
    
    return true;
}`;
  
  // Replace the function
  let newContent = content.replace(functionRegex, improvedFunction);
  
  // Find the initialize function
  const initializeRegex = /async function initialize\(\)[^{]*{[\s\S]*?}/;
  const initializeMatch = newContent.match(initializeRegex);
  
  if (!initializeMatch) {
    console.error("Could not find initialize function");
    return writeFile(filePath, newContent);
  }
  
  // Add retry logic to the initialize function
  const improvedInitialize = initializeMatch[0].replace(
    /if \(!isTensorFlowReady\(\)\) {/,
    `// Try to load TensorFlow.js
    let tfReadyAttempts = 0;
    const maxTfReadyAttempts = 5;
    
    while (!isTensorFlowReady() && tfReadyAttempts < maxTfReadyAttempts) {
        console.log("Waiting for TensorFlow.js to load...");
        await new Promise(resolve => setTimeout(resolve, 500));
        tfReadyAttempts++;
    }
    
    if (!isTensorFlowReady()) {`
  );
  
  // Update the content
  newContent = newContent.replace(initializeRegex, improvedInitialize);
  
  return writeFile(filePath, newContent);
}

// Run the fix
console.log("Fixing TensorFlow.js detection...");
if (fixTfDetection()) {
  console.log("Successfully fixed TensorFlow.js detection");
} else {
  console.error("Failed to fix TensorFlow.js detection");
}

