// @ts-nocheck
/**
 * Type definitions for app.ts
 */

// Define the AgentProcessResponse interface
export interface AgentProcessResponse {
  cascadeHistory: number[][]; // Changed from number[][] | null
  rihScore: number;
  trustScore: number;
  affinities: number[];
  emotions: any; // Using 'any' for tensor types
  hmLabel: string;
  responseText: string;
  integration: number;
  reflexivity: number;
  beliefNorm: number;
  feedbackNorm: number;
  selfStateNorm: number;
  beliefEmbedding?: any; // Optional for backward compatibility
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

// Import correct types from chart.js
import { ChartType, TooltipItem, Chart } from 'chart.js';

// Define our own types for missing Chart.js exports
interface ChartEvent {
  type: string;
  chart: Chart;
  native?: Event;
  x?: number;
  y?: number;
}

interface LegendItem {
  text: string;
  fillStyle: string;
  hidden: boolean;
  index: number;
  strokeStyle: string;
  lineWidth: number;
}

interface LegendElement {
  text: string;
  fillStyle: string;
  hidden: boolean;
  index: number;
  strokeStyle: string;
  lineWidth: number;
}

export type { 
  ChartEvent, LegendItem, LegendElement 
};

// Import HeadMovementLabel from config instead of redefining it
import { HeadMovementLabel } from './config.js';

// Re-export it for use in app.ts
export { HeadMovementLabel };






