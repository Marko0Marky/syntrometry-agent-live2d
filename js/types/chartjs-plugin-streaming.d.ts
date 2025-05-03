// @ts-nocheck
declare module 'chartjs-plugin-streaming' {
  export interface RealTimeScaleOptions {
    duration: number;
    refresh: number;
    delay: number;
    pause: boolean;
    ttl: number;
    frameRate?: number;
    onRefresh?: (chart: any) => void;
  }
  
  export interface RealTimeScale {
    realtime: RealTimeScaleOptions;
  }
  
  const plugin: any;
  export default plugin;
}



