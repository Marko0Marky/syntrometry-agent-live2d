declare module 'three/examples/jsm/controls/OrbitControls.js' {
  import { Camera, EventDispatcher, Vector3 } from 'three';

  export class OrbitControls extends EventDispatcher {
    constructor(camera: Camera, domElement?: HTMLElement);
    
    enabled: boolean;
    target: Vector3;
    
    // Add the missing properties
    enableDamping: boolean;
    dampingFactor: number;
    
    update(): boolean;
    dispose(): void;
    
    // Other properties
    minDistance: number;
    maxDistance: number;
    enableZoom: boolean;
    enableRotate: boolean;
    enablePan: boolean;
    autoRotate: boolean;
    autoRotateSpeed: number;
  }
}

declare module 'three/examples/jsm/renderers/CSS2DRenderer.js' {
  import { Object3D, Scene, Camera, Vector3 } from 'three';

  export class CSS2DObject extends Object3D {
    constructor(element: HTMLElement);
    element: HTMLElement;
    center: Vector3;
  }

  export class CSS2DRenderer {
    constructor();
    domElement: HTMLElement;
    getSize(): { width: number, height: number };
    setSize(width: number, height: number): void;
    render(scene: Scene, camera: Camera): void;
  }
}
