// js/scripts/fix-duplicates.js
// Script to fix duplicate functions in tensorUtils.ts

const fs = require('fs');
const path = require('path');

// The file to check and fix
const FILE_PATH = 'js/tensorUtils.ts';

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

// Function to find duplicate function declarations
function findDuplicateFunctions(content) {
  // Match export declarations for functions
  const exportRegex = /export\s+(function|const|let|var|class|interface|type)\s+(\w+)/g;
  const matches = [...content.matchAll(exportRegex)];
  
  // Count occurrences of each export name
  const exportCounts = {};
  const exportPositions = {};
  
  for (const match of matches) {
    const exportName = match[2];
    const position = match.index;
    
    if (!exportCounts[exportName]) {
      exportCounts[exportName] = 1;
      exportPositions[exportName] = [position];
    } else {
      exportCounts[exportName]++;
      exportPositions[exportName].push(position);
    }
  }
  
  // Find duplicates
  const duplicates = Object.entries(exportCounts)
    .filter(([_, count]) => count > 1)
    .map(([name, count]) => ({ 
      name, 
      count, 
      positions: exportPositions[name].sort((a, b) => a - b) 
    }));
  
  return duplicates;
}

// Function to remove duplicate functions
function removeDuplicateFunctions(content, duplicates) {
  // Sort duplicates by position in descending order to avoid index shifting
  const sortedDuplicates = [...duplicates].sort((a, b) => {
    // Sort by name first
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    // Then sort positions in descending order
    return b.positions[0] - a.positions[0];
  });
  
  let newContent = content;
  
  for (const duplicate of sortedDuplicates) {
    console.log(`Fixing duplicate function: ${duplicate.name} (${duplicate.count} occurrences)`);
    
    // Keep only the first occurrence (lowest position)
    const positionsToRemove = duplicate.positions.slice(1);
    
    for (const position of positionsToRemove) {
      // Find the function declaration and its body
      const functionStartRegex = new RegExp(`export\\s+(function|const|let|var|class|interface|type)\\s+${duplicate.name}[\\s\\S]*?\\{`, 'g');
      functionStartRegex.lastIndex = position;
      const functionStartMatch = functionStartRegex.exec(newContent);
      
      if (functionStartMatch) {
        const functionStart = functionStartMatch.index;
        let braceCount = 1;
        let functionEnd = functionStartMatch.index + functionStartMatch[0].length;
        
        // Find the end of the function by matching braces
        for (let i = functionEnd; i < newContent.length && braceCount > 0; i++) {
          if (newContent[i] === '{') braceCount++;
          if (newContent[i] === '}') braceCount--;
          if (braceCount === 0) functionEnd = i + 1;
        }
        
        // Remove the function
        newContent = newContent.substring(0, functionStart) + newContent.substring(functionEnd);
        console.log(`  Removed duplicate at position ${position}`);
      }
    }
  }
  
  return newContent;
}

// Main function
function main() {
  console.log(`Checking for duplicate functions in ${FILE_PATH}...`);
  
  const content = readFile(FILE_PATH);
  if (!content) {
    console.error(`Could not read ${FILE_PATH}`);
    return;
  }
  
  const duplicates = findDuplicateFunctions(content);
  
  if (duplicates.length === 0) {
    console.log('No duplicate functions found.');
    return;
  }
  
  console.log(`Found ${duplicates.length} duplicate functions:`);
  duplicates.forEach(({ name, count }) => {
    console.log(`  ${name}: ${count} occurrences`);
  });
  
  const newContent = removeDuplicateFunctions(content, duplicates);
  
  if (writeFile(FILE_PATH, newContent)) {
    console.log(`Successfully fixed duplicate functions in ${FILE_PATH}`);
  } else {
    console.error(`Failed to write updated content to ${FILE_PATH}`);
  }
}

// Run the main function
main();