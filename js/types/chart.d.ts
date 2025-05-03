// @ts-nocheck
declare module 'chart.js' {
  export const registerables: any[];
  
  export type ChartType = 'line' | 'bar' | 'radar' | 'doughnut' | 'pie' | 'polarArea' | 'bubble' | 'scatter';
  
  export interface ChartPoint {
    x: number;
    y: number;
  }
  
  export interface ChartConfiguration<TType extends ChartType = ChartType, TData = any[], TLabel = any> {
    type: TType;
    data: ChartData<TType, TData, TLabel>;
    options?: ChartOptions<TType>;
  }
  
  export interface ChartData<TType extends ChartType = ChartType, TData = any[], TLabel = any> {
    datasets: ChartDataset<TType, TData>[];
    labels?: TLabel[];
  }
  
  export interface ChartOptions<TType extends ChartType = ChartType> {
    scales?: Record<string, any>;
    plugins?: Record<string, any>;
    animation?: boolean | Record<string, any>;
    responsive?: boolean;
    maintainAspectRatio?: boolean;
    [key: string]: any;
  }
  
  export interface ChartDataset<TType extends ChartType = ChartType, TData = any[]> {
    label?: string;
    data: TData;
    borderColor?: string;
    backgroundColor?: string;
    borderWidth?: number;
    pointRadius?: number;
    yAxisID?: string;
    tension?: number;
    [key: string]: any;
  }
  
  export interface TooltipItem<TType extends ChartType = ChartType> {
    dataset: ChartDataset<TType>;
    datasetIndex: number;
    index: number;
    raw: any;
    formattedValue: string;
    parsed: {
      x?: number;
      y?: number;
    };
  }
  
  export class Chart<TType extends ChartType = ChartType, TData = any[], TLabel = any> {
    constructor(ctx: any, config: ChartConfiguration<TType, TData, TLabel>);
    static register(...args: any[]): void;
    destroy(): void;
    update(mode?: 'none' | 'normal' | 'reset' | 'resize' | 'show' | 'hide' | 'active' | 'inactive'): void;
    data: ChartData<TType, TData, TLabel>;
    options: ChartOptions<TType>;
  }
}

