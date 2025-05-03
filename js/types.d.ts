// @ts-nocheck
// Fix TensorFlow.js type issues
declare module '@tensorflow/tfjs-core' {
  interface Tensor {
    arraySync(): any;
    array(): Promise<any>;
    isDisposed: boolean;
    dataSync(): Float32Array | Int32Array | Uint8Array;
  }
  
  type Rank = number;
  type Tensor1D = Tensor;
  type Tensor2D = Tensor;
  type Tensor3D = Tensor;
  type Tensor4D = Tensor;
  
  const backend_util: any;
  type BackendTimingInfo = any;
  type DataStorage = any;
  type KernelBackend = any;
  type TensorBuffer<R extends Rank = Rank, D extends DataType = DataType> = any;
  type TensorInfo = any;
  
  type AbsInputs = any;
  type KernelConfig = any;
  type KernelFunc = any;
  type CastAttrs = any;
  
  // Add any other missing types here
}

// Fix Chart.js type issues
declare module 'chart.js' {
  const Plugin: any;
}

// Fix THREE.js duplicate identifiers by removing them from augmentations
// You should delete or comment out the duplicate declarations in:
// - js/types/three-augmentations.d.ts
// - js/types/three-extensions.d.ts
// - js/types/three.d.ts

// Fix Color.add method
declare module 'three' {
  interface Color {
    add(color: Color): Color;
  }
}