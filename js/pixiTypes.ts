// @ts-nocheck
/**
 * Type definitions for PIXI.js and Live2D integration
 */

// Define PIXI Application interface based on how it's used in the code
export interface PIXIApplication {
    init(options: PIXIApplicationOptions): Promise<void>;
    stage: {
        addChild(child: any): void;
    };
    canvas: HTMLCanvasElement;
    view?: HTMLCanvasElement; // For backward compatibility
    screen: {
        width: number;
        height: number;
    };
    destroy(removeView?: boolean, options?: any): void;
    ticker?: {
        add(fn: (delta: number) => void): void;
        remove(fn: (delta: number) => void): void;
    };
}

export interface PIXIApplicationOptions {
    width: number;
    height: number;
    transparent?: boolean;
    antialias?: boolean;
    autoStart?: boolean;
    resizeTo?: HTMLElement;
    backgroundColor?: number;
    backgroundAlpha?: number;
}

// Define Live2D model interface
export interface Live2DModel {
    expression(name: string | Record<string, number>): void;
    setParameterValueById(id: string, value: number): void;
    update(deltaTime: number): void;
    anchor: { set: (x: number, y: number) => void };
    scale: { set: (scale: number) => void };
    x: number;
    y: number;
    on(event: string, callback: (hitAreaNames: string[]) => void): void;
}

// Helper function to safely cast PIXI Application
export function asPIXIApp(app: any): PIXIApplication {
    return app as PIXIApplication;
}

// Helper function to safely cast Live2D model
export function asLive2DModel(model: any): Live2DModel {
    return model as Live2DModel;
}