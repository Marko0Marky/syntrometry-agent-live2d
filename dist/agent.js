"use strict";
class Agent {
    constructor(id, environment) {
        this.canvas = document.createElement('canvas');
        this.id = id;
        this.environment = environment;
        this.position = { x: 0, y: 0 };
        this.velocity = { x: 0, y: 0 };
        this.energy = 100;
        this.perception = [];
        this.intentions = [];
        this.state = "idle";
        this.color = "blue";
        this.target = undefined;
    }
    moveTowards(target) {
        const dx = target.x - this.position.x;
        const dy = target.y - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
            this.velocity.x = dx / distance;
            this.velocity.y = dy / distance;
        }
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;
    }
    update() {
        if (this.state === "moving") {
            if (this.target) {
                this.moveTowards(this.target);
            }
        }
    }
    interact() {
        console.log(`Agent ${this.id} is interacting.`);
    }
    observe() {
        if (this.environment) {
            //TODO: implement a getPerception in the environment object
            //this.perception = this.environment.getPerception(this);
        }
    }
    decide() {
        if (this.perception && this.perception.length > 0) {
            this.intentions = this.perception.map(p => ({
                type: 'interact',
                target: p
            }));
        }
    }
    act() {
        if (this.intentions.length > 0) {
            const intention = this.intentions.shift();
            if (intention && intention.type === 'interact') {
                //TODO: implement the correct type for `target` property, and add `position` to it
                //this.target = intention.target.position;
                this.state = "moving";
                this.interact();
            }
        }
    }
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, 10, 0, 2 * Math.PI);
        ctx.fill();
    }
}
