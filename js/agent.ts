class Agent {
    public id: string;
    public environment: unknown; // TODO: Add Environment Type
    public position: { x: number; y: number; };
    public velocity: { x: number; y: number; };
    public energy: number;
    public perception: unknown[];
    public intentions: { type: string; target: unknown; }[];
    public state: string;
    public color: string;
    public target: { x: number; y: number; } | undefined;

    private canvas: HTMLCanvasElement = document.createElement('canvas');

    constructor(id: string, environment: unknown) {
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

    moveTowards(target: { x: number; y: number; }): void {
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

    update(): void {
        if (this.state === "moving") {
            if (this.target) {
                this.moveTowards(this.target);
            }
        }
    }
    interact(): void {
        console.log(`Agent ${this.id} is interacting.`);
    }

    observe(): void {
        if(this.environment){
            //TODO: implement a getPerception in the environment object
            //this.perception = this.environment.getPerception(this);
        }
       
    }

    decide(): void {
        if (this.perception && this.perception.length > 0) {
           this.intentions = this.perception.map(p => ({
                type: 'interact',
                target: p
            }));
        }
    }

    act(): void {
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

    draw(ctx: CanvasRenderingContext2D): void {
       ctx.fillStyle = this.color;
       ctx.beginPath();
       ctx.arc(this.position.x, this.position.y, 10, 0, 2 * Math.PI);
       ctx.fill();
    }
}