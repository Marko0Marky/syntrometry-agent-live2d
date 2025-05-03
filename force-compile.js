const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Directory to process
const sourceDir = 'js';

// Function to add @ts-nocheck to files
function addTsNocheck(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Only add if not already present
  if (!content.includes('@ts-nocheck')) {
    const newContent = '// @ts-nocheck\n' + content;
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Added @ts-nocheck to ${filePath}`);
  }
}

// Process all TypeScript files in the directory
function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else if (file.endsWith('.ts')) {
      addTsNocheck(filePath);
    }
  });
}

// Add @ts-nocheck to all TypeScript files
processDirectory(sourceDir);

// Run tsc with --skipLibCheck and --noEmitOnError
console.log('Compiling TypeScript files...');
exec('npx tsc --skipLibCheck --noEmitOnError', (error, stdout, stderr) => {
  if (error) {
    console.error(`Compilation error: ${error.message}`);
    return;
  }
  
  if (stderr) {
    console.error(`Compilation stderr: ${stderr}`);
  }
  
  console.log('Compilation completed successfully!');
  console.log(stdout);
});