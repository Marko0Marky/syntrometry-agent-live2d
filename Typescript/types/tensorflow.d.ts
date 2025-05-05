// Unified type declarations for TensorFlow.js
// This file replaces all other tensorflow type declaration files

declare module '@tensorflow/tfjs' {
  // Core types
  export type Rank = number;
  
  export interface Tensor<R extends Rank = Rank> {
    // Basic properties
    id: number;
    dataId: {};
    shape: number[];
    dtype: DataType;
    size: number;
    rank: number;
    isDisposed: boolean;
    
    // Data methods
    dataSync<D extends DataType = 'float32'>(): TypedArray | string[];
    array(): Promise<any>;
    arraySync(): any;
    
    // Tensor operations
    dispose(): void;
    clone<T extends Tensor>(): T;
    
    // Math operations
    add<T extends Tensor>(b: Tensor | TensorLike): T;
    sub<T extends Tensor>(b: Tensor | TensorLike): T;
    mul<T extends Tensor>(b: Tensor | TensorLike): T;
    div<T extends Tensor>(b: Tensor | TensorLike): T;
    
    // Reduction operations
    mean<T extends Tensor>(axis?: number | number[], keepDims?: boolean): T;
    sum<T extends Tensor>(axis?: number | number[], keepDims?: boolean): T;
    
    // Type conversion
    toFloat<T extends Tensor>(): T;
    toInt<T extends Tensor>(): T;
    toBool<T extends Tensor>(): T;
    
    // Shape operations
    reshape<T extends Tensor>(newShape: number[]): T;
    expandDims<T extends Tensor>(axis?: number): T;
    squeeze<T extends Tensor>(axis?: number[]): T;
  }
  
  // Specific tensor types
  export interface Scalar extends Tensor<0> {}
  export interface Tensor1D extends Tensor<1> {}
  export interface Tensor2D extends Tensor<2> {}
  export interface Tensor3D extends Tensor<3> {}
  export interface Tensor4D extends Tensor<4> {}
  
  // Variable type
  export interface Variable<R extends Rank = Rank> extends Tensor<R> {
    assign(newValue: Tensor<R>): void;
  }
  
  // Data types
  export type DataType = 'float32' | 'int32' | 'bool' | 'complex64' | 'string';
  export type TypedArray = Float32Array | Int32Array | Uint8Array | Uint8ClampedArray;
  export type TensorLike = number | boolean | string | TypedArray | number[] | number[][] | number[][][] | number[][][][] | boolean[] | boolean[][] | boolean[][][] | boolean[][][][];
  
  // Core functions
  export function tensor(values: TensorLike, shape?: number[], dtype?: DataType): Tensor;
  export function scalar(value: number | boolean | string, dtype?: DataType): Scalar;
  export function tensor1d(values: TensorLike, dtype?: DataType): Tensor;
  export function tensor2d(values: TensorLike, shape?: [number, number], dtype?: DataType): Tensor;
  export function tensor3d(values: TensorLike, shape?: [number, number, number], dtype?: DataType): Tensor;
  export function tensor4d(values: TensorLike, shape?: [number, number, number, number], dtype?: DataType): Tensor;
  
  export function variable<R extends Rank>(initialValue: Tensor<R>, trainable?: boolean, name?: string, dtype?: DataType): Variable<R>;
  
  export function zeros(shape: number[], dtype?: DataType): Tensor;
  export function ones(shape: number[], dtype?: DataType): Tensor;
  
  // Keep function for tensor memory management
  export function keep<T extends Tensor>(tensor: T): T;
  
  // Modules
  export const train: any;
  export const layers: any;
  
  // Serialization namespace (stub to avoid errors)
  export namespace serialization {
    export interface ConfigDict {
      [key: string]: any;
    }
    export interface Serializable {}
    export interface SerializableConstructor<T> {}
  }
  
  // IO namespace (stub to avoid errors)
  export namespace io {
    export interface ModelPredictConfig {}
    export interface NamedTensorMap {}
  }
}

// Type aliases for convenience
declare module '@tensorflow/tfjs-core' {
  export * from '@tensorflow/tfjs';
}

declare module '@tensorflow/tfjs-layers' {
  export * from '@tensorflow/tfjs';
}

// Extend Chart.js update method to include 'quiet'
declare module 'chart.js' {
  interface Chart {
    update(mode?: 'none' | 'normal' | 'reset' | 'resize' | 'show' | 'hide' | 'active' | 'inactive' | 'quiet'): void;
  }
}



