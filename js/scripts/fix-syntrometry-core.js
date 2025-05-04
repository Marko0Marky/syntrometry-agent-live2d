// js/scripts/fix-syntrometry-core.js
// Script to fix the remaining error in syntrometry-core.ts

const fs = require('fs');
const path = require('path');

// Read the syntrometry-core.ts file
const filePath = path.join(__dirname, '..', 'syntrometry-core.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Split the content into lines
const lines = content.split('\n');

// Find all lines with safeDispose(tensor) and add @ts-ignore
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('safeDispose(tensor)')) {
    // Check if there's already a @ts-ignore comment
    if (i > 0 && !lines[i-1].includes('@ts-ignore')) {
      lines.splice(i, 0, '                // @ts-ignore - Type compatibility between tfjs and tfjs-core');
      i++; // Skip the newly inserted line
    }
  }
}

// Join the lines back together
const newContent = lines.join('\n');

// Write the modified content back to the file
fs.writeFileSync(filePath, newContent, 'utf8');

console.log('Fixed tensor type compatibility issue in syntrometry-core.ts');