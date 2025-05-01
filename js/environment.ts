// js/environment.ts

class Environment {
    private canvas: HTMLCanvasElement = document.createElement('canvas');
    public id: string;
    public name: string;
    public agents: any[]; // We'll define the Agent type later
    public objects: any[]; // We'll define the Object type later

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
        this.agents = [];
        this.objects = [];
    }

    addAgent(agent: any): void { // Will be replaced by the real type
        this.agents.push(agent);
    }

    addObject(object: any): void { // Will be replaced by the real type
        this.objects.push(object);
    }

    removeAgent(agentId: string): void {
        this.agents = this.agents.filter(agent => agent.id !== agentId);
    }

    removeObject(objectId: string): void {
        this.objects = this.objects.filter(object => object.id !== objectId);
    }

    getAgent(agentId: string): any | undefined { // Will be replaced by the real type
        return this.agents.find(agent => agent.id === agentId);
    }

    getObject(objectId: string): any | undefined { // Will be replaced by the real type
        return this.objects.find(object => object.id === objectId);
    }

    getAllAgents(): any[] { // Will be replaced by the real type
        return this.agents;
    }

    getAllObjects(): any[] { // Will be replaced by the real type
        return this.objects;
    }
    
    update():void {
        this.agents.forEach(agent => {
            agent.update();
        });
    }

    // Other environment-related methods...
}

export default Environment;
