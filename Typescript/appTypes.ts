/**
 * Type definitions for app.ts
 */
import type { Tensor, Rank } from '@tensorflow/tfjs-core';
import { TensorCompatible, NullableTensorCompatible } from './tensorTypeUtils.js';

// Update EnvStepResult to use NullableTensorCompatible
export interface EnvStepResult {
  state: NullableTensorCompatible;
  reward: number;
  done: boolean;
  context: string;
  eventType: string | null;
}

// Update AgentProcessResponse to use TensorCompatible
export interface AgentProcessResponse {
  cascadeHistory: number[][]; // Changed from number[][] | null
  rihScore: number;
  trustScore: number;
  affinities: number[];
  emotions: Tensor<Rank>; // Using Tensor<Rank> instead of any
  hmLabel: string;
  responseText: string;
  integration: number;
  reflexivity: number;
  beliefNorm: number;
  feedbackNorm: number;
  selfStateNorm: number;
  beliefEmbedding?: Tensor<Rank>; // Optional for backward compatibility
}

// Define UI mode types
export type UIMode = "reset" | "resize" | "none" | "normal" | "show" | "hide" | "active" | "inactive" | "quiet";

// Extend the UIMode type to include "quiet"
declare module "./uiController" {
  export function setUIMode(mode: UIMode): void;
}

// Define Chart context type
export interface ChartContext {
  dataset?: {
    value: number;
  };
}

// Define ChartPoint interface for Chart.js
export interface ChartPoint {
  x: number;
  y: number;
}

// Define SafeTooltipItem for Chart.js tooltips
export interface SafeTooltipItem {
  chart: any;
  datasetIndex: number;
  parsed: {
    x: number;
    y: number;
  };
  dataset: {
    label: string;
    yAxisID?: string;
  };
}

// Import Chart.js
import { Chart as ChartJS } from 'chart.js';

// Define our own ChartData type
export interface ChartData {
  datasets: ChartDataset[];
  labels?: string[];
}

// Extend Chart.js types for our needs
export interface ExtendedChart extends ChartJS {
  data: ChartData;
}

// Define our own types for missing Chart.js exports
export interface ChartEvent {
  type: string;
  chart: ExtendedChart;
  native?: Event;
  x?: number;
  y?: number;
}

export interface LegendItem {
  text: string;
  fillStyle: string;
  hidden: boolean;
  index: number;
  strokeStyle: string;
  lineWidth: number;
  datasetIndex?: number;
}

export interface LegendElement {
  text: string;
  fillStyle: string;
  hidden: boolean;
  index: number;
  strokeStyle: string;
  lineWidth: number;
  datasetIndex?: number;
}

// Import HeadMovementLabel from config instead of redefining it
import { HeadMovementLabel } from './config.js';

// Re-export it for use in app.ts
export { HeadMovementLabel };

// Add this to your existing types
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

// Extended CSS2DObject with visible property
export interface ExtendedCSS2DObject extends CSS2DObject {
    visible: boolean;
}

// Define Chart.js specific types to avoid generics issues
export type ChartConfiguration = {
  type: string;
  data: ChartData;
  options: any;
};

export type ChartDataset = {
  label: string;
  data: ChartPoint[];
  backgroundColor?: string;
  borderColor?: string;
  yAxisID?: string;
  [key: string]: any;
};

// Define our own TooltipItem type
export interface TooltipItem {
  chart: any;
  dataIndex: number;
  datasetIndex: number;
  element: any;
  index: number;
  label: string;
  value: any;
  x: number;
  y: number;
  dataset: ChartDataset;
  parsed: {
    x: number;
    y: number;
  };
  formattedValue: string;
  raw: any;
  tooltip: any;
}

// Update EnvStepResult to use our compatible types
export interface EnvStepResult {
  state: NullableTensorCompatible;
  reward: number;
  done: boolean;
  context: string;
  eventType: string | null;
}










