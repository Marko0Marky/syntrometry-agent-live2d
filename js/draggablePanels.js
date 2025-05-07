// File: js/draggablePanels.js

/**
 * Makes overlay panels draggable within a specified container, using their '.panel-header'.
 * @param {string} panelSelector CSS selector for the draggable panels.
 * @param {string} containerSelector CSS selector for the bounding container.
 * @param {string[]} ignoreSelectors Array of CSS selectors for elements inside the header that should NOT trigger a drag.
 * @param {string[]} ignoredClasses Array of CSS classes on target elements that should prevent dragging.
 */
export function initializeDraggablePanels(
    panelSelector,
    containerSelector,
    // Ignore common interactive elements, plus specific UI classes
    ignoreSelectors = ['input', 'button', 'textarea', 'select', 'progress', 'canvas', '.no-drag', '[role="button"]', 'a', 'pre', '.chart-container', '.label', '.heatmap-cell', '.cv-syndrome-bar', '.bar-fill', '.metric-value', '.metric-label', '.chat-message', '.timeline-time', '.info-panel-link', '.chat-sender', '.chat-text'],
    ignoredClasses = ['heatmap-cell', 'cv-syndrome-bar', 'bar-fill', 'metric-value', 'metric-label', 'label', 'chat-sender', 'chat-text', 'timeline-time', 'info-panel-link'] // Classes on the target element itself
) {
    const container = document.querySelector(containerSelector);
    const panels = document.querySelectorAll(panelSelector);

    if (!container) {
        console.error("Draggable panels container not found:", containerSelector);
        return;
    }

    let activePanel = null;
    let initialMouseX, initialMouseY; // Mouse position relative to document
    let panelStartX, panelStartY;     // Panel's top-left relative to document at drag start

    // Calculate initial highest z-index dynamically
    let highestZ = 10; // Starting point
    panels.forEach(p => {
        try {
            const z = parseInt(window.getComputedStyle(p).zIndex, 10);
            if (!isNaN(z) && z >= highestZ) {
                highestZ = z + 1;
            }
        } catch (e) { console.warn("Could not parse z-index for panel:", p, e); }
    });
    highestZ += 5; // Add buffer

    panels.forEach(panel => {
        const header = panel.querySelector('.panel-header'); // Find the header element
        if (header) {
            header.style.cursor = 'grab'; // Indicate draggable area
            // Use bind to ensure `this` refers to the panel inside dragStart
            header.addEventListener('mousedown', dragStart.bind(panel), false);
            header.addEventListener('touchstart', dragStart.bind(panel), { passive: false });
        } else {
            console.warn(`Panel with selector "${panelSelector}" (id: ${panel.id || 'N/A'}) is missing a '.panel-header'. Dragging will not be enabled for this panel.`);
            // Optionally, make the whole panel draggable as a fallback:
            // panel.style.cursor = 'grab';
            // panel.addEventListener('mousedown', dragStart.bind(panel), false);
            // panel.addEventListener('touchstart', dragStart.bind(panel), { passive: false });
        }
    });

    function dragStart(e) {
        // `this` is the panel element because of .bind(panel)
        const currentPanel = this;
        const targetElement = e.target; // The actual element clicked (could be inside the header)

        // 1. Check if the clicked element itself should prevent dragging
        if (ignoreSelectors.some(sel => targetElement.closest(sel)) ||
            ignoredClasses.some(cls => targetElement.classList.contains(cls))) {
            return; // Prevent drag
        }

        // 2. Check specifically for scrollbar clicks (if header could potentially scroll)
        // Note: Headers usually don't scroll, but this check is included for completeness.
        // Pass the HEADER element to the check if you only want to check header scrollbars.
        // If checking the panel itself: isScrollbarClick(e, currentPanel)
        if (!e.type.startsWith('touch') && isScrollbarClick(e, targetElement.closest('.panel-header') || currentPanel)) { // Check header or panel
             return;
        }

        // 3. Check for active text selection *within the panel*
        const selection = window.getSelection();
        if (!e.type.startsWith('touch') && selection && selection.toString().length > 0 && currentPanel.contains(selection.anchorNode)) {
             // Allow drag to start even if text is selected, but clear selection
             // selection.removeAllRanges(); // Optionally clear selection
             // OR prevent drag if text is selected:
             // return;
        }

        // If all checks pass, initiate the drag
        activePanel = currentPanel;

        const isTouchEvent = e.type.startsWith('touch');
        const currentEvent = isTouchEvent ? e.touches[0] : e;

        initialMouseX = currentEvent.pageX; // Document coordinate
        initialMouseY = currentEvent.pageY; // Document coordinate

        // Get panel's current position reliably
        const panelRect = activePanel.getBoundingClientRect(); // Position relative to viewport
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        // Calculate initial top-left relative to document
        panelStartX = panelRect.left + scrollX;
        panelStartY = panelRect.top + scrollY;
        
        // Alternative using style (less reliable if position isn't set via left/top initially)
        // panelStartX = parseFloat(activePanel.style.left) || panelRect.left + scrollX;
        // panelStartY = parseFloat(activePanel.style.top) || panelRect.top + scrollY;


        const header = activePanel.querySelector('.panel-header');
        if (header) header.style.cursor = 'grabbing'; // Change cursor on the header
        activePanel.style.zIndex = ++highestZ; // Bring panel to front

        // Add listeners to the document to capture mouse movement everywhere
        document.addEventListener('mousemove', drag, false);
        document.addEventListener('mouseup', dragEnd, false);
        if (isTouchEvent) {
            document.addEventListener('touchmove', drag, { passive: false }); // Prevent scroll during touch drag
            document.addEventListener('touchend', dragEnd, false);
        }

        // Add global style to prevent text selection during drag
        document.body.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none'; // For Safari/Chrome
        document.body.style.msUserSelect = 'none'; // For IE/Edge
        document.body.style.MozUserSelect = 'none'; // For Firefox
    }

    function drag(e) {
        if (!activePanel) return;

        // Prevent default actions like touch scrolling while dragging
        if (e.type.startsWith('touch')) {
            e.preventDefault();
        }

        const isTouchEvent = e.type.startsWith('touch');
        const currentEvent = isTouchEvent ? e.touches[0] : e;

        // Calculate mouse movement delta since drag start
        const deltaX = currentEvent.pageX - initialMouseX;
        const deltaY = currentEvent.pageY - initialMouseY;

        // Calculate new desired panel position (top-left corner relative to document)
        let newX = panelStartX + deltaX;
        let newY = panelStartY + deltaY;

        // --- Containment Logic ---
        const containerRect = container.getBoundingClientRect(); // Container position relative to viewport
        const panelWidth = activePanel.offsetWidth;
        const panelHeight = activePanel.offsetHeight;

        // Calculate boundaries relative to the document
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        const containerDocLeft = containerRect.left + scrollX;
        const containerDocTop = containerRect.top + scrollY;
        const containerDocRight = containerDocLeft + container.clientWidth;
        const containerDocBottom = containerDocTop + container.clientHeight;

        // Determine min/max X/Y for the panel's top-left corner within the container's document coordinates
        const minX = containerDocLeft;
        const minY = containerDocTop;
        const maxX = Math.max(minX, containerDocRight - panelWidth);   // Ensure maxX >= minX
        const maxY = Math.max(minY, containerDocBottom - panelHeight); // Ensure maxY >= minY

        // Clamp calculated position
        newX = Math.max(minX, Math.min(newX, maxX));
        newY = Math.max(minY, Math.min(newY, maxY));

        // Apply the constrained position using left/top style properties
        activePanel.style.left = `${newX}px`;
        activePanel.style.top = `${newY}px`;
        activePanel.style.transform = ''; // Ensure transform doesn't interfere
    }

    function dragEnd() {
        if (!activePanel) return;

        // Restore cursor on the header
        const header = activePanel.querySelector('.panel-header');
        if (header) header.style.cursor = 'grab';

        // Remove document listeners
        document.removeEventListener('mousemove', drag, false);
        document.removeEventListener('mouseup', dragEnd, false);
        document.removeEventListener('touchmove', drag, false);
        document.removeEventListener('touchend', dragEnd, false);

        // Remove global dragging styles/flags
        document.body.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
        document.body.style.msUserSelect = '';
        document.body.style.MozUserSelect = '';

        activePanel = null; // Deactivate panel
    }

    /** Checks if a click event occurred on a likely scrollbar area of an element. */
    function isScrollbarClick(e, element) {
        if (!element) return false;
        // Check if element is potentially scrollable
        const canScrollVertically = element.scrollHeight > element.clientHeight;
        const canScrollHorizontally = element.scrollWidth > element.clientWidth;

        if (!canScrollVertically && !canScrollHorizontally) return false; // Not scrollable

        const rect = element.getBoundingClientRect(); // Position relative to viewport

        // Calculate click position relative to the element's border-box top-left corner
        const clickXRelative = e.clientX - rect.left;
        const clickYRelative = e.clientY - rect.top;

        // Calculate approximate scrollbar widths (might vary by browser/OS)
        // offsetWidth/Height includes border and padding
        // clientWidth/Height includes padding but not border or scrollbar
        const scrollbarVWidth = element.offsetWidth - element.clientWidth - (parseFloat(getComputedStyle(element).borderLeftWidth) || 0) - (parseFloat(getComputedStyle(element).borderRightWidth) || 0);
        const scrollbarHHeight = element.offsetHeight - element.clientHeight - (parseFloat(getComputedStyle(element).borderTopWidth) || 0) - (parseFloat(getComputedStyle(element).borderBottomWidth) || 0);

        const tolerance = 2; // Allow a small margin of error

        // Check if click is within the vertical scrollbar region (usually on the right)
        // It's right of the client area and within the element's offset width
        const isOverVerticalScrollbar = canScrollVertically &&
            scrollbarVWidth > tolerance && // Only check if scrollbar likely visible
            clickXRelative >= (element.clientWidth + (parseFloat(getComputedStyle(element).borderLeftWidth) || 0)) - tolerance &&
            clickXRelative <= element.offsetWidth + tolerance;

        // Check if click is within the horizontal scrollbar region (usually at the bottom)
        // It's below the client area and within the element's offset height
        const isOverHorizontalScrollbar = canScrollHorizontally &&
            scrollbarHHeight > tolerance && // Only check if scrollbar likely visible
            clickYRelative >= (element.clientHeight + (parseFloat(getComputedStyle(element).borderTopWidth) || 0)) - tolerance &&
            clickYRelative <= element.offsetHeight + tolerance;

        return isOverVerticalScrollbar || isOverHorizontalScrollbar;
    }
}
