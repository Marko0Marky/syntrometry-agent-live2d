// js/scripts/fix-imports.js
// Script to fix import issues

const fs = require('fs');
const path = require('path');

// Fix import issues in app.js
function fixImports() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'app.js');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if we're importing toLive2DFormat from tensorUtils.js
    const importRegex = /import\s*{\s*[^}]*toLive2DFormat[^}]*}\s*from\s*['"]\.\/tensorUtils\.js['"]/;
    if (importRegex.test(content)) {
      console.log('toLive2DFormat is already imported from tensorUtils.js');
      return true;
    }
    
    // Add the import if it's missing
    const importStatement = "import { tensorToArray, toNumberArray, toLive2DFormat } from './tensorUtils.js';";
    
    // Find the import section
    const importSection = content.match(/import\s*{[^}]*}\s*from\s*['"]\.\/tensorUtils\.js['"]/);
    if (importSection) {
      // Replace the existing import
      content = content.replace(
        importSection[0],
        importStatement
      );
    } else {
      // Add a new import after another import
      const lastImport = content.lastIndexOf("import");
      const lastImportEnd = content.indexOf(";", lastImport);
      if (lastImportEnd !== -1) {
        content = content.slice(0, lastImportEnd + 1) + "\n" + importStatement + content.slice(lastImportEnd + 1);
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed imports in app.js');
    return true;
  } catch (error) {
    console.error('Error fixing imports in app.js:', error);
    return false;
  }
}

// Run the fix
fixImports();

