// File: js/draggablePanels.ts
/**
 * Makes overlay panels draggable within a specified container.
 */
export function initializeDraggablePanels(panelSelector, containerSelector, ignoreSelectors = ['input', 'button', 'textarea', 'select', 'progress', 'canvas', '.no-drag', '[role="button"]', 'a', 'pre', '.chart-container'], ignoredClasses = ['heatmap-cell', 'cv-syndrome-bar', 'bar-fill', 'metric-value', 'metric-label']) {
    const container = document.querySelector(containerSelector); // Specify HTMLElement
    const panels = document.querySelectorAll(panelSelector); // Specify HTMLElement NodeList
    let activePanel = null;
    let currentX, currentY, initialX, initialY;
    let highestZ = 10;
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
        }
        catch (e) {
            console.warn("Could not parse z-index for panel:", p, e);
        }
    });
    highestZ += 5; // Buffer
    panels.forEach(panel => {
        panel.style.cursor = 'grab';
        panel.addEventListener('mousedown', dragStart, false);
        panel.addEventListener('touchstart', dragStart, { passive: false });
    });
    function dragStart(e) {
        const isTouchEvent = e.type.startsWith('touch');
        // Use type assertion for TouchEvent properties or check e.touches
        const currentEvent = isTouchEvent ? e.touches[0] : e;
        const targetElement = currentEvent.target; // Assert target as HTMLElement
        // Check ignored elements/classes
        if (targetElement.closest(ignoreSelectors.join(','))) {
            return;
        }
        if (ignoredClasses.some(cls => targetElement.classList.contains(cls))) {
            return;
        }
        if (!isTouchEvent && isScrollbarClick(e, this)) { // Pass MouseEvent to helper
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
    function drag(e) {
        if (!activePanel)
            return;
        e.preventDefault();
        const isTouchEvent = e.type.startsWith('touch');
        const currentEvent = isTouchEvent ? e.touches[0] : e;
        currentX = currentEvent.pageX - initialX;
        currentY = currentEvent.pageY - initialY;
        // Check if container exists before using it
        if (!container)
            return;
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
    function dragEnd() {
        if (!activePanel)
            return;
        activePanel.style.cursor = 'grab';
        document.removeEventListener('mousemove', drag, false);
        document.removeEventListener('mouseup', dragEnd, false);
        document.removeEventListener('touchmove', drag, false);
        document.removeEventListener('touchend', dragEnd, false);
        document.body.classList.remove('dragging');
        activePanel = null;
    }
    function setTranslate(xPos, yPos, el) {
        el.style.left = `${xPos}px`;
        el.style.top = `${yPos}px`;
        el.style.transform = '';
    }
    function isScrollbarClick(e, element) {
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
