// js/scripts/fix-agent-tf-layers.js
// Script to fix TensorFlow.js layers handling in agent.js

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

// Fix TensorFlow.js layers handling in agent.js
function fixAgentTfLayers() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'agent.js');
  const content = readFile(filePath);
  if (!content) return false;

  // Find the constructor
  const constructorRegex = /constructor\([^)]*\)[^{]*{[\s\S]*?this\.isTfReady = true;/;
  const constructorMatch = content.match(constructorRegex);
  
  if (!constructorMatch) {
    console.error("Could not find constructor with TensorFlow.js check");
    return false;
  }
  
  // Replace with improved check
  const improvedConstructor = constructorMatch[0].replace(
    /\/\/ Check for TensorFlow\.js[\s\S]*?this\.isTfReady = true;/,
    `// Check for TensorFlow.js
        if (typeof tf === 'undefined') {
            console.error("CRITICAL: TensorFlow.js not loaded.");
            displayError("TensorFlow.js not loaded. Agent initialization failed.", true, 'error-message');
            return; // Stop initialization
        }
        
        // Check for essential TensorFlow.js modules
        if (typeof tf.layers === 'undefined') {
            // Try to get layers from window.tf if available
            if (typeof window !== 'undefined' && 
                typeof window.tf !== 'undefined' && 
                typeof window.tf.layers !== 'undefined') {
                console.log("Using tf.layers from window.tf");
                tf.layers = window.tf.layers;
            } else {
                console.error("CRITICAL: TensorFlow.js or required modules (layers) not loaded.");
                displayError("TensorFlow.js not loaded/incomplete. Agent initialization failed.", true, 'error-message');
                this.cleanup(); // Attempt cleanup
                return; // Stop initialization
            }
        }
        
        this.isTfReady = true;`
  );
  
  // Replace the constructor
  let newContent = content.replace(constructorRegex, improvedConstructor);
  
  // Find all tf.layers references and make them more robust
  newContent = newContent.replace(
    /tf\.layers\./g,
    "tf.layers && tf.layers."
  );
  
  return writeFile(filePath, newContent);
}

// Run the fix
console.log("Fixing TensorFlow.js layers handling in agent.js...");
if (fixAgentTfLayers()) {
  console.log("Successfully fixed TensorFlow.js layers handling in agent.js");
} else {
  console.error("Failed to fix TensorFlow.js layers handling in agent.js");
}