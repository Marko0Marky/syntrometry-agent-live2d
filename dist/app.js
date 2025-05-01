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
function init() {
    document.addEventListener('DOMContentLoaded', () => {
    });
}
export default App;
