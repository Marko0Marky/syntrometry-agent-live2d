// @ts-nocheck
import * as THREE from 'three';

// Use module augmentation instead of interface redeclaration
declare module 'three' {
  // Extend Object3D with additional properties
  interface Object3D {
    type: string;
    geometry?: BufferGeometry;
    userData: any;
  }
}

// Create new interfaces without extending the THREE interfaces directly
// This avoids the property type conflicts
interface MultiMaterialObject {
  material: THREE.Material | THREE.Material[];
}

// For Mesh objects with multiple materials
interface MultiMaterialMesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

// For Line objects with multiple materials
interface MultiMaterialLine {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

// Fix Points reference - THREE.Points should be available
// If not, we'll define our own interface
interface MultiMaterialPoints {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

// Add your other interfaces here
interface Material {
  dispose(): void;
  opacity: number;
  transparent: boolean;
  needsUpdate: boolean;
}

interface MeshBasicMaterial extends Material {
  color: Color;
}

interface MeshPhongMaterial extends Material {
  color: Color;
  emissive: Color;
  shininess: number;
  specular: Color;
}

interface LineBasicMaterial extends Material {
  color: Color;
}

interface PointsMaterial extends Material {
  color: Color;
  size: number;
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
  length(): number;
  // lengthSq is deprecated in newer THREE.js versions
}

interface BufferGeometry {
  dispose(): void;
}

interface Color {
  set(color: number | string | Color): this;
}



