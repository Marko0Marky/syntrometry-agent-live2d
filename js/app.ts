import './agent.js';
import './config.js';
import './draggablePanels.js';
import Environment from './environment.js';
import './syntrometry-core.js';
import './utils.js';
import './viz-concepts.js';
import './viz-live2d.js';
import './viz-syntrometry.js'; //Added a comma here


class App {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D | null;
  private environment: Environment;
  
  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D | null) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.environment = new Environment("env1", "My Environment");
  }

  start(): void {
    console.log('App starting...');
  }
  
  run(): void {
    this.environment.update();
  }
  
  addAgent(): void {
    const agent = {}
    this.environment.addAgent(agent);
  }  
}

function init(){
  document.addEventListener('DOMContentLoaded', () => {
      });
}

export default App;