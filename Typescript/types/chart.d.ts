declare module 'chart.js' {
  export const registerables: any[];
  
  export interface ChartConfiguration {
    type: string;
    data: any;
    options?: any;
  }
  
  export interface ChartDataset {
    label?: string;
    data: any[];
    borderColor?: string;
    backgroundColor?: string;
    borderWidth?: number;
    pointRadius?: number;
    yAxisID?: string;
    tension?: number;
  }
  
  export interface TooltipItem {
    dataset: ChartDataset;
    raw: any;
  }
  
  export class Chart {
    constructor(ctx: any, config: ChartConfiguration);
    static register(...args: any[]): void;
    destroy(): void;
    update(): void;
  }
}