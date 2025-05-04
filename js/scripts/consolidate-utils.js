// js/scripts/consolidate-utils.js
// Script to help consolidate utility files

const fs = require('fs');
const path = require('path');

// Files to be consolidated
const FILES_TO_CONSOLIDATE = [
  'js/typeUtils.ts',
  'js/tensorTypeUtils.ts',
  'js/tensorArrayUtils.ts',
  'js/tensorTypeAdapter.ts',
  'js/tensorTypes.ts',
  'js/tfTypesFix.ts'
];

// Target consolidated file
const TARGET_FILE = 'js/tensorUtils.ts';

// Files that need import updates
const FILES_TO_UPDATE = [
  'js/agent.js',
  'js/agent.ts',
  'js/app.js',
  'js/app.ts',
  'js/environment.js',
  'js/environment.ts',
  'js/viz-syntrometry.js',
  'js/viz-concepts.js',
  'js/viz-live2d.js'
];

// Function to resolve file paths relative to the project root
function resolvePath(filePath) {
  // Assuming the script is in js/scripts/ directory
  return path.resolve(__dirname, '..', '..', filePath);
}

// Function to read a file
function readFile(filePath) {
  const resolvedPath = resolvePath(filePath);
  try {
    console.log(`Reading file: ${resolvedPath}`);
    return fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    console.error(`Error reading file ${resolvedPath}:`, error.message);
    return null;
  }
}

// Function to write to a file
function writeFile(filePath, content) {
  const resolvedPath = resolvePath(filePath);
  try {
    console.log(`Writing to file: ${resolvedPath}`);
    fs.writeFileSync(resolvedPath, content, 'utf8');
    // Verify the file was written correctly
    const writtenContent = fs.readFileSync(resolvedPath, 'utf8');
    if (writtenContent === content) {
      console.log(`Successfully wrote ${content.length} characters to ${resolvedPath}`);
      return true;
    } else {
      console.error(`File content verification failed for ${resolvedPath}`);
      return false;
    }
  } catch (error) {
    console.error(`Error writing to file ${resolvedPath}:`, error.message);
    return false;
  }
}

// Function to check if a file exists
function fileExists(filePath) {
  const resolvedPath = resolvePath(filePath);
  const exists = fs.existsSync(resolvedPath);
  console.log(`Checking if file exists: ${resolvedPath} - ${exists ? 'Yes' : 'No'}`);
  return exists;
}

// Function to extract exports from a file
function extractExports(filePath) {
  const content = readFile(filePath);
  if (!content) return [];
  
  // Match export declarations for functions, constants, classes, types, and interfaces
  const exportRegex = /export\s+(const|function|class|type|interface)\s+(\w+)/g;
  const matches = [...content.matchAll(exportRegex)];
  
  return matches.map(match => match[2]);
}

// Function to extract export definition from a file
function extractExportDefinition(content, exportName) {
  // Match the entire export declaration including the body
  const functionRegex = new RegExp(`export\\s+function\\s+${exportName}[\\s\\S]*?(?=\\nexport\\s|$)`, 'g');
  const constRegex = new RegExp(`export\\s+const\\s+${exportName}[\\s\\S]*?(?=\\nexport\\s|$)`, 'g');
  const classRegex = new RegExp(`export\\s+class\\s+${exportName}[\\s\\S]*?(?=\\nexport\\s|$)`, 'g');
  const typeRegex = new RegExp(`export\\s+type\\s+${exportName}[\\s\\S]*?(?=\\nexport\\s|$)`, 'g');
  const interfaceRegex = new RegExp(`export\\s+interface\\s+${exportName}[\\s\\S]*?(?=\\nexport\\s|$)`, 'g');
  
  // Try each regex pattern
  const functionMatch = functionRegex.exec(content);
  if (functionMatch) return functionMatch[0];
  
  const constMatch = constRegex.exec(content);
  if (constMatch) return constMatch[0];
  
  const classMatch = classRegex.exec(content);
  if (classMatch) return classMatch[0];
  
  const typeMatch = typeRegex.exec(content);
  if (typeMatch) return typeMatch[0];
  
  const interfaceMatch = interfaceRegex.exec(content);
  if (interfaceMatch) return interfaceMatch[0];
  
  return null;
}

// Function to check if an export already exists in the target file
function exportExists(targetContent, exportName) {
  const patterns = [
    `export function ${exportName}`,
    `export const ${exportName}`,
    `export class ${exportName}`,
    `export type ${exportName}`,
    `export interface ${exportName}`
  ];
  
  return patterns.some(pattern => targetContent.includes(pattern));
}

// Function to consolidate files
function consolidateFiles(sourceFiles, targetFile) {
  // Check if target file already exists
  if (fileExists(targetFile)) {
    console.log(`Target file ${targetFile} already exists. Using it as a base.`);
    let targetContent = readFile(targetFile);
    
    if (!targetContent) {
      console.error(`Failed to read target file ${targetFile}`);
      return false;
    }
    
    let hasChanges = false;
    
    // Process each source file
    for (const sourceFile of sourceFiles) {
      if (fileExists(sourceFile)) {
        console.log(`Processing ${sourceFile}...`);
        const sourceContent = readFile(sourceFile);
        
        if (sourceContent) {
          // Extract exports from source file
          const exports = extractExports(sourceFile);
          console.log(`Found exports in ${sourceFile}:`, exports);
          
          // Check if exports already exist in target file
          for (const exportName of exports) {
            if (!exportExists(targetContent, exportName)) {
              // Extract the export definition from source file
              const exportDefinition = extractExportDefinition(sourceContent, exportName);
              
              if (exportDefinition) {
                // Add the export to the target file
                targetContent += '\n\n' + exportDefinition;
                console.log(`Added export ${exportName} to ${targetFile}`);
                hasChanges = true;
              } else {
                console.warn(`Could not extract definition for export ${exportName} from ${sourceFile}`);
              }
            } else {
              console.log(`Export ${exportName} already exists in ${targetFile}, skipping`);
            }
          }
        }
      } else {
        console.warn(`Source file ${sourceFile} does not exist, skipping.`);
      }
    }
    
    // Write the updated content to the target file if there were changes
    if (hasChanges) {
      console.log(`Writing updated content to ${targetFile}...`);
      return writeFile(targetFile, targetContent);
    } else {
      console.log(`No changes needed for ${targetFile}`);
      return true;
    }
  } else {
    console.log(`Creating new target file ${targetFile}...`);
    
    // Create header for the new file
    let targetContent = `// ${targetFile}\n// Consolidated utility functions for tensor operations and type handling\n\n`;
    targetContent += `import * as tf from '@tensorflow/tfjs';\n`;
    targetContent += `import { Tensor, TypedArray, TensorLike } from '@tensorflow/tfjs';\n\n`;
    targetContent += `// Type definitions\n`;
    targetContent += `export type TensorCompatible = number | number[] | number[][] | number[][][] | Tensor;\n`;
    targetContent += `export type NullableTensorCompatible = TensorCompatible | null | undefined;\n\n`;
    
    // Process each source file
    for (const sourceFile of sourceFiles) {
      if (fileExists(sourceFile)) {
        console.log(`Processing ${sourceFile}...`);
        const sourceContent = readFile(sourceFile);
        
        if (sourceContent) {
          // Extract content without imports
          let processedContent = sourceContent
            .replace(/import\s+.*?from\s+['"].*?['"]/g, ''); // Remove imports
          
          // Add section header for the file
          targetContent += `\n// ===== Functions from ${sourceFile} =====\n\n`;
          targetContent += processedContent;
        }
      } else {
        console.warn(`Source file ${sourceFile} does not exist, skipping.`);
      }
    }
    
    // Write the consolidated content to the target file
    console.log(`Writing new content to ${targetFile}...`);
    return writeFile(targetFile, targetContent);
  }
}

// Function to update imports in a file
function updateImports(filePath, oldImports, newImport) {
  const content = readFile(filePath);
  if (!content) return false;
  
  let updatedContent = content;
  let hasChanges = false;
  
  // Replace old imports with new import
  for (const oldImport of oldImports) {
    const importRegex = new RegExp(`import\\s+\\{([^}]*)\\}\\s+from\\s+['"]${oldImport}['"]`, 'g');
    const matches = [...updatedContent.matchAll(importRegex)];
    
    if (matches.length > 0) {
      for (const match of matches) {
        const importedItems = match[1].split(',').map(item => item.trim());
        const newImportStatement = `import { ${importedItems.join(', ')} } from '${newImport}'`;
        
        if (match[0] !== newImportStatement) {
          updatedContent = updatedContent.replace(match[0], newImportStatement);
          hasChanges = true;
        }
      }
    }
  }
  
  // Only write to the file if there were changes
  if (hasChanges) {
    return writeFile(filePath, updatedContent);
  } else {
    console.log(`No import changes needed for ${filePath}`);
    return true;
  }
}

// Function to check for duplicate functions in the target file
function checkForDuplicates(targetFile) {
  const content = readFile(targetFile);
  if (!content) return;
  
  // Find all function declarations
  const functionRegex = /function\s+(\w+)/g;
  const matches = [...content.matchAll(functionRegex)];
  
  // Count occurrences of each function name
  const functionCounts = {};
  for (const match of matches) {
    const functionName = match[1];
    functionCounts[functionName] = (functionCounts[functionName] || 0) + 1;
  }
  
  // Report duplicates
  let hasDuplicates = false;
  for (const [functionName, count] of Object.entries(functionCounts)) {
    if (count > 1) {
      console.warn(`Warning: Function ${functionName} appears ${count} times in ${targetFile}`);
      hasDuplicates = true;
    }
  }
  
  if (!hasDuplicates) {
    console.log(`No duplicate functions found in ${targetFile}`);
  }
}

// Main function
function main() {
  console.log('Starting utility consolidation...');
  
  // Create the consolidated file
  if (consolidateFiles(FILES_TO_CONSOLIDATE, TARGET_FILE)) {
    console.log(`Created consolidated file: ${TARGET_FILE}`);
    
    // Check for duplicates
    checkForDuplicates(TARGET_FILE);
  } else {
    console.error(`Failed to create consolidated file: ${TARGET_FILE}`);
    return;
  }
  
  // Update imports in files
  for (const file of FILES_TO_UPDATE) {
    if (fileExists(file)) {
      // Map all old imports to the new consolidated import
      const oldImports = FILES_TO_CONSOLIDATE.map(f => f.replace(/\.ts$/, ''));
      const newImport = TARGET_FILE.replace(/\.ts$/, '');
      
      if (updateImports(file, oldImports, newImport)) {
        console.log(`Updated imports in ${file}`);
      } else {
        console.error(`Failed to update imports in ${file}`);
      }
    } else {
      console.warn(`File ${file} does not exist, skipping.`);
    }
  }
  
  console.log('Utility consolidation complete!');
}

// Run the main function
main();


