declare module 'three/examples/jsm/renderers/CSS2DRenderer.js' {
  import { Object3D, Scene, Camera } from 'three';
  
  export class CSS2DObject extends Object3D {
    constructor(element: HTMLElement);
    element: HTMLElement;
    visible: boolean;
  }
  
  export class CSS2DRenderer {
    constructor(parameters?: { element?: HTMLElement });
    domElement: HTMLElement;
    getSize(): { width: number; height: number };
    render(scene: Scene, camera: Camera): void;
    setSize(width: number, height: number): void;
  }
}