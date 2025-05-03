const fs = require('fs');
const path = require('path');

// Directory to process
const jsDir = 'js';

// Function to fix tf.dispose calls in a file
function fixTfDispose(filePath) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace tf.dispose(tensor) with tensor.dispose()
  content = content.replace(/tf\.dispose\(([^)]+)\)/g, '$1.dispose()');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed tf.dispose calls in ${filePath}`);
}

// Process all TypeScript and JavaScript files in the directory
function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else {
      fixTfDispose(filePath);
    }
  });
}

// Fix tf.dispose calls in all TypeScript and JavaScript files
processDirectory(jsDir);
console.log('All tf.dispose calls fixed!');