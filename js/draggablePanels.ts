// @ts-nocheck
// File: js/draggablePanels.ts

/**
 * Makes overlay panels draggable within a specified container.
 */
export function initializeDraggablePanels(
    panelSelector: string,
    containerSelector: string,
    ignoreSelectors: string[] = ['input', 'button', 'textarea', 'select', 'progress', 'canvas', '.no-drag', '[role="button"]', 'a', 'pre', '.chart-container'],
    ignoredClasses: string[] = ['heatmap-cell', 'cv-syndrome-bar', 'bar-fill', 'metric-value', 'metric-label']
): void {
    const container = document.querySelector<HTMLElement>(containerSelector); // Specify HTMLElement
    const panels = document.querySelectorAll<HTMLElement>(panelSelector); // Specify HTMLElement NodeList
    let activePanel: HTMLElement | null = null;
    let currentX: number, currentY: number, initialX: number, initialY: number;
    let highestZ: number = 10;

    if (!container) {
        console.error("Draggable panels container not found:", containerSelector);
        return;
    }

    // Calculate initial highest z-index
    panels.forEach(p => {
        try {
            const z = parseInt(window.getComputedStyle(p).zIndex, 10);
            if (!isNaN(z) && z >= highestZ) {
                highestZ = z + 1;
            }
        } catch (e) {
            console.warn("Could not parse z-index for panel:", p, e);
        }
    });
    highestZ += 5; // Buffer

    panels.forEach(panel => {
        panel.style.cursor = 'grab';
        panel.addEventListener('mousedown', dragStart, false);
        panel.addEventListener('touchstart', dragStart, { passive: false });
    });

    function dragStart(this: HTMLElement, e: MouseEvent | TouchEvent): void { // Type 'this' context
        const isTouchEvent = e.type.startsWith('touch');
        // Use type assertion for TouchEvent properties or check e.touches
        const currentEvent = isTouchEvent ? (e as TouchEvent).touches[0] : (e as MouseEvent);
        const targetElement = currentEvent.target as HTMLElement; // Assert target as HTMLElement

        // Check ignored elements/classes
        if (targetElement.closest(ignoreSelectors.join(','))) {
             return;
        }
        if (ignoredClasses.some(cls => targetElement.classList.contains(cls))) {
            return;
        }
        if (!isTouchEvent && isScrollbarClick(e as MouseEvent, this)) { // Pass MouseEvent to helper
            return;
        }

        activePanel = this;
        activePanel.style.cursor = 'grabbing';
        highestZ++;
        activePanel.style.zIndex = String(highestZ); // Convert number to string for style

        initialX = currentEvent.pageX - activePanel.offsetLeft;
        initialY = currentEvent.pageY - activePanel.offsetTop;

        document.addEventListener('mousemove', drag, false);
        document.addEventListener('mouseup', dragEnd, false);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', dragEnd, false);

        document.body.classList.add('dragging');
    }

    function drag(e: MouseEvent | TouchEvent): void {
        if (!activePanel) return;

        e.preventDefault();

        const isTouchEvent = e.type.startsWith('touch');
        const currentEvent = isTouchEvent ? (e as TouchEvent).touches[0] : (e as MouseEvent);

        currentX = currentEvent.pageX - initialX;
        currentY = currentEvent.pageY - initialY;

        // Check if container exists before using it
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const panelRect = activePanel.getBoundingClientRect();

        const containerInnerWidth = container.clientWidth;
        const containerInnerHeight = container.clientHeight;
        const panelWidth = activePanel.offsetWidth;
        const panelHeight = activePanel.offsetHeight;

        const minX = 0;
        const minY = 0;
        const maxX = Math.max(0, containerInnerWidth - panelWidth);
        const maxY = Math.max(0, containerInnerHeight - panelHeight);

        currentX = Math.max(minX, Math.min(currentX, maxX));
        currentY = Math.max(minY, Math.min(currentY, maxY));

        setTranslate(currentX, currentY, activePanel);
    }

    function dragEnd(): void {
        if (!activePanel) return;

        activePanel.style.cursor = 'grab';
        document.removeEventListener('mousemove', drag, false);
        document.removeEventListener('mouseup', dragEnd, false);
        document.removeEventListener('touchmove', drag, false);
        document.removeEventListener('touchend', dragEnd, false);
        document.body.classList.remove('dragging');
        activePanel = null;
    }

    function setTranslate(xPos: number, yPos: number, el: HTMLElement): void {
        el.style.left = `${xPos}px`;
        el.style.top = `${yPos}px`;
        el.style.transform = '';
    }

    function isScrollbarClick(e: MouseEvent, element: HTMLElement): boolean {
        const hasVerticalScrollbar = element.scrollHeight > element.clientHeight;
        const hasHorizontalScrollbar = element.scrollWidth > element.clientWidth;

        if (!hasVerticalScrollbar && !hasHorizontalScrollbar) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        const scrollbarWidth = element.offsetWidth - element.clientWidth;
        const scrollbarHeight = element.offsetHeight - element.clientHeight;
        const clickXrelative = e.clientX - rect.left;
        const clickYrelative = e.clientY - rect.top;
        const tolerance = 2;
        const isOverVerticalScrollbar = hasVerticalScrollbar && scrollbarWidth > 5 && clickXrelative >= (element.offsetWidth - scrollbarWidth - tolerance);
        const isOverHorizontalScrollbar = hasHorizontalScrollbar && scrollbarHeight > 5 && clickYrelative >= (element.offsetHeight - scrollbarHeight - tolerance);

        return isOverVerticalScrollbar || isOverHorizontalScrollbar;
    }
}
