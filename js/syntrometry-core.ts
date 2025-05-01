// js/syntrometry-core.js

class HeimSyntrometry {
    config;
    space_dimensions: number;
    time_dimensions;
    information_dimensions;
    entropy_dimensions;
    dimensions;
    currentState: number[];
    constructor(params = {}) {
        this.config = Object.assign({
            space_dimensions: 3,
            time_dimensions: 1,
            information_dimensions: 2,
            entropy_dimensions: 2,
        }, params);
        this.space_dimensions = this.config.space_dimensions;
        this.time_dimensions = this.config.time_dimensions;
        this.information_dimensions = this.config.information_dimensions;
        this.entropy_dimensions = this.config.entropy_dimensions;
        this.dimensions = {
            space: this.space_dimensions,
            time: this.time_dimensions,
            information: this.information_dimensions,
            entropy: this.entropy_dimensions,

        };
        this.currentState = [];
        this.initialize();
    }
    initialize() {
        this.currentState = this.createInitialState();
    }

    createInitialState(): number[] {
        return Array.from({ length: this.getTotalDimensions() }, () => 0);
    }

    operateOnState(operator: (value: number, index: number) => number, currentState: number[] = this.currentState): void {
        if (!Array.isArray(currentState) || currentState.length !== this.getTotalDimensions()) {
            console.error("Invalid state format.");
            return;
        }
        let newState = [...currentState]; // Clone the current state to avoid mutation
        if (operator) {
            for (let i = 0; i < this.getTotalDimensions(); i++) {
                  newState[i] = operator(newState[i], i);
            }
        }
         this.currentState = newState;
    }
    isCloserThan(otherPosition: number | number[], distance: number) {
        const position: number[] = this.currentState;
        const sum = position.reduce((acc, curr, index) => acc + Math.abs(curr - (Array.isArray(otherPosition) ? otherPosition[index] : otherPosition)), 0);
    }
    
    
    getTotalDimensions(): number {
        return this.getSpaceDimensions() + this.getTimeDimensions() + this.getInformationDimensions() + this.getEntropyDimensions();
    }
    // Operators
     simpleOperator(value: number) {
        return value;
    }

     randomOperator(value: number) {
        return Math.random();
    }
    getState(): number[] {
        return this.currentState;
    }

    setState(value: number): void {
        if (typeof value !== "number") {
            throw new Error("setState: value must be a number");
        }
        this.currentState= [value];
    }
    addEnergy(value: number): void {
        if (typeof value !== "number") {
            throw new Error("addEnergy: value must be a number");
        }
        this.currentState.push(value);
    }    

     getSpaceDimensions(): number {
        return this.space_dimensions;
    }

     getTimeDimensions(): number {
        return this.time_dimensions;
    }    

    getInformationDimensions(): number {
        return this.dimensions.information;
    }

    getEntropyDimensions(): number {
        return this.dimensions.entropy;
    }
}

class SyntrometryConcept {
    position: number[];
    energy: number;
    state: number[];
    constructor(public name: string, public dimensions: number[], position: number[] = [0, 0, 0], energy: number = 1) {
        this.position = position;
        this.energy = energy;
        this.state = Array.from({ length: dimensions.length }, () => 0);
    }


    updatePosition(newPosition: any) {
        if (!Array.isArray(newPosition) || newPosition.length !== this.position.length) {
            console.error("Invalid position format.");
            return;
        }
        this.position = newPosition;
    }
    
    updateEnergy(newEnergy: any) {
        if (typeof newEnergy !== 'number' || newEnergy < 0) {
            console.error("Invalid energy value.");
            return;
        }
        this.energy = newEnergy;
    }

    updateState(operator: any) {
        for (let i = 0; i < this.dimensions.length; i++) {
                this.state[i] = operator(this.state[i], i);
        }
    }

    getPosition() {
        return this.position;
    }

    getEnergy() {
        return this.energy;
    }

    getState() {
        return this.state;
    }
}