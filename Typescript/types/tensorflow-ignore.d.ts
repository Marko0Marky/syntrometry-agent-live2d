// This file completely ignores the official TensorFlow.js type definitions
// and provides minimal type definitions to make the code compile

// Declare all TensorFlow.js modules to prevent TypeScript from looking for the real ones
declare module '@tensorflow/tfjs' {
  export type DataType = 'float32' | 'int32' | 'bool' | 'complex64' | 'string';
  export type TypedArray = Float32Array | Int32Array | Uint8Array | Uint8ClampedArray;
  export type TensorLike = number | boolean | string | TypedArray | number[] | number[][] | number[][][] | number[][][][] | boolean[] | boolean[][] | boolean[][][] | boolean[][][][];
  export type Rank = number;
  
  export interface Tensor<R extends Rank = Rank> {
    id: number;
    dataId: {};
    shape: number[];
    dtype: DataType;
    size: number;
    rank: number;
    isDisposed: boolean;
    
    dataSync<D extends DataType = 'float32'>(): TypedArray | string[];
    array(): Promise<any>;
    arraySync(): any;
    
    dispose(): void;
    clone<T extends Tensor>(): T;
    
    add<T extends Tensor>(b: Tensor | TensorLike): T;
    sub<T extends Tensor>(b: Tensor | TensorLike): T;
    mul<T extends Tensor>(b: Tensor | TensorLike): T;
    div<T extends Tensor>(b: Tensor | TensorLike): T;
    
    mean<T extends Tensor>(axis?: number | number[], keepDims?: boolean): T;
    sum<T extends Tensor>(axis?: number | number[], keepDims?: boolean): T;
    
    clipByValue(min: number, max: number): Tensor;
    maximum(other: Tensor | number): Tensor;
    minimum(other: Tensor | number): Tensor;
  }
  
  export function tensor(data: TensorLike, shape?: number[], dtype?: DataType): Tensor;
  export function tensor1d(values: TensorLike, dtype?: DataType): Tensor;
  export function tensor2d(values: TensorLike, shape?: [number, number], dtype?: DataType): Tensor;
  export function tensor3d(values: TensorLike, shape?: [number, number, number], dtype?: DataType): Tensor;
  export function tensor4d(values: TensorLike, shape?: [number, number, number, number], dtype?: DataType): Tensor;
  export function zeros(shape: number[], dtype?: DataType): Tensor;
  export function ones(shape: number[], dtype?: DataType): Tensor;
  export function scalar(value: number | boolean, dtype?: DataType): Tensor;
  export function keep<T extends Tensor>(tensor: T): T;
  export function tidy<T extends Tensor>(fn: () => T): T;
  export function dispose(tensor: Tensor | Tensor[]): void;
  
  // Add any other functions/types you need
  export const train: any;
  export const layers: any;
  
  // Add namespaces to prevent errors
  export namespace serialization {
    export interface ConfigDict { [key: string]: any; }
    export interface Serializable {}
    export interface SerializableConstructor<T> {}
  }
  
  export namespace io {
    export interface ModelPredictConfig {}
    export interface NamedTensorMap {}
  }
  
  // Add TensorContainer type
  export type TensorContainer = Tensor | Tensor[] | {[key: string]: TensorContainer};
  
  // Add other missing types
  export type NamedTensorMap = {[key: string]: Tensor};
  export type InferenceModel = any;
  export type Optimizer = any;
  export type Scalar = Tensor;
  export type Variable = Tensor;
  export type BackendValues = any;
  export type DataId = any;
  export type DataStorage = any;
  export type DataToGPUWebGLOption = any;
  export type GPUData = any;
  export type KernelBackend = any;
  export type MemoryInfo = any;
  export type RecursiveArray<T> = Array<T | RecursiveArray<T>>;
  export type TensorBuffer = any;
  export type TensorInfo = any;
  export type TimingInfo = any;
  export type WebGLData = any;
  export type PixelData = any;
  export type backend_util = any;
  export type Environment = any;
  export type fused = any;
}

// Make all other TensorFlow.js modules use the same definitions
declare module '@tensorflow/tfjs-core' {
  export * from '@tensorflow/tfjs';
}

declare module '@tensorflow/tfjs-layers' {
  export * from '@tensorflow/tfjs';
}

declare module '@tensorflow/tfjs-converter' {
  export * from '@tensorflow/tfjs';
}

declare module '@tensorflow/tfjs-backend-cpu' {
  export * from '@tensorflow/tfjs';
}

declare module '@tensorflow/tfjs-backend-webgl' {
  export * from '@tensorflow/tfjs';
}

declare module '@tensorflow/tfjs-data' {
  export * from '@tensorflow/tfjs';
}
