// js/scripts/run-all-fixes.js
// Script to run all fixes

const { execSync } = require('child_process');
const path = require('path');

// Run a script and return success status
function runScript(scriptPath) {
  try {
    console.log(`Running ${path.basename(scriptPath)}...`);
    execSync(`node ${scriptPath}`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`Error running ${path.basename(scriptPath)}:`, error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('Starting to run all fixes...');
  
  // Run the TensorFlow.js layers detection fix
  const tfLayersResult = runScript(
    path.join(__dirname, 'fix-tf-layers.js')
  );
  
  if (!tfLayersResult) {
    console.error('Failed to fix TensorFlow.js layers detection');
    return;
  }
  
  // Run the Live2D format fix
  const live2dFormatResult = runScript(
    path.join(__dirname, 'fix-live2d-format.js')
  );
  
  if (!live2dFormatResult) {
    console.error('Failed to fix Live2D format');
    return;
  }
  
  // Run the Three.js deprecated methods fix
  const threeJsResult = runScript(
    path.join(__dirname, 'fix-threejs-deprecated.js')
  );
  
  if (!threeJsResult) {
    console.error('Failed to fix Three.js deprecated methods');
    return;
  }
  
  console.log('All fixes completed successfully!');
}

// Run the script
main().catch(error => {
  console.error('Error:', error);
});