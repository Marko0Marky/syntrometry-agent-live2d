// @ts-nocheck
// Global type declarations to fix compatibility issues

// Make TensorFlow.js types compatible
declare module '@tensorflow/tfjs' {
  export * from '@tensorflow/tfjs-core';
  
  // Add missing functions
  export function clipByValue(x: any, min: number, max: number): any;
  export function add(a: any, b: any): any;
  export function pad(x: any, paddings: Array<[number, number]>, constantValue?: number): any;
  export function norm(x: any, ord?: any, axis?: any, keepDims?: boolean): any;
  export function mul(a: any, b: any): any;
  export function dot(a: any, b: any): any;
  export function div(a: any, b: any): any;
  export function mean(x: any, axis?: any, keepDims?: boolean): any;
  export function moments(x: any, axis?: any, keepDims?: boolean): {mean: any, variance: any};
  export function sqrt(x: any): any;
  export function abs(x: any): any;
  export function any(x: any, axis?: any, keepDims?: boolean): any;
  export function isNaN(x: any): any;
  export function isInf(x: any): any;
}

// Fix Chart.js types
declare module 'chart.js' {
  export interface ChartConfiguration {
    type: string;
    data: any;
    options?: any;
  }

  export interface ChartDataset {
    label?: string;
    data: any[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    fill?: boolean;
    tension?: number;
    yAxisID?: string;
  }

  export interface TooltipItem {
    datasetIndex: number;
    index: number;
    label: string;
    value: string;
    x: number;
    y: number;
  }

  export interface Chart {
    update(mode?: string): void;
    data: any;
    options: any;
    destroy(): void;
    getDatasetMeta(index: number): any;
  }

  export interface LegendItem {
    datasetIndex: number;
    text: string;
    hidden: boolean;
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    index: number;
  }

  export interface LegendElement {
    chart: Chart;
  }
}

// Fix PIXI.js types
declare namespace PIXI {
  interface Application {
    renderer: any;
    stage: any;
    view: HTMLCanvasElement;
    canvas: HTMLCanvasElement;
    screen: { width: number; height: number };
    ticker: any;
    init(options: any): Promise<void>;
    destroy(removeView?: boolean, options?: any): void;
  }
}

// Fix Live2D model types
interface Live2DModel {
  expression(name: string | Record<string, number>): void;
  setParameterValueById(id: string, value: number): void;
  update(deltaTime: number): void;
  anchor: { set: (x: number, y: number) => void };
  scale: { set: (scale: number) => void };
  x: number;
  y: number;
  on(event: string, callback: (hitAreaNames: string[]) => void): void;
}

interface PIXILive2D {
  Live2DModel: {
    from(url: string): Promise<Live2DModel>;
  }
}

// Extend PIXI namespace
declare namespace PIXI {
  var live2d: PIXILive2D;
}