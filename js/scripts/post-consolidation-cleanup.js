// js/scripts/post-consolidation-cleanup.js
// Script to clean up after consolidating utility files

const fs = require('fs');
const path = require('path');

// Files that were consolidated and should be removed
const FILES_TO_REMOVE = [
  'js/typeUtils.ts',
  'js/tensorTypeUtils.ts',
  'js/tensorArrayUtils.ts',
  'js/tensorTypeAdapter.ts',
  'js/tensorTypes.ts',
  'js/tfTypesFix.ts'
];

// The consolidated file
const CONSOLIDATED_FILE = 'js/tensorUtils.ts';

// Files that might need import updates (expand this list as needed)
const FILES_TO_CHECK = [
  'js/agent.js',
  'js/agent.ts',
  'js/app.js',
  'js/app.ts',
  'js/environment.js',
  'js/environment.ts',
  'js/viz-syntrometry.js',
  'js/viz-concepts.js',
  'js/viz-live2d.js',
  'js/viz-live2d.ts',
  // Add more files that might import from the consolidated files
];

// Helper function to resolve file paths
function resolvePath(filePath) {
  return path.resolve(process.cwd(), filePath);
}

// Helper function to check if a file exists
function fileExists(filePath) {
  const resolvedPath = resolvePath(filePath);
  return fs.existsSync(resolvedPath);
}

// Helper function to read a file
function readFile(filePath) {
  const resolvedPath = resolvePath(filePath);
  try {
    return fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    console.error(`Error reading file ${resolvedPath}:`, error);
    return null;
  }
}

// Helper function to write a file
function writeFile(filePath, content) {
  const resolvedPath = resolvePath(filePath);
  try {
    fs.writeFileSync(resolvedPath, content, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing file ${resolvedPath}:`, error);
    return false;
  }
}

// Function to remove consolidated files
function removeConsolidatedFiles() {
  console.log('Removing consolidated files...');
  
  let removedCount = 0;
  
  for (const file of FILES_TO_REMOVE) {
    if (fileExists(file)) {
      try {
        fs.unlinkSync(resolvePath(file));
        console.log(`Removed ${file}`);
        removedCount++;
      } catch (error) {
        console.error(`Error removing ${file}:`, error);
      }
    } else {
      console.log(`File ${file} does not exist, skipping.`);
    }
  }
  
  console.log(`Removed ${removedCount} of ${FILES_TO_REMOVE.length} files.`);
  return removedCount;
}

// Function to update imports in a file
function updateImportsInFile(filePath) {
  if (!fileExists(filePath)) {
    console.log(`File ${filePath} does not exist, skipping.`);
    return false;
  }
  
  console.log(`Updating imports in ${filePath}...`);
  let content = readFile(filePath);
  if (!content) return false;
  
  let hasChanges = false;
  const newImportPath = CONSOLIDATED_FILE.replace(/\.ts$/, '');
  
  // Create a map of old import paths to check
  const oldImportPaths = FILES_TO_REMOVE.map(file => file.replace(/\.ts$/, ''));
  
  // Check for each old import path
  for (const oldImportPath of oldImportPaths) {
    // Match import statements for the old path
    const importRegex = new RegExp(`import\\s+\\{([^}]*)\\}\\s+from\\s+['"]${oldImportPath.replace(/\//g, '\\/')}(\\.js)?['"]`, 'g');
    const matches = [...content.matchAll(importRegex)];
    
    if (matches.length > 0) {
      for (const match of matches) {
        const importedItems = match[1].split(',').map(item => item.trim());
        const newImportStatement = `import { ${importedItems.join(', ')} } from '${newImportPath}.js'`;
        
        content = content.replace(match[0], newImportStatement);
        hasChanges = true;
        console.log(`  Updated import: ${match[0]} -> ${newImportStatement}`);
      }
    }
  }
  
  // Check for direct requires
  for (const oldImportPath of oldImportPaths) {
    const requireRegex = new RegExp(`require\\(['"]${oldImportPath.replace(/\//g, '\\/')}(\\.js)?['"]\\)`, 'g');
    const newRequireStatement = `require('${newImportPath}.js')`;
    
    if (requireRegex.test(content)) {
      content = content.replace(requireRegex, newRequireStatement);
      hasChanges = true;
      console.log(`  Updated require statement to ${newRequireStatement}`);
    }
  }
  
  if (hasChanges) {
    return writeFile(filePath, content);
  } else {
    console.log(`  No import changes needed in ${filePath}`);
    return true;
  }
}

// Function to update imports in all files
function updateAllImports() {
  console.log('Updating imports in all files...');
  
  let successCount = 0;
  
  for (const file of FILES_TO_CHECK) {
    if (updateImportsInFile(file)) {
      successCount++;
    }
  }
  
  console.log(`Updated imports in ${successCount} of ${FILES_TO_CHECK.length} files.`);
  return successCount;
}

// Function to check for any remaining references to old files
function checkForRemainingReferences() {
  console.log('Checking for remaining references to old files...');
  
  const oldFileBasenames = FILES_TO_REMOVE.map(file => path.basename(file, '.ts'));
  let referencesFound = false;
  
  for (const file of FILES_TO_CHECK) {
    if (!fileExists(file)) continue;
    
    const content = readFile(file);
    if (!content) continue;
    
    for (const oldFile of oldFileBasenames) {
      if (content.includes(oldFile)) {
        console.log(`Found reference to ${oldFile} in ${file}`);
        referencesFound = true;
      }
    }
  }
  
  if (!referencesFound) {
    console.log('No remaining references found.');
  }
  
  return !referencesFound;
}

// Main function
function main() {
  console.log('Starting post-consolidation cleanup...');
  
  // Check if consolidated file exists
  if (!fileExists(CONSOLIDATED_FILE)) {
    console.error(`Consolidated file ${CONSOLIDATED_FILE} does not exist. Aborting.`);
    return;
  }
  
  // Update imports first (before removing files)
  updateAllImports();
  
  // Remove consolidated files
  removeConsolidatedFiles();
  
  // Check for any remaining references
  checkForRemainingReferences();
  
  console.log('Post-consolidation cleanup complete!');
}

// Run the main function
main();