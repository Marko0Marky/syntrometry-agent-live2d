import Environment from './environment.js';
class App {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.environment = new Environment("env1", "My Environment");
    }
    start() {
        console.log('App starting...');
    }
    run() {
        this.environment.update();
    }
    addAgent() {
        const agent = {};
        this.environment.addAgent(agent);
    }
}
export default App;
