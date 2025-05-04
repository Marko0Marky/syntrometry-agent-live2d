// js/scripts/fix-index-html.js
// Script to fix index.html

const fs = require('fs');
const path = require('path');

// Fix index.html
function fixIndexHtml() {
  const filePath = path.join(__dirname, '..', '..', 'dist', 'index.html');
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Update the TensorFlow.js script tag to ensure it's loaded before our app
    const tfScriptTag = `<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.21.0/dist/tf.min.js"
        onerror="handleScriptError('TensorFlow.js', null, 'Could not load TensorFlow.js.')"
        onload="console.log('TensorFlow.js loaded successfully')"></script>`;
    
    // Replace the existing TensorFlow.js script tag
    content = content.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@tensorflow\/tfjs[^>]*><\/script>/, tfScriptTag);
    
    // Add a script to ensure TensorFlow.js is properly initialized
    const tfInitScript = `<script>
        // Ensure TensorFlow.js is properly initialized
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof tf === 'undefined') {
                console.error("TensorFlow.js is not loaded!");
                handleScriptError('TensorFlow.js', null, 'TensorFlow.js is not available.');
            } else {
                console.log("TensorFlow.js is available:", tf.version);
                // Set global variables that modules can access
                window.tf = tf;
            }
        });
    </script>`;
    
    // Add the script before the closing </head> tag
    content = content.replace('</head>', tfInitScript + '\n</head>');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed index.html');
    return true;
  } catch (error) {
    console.error('Error fixing index.html:', error);
    return false;
  }
}

// Run the fix
fixIndexHtml();