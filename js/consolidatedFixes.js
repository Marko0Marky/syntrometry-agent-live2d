// Consolidated fix script for tensor type issues
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  files: {
    app: path.join(__dirname, 'app.ts'),
    live2d: path.join(__dirname, 'viz-live2d.ts'),
    environment: path.join(__dirname, 'environment.ts'),
    typeUtils: path.join(__dirname, 'tensorTypeUtils.ts')
  },
  imports: {
    tensorTypeUtils: 'import { asTensor, asNullableTensor, asNonNullTensor, asNumberTensor, asNullableNumberTensor, asRankTensor, asNullableRankTensor, asEnvStepResult, asVariable, TensorCompatible, NullableTensorCompatible } from \'./tensorTypeUtils.js\';'
  }
};

// Create tensorTypeUtils.ts if it doesn't exist
function ensureTypeUtilsExists() {
  if (!fs.existsSync(CONFIG.files.typeUtils)) {
    console.log('Creating tensorTypeUtils.ts...');
    // Rename typeUtils.ts to tensorTypeUtils.ts if it exists
    if (fs.existsSync(path.join(__dirname, 'typeUtils.ts'))) {
      fs.renameSync(
        path.join(__dirname, 'typeUtils.ts'),
        CONFIG.files.typeUtils
      );
      console.log('Renamed typeUtils.ts to tensorTypeUtils.ts');
    } else {
      // Copy content from your current typeUtils.ts
      const content = fs.readFileSync(path.join(__dirname, 'typeUtils.ts'), 'utf8');
      fs.writeFileSync(CONFIG.files.typeUtils, content, 'utf8');
      console.log('Created tensorTypeUtils.ts from typeUtils.ts');
    }
  }
}

// Fix app.ts tensor type issues
function fixAppTensorTypes() {
  console.log('Fixing app.ts tensor type issues...');
  let content = fs.readFileSync(CONFIG.files.app, 'utf8');
  
  // Fix imports
  if (!content.includes('import { asTensor')) {
    content = content.replace(
      'import * as tf from \'@tensorflow/tfjs\';',
      'import * as tf from \'@tensorflow/tfjs\';\n' + CONFIG.imports.tensorTypeUtils
    );
  }
  
  // Apply all tensor type fixes from fixTensorTypes.js and fixAppTensorTypes.js
  const replacements = [
    // Common tensor fixes
    { search: /tf\.zeros\(([^)]+)\)/g, replace: 'createZeros($1)' },
    { search: /tf\.tensor\(([^)]+)\)/g, replace: 'createTensor($1)' },
    
    // App-specific fixes
    { search: /updateLive2DEmotions\(([^)]+)\)/g, replace: 'updateLive2DEmotions(asTensor($1))' },
    { search: /updateLive2D\(([^)]+)\)/g, replace: 'updateLive2D(asTensor($1))' },
    { search: /environment\.step\(([^)]+)\)/g, replace: 'environment.step(asTensor($1))' },
    { search: /result\.emotions(?!\s*=)/g, replace: 'asTensor(result.emotions)' },
    { search: /result\.state(?!\s*=)/g, replace: 'asTensor(result.state)' },
    { search: /agent\.reflexiveIntegration\.variable/g, replace: 'asVariable(agent.reflexiveIntegration.variable)' },
    { search: /agentResponse\.emotions/g, replace: 'asTensor(agentResponse.emotions)' },
    { search: /agentResponse\.beliefEmbedding/g, replace: 'asTensor(agentResponse.beliefEmbedding)' },
    { search: /currentState(?!\s*=)/g, replace: 'asTensor(currentState)' },
    { search: /emotionTensor(?!\s*=)/g, replace: 'asTensor(emotionTensor)' },
    { search: /\.dispose\(null\)/g, replace: '.dispose()' },
  ];
  
  // Apply all replacements
  replacements.forEach(({ search, replace }) => {
    content = content.replace(search, replace);
  });
  
  fs.writeFileSync(CONFIG.files.app, content, 'utf8');
  console.log('Fixed app.ts tensor type issues');
}

// Fix Live2D tensor type issues
function fixLive2DTensorTypes() {
  console.log('Fixing viz-live2d.ts tensor type issues...');
  let content = fs.readFileSync(CONFIG.files.live2d, 'utf8');
  
  // Update function signatures
  const replacements = [
    { 
      search: /export function updateLive2DEmotions\(emotionTensor: Tensor(?:<Rank>)?\)/g, 
      replace: 'export function updateLive2DEmotions(emotionTensor: Tensor<number>)' 
    },
    { 
      search: /export function updateLive2D\(stateTensor: Tensor(?:<Rank>)?\)/g, 
      replace: 'export function updateLive2D(stateTensor: Tensor<number>)' 
    }
  ];
  
  // Apply the replacements
  replacements.forEach(({ search, replace }) => {
    content = content.replace(search, replace);
  });
  
  fs.writeFileSync(CONFIG.files.live2d, content, 'utf8');
  console.log('Fixed viz-live2d.ts tensor type issues');
}

// Fix environment.ts tensor type issues
function fixEnvironmentTensorTypes() {
  console.log('Fixing environment.ts tensor type issues...');
  let content = fs.readFileSync(CONFIG.files.environment, 'utf8');
  
  // Ensure imports
  if (!content.includes('import { tensorDataToArray }')) {
    content = content.replace(
      'import * as tf from \'@tensorflow/tfjs\';',
      'import * as tf from \'@tensorflow/tfjs\';\nimport { tensorDataToArray } from \'./tensorArrayUtils.js\';'
    );
  }
  
  // Add environmentFixes import if not present
  if (!content.includes('import { fixLine')) {
    content = content.replace(
      'import { tensorDataToArray } from \'./tensorArrayUtils.js\';',
      'import { tensorDataToArray } from \'./tensorArrayUtils.js\';\nimport { fixLine170, fixLine191, fixLine192, fixLine305, fixLine316, fixLine446, fixLine459, fixLine545 } from \'./environmentFixes.js\';'
    );
  }
  
  fs.writeFileSync(CONFIG.files.environment, content, 'utf8');
  console.log('Fixed environment.ts tensor type issues');
}

// Fix tf.dispose calls
function fixTfDispose() {
  console.log('Fixing tf.dispose calls...');
  
  // Process all TypeScript and JavaScript files
  function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        processDirectory(filePath);
      } else if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Replace tf.dispose(tensor) with tensor.dispose()
        content = content.replace(/tf\.dispose\(([^)]+)\)/g, '$1.dispose()');
        
        fs.writeFileSync(filePath, content, 'utf8');
      }
    });
  }
  
  processDirectory(__dirname);
  console.log('Fixed tf.dispose calls');
}

// Main function to run all fixes
function runAllFixes() {
  try {
    // Ensure tensorTypeUtils.ts exists
    ensureTypeUtilsExists();
    
    // Run all fixes
    fixAppTensorTypes();
    fixLive2DTensorTypes();
    fixEnvironmentTensorTypes();
    fixTfDispose();
    
    // Compile TypeScript
    console.log('Compiling TypeScript...');
    execSync('npx tsc --skipLibCheck --noEmitOnError', { stdio: 'inherit' });
    
    console.log('All fixes completed successfully!');
  } catch (error) {
    console.error('Error running fixes:', error.message);
    process.exit(1);
  }
}

// Run all fixes
runAllFixes();