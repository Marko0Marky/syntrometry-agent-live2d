// @ts-nocheck
// Custom type declarations for TensorFlow.js
declare module '@tensorflow/tfjs' {
  export interface Tensor {
    dataSync(): Float32Array | Int32Array | Uint8Array;
    data(): Promise<Float32Array | Int32Array | Uint8Array>;
    dispose(): void;
    clone(): Tensor;
    shape: number[];
    size: number;
    rank: number;
    dtype: string;
    sub(b: Tensor | number): Tensor;
    add(b: Tensor | number): Tensor;
    mul(b: Tensor | number): Tensor;
    div(b: Tensor | number): Tensor;
    clipByValue(min: number, max: number): Tensor;
    slice(begin: number[], size: number[]): Tensor;
    arraySync(): any;
    isDisposed: boolean;
  }

  export type TypedArray = Float32Array | Int32Array | Uint8Array;
  export type TensorLike = number | number[] | number[][] | number[][][] | number[][][][] | TypedArray;
  export interface Scalar extends Tensor {}

  export function tensor(values: TensorLike, shape?: number[], dtype?: string): Tensor;
  export function scalar(value: number, dtype?: string): Tensor;
  export function zeros(shape: number[], dtype?: string): Tensor;
  export function keep(tensor: Tensor): Tensor;
  export function tidy<T>(fn: () => T): T;
  export function dispose(tensor: Tensor | Tensor[]): void;
  export function memory(): { numTensors: number; numDataBuffers: number; unreliable: boolean };

  // Add TF operations
  export function add(a: Tensor | TensorLike, b: Tensor | TensorLike): Tensor;
  export function sub(a: Tensor | TensorLike, b: Tensor | TensorLike): Tensor;
  export function mul(a: Tensor | TensorLike, b: Tensor | TensorLike): Tensor;
  export function div(a: Tensor | TensorLike, b: Tensor | TensorLike): Tensor;
  export function dot(a: Tensor, b: Tensor): Tensor;
  export function norm(x: Tensor, ord?: number, axis?: number | number[], keepDims?: boolean): Tensor;
  export function mean(x: Tensor, axis?: number | number[], keepDims?: boolean): Tensor;
  export function moments(x: Tensor, axis?: number | number[], keepDims?: boolean): { mean: Tensor, variance: Tensor };
  export function sqrt(x: Tensor): Tensor;
  export function abs(x: Tensor): Tensor;
  export function round(x: Tensor): Tensor;
  export function pad(x: Tensor, paddings: Array<[number, number]>, constantValue?: number): Tensor;
  export function clipByValue(x: Tensor, clipValueMin: number, clipValueMax: number): Tensor;
  export function any(x: Tensor, axis?: number | number[], keepDims?: boolean): Tensor;
  export function isNaN(x: Tensor): Tensor;
  export function isInf(x: Tensor): Tensor;
  export function logicalOr(a: Tensor, b: Tensor): Tensor;
  export function randomNormal(shape: number[], mean?: number, stdDev?: number, dtype?: string, seed?: number): Tensor;
}

declare module '@tensorflow/tfjs-core' {
  export interface Tensor {
    dataSync(): Float32Array | Int32Array | Uint8Array;
    data(): Promise<Float32Array | Int32Array | Uint8Array>;
    dispose(): void;
    clone(): Tensor;
    shape: number[];
    size: number;
    rank: number;
    dtype: string;
    sub(b: Tensor | number): Tensor;
    add(b: Tensor | number): Tensor;
    mul(b: Tensor | number): Tensor;
    div(b: Tensor | number): Tensor;
    clipByValue(min: number, max: number): Tensor;
    slice(begin: number[], size: number[]): Tensor;
    arraySync(): any;
    isDisposed: boolean;
  }

  export type TypedArray = Float32Array | Int32Array | Uint8Array;
  export type TensorLike = number | number[] | number[][] | number[][][] | number[][][][] | TypedArray;
  export interface Scalar extends Tensor {}
}

// Chart.js declarations
declare namespace Chart {
  interface ChartConfiguration {
    type: string;
    data: any;
    options?: any;
  }

  interface ChartInstance {
    update(mode?: any): void;
    data: any;
    options: any;
    destroy(): void;
  }

  interface LegendItem {
    datasetIndex: number;
    text: string;
    hidden: boolean;
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    hidden: boolean;
    index: number;
  }

  interface LegendElement {
    chart: ChartInstance;
  }
}

// PIXI declarations
declare namespace PIXI {
  interface Application {
    renderer: any;
    stage: any;
    view: HTMLCanvasElement;
    ticker: any;
  }
}