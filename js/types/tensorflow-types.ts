// Updated tensorflow-types.ts
import * as tf from '@tensorflow/tfjs';

// Core tensor types
export type Tensor = tf.Tensor;
export type Scalar = tf.Scalar;
export type TensorLike = tf.TensorLike;
export type TypedArray = tf.TypedArray;
export type Rank = tf.Rank;

// Layer types
// @ts-ignore - Type compatibility issue
export type Variable = tf.Variable;
// @ts-ignore - Type compatibility issue
export type Optimizer = tf.Optimizer;
// @ts-ignore - Type compatibility issue with TensorFlow.js
export type Sequential = any;
// @ts-ignore - Type compatibility issue with TensorFlow.js
export type LayersModel = any;

// Additional types
export namespace layers {
  // @ts-ignore - Type compatibility issue
  export type Layer = tf.layers.Layer;
  export type LayerArgs = any;
}
export type SymbolicTensor = any;

// Add missing methods to make types compatible
declare module '@tensorflow/tfjs' {
  interface Tensor {
    reshape(newShape: number[]): Tensor;
  }
}
