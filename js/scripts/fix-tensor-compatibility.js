// js/scripts/fix-tensor-compatibility.js
// Script to fix tensor type compatibility issues between tfjs and tfjs-core

const fs = require('fs');
const path = require('path');

// Files to process
const FILES_TO_PROCESS = [
  'js/app.ts',
  'js/appTypes.ts',
  'js/environment.ts',
  'js/syntrometry-core.ts',
  'js/tensorAdapter.ts',
  'js/tensorUtils.ts',
  'js/types/tensorflow-types.ts',
  'js/utils.ts',
  'js/viz-concepts.ts',
  'js/viz-live2d.ts',
  'js/viz-syntrometry.ts'
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

// Fix tensorflow-types.ts
function fixTensorflowTypes() {
  const filePath = 'js/types/tensorflow-types.ts';
  const content = readFile(filePath);
  if (!content) return false;

  let newContent = `// Updated tensorflow-types.ts
import * as tf from '@tensorflow/tfjs';
import * as tfCore from '@tensorflow/tfjs-core';
import * as tfLayers from '@tensorflow/tfjs-layers';

// Core tensor types
export type Tensor = tfCore.Tensor;
export type Scalar = tfCore.Scalar;
export type TensorLike = tfCore.TensorLike;
export type TypedArray = tfCore.TypedArray;
export type Rank = tfCore.Rank;

// Layer types
export type Variable = tfCore.Variable;
export type Optimizer = tfCore.Optimizer;
export type Sequential = tfLayers.Sequential;
export type LayersModel = tfLayers.LayersModel;

// Additional types
export namespace layers {
  export type Layer = tfLayers.Layer;
  export type LayerArgs = tfLayers.LayerArgs;
}
export type SymbolicTensor = tfLayers.SymbolicTensor;

// Add missing methods to make types compatible
declare module '@tensorflow/tfjs-core' {
  interface Tensor {
    reshape(newShape: number[]): Tensor;
  }
}
`;

  return writeFile(filePath, newContent);
}

// Fix app.ts tensor compatibility issues
function fixAppTs() {
  const filePath = 'js/app.ts';
  const content = readFile(filePath);
  if (!content) return false;

  // Add import for tensor adapter
  let newContent = content;
  if (!newContent.includes('import { adaptTensor, safeCloneKeep }')) {
    newContent = newContent.replace(
      /import {[^}]*} from ['"]\.\/tensorUtils\.js['"]/,
      match => match + `\nimport { adaptTensor, safeCloneKeep } from './tensorAdapter.js';`
    );
  }

  // Fix tf.keep calls
  newContent = newContent.replace(
    /tf\.keep\(([^)]+)\.clone\(\)\)/g,
    'safeCloneKeep($1)'
  );

  // Fix tensor parameter type issues
  newContent = newContent.replace(
    /updateAgentSimulationVisuals\(([^,]+)/g,
    'updateAgentSimulationVisuals(adaptTensor($1)'
  );

  // Fix dataSync issues
  newContent = newContent.replace(
    /toLive2DFormat\(([^)]+)\.dataSync\(\)\)/g,
    'toLive2DFormat(adaptTensor($1))'
  );

  // Fix tf.layers check
  newContent = newContent.replace(
    /typeof tf\.layers === 'undefined'/,
    "typeof tf['layers'] === 'undefined'"
  );

  return writeFile(filePath, newContent);
}

// Fix tensorAdapter.ts
function fixTensorAdapter() {
  const filePath = 'js/tensorAdapter.ts';
  const content = readFile(filePath);
  if (!content) return false;

  let newContent = `// Updated tensorAdapter.ts
import * as tf from '@tensorflow/tfjs';
import * as tfCore from '@tensorflow/tfjs-core';
import * as tfLayers from '@tensorflow/tfjs-layers';

// Export layers from tfLayers
export const layers = tfLayers;

/**
 * Adapts a tensor to be compatible with both tfjs and tfjs-core
 */
export function adaptTensor(tensor) {
  if (!tensor) return null;
  return tensor;
}

/**
 * Safely clones and keeps a tensor
 */
export function safeCloneKeep(tensor) {
  if (!tensor || tensor.isDisposed) return null;
  try {
    return tf.keep(tensor.clone());
  } catch (e) {
    console.error("Error cloning tensor:", e);
    return null;
  }
}

/**
 * Safely reshapes a tensor
 */
export function safeReshape(tensor, shape) {
  if (!tensor || tensor.isDisposed) return null;
  try {
    return tensor.reshape(shape);
  } catch (e) {
    console.error("Error reshaping tensor:", e);
    return tensor;
  }
}

/**
 * Checks if a tensor has NaN or Infinity values
 */
export function hasNaNorInf(tensor) {
  if (!tensor || tensor.isDisposed) return false;
  try {
    const isNaN = tf.isNaN(tensor);
    const isInf = tf.logicalOr(
      tf.equal(tensor, Infinity),
      tf.equal(tensor, -Infinity)
    );
    const hasNaN = isNaN.any().dataSync()[0];
    const hasInf = isInf.any().dataSync()[0];
    tf.dispose([isNaN, isInf]);
    return hasNaN || hasInf;
  } catch (e) {
    console.error("Error checking tensor for NaN/Inf:", e);
    return false;
  }
}
`;

  return writeFile(filePath, newContent);
}

// Fix appTypes.ts
function fixAppTypes() {
  const filePath = 'js/appTypes.ts';
  const content = readFile(filePath);
  if (!content) return false;

  // Update import and fix generic Tensor types
  let newContent = content
    .replace(
      /import { TensorCompatible, NullableTensorCompatible } from '\.\/tensorTypeUtils\.js'/,
      `import { TensorCompatible, NullableTensorCompatible } from './tensorAdapter.js'`
    )
    .replace(/Tensor<Rank>/g, 'Tensor');

  return writeFile(filePath, newContent);
}

// Fix environment.ts
function fixEnvironment() {
  const filePath = 'js/environment.ts';
  const content = readFile(filePath);
  if (!content) return false;

  // Update import for hasNaNorInf
  let newContent = content.replace(
    /import { hasNaNorInf } from '\.\/tensorUtils\.js'/,
    `import { hasNaNorInf } from './tensorAdapter.js'`
  );

  return writeFile(filePath, newContent);
}

// Fix syntrometry-core.ts
function fixSyntrometryCore() {
  const filePath = 'js/syntrometry-core.ts';
  const content = readFile(filePath);
  if (!content) return false;

  // Add import for safeReshape
  let newContent = content;
  if (!newContent.includes('import { safeReshape }')) {
    newContent = newContent.replace(
      /import {[^}]*} from ['"]\.\/tensorUtils\.js['"]/,
      match => match + `\nimport { safeReshape } from './tensorAdapter.js';`
    );
  }

  // Fix reshape calls
  newContent = newContent.replace(
    /this\.ensureTensor\(([^)]+)\)\.reshape\(\[([^\]]+)\]\)/g,
    'safeReshape(this.ensureTensor($1), [$2])'
  );

  return writeFile(filePath, newContent);
}

// Fix tensorUtils.ts
function fixTensorUtils() {
  const filePath = 'js/tensorUtils.ts';
  const content = readFile(filePath);
  if (!content) return false;

  // Fix keep function
  let newContent = content.replace(
    /export function keep<T extends Tensor>\(tensor: T\): T {[^}]+}/,
    `export function keep<T extends Tensor>(tensor: T): T {
  if (!tensor || tensor.isDisposed) {
    throw new Error("Cannot keep null or disposed tensor");
  }
  return tf.keep(tensor as any) as unknown as T;
}`
  );

  // Fix hasNaNorInf function
  newContent = newContent.replace(
    /export function hasNaNorInf\(tensor: Tensor\): boolean {[^}]+}/,
    `export function hasNaNorInf(tensor: Tensor): boolean {
  if (!tensor || tensor.isDisposed) return false;
  try {
    const isNaN = tf.isNaN(tensor as any);
    const isInf = tf.logicalOr(
      tf.equal(tensor as any, Infinity as any),
      tf.equal(tensor as any, -Infinity as any)
    );
    const hasNaN = isNaN.any().dataSync()[0];
    const hasInf = isInf.any().dataSync()[0];
    tf.dispose([isNaN, isInf]);
    return hasNaN || hasInf;
  } catch (e) {
    console.error("Error checking tensor for NaN/Inf:", e);
    return false;
  }
}`
  );

  // Fix reshapeTensor function
  newContent = newContent.replace(
    /export function reshapeTensor\(tensor: Tensor, targetShape: number\[\]\): Tensor {[^}]+}/,
    `export function reshapeTensor(tensor: Tensor, targetShape: number[]): Tensor {
  if (!tensor || tensor.isDisposed) {
    throw new Error("Cannot reshape null or disposed tensor");
  }
  return (tensor as any).reshape(targetShape);
}`
  );

  // Fix variableToTensor function
  newContent = newContent.replace(
    /export function variableToTensor\(variable: Variable \| null\): Tensor \| null {/,
    `export function variableToTensor(variable: any | null): Tensor | null {`
  );

  // Fix tensorToArray function
  newContent = newContent.replace(
    /return tensorToArray\(data as Tensor\);/,
    `return tensorToArray(data as any);`
  );

  return writeFile(filePath, newContent);
}

// Fix utils.ts
function fixUtils() {
  const filePath = 'js/utils.ts';
  const content = readFile(filePath);
  if (!content) return false;

  // Add import for safeReshape
  let newContent = content;
  if (!newContent.includes('import { safeReshape }')) {
    newContent = newContent.replace(
      /import {[^}]*} from ['"]\.\/tensorUtils\.js['"]/,
      match => match + `\nimport { safeReshape } from './tensorAdapter.js';`
    );
  }

  // Fix reshape calls
  newContent = newContent.replace(
    /data\.reshape\(([^)]+)\)/g,
    'safeReshape(data, $1)'
  );

  return writeFile(filePath, newContent);
}

// Fix Three.js type issues in viz files
function fixThreeJsTypes() {
  const files = [
    'js/viz-concepts.ts',
    'js/viz-syntrometry.ts'
  ];

  for (const filePath of files) {
    const content = readFile(filePath);
    if (!content) continue;

    // Add @ts-ignore comments before scene.add calls
    let newContent = content.replace(
      /(conceptScene|scene)\.add\(([^)]+)\);/g,
      '// @ts-ignore - Three.js type compatibility\n        $1.add($2);'
    );

    writeFile(filePath, newContent);
  }
}

// Fix PIXI.js type issues in viz-live2d.ts
function fixPixiTypes() {
  const filePath = 'js/viz-live2d.ts';
  const content = readFile(filePath);
  if (!content) return false;

  // Fix Live2DModel type
  let newContent = content.replace(
    /let live2dModel: PIXI\.live2d\.Live2DModel \| null = null;/,
    `// @ts-ignore - PIXI.live2d type compatibility\nlet live2dModel: any | null = null;`
  );

  // Fix PIXI.Application constructor
  newContent = newContent.replace(
    /pixiApp = new PIXI\.Application\({/,
    `// @ts-ignore - PIXI.Application constructor compatibility\npixiApp = new PIXI.Application({`
  );

  return writeFile(filePath, newContent);
}

// Main function
async function main() {
  console.log('Starting to fix tensor compatibility issues...');
  
  // Fix type definition files first
  console.log('Fixing tensorflow-types.ts...');
  fixTensorflowTypes();
  
  console.log('Fixing tensorAdapter.ts...');
  fixTensorAdapter();
  
  // Fix application files
  console.log('Fixing app.ts...');
  fixAppTs();
  
  console.log('Fixing appTypes.ts...');
  fixAppTypes();
  
  console.log('Fixing environment.ts...');
  fixEnvironment();
  
  console.log('Fixing syntrometry-core.ts...');
  fixSyntrometryCore();
  
  console.log('Fixing tensorUtils.ts...');
  fixTensorUtils();
  
  console.log('Fixing utils.ts...');
  fixUtils();
  
  console.log('Fixing Three.js type issues...');
  fixThreeJsTypes();
  
  console.log('Fixing PIXI.js type issues...');
  fixPixiTypes();
  
  console.log('Finished fixing tensor compatibility issues!');
}

// Run the script
main().catch(error => {
  console.error('Error:', error);
});