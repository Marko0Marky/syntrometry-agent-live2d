// js/scripts/fix-tf-layers.js
// Script to fix TensorFlow.js layers detection

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

// Fix TensorFlow.js layers detection in app.js
function fixTfLayersDetection() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'app.js');
  const content = readFile(filePath);
  if (!content) return false;

  // Create a global wrapper for TensorFlow.js
  const tfWrapper = `
// TensorFlow.js wrapper to handle different loading scenarios
const tfWrapper = {
  get instance() {
    // If the imported tf has layers, use it
    if (typeof tf !== 'undefined' && typeof tf.layers !== 'undefined') {
      return tf;
    }
    
    // If window.tf has layers, use that
    if (typeof window !== 'undefined' && 
        typeof window.tf !== 'undefined' && 
        typeof window.tf.layers !== 'undefined') {
      console.log("Using global TensorFlow.js instance");
      return window.tf;
    }
    
    // Return whatever we have, even if incomplete
    return tf || window.tf;
  },
  
  get layers() {
    return this.instance.layers;
  },
  
  get keep() {
    return this.instance.keep;
  },
  
  get zeros() {
    return this.instance.zeros;
  },
  
  isReady() {
    const instance = this.instance;
    if (!instance) return false;
    
    const hasLayers = typeof instance.layers !== 'undefined';
    const hasKeep = typeof instance.keep === 'function';
    const hasZeros = typeof instance.zeros === 'function';
    
    if (!hasLayers || !hasKeep || !hasZeros) {
      console.warn("TensorFlow.js is missing essential functions:", 
        {hasLayers, hasKeep, hasZeros});
      return false;
    }
    
    return true;
  }
};

// Replace the isTensorFlowReady function
function isTensorFlowReady() {
  return tfWrapper.isReady();
}
`;

  // Add the wrapper after the imports
  const importEndIndex = content.indexOf('// --- Global State ---');
  if (importEndIndex !== -1) {
    const newContent = content.slice(0, importEndIndex) + tfWrapper + '\n' + content.slice(importEndIndex);
    return writeFile(filePath, newContent);
  }
  
  return false;
}

// Fix the initialize function to use tfWrapper
function fixInitializeFunction() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'app.js');
  const content = readFile(filePath);
  if (!content) return false;

  // Find the initialize function
  const initializeRegex = /async function initialize\(\)[^{]*{[\s\S]*?}/;
  const initializeMatch = content.match(initializeRegex);
  
  if (!initializeMatch) {
    console.error("Could not find initialize function");
    return false;
  }
  
  // Replace tf references with tfWrapper.instance
  let newInitialize = initializeMatch[0].replace(
    /const coreInitSuccess = initAgentAndEnvironment\(\);/,
    'const coreInitSuccess = initAgentAndEnvironment(tfWrapper.instance);'
  );
  
  // Update the content
  const newContent = content.replace(initializeRegex, newInitialize);
  return writeFile(filePath, newContent);
}

// Fix the initAgentAndEnvironment function to accept a TensorFlow instance
function fixInitAgentFunction() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'app.js');
  const content = readFile(filePath);
  if (!content) return false;

  // Find the initAgentAndEnvironment function
  const functionRegex = /function initAgentAndEnvironment\(\)[^{]*{[\s\S]*?}/;
  const functionMatch = content.match(functionRegex);
  
  if (!functionMatch) {
    console.error("Could not find initAgentAndEnvironment function");
    return false;
  }
  
  // Update the function signature and check
  let newFunction = functionMatch[0]
    .replace(
      'function initAgentAndEnvironment()',
      'function initAgentAndEnvironment(tfInstance)'
    )
    .replace(
      /if \(!isTensorFlowReady\(\)\) {/,
      'if (!tfInstance || typeof tfInstance.layers === "undefined") {'
    );
  
  // Update the content
  const newContent = content.replace(functionRegex, newFunction);
  return writeFile(filePath, newContent);
}

// Run all fixes
function main() {
  console.log("Fixing TensorFlow.js layers detection...");
  
  const wrapperResult = fixTfLayersDetection();
  if (!wrapperResult) {
    console.error("Failed to add TensorFlow.js wrapper");
    return;
  }
  
  const initializeResult = fixInitializeFunction();
  if (!initializeResult) {
    console.error("Failed to update initialize function");
    return;
  }
  
  const agentResult = fixInitAgentFunction();
  if (!agentResult) {
    console.error("Failed to update initAgentAndEnvironment function");
    return;
  }
  
  console.log("Successfully fixed TensorFlow.js layers detection");
}

// Run the script
main();