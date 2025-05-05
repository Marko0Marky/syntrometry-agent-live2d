declare module 'three' {
  export class Object3D {
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    add(object: Object3D): this;
    remove(object: Object3D): this;
  }
  
  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
  }
  
  export class Color {
    r: number;
    g: number;
    b: number;
    constructor();
    constructor(hex: number);
    constructor(color: string);
    constructor(r: number, g: number, b: number);
    set(value: number | string | Color): this;
    clone(): this;
    getHex(): number;
    lerp(color: Color, alpha: number): this;
    multiplyScalar(scalar: number): this;
    copy(color: Color): this;
  }
  export class Euler {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
  }
  
  export class Clock {
    constructor();
    getDelta(): number;
    getElapsedTime(): number;
  }
}