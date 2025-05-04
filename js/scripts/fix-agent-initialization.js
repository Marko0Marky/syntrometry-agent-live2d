// js/scripts/fix-agent-initialization.js
// Script to fix agent initialization

const fs = require('fs');
const path = require('path');

// Fix agent initialization in agent.ts
function fixAgentInitialization() {
  const filePath = path.join(__dirname, '..', 'agent.ts');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Find the constructor
    const constructorRegex = /constructor\([^)]*\)\s*{[^]*?this\.isTfReady = true;/s;
    const match = content.match(constructorRegex);
    
    if (!match) {
      console.error('Could not find constructor in agent.ts');
      return false;
    }
    
    // Replace the TensorFlow.js check with a more robust version
    const improvedConstructor = match[0].replace(
      /\/\/ Check for TensorFlow\.js[^]*?this\.isTfReady = true;/s,
      `// Check for TensorFlow.js
        if (typeof tf === 'undefined') {
            console.error("CRITICAL: TensorFlow.js not loaded.");
            displayError("TensorFlow.js not loaded. Agent initialization failed.", true, 'error-message');
            return; // Stop initialization
        }
        
        // Check for essential TensorFlow.js modules
        let missingModules = [];
        if (typeof tf.layers === 'undefined') {
            // Try to get layers from window.tf if available
            if (typeof window !== 'undefined' && window.tf && window.tf.layers) {
                console.log("Using tf.layers from window.tf");
                tf.layers = window.tf.layers;
            } else {
                missingModules.push('layers');
            }
        }
        
        if (typeof tf.train === 'undefined') {
            missingModules.push('train');
        }
        
        if (missingModules.length > 0) {
            console.error("CRITICAL: TensorFlow.js modules missing:", missingModules.join(', '));
            displayError("TensorFlow.js modules incomplete. Agent initialization failed.", true, 'error-message');
            this.cleanup(); // Attempt cleanup
            return; // Stop initialization
        }
        
        this.isTfReady = true;`
    );
    
    // Replace the constructor
    content = content.replace(constructorRegex, improvedConstructor);
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed agent initialization in agent.ts');
    
    // Now fix the dist/agent.js file if it exists
    const distFilePath = path.join(__dirname, '..', '..', 'dist', 'agent.js');
    if (fs.existsSync(distFilePath)) {
      let distContent = fs.readFileSync(distFilePath, 'utf8');
      
      // Find the constructor check in the compiled JS
      const distCheckRegex = /\/\/ Check for TensorFlow\.js[^]*?this\.isTfReady = true;/s;
      const distMatch = distContent.match(distCheckRegex);
      
      if (distMatch) {
        // Replace with compiled version of our improved check
        const compiledCheck = `// Check for TensorFlow.js
        if (typeof tf === 'undefined') {
            console.error("CRITICAL: TensorFlow.js not loaded.");
            displayError("TensorFlow.js not loaded. Agent initialization failed.", true, 'error-message');
            return; // Stop initialization
        }
        
        // Check for essential TensorFlow.js modules
        let missingModules = [];
        if (typeof tf.layers === 'undefined') {
            // Try to get layers from window.tf if available
            if (typeof window !== 'undefined' && window.tf && window.tf.layers) {
                console.log("Using tf.layers from window.tf");
                tf.layers = window.tf.layers;
            } else {
                missingModules.push('layers');
            }
        }
        
        if (typeof tf.train === 'undefined') {
            missingModules.push('train');
        }
        
        if (missingModules.length > 0) {
            console.error("CRITICAL: TensorFlow.js modules missing:", missingModules.join(', '));
            displayError("TensorFlow.js modules incomplete. Agent initialization failed.", true, 'error-message');
            this.cleanup(); // Attempt cleanup
            return; // Stop initialization
        }
        
        this.isTfReady = true;`;
        
        // Replace the check
        distContent = distContent.replace(distCheckRegex, compiledCheck);
        
        fs.writeFileSync(distFilePath, distContent, 'utf8');
        console.log('Fixed agent initialization in dist/agent.js');
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error fixing agent initialization:', error);
    return false;
  }
}

// Run the fix
fixAgentInitialization();