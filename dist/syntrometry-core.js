"use strict";
// js/syntrometry-core.js
class HeimSyntrometry {
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
    createInitialState() {
        return Array.from({ length: this.getTotalDimensions() }, () => 0);
    }
    operateOnState(operator, currentState = this.currentState) {
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
    isCloserThan(otherPosition, distance) {
        const position = this.currentState;
        const sum = position.reduce((acc, curr, index) => acc + Math.abs(curr - (Array.isArray(otherPosition) ? otherPosition[index] : otherPosition)), 0);
    }
    getTotalDimensions() {
        return this.getSpaceDimensions() + this.getTimeDimensions() + this.getInformationDimensions() + this.getEntropyDimensions();
    }
    // Operators
    simpleOperator(value) {
        return value;
    }
    randomOperator(value) {
        return Math.random();
    }
    getState() {
        return this.currentState;
    }
    setState(value) {
        if (typeof value !== "number") {
            throw new Error("setState: value must be a number");
        }
        this.currentState = [value];
    }
    addEnergy(value) {
        if (typeof value !== "number") {
            throw new Error("addEnergy: value must be a number");
        }
        this.currentState.push(value);
    }
    getSpaceDimensions() {
        return this.space_dimensions;
    }
    getTimeDimensions() {
        return this.time_dimensions;
    }
    getInformationDimensions() {
        return this.dimensions.information;
    }
    getEntropyDimensions() {
        return this.dimensions.entropy;
    }
}
class SyntrometryConcept {
    constructor(name, dimensions, position = [0, 0, 0], energy = 1) {
        this.name = name;
        this.dimensions = dimensions;
        this.position = position;
        this.energy = energy;
        this.state = Array.from({ length: dimensions.length }, () => 0);
    }
    updatePosition(newPosition) {
        if (!Array.isArray(newPosition) || newPosition.length !== this.position.length) {
            console.error("Invalid position format.");
            return;
        }
        this.position = newPosition;
    }
    updateEnergy(newEnergy) {
        if (typeof newEnergy !== 'number' || newEnergy < 0) {
            console.error("Invalid energy value.");
            return;
        }
        this.energy = newEnergy;
    }
    updateState(operator) {
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
