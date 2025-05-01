class DraggablePanel {    
    static createDraggablePanels(panelClass: string, headerClass: string): DraggablePanel[] {
        const panels: DraggablePanel[] = [];
        const panelElements = document.querySelectorAll(`.${panelClass}`);
        panelElements.forEach((panelElement: Element) => {
            const headerElement = panelElement.querySelector(`.${headerClass}`);
            if (headerElement && panelElement.id && headerElement.id) {
                const panel = new DraggablePanel(panelElement.id, headerElement.id);
                panels.push(panel);
            } else {
                console.error("Could not find header or elements with id.");
            }
        });
        return panels;
    }


    private element: HTMLElement;
    private header: HTMLElement;
    private isDragging: boolean = false;
    private offsetX: number = 0;
    private offsetY: number = 0;

    constructor(elementId: string, headerId: string) {
        this.element = document.getElementById(elementId) as HTMLElement;
        this.header = document.getElementById(headerId) as HTMLElement;

        if (!this.element || !this.header) {
            throw new Error("Element or header not found.");
        }

        this.header.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
    }

    private onMouseDown(event: MouseEvent) {
        this.isDragging = true;
        this.offsetX = event.clientX - this.element.offsetLeft;
        this.offsetY = event.clientY - this.element.offsetTop;
        this.element.style.zIndex = '100';
    }

    private onMouseMove(event: MouseEvent) {
        if (!this.isDragging) return;

        this.element.style.left = (event.clientX - this.offsetX) + 'px';
        this.element.style.top = (event.clientY - this.offsetY) + 'px';
    }

    private onMouseUp() {
        this.isDragging = false;
        this.element.style.zIndex = '1';
    }
}