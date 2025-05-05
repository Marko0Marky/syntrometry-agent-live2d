declare module 'chartjs-plugin-streaming' {
    import { Plugin } from 'chart.js';
    
    export interface RealTimeScale {
        realtime: {
            duration: number;
            refresh: number;
            delay: number;
            pause: boolean;
            ttl: number;
            frameRate?: number;
            onRefresh?: (chart: any) => void;
        };
    }
    
    const plugin: Plugin;
    export default plugin;
}