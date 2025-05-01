import Environment from './environment.js';


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

export default App;