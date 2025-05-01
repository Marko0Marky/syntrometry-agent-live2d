"use strict";
class DraggablePanel {
    static createDraggablePanels(panelClass, headerClass) {
        const panels = [];
        const panelElements = document.querySelectorAll(`.${panelClass}`);
        panelElements.forEach((panelElement) => {
            const headerElement = panelElement.querySelector(`.${headerClass}`);
            if (headerElement && panelElement.id && headerElement.id) {
                const panel = new DraggablePanel(panelElement.id, headerElement.id);
                panels.push(panel);
            }
            else {
                console.error("Could not find header or elements with id.");
            }
        });
        return panels;
    }
    constructor(elementId, headerId) {
        this.isDragging = false;
        this.offsetX = 0;
        this.offsetY = 0;
        this.element = document.getElementById(elementId);
        this.header = document.getElementById(headerId);
        if (!this.element || !this.header) {
            throw new Error("Element or header not found.");
        }
        this.header.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
    }
    onMouseDown(event) {
        this.isDragging = true;
        this.offsetX = event.clientX - this.element.offsetLeft;
        this.offsetY = event.clientY - this.element.offsetTop;
        this.element.style.zIndex = '100';
    }
    onMouseMove(event) {
        if (!this.isDragging)
            return;
        this.element.style.left = (event.clientX - this.offsetX) + 'px';
        this.element.style.top = (event.clientY - this.offsetY) + 'px';
    }
    onMouseUp() {
        this.isDragging = false;
        this.element.style.zIndex = '1';
    }
}
