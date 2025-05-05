// Type augmentations for Three.js

import * as THREE from 'three';

declare module 'three' {
  interface Clock {
    // Add missing methods or override existing ones
    getElapsedTime(): number;
    getDelta(): number;
    // No arguments version
    (): number;
  }
}

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
    length(): number;
    lengthSq(): number;
    sub(v: Vector3): this;
  }

  interface Object3D {
    userData: any;
    type: string;
    position: Vector3;
  }

  interface Scene {
    traverse(callback: (object: Object3D) => void): void;
  }

  interface OrbitControls {
    dispose(): void;
    target: Vector3;
  }

  interface Mesh extends Object3D {
    geometry: BufferGeometry;
    material: Material | Material[];
  }

  interface Color {
    add(color: Color): this;
    addColors(color1: Color, color2: Color): this;
    copy(color: Color): this;
    multiplyScalar(s: number): this;
    lerp(color: Color, alpha: number): this;
    getHex(): number;
    setHex(hex: number): this;
  }
}

// Augment the OrbitControls module
declare module 'three/examples/jsm/controls/OrbitControls.js' {
  export interface OrbitControls {
    dispose(): void;
    target: THREE.Vector3;
  }
}



