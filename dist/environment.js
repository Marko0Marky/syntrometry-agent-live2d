// js/environment.ts
class Environment {
    constructor(id, name) {
        this.canvas = document.createElement('canvas');
        this.id = id;
        this.name = name;
        this.agents = [];
        this.objects = [];
    }
    addAgent(agent) {
        this.agents.push(agent);
    }
    addObject(object) {
        this.objects.push(object);
    }
    removeAgent(agentId) {
        this.agents = this.agents.filter(agent => agent.id !== agentId);
    }
    removeObject(objectId) {
        this.objects = this.objects.filter(object => object.id !== objectId);
    }
    getAgent(agentId) {
        return this.agents.find(agent => agent.id === agentId);
    }
    getObject(objectId) {
        return this.objects.find(object => object.id === objectId);
    }
    getAllAgents() {
        return this.agents;
    }
    getAllObjects() {
        return this.objects;
    }
    update() {
        this.agents.forEach(agent => {
            agent.update();
        });
    }
}
export default Environment;
