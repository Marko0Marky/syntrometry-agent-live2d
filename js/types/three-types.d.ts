// Type definitions for Three.js
declare module 'three' {
  export class Vector3 {
    x: number;
    y: number;
    z: number;
    
    constructor(x?: number, y?: number, z?: number);
    
    set(x: number, y: number, z: number): this;
    clone(): Vector3;
    copy(v: Vector3): this;
    add(v: Vector3): this;
    addScalar(s: number): this;
    addVectors(a: Vector3, b: Vector3): this;
    sub(v: Vector3): this;
    subVectors(a: Vector3, b: Vector3): this;
    multiply(v: Vector3): this;
    multiplyScalar(s: number): this;
    divideScalar(s: number): this;
    normalize(): this;
    length(): number;
    lengthSq(): number;
    distanceTo(v: Vector3): number;
    lerp(v: Vector3, alpha: number): this;
    lerpVectors(v1: Vector3, v2: Vector3, alpha: number): this;
    cross(v: Vector3): this;
    crossVectors(a: Vector3, b: Vector3): this;
    dot(v: Vector3): number;
  }

  export class Color {
    r: number;
    g: number;
    b: number;
    
    constructor(r?: number | string, g?: number, b?: number);
    
    set(color: Color | string | number): this;
    setRGB(r: number, g: number, b: number): this;
    setHex(hex: number): this;
    getHex(): number;
    getHexString(): string;
    add(color: Color): this;
    addColors(color1: Color, color2: Color): this;
    addScalar(s: number): this;
    multiply(color: Color): this;
    multiplyScalar(s: number): this;
    lerp(color: Color, alpha: number): this;
    lerpColors(color1: Color, color2: Color, alpha: number): this;
    equals(color: Color): boolean;
    clone(): Color;
    copy(color: Color): this;
  }

  export class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    matrix: Matrix4;
    quaternion: Quaternion;
    children: Object3D[];
    parent: Object3D | null;
    visible: boolean;
    userData: any;
    
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    updateMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
    lookAt(vector: Vector3 | number, y?: number, z?: number): void;
    clone(recursive?: boolean): this;
  }
}