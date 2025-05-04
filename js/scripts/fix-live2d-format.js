// js/scripts/fix-live2d-format.js
// Script to add the missing toLive2DFormat function

const fs = require('fs');
const path = require('path');

// Add the toLive2DFormat function to app.js
function addToLive2DFormat() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'app.js');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if the function already exists
    if (content.includes('function toLive2DFormat(')) {
      console.log('toLive2DFormat function already exists, skipping...');
      return true;
    }
    
    // Define the toLive2DFormat function
    const functionCode = `
// Convert tensor to Live2D format
function toLive2DFormat(tensor) {
  // If it's already an array, use it directly
  if (Array.isArray(tensor)) {
    return tensor;
  }
  
  // If it's a tensor, convert to array
  if (tensor && typeof tensor.dataSync === 'function') {
    try {
      return Array.from(tensor.dataSync());
    } catch (e) {
      console.error("Error converting tensor to Live2D format:", e);
      return new Array(8).fill(0); // Default to zeros
    }
  }
  
  // If it's null or undefined, return zeros
  return new Array(8).fill(0); // Assuming 8 emotion dimensions
}
`;
    
    // Add the function after the imports
    const importEndIndex = content.indexOf('// --- Global State ---');
    if (importEndIndex !== -1) {
      content = content.slice(0, importEndIndex) + functionCode + '\n' + content.slice(importEndIndex);
    } else {
      // If we can't find the marker, add it near the top
      const firstFunctionIndex = content.indexOf('function ');
      if (firstFunctionIndex !== -1) {
        content = content.slice(0, firstFunctionIndex) + functionCode + '\n' + content.slice(firstFunctionIndex);
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Added toLive2DFormat function');
    return true;
  } catch (error) {
    console.error('Error adding toLive2DFormat function:', error);
    return false;
  }
}

// Run the fix
addToLive2DFormat();

