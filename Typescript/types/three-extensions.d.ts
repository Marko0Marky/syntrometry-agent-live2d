// Type declarations for THREE.js to fix TypeScript errors
import * as THREE from 'three';

declare module 'three' {
  export class Scene extends Object3D {
    background: Color | Texture | null;
    fog: Fog | FogExp2 | null;
  }

  export class Camera extends Object3D {
    matrixWorldInverse: Matrix4;
    projectionMatrix: Matrix4;
  }

  export class PerspectiveCamera extends Camera {
    aspect: number;
    fov: number;
    near: number;
    far: number;
    updateProjectionMatrix(): void;
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
  }

  export class WebGLRenderer {
    domElement: HTMLCanvasElement;
    setSize(width: number, height: number): void;
    setPixelRatio(value: number): void;
    render(scene: Scene, camera: Camera): void;
    dispose(): void;
    forceContextLoss?(): void;
    constructor(parameters?: { antialias?: boolean; alpha?: boolean });
  }

  export class Raycaster {
    setFromCamera(coords: Vector2, camera: Camera): void;
    intersectObjects(objects: Object3D[], recursive?: boolean): Intersection[];
  }

  export class Vector2 {
    x: number;
    y: number;
    constructor(x?: number, y?: number);
  }

  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    clone(): Vector3;
    copy(v: Vector3): this;
    add(v: Vector3): this;
    addVectors(a: Vector3, b: Vector3): this;
    subVectors(a: Vector3, b: Vector3): this;
    multiplyScalar(s: number): this;
    lerpVectors(a: Vector3, b: Vector3, t: number): this;
    crossVectors(a: Vector3, b: Vector3): this;
    lerp(v: Vector3, t: number): this;
    normalize(): this;
    length(): number;
  }

  export class Color {
    constructor(color?: number | string);
    r: number;
    g: number;
    b: number;
    getHex(): number;
    setHex(hex: number): this;
    clone(): Color;
    copy(color: Color): this;
    add(color: Color): this;
    addColors(color1: Color, color2: Color): this;
    multiplyScalar(s: number): this;
    lerp(color: Color, alpha: number): this;
  }

  export class Fog {
    constructor(color: number | string, near?: number, far?: number);
    color: Color;
    near: number;
    far: number;
  }

  export class FogExp2 {
    constructor(color: number | string, density?: number);
    color: Color;
    density: number;
  }

  export class Light extends Object3D {
    color: Color;
    intensity: number;
  }

  export class AmbientLight extends Light {
    constructor(color?: number | string, intensity?: number);
  }

  export class DirectionalLight extends Light {
    constructor(color?: number | string, intensity?: number);
    target: Object3D;
  }

  export class BufferGeometry {
    dispose(): void;
    computeBoundingSphere(): void;
    boundingSphere: { radius: number };
  }

  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number);
  }

  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number);
  }

  export class TetrahedronGeometry extends BufferGeometry {
    constructor(radius?: number, detail?: number);
  }

  export class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, widthSegments?: number, heightSegments?: number);
  }

  export class TubeGeometry extends BufferGeometry {
    constructor(path: CubicBezierCurve3, tubularSegments?: number, radius?: number, radialSegments?: number, closed?: boolean);
  }

  export class CubicBezierCurve3 {
    constructor(v0: Vector3, v1: Vector3, v2: Vector3, v3: Vector3);
  }

  export class Material {
    dispose(): void;
    transparent: boolean;
    opacity: number;
    visible: boolean;
  }

  export class MeshBasicMaterial extends Material {
    constructor(parameters?: MeshBasicMaterialParameters);
    color: Color;
    side: number;
  }

  export class MeshPhongMaterial extends Material {
    constructor(parameters?: MeshPhongMaterialParameters);
    color: Color;
    emissive: Color;
    shininess: number;
    specular: Color;
    side: number;
    clone(): MeshPhongMaterial;
  }

  export interface MeshBasicMaterialParameters {
    color?: number | string | Color;
    transparent?: boolean;
    opacity?: number;
    side?: number;
  }

  export interface MeshPhongMaterialParameters {
    color?: number | string | Color;
    emissive?: number | string | Color;
    shininess?: number;
    specular?: number | string | Color;
    transparent?: boolean;
    opacity?: number;
    side?: number;
  }

  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material | Material[]);
    geometry: BufferGeometry;
    material: Material | Material[];
  }

  export class Object3D {
    position: Vector3;
    rotation: { x: number; y: number; z: number };
    scale: Vector3;
    userData: any;
    children: Object3D[];
    parent: Object3D | null;
    type: string;
    visible: boolean;
    add(object: Object3D): this;
    remove(object: Object3D): this;
    copy(source: Object3D): this;
  }

  export class Group extends Object3D {
    constructor();
  }

  export class Clock {
    constructor(autoStart?: boolean);
    getElapsedTime(): number;
    getDelta(): number;
  }

  export class Intersection {
    distance: number;
    point: Vector3;
    object: Object3D;
  }

  export class Texture {
    constructor(image?: HTMLImageElement | HTMLCanvasElement);
  }

  export class Matrix4 {
    constructor();
  }

  export const DoubleSide: number;
}

