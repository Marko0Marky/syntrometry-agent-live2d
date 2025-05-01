// viz-concepts.ts
class Concept {
    name: string;
    description: string;
    constructor(name: string, description: string) {
        this.name = name;
        this.description = description;
    }

    toString(): string {
        return `Concept: ${this.name}, Description: ${this.description}`;
    }
}

class ConceptVisualizer {
    concepts: Concept[];
    constructor() {
        this.concepts = [] as Concept[];
    }

    addConcept(concept: Concept): void {
        this.concepts.push(concept);
    }

    removeConcept(concept: Concept): void {
        const index = this.concepts.indexOf(concept);
        if (index > -1) {
            this.concepts.splice(index, 1);
        }
    }

    visualize(): void {
        console.log("Visualizing concepts:", this.concepts);
        // Placeholder for visualization logic
    }
}