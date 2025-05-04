// js/scripts/fix-tensor-types.js
// Script to fix tensor type issues in the codebase

const fs = require('fs');
const path = require('path');

// Files to process
const FILES_TO_PROCESS = [
  'js/app.ts',
  'js/agent.ts',
  'js/environment.ts',
  'js/viz-live2d.ts'
];

// Helper function to read a file
function readFile(filePath) {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

// Helper function to write a file
function writeFile(filePath, content) {
  try {
    fs.writeFileSync(path.resolve(process.cwd(), filePath), content, 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    return false;
  }
}

// Function to add the UnifiedTensor type to a file
function addUnifiedTensorType(content) {
  // Check if the file already has the UnifiedTensor type
  if (content.includes('type Tensor = UnifiedTensor')) {
    return content;
  }
  
  // Add the type after the imports
  const importRegex = /import.*?from.*?;/gs;
  const lastImportMatch = [...content.matchAll(importRegex)].pop();
  
  if (lastImportMatch) {
    const insertPosition = lastImportMatch.index + lastImportMatch[0].length;
    return content.slice(0, insertPosition) + 
           '\n\n// Use the UnifiedTensor type for all tensor declarations\ntype Tensor = UnifiedTensor;\n' + 
           content.slice(insertPosition);
  }
  
  return content;
}

// Function to fix missing function references
function fixMissingFunctions(content) {
  // Replace toNumberArray with tensorToArray if needed
  content = content.replace(/toNumberArray\(/g, 'tensorToArray(');
  
  // Add missing imports
  if (content.includes('toNumberArray(') && !content.includes('import { toNumberArray')) {
    content = content.replace(/import {/, 'import { toNumberArray, ');
  }
  
  if (content.includes('toLive2DFormat(') && !content.includes('import { toLive2DFormat')) {
    content = content.replace(/import {/, 'import { toLive2DFormat, ');
  }
  
  return content;
}

// Function to wrap tensor parameters with adaptTensor
function wrapTensorParameters(content) {
  // This is a complex task that would require parsing the TypeScript AST
  // For now, we'll add a comment suggesting manual fixes
  
  if (!content.includes('// TENSOR TYPE FIX: Wrap tensor parameters with adaptTensor() where needed')) {
    content = '// TENSOR TYPE FIX: Wrap tensor parameters with adaptTensor() where needed\n' + content;
  }
  
  return content;
}

// Main function
function main() {
  console.log('Starting tensor type fix...');
  
  for (const filePath of FILES_TO_PROCESS) {
    console.log(`Processing ${filePath}...`);
    
    const content = readFile(filePath);
    if (!content) {
      console.error(`Could not read ${filePath}`);
      continue;
    }
    
    let newContent = content;
    
    // Add the UnifiedTensor type
    newContent = addUnifiedTensorType(newContent);
    
    // Fix missing function references
    newContent = fixMissingFunctions(newContent);
    
    // Wrap tensor parameters with adaptTensor
    newContent = wrapTensorParameters(newContent);
    
    if (newContent !== content) {
      if (writeFile(filePath, newContent)) {
        console.log(`Successfully updated ${filePath}`);
      } else {
        console.error(`Failed to write updated content to ${filePath}`);
      }
    } else {
      console.log(`No changes needed for ${filePath}`);
    }
  }
  
  console.log('Tensor type fix complete!');
}

// Run the main function
main();