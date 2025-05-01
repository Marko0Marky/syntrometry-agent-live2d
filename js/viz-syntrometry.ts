// js/viz-syntrometry.ts

interface StateObject {
    [key: string]: {
        x: number;
        y: number;
        color: string;
    };
}

class SyntrometryVisualizer {
    containerId: string;
    options: object;
    container: HTMLElement;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D | null;
    constructor(containerId: string, options: object = {}) {
        this.containerId = containerId;
        this.options = options;
        this.container = document.getElementById(containerId) as HTMLElement;
        if (!this.container) {
            throw new Error(`Container element with ID "${containerId}" not found.`);
        }        
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');        
        if (!this.ctx) {
            throw new Error('Could not get 2D rendering context for canvas.');
        }
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawGrid(): void {
        if(this.ctx){
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            this.ctx.lineWidth = 1;
            const step = 50;
            for (let x = 0; x <= this.canvas.width; x += step) {
                this.ctx.beginPath();
                this.ctx.moveTo(x, 0);
                this.ctx.lineTo(x, this.canvas.height);
                this.ctx.stroke();
            }
            for (let y = 0; y <= this.canvas.height; y += step) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y);
                this.ctx.lineTo(this.canvas.width, y);
                this.ctx.stroke();
            }
        }
        
    }

    drawAxis(): void {
        if(this.ctx){
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(this.canvas.width / 2, 0);
            this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(0, this.canvas.height / 2);
            this.ctx.lineTo(this.canvas.width, this.canvas.height / 2);
            this.ctx.stroke();
        }
    }

    drawPoint(x: number, y: number, color: string = 'white', radius: number = 5): void {
        if(this.ctx){
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.fill();
        }
    }

    drawText(text: string, x: number, y: number, color: string = 'white', fontSize: number = 12): void {
        if(this.ctx){
            this.ctx.fillStyle = color;
            this.ctx.font = `${fontSize}px Arial`;
            this.ctx.fillText(text, x, y);
        }
    }

    clear(): void {
        if(this.ctx){
            this.ctx.fillStyle = 'black';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    update(state: StateObject): void {
        this.clear();
        this.drawGrid();
        this.drawAxis();
        if (state) {
            Object.keys(state).forEach(key => {
                const value = state[key];
                const x = this.canvas.width / 2 + value.x; // Center at x-axis
                const y = this.canvas.height / 2 - value.y; // Center at y-axis, invert y
                this.drawPoint(x, y, value.color);
                this.drawText(key, x + 10, y - 10);
            });
        }
    }
}