// Type definitions for PIXI.js and Live2D integration

declare namespace PIXI {
  class Application {
    constructor(options?: {
      width?: number;
      height?: number;
      transparent?: boolean;
      antialias?: boolean;
      autoStart?: boolean;
      resizeTo?: HTMLElement;
    });
    view: HTMLCanvasElement;
    screen: { width: number; height: number };
    stage: Container;
    destroy(removeView?: boolean): void;
  }

  class Container {
    addChild(child: DisplayObject): DisplayObject;
    removeChild(child: DisplayObject): DisplayObject;
    children: DisplayObject[];
  }

  class DisplayObject {
    x: number;
    y: number;
    scale: { set(x: number, y: number): void };
    anchor?: { set(x: number, y: number): void };
    getBounds(): { width: number; height: number; x: number; y: number };
  }

  namespace live2d {
    class Live2DModel extends DisplayObject {
      static from(modelUrl: string): Promise<Live2DModel>;
      internalModel: {
        coreModel: any;
      };
      anchor: { set(x: number, y: number): void };
      on(event: string, callback: (args: any) => void): void;
      expression(expression: Record<string, number>): void;
      setParameterValueById(id: string, value: number): void;
    }
  }
}

// Global PIXI namespace
declare const PIXI: typeof PIXI;

// Global Live2DCubismCore
declare const Live2DCubismCore: any;

