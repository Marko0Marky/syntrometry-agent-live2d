// This is a script to help clean up duplicate type declaration files
// Run this with Node.js: node cleanup-types.js

const fs = require('fs');
const path = require('path');

const typesDir = path.join(__dirname, 'js', 'types');
const filesToRemove = [
  'tensorflow.d.ts',
  'tensorflow-core.d.ts',
  'tensorflow-fix.d.ts',
  'tensorflow-extensions.d.ts',
  'tensorflow-extended.d.ts',
  'global.d.ts'
];

// Rename our unified file to be the main tensorflow.d.ts
try {
  fs.renameSync(
    path.join(typesDir, 'tensorflow-unified.d.ts'),
    path.join(typesDir, 'tensorflow.d.ts')
  );
  console.log('Renamed tensorflow-unified.d.ts to tensorflow.d.ts');
} catch (err) {
  console.error('Error renaming file:', err);
}

// Remove the old files
filesToRemove.forEach(file => {
  const filePath = path.join(typesDir, file);
  
  // Skip the main tensorflow.d.ts file we just created
  if (file === 'tensorflow.d.ts') return;
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Removed ${file}`);
    }
  } catch (err) {
    console.error(`Error removing ${file}:`, err);
  }
});

console.log('Cleanup complete!');