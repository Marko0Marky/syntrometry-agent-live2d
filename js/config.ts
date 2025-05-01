interface SimulationConfig {
    stepsPerSecond: number;
    maxStepsPerFrame: number;
    maxThreads: number | undefined;
    maxTicks: number;
}

interface WorldConfig {
    size: number;
    gravity: number;
    showGrid: boolean;
    bgColor: string;
    gridColor: string;
}

interface AgentConfig {
    maxEnergy: number;
    energyDecayRate: number;
    maxSpeed: number;
    maxForce: number;
    maxVisionRange: number;
    maxVisionAngle: number;
    minReproduceEnergy: number;
    reproduceCost: number;
    mutationRate: number;
    mutationRange: number;
    mutationStep: number;
    maxMutation: number;
    maxSize: number;
    minSize: number;
    defaultSize: number;
    defaultColor: string;
}
interface FoodOrPoisonConfig {
    maxEnergy: number;
    energyDecayRate: number;
    maxSize: number;
    minSize: number;
    defaultSize: number;
    defaultColor: string;
    respawnRate: number;
}
interface DebugConfig {
    showStats: boolean;
    showSensors: boolean;
    showForces: boolean;
    showVision: boolean;
}

interface Config {
    simulation: SimulationConfig;
    world: WorldConfig;
    agent: AgentConfig;
    food: FoodOrPoisonConfig;
    poison: FoodOrPoisonConfig;
    debug: DebugConfig;
}

const CONFIG: Config = {
    simulation: {
        stepsPerSecond: 60,
        maxStepsPerFrame: 10,
        maxThreads: navigator.hardwareConcurrency || 4,
        maxTicks: 10000000,
    },
    world: {
        size: 512,
        gravity: 0,
        showGrid: true,
        bgColor: "#333",
        gridColor: "#444",
    },
    agent: {

        maxEnergy: 100,
        energyDecayRate: 0.1,
        maxSpeed: 4,
        maxForce: 0.2,
        maxVisionRange: 100,
        maxVisionAngle: 270,
        minReproduceEnergy: 75,
        reproduceCost: 50,
        mutationRate: 0.1,
        mutationRange: 0.5,
        mutationStep: 0.05,
        maxMutation: 0.25,
        maxSize: 10,
        minSize: 5,
        defaultSize: 8,
        defaultColor: "rgb(100,100,100)",
    },
    food: {
        maxEnergy: 10,
        energyDecayRate: 0,
        maxSize: 5,
        minSize: 3,
        defaultSize: 4,
        defaultColor: "rgb(0,255,0)",
        respawnRate: 0.05,
    },
    poison: {
        maxEnergy: -20,
        energyDecayRate: 0,
        maxSize: 5,
        minSize: 3,
        defaultSize: 4,
        defaultColor: "rgb(255,0,0)",
        respawnRate: 0.05,
    },    
    debug: {
        showStats: true,
        showSensors: false,
        showForces: false,
        showVision: false,
    },
};

export default CONFIG;