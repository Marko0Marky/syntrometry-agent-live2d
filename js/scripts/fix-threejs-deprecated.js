// js/scripts/fix-threejs-deprecated.js
// Script to fix Three.js deprecated methods

const fs = require('fs');
const path = require('path');

// Fix Three.js deprecated methods
function fixThreeJsDeprecated() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'viz-syntrometry.js');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace deprecated addAttribute with setAttribute
    content = content.replace(/\.addAttribute\(/g, '.setAttribute(');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed Three.js deprecated methods');
    return true;
  } catch (error) {
    console.error('Error fixing Three.js deprecated methods:', error);
    return false;
  }
}

// Run the fix
fixThreeJsDeprecated();