// js/scripts/fix-remaining-references.js
// Script to fix remaining references to old utility files

const fs = require('fs');
const path = require('path');

// Files that were consolidated
const OLD_FILES = [
  'typeUtils',
  'tensorTypeUtils',
  'tensorArrayUtils',
  'tensorTypeAdapter',
  'tensorTypes',
  'tfTypesFix'
];

// The new consolidated file (without extension)
const NEW_FILE = 'tensorUtils';

// Files that need to be checked
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
  // Add more files as needed
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

// Function to fix remaining references in a file
function fixReferencesInFile(filePath) {
  if (!fileExists(filePath)) {
    console.log(`File ${filePath} does not exist, skipping.`);
    return false;
  }
  
  console.log(`Fixing references in ${filePath}...`);
  let content = readFile(filePath);
  if (!content) return false;
  
  let hasChanges = false;
  
  // Replace references in the entire file content (including comments and strings)
  for (const oldFile of OLD_FILES) {
    const oldFileRegex = new RegExp(oldFile, 'g');
    if (content.match(oldFileRegex)) {
      content = content.replace(oldFileRegex, NEW_FILE);
      hasChanges = true;
      console.log(`  Replaced references to ${oldFile} with ${NEW_FILE}`);
    }
  }
  
  if (hasChanges) {
    return writeFile(filePath, content);
  } else {
    console.log(`  No references to fix in ${filePath}`);
    return true;
  }
}

// Function to fix references in all files
function fixAllReferences() {
  console.log('Fixing remaining references in all files...');
  
  let successCount = 0;
  
  for (const file of FILES_TO_CHECK) {
    if (fixReferencesInFile(file)) {
      successCount++;
    }
  }
  
  console.log(`Fixed references in ${successCount} of ${FILES_TO_CHECK.length} files.`);
  return successCount;
}

// Main function
function main() {
  console.log('Starting reference fix...');
  fixAllReferences();
  console.log('Reference fix complete!');
}

// Run the main function
main();