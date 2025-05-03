// @ts-nocheck
// Type augmentations for THREE.js
import * as THREE from 'three';

// Augment existing THREE types with missing methods
declare module 'three' {
  interface Vector3 {
    set(x: number, y: number, z: number): this;
    copy(v: Vector3): this;
    clone(): Vector3;
    add(v: Vector3): this;
    addVectors(a: Vector3, b: Vector3): this;
    subVectors(a: Vector3, b: Vector3): this;
    multiplyScalar(s: number): this;
    lerpVectors(a: Vector3, b: Vector3, t: number): this;
    crossVectors(a: Vector3, b: Vector3): this;
    lerp(v: Vector3, t: number): this;
    normalize(): this;
  }

  interface Object3D {
    userData: any;
    type: string;
  }

  interface Scene {
    traverse(callback: (object: Object3D) => void): void;
  }

  interface OrbitControls {
    dispose(): void;
  }
}

// Augment the OrbitControls module
declare module 'three/examples/jsm/controls/OrbitControls.js' {
  export interface OrbitControls {
    dispose(): void;
  }
}