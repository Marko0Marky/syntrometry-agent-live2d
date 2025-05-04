// js/scripts/fix-threejs-issues.js
// Script to fix THREE.js issues in viz-syntrometry.ts

const fs = require('fs');
const path = require('path');

// Fix THREE.js issues in viz-syntrometry.ts
function fixThreeJsIssues() {
  const filePath = path.join(__dirname, '..', 'viz-syntrometry.ts');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove duplicate @ts-ignore comments
    const lines = content.split('\n');
    const cleanedLines = [];
    
    let skipCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip consecutive @ts-ignore comments
      if (line.trim().startsWith('// @ts-ignore')) {
        if (skipCount > 0) {
          continue;
        }
        skipCount++;
      } else {
        skipCount = 0;
      }
      
      cleanedLines.push(line);
    }
    
    // Join the lines back together
    const newContent = cleanedLines.join('\n');
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log('Fixed THREE.js issues in viz-syntrometry.ts');
    return true;
  } catch (error) {
    console.error('Error fixing viz-syntrometry.ts:', error);
    return false;
  }
}

// Run the fix
fixThreeJsIssues();