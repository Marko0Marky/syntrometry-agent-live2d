// @ts-nocheck
declare module 'three/examples/jsm/renderers/CSS2DRenderer' {
  import { Object3D } from 'three';
  
  export class CSS2DObject extends Object3D {
    constructor(element: HTMLElement);
    element: HTMLElement;
    visible: boolean;
  }
  
  export class CSS2DRenderer {
    constructor();
    setSize(width: number, height: number): void;
    render(scene: any, camera: any): void;
    domElement: HTMLElement;
  }
}
