// js/scripts/fix-app-imports.js
// Script to fix app.js imports

const fs = require('fs');
const path = require('path');

// Fix app.js imports
function fixAppImports() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'app.js');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add safeDispose function directly to the file
    const safeDisposeFunction = `
// Safely disposes a tensor or array of tensors
function safeDispose(tensors) {
    if (!tensors) return;
    
    if (Array.isArray(tensors)) {
        tensors.forEach(t => {
            if (t && !t.isDisposed && typeof t.dispose === 'function') {
                try {
                    t.dispose();
                } catch (e) {
                    console.error("Error disposing tensor:", e);
                }
            }
        });
    } else if (tensors && !tensors.isDisposed && typeof tensors.dispose === 'function') {
        try {
            tensors.dispose();
        } catch (e) {
            console.error("Error disposing tensor:", e);
        }
    }
}
`;
    
    // Add the function after the imports
    const importEndIndex = content.indexOf('// --- Global State ---');
    if (importEndIndex !== -1) {
      content = content.slice(0, importEndIndex) + safeDisposeFunction + '\n' + content.slice(importEndIndex);
    } else {
      // If we can't find the marker, add it near the top
      const firstFunctionIndex = content.indexOf('function ');
      if (firstFunctionIndex !== -1) {
        content = content.slice(0, firstFunctionIndex) + safeDisposeFunction + '\n' + content.slice(firstFunctionIndex);
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed safeDispose in app.js');
    return true;
  } catch (error) {
    console.error('Error fixing app.js imports:', error);
    return false;
  }
}

// Run the fix
fixAppImports();


