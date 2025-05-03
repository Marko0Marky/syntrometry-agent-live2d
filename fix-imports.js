const fs = require('fs');
const path = require('path');

// Directory to process
const distDir = 'dist';

// Function to fix imports in a file
function fixImports(filePath) {
  if (!filePath.endsWith('.js')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix TensorFlow imports
  content = content.replace(/from\s+['"]@tensorflow\/tfjs['"]/g, 'from "@tensorflow/tfjs"');
  content = content.replace(/from\s+['"]@tensorflow\/tfjs-core['"]/g, 'from "@tensorflow/tfjs-core"');
  content = content.replace(/from\s+['"]@tensorflow\/tfjs-layers['"]/g, 'from "@tensorflow/tfjs-layers"');
  
  // Fix relative imports
  content = content.replace(/from\s+['"](\.\/[^'"]+)\.js['"]/g, 'from "$1.js"');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed imports in ${filePath}`);
}

// Process all JavaScript files in the directory
function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else {
      fixImports(filePath);
    }
  });
}

// Fix imports in all JavaScript files
processDirectory(distDir);
console.log('All imports fixed!');