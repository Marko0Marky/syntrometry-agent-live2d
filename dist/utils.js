// js/utils.js
// General utility functions, independent of TensorFlow.js

/**
 * Displays an error message in a specific container element.
 * Appends the message if the container already has content.
 * @param {string} message The error message to display.
 * @param {boolean} [isCritical=false] If true, indicates a more severe error.
 * @param {string} [targetId='error-message'] The ID of the HTML element to display the error in.
 */
export function displayError(message, isCritical = false, targetId = 'error-message') {
    const errorPrefix = isCritical ? "[Critical Error] " : "[Error] ";
    console.error(errorPrefix + message); // Log to console regardless

    try {
        const errorDiv = document.getElementById(targetId);
        if (errorDiv) {
            // Basic check to prevent flooding with identical messages rapidly
            if (!errorDiv.innerHTML.includes(message)) {
                // Sanitize message before inserting as HTML
                const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");
                const newErrorLine = document.createElement('div');
                newErrorLine.innerHTML = errorPrefix + sanitizedMessage; // Use innerHTML for the prefix bolding/styling via CSS potentially
                errorDiv.appendChild(newErrorLine);
                errorDiv.style.display = 'block'; // Ensure visible
                errorDiv.scrollTop = errorDiv.scrollHeight; // Scroll to bottom
            }
        } else {
            console.error(`Target error message container not found: #${targetId}`);
        }
    } catch (e) {
        console.error("Error displaying error message in UI:", e);
    }
}

/**
 * Creates an array filled with zeros.
 * @param {number} length The desired length of the array.
 * @returns {number[]} The zero-filled array. Returns empty array for invalid length.
 */
export function zeros(length) {
    if (typeof length !== 'number' || !isFinite(length) || length < 0) {
        console.warn(`[zeros] Invalid length provided: ${length}. Returning empty array.`);
        return [];
    }
    return new Array(Math.floor(length)).fill(0);
}

/**
 * Clamps a numerical value between a minimum and maximum boundary.
 * @param {number} value The value to clamp.
 * @param {number} min The minimum allowed value.
 * @param {number} max The maximum allowed value.
 * @returns {number} The clamped value. Returns NaN if inputs are not finite numbers.
 */
export function clamp(value, min, max) {
    if (!isFinite(value) || !isFinite(min) || !isFinite(max)) {
        // console.warn(`[clamp] Received non-finite value(s): value=${value}, min=${min}, max=${max}. Returning NaN.`);
        return NaN; // Return NaN for non-finite inputs
    }
    return Math.max(min, Math.min(max, value));
}

/**
 * Computes the L2 norm (Euclidean norm) of a numerical array.
 * @param {Array<number> | Float32Array | Int32Array | Uint8Array | null | undefined} arr The array-like object of numbers.
 * @returns {number} The L2 norm. Returns 0 for non-arrays, empty arrays, or arrays with non-finite values.
 */
export function norm(arr) {
    if (!arr || typeof arr !== 'object' || typeof arr.length !== 'number' || arr.length === 0) {
        return 0.0;
    }
    let sumSq = 0;
    let valid = true;
    for (let i = 0; i < arr.length; i++) {
        const val = arr[i];
        if (typeof val === 'number' && isFinite(val)) {
            sumSq += val * val;
        } else {
            // console.warn("[norm] Input array contains non-finite values. Returning 0.", arr);
            valid = false;
            break; // Exit early if invalid value found
        }
    }
    return valid ? Math.sqrt(sumSq) : 0.0; // Return 0 if any value was invalid
}


/**
 * Linear interpolation (lerp) between two values.
 * @param {number} start The starting value.
 * @param {number} end The ending value.
 * @param {number} t The interpolation factor (progress), clamped between 0 and 1.
 * @returns {number} The interpolated value. Returns NaN if inputs are not finite numbers.
 */
export function lerp(start, end, t) {
    if (!isFinite(start) || !isFinite(end) || !isFinite(t)) {
        // console.warn(`[lerp] Received non-finite value(s): start=${start}, end=${end}, t=${t}. Returning NaN.`);
        return NaN;
    }
    const clampedT = clamp(t, 0, 1);
    return start * (1 - clampedT) + end * clampedT;
}

/**
 * Appends a formatted message to the chat output display element.
 * @param {string} sender The name of the sender (e.g., 'You', 'System', 'Agent').
 * @param {string} message The message text.
 */
export function appendChatMessage(sender, message) {
    try {
        const chatOutput = document.getElementById('chat-output');
        if (!chatOutput) {
            console.warn("Chat output element (#chat-output) not found.");
            return;
        }

        const shouldScroll = chatOutput.scrollTop + chatOutput.clientHeight >= chatOutput.scrollHeight - 30;

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message');
        const sanitizedSender = sender.replace(/</g, "<").replace(/>/g, ">");
        const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");
        messageDiv.classList.add(`sender-${sender.toLowerCase().replace(/[^a-z0-9]/g, '-')}`); // Sanitize class name

        // Use textContent for safety against XSS
        const strongEl = document.createElement('strong');
        strongEl.className = 'chat-sender';
        strongEl.textContent = `${sanitizedSender}: `;
        const spanEl = document.createElement('span');
        spanEl.className = 'chat-text';
        spanEl.textContent = sanitizedMessage;
        messageDiv.appendChild(strongEl);
        messageDiv.appendChild(spanEl);

        chatOutput.appendChild(messageDiv);

        if (shouldScroll) {
            // Use smooth scroll if available, fallback to direct assignment
            try { chatOutput.scrollTo({ top: chatOutput.scrollHeight, behavior: 'smooth' }); }
            catch (e) { chatOutput.scrollTop = chatOutput.scrollHeight; }
        }
    } catch (e) {
        console.error("Error appending chat message:", e);
    }
}

/**
 * Logs a message with a timestamp to a timeline list UI element.
 * @param {string} message The message to log.
 * @param {string} [listId='expressions-list'] The ID of the UL element for the timeline.
 * @param {number} [maxItems=30] Maximum number of items to keep in the timeline.
 */
export function logToTimeline(message, listId = 'expressions-list', maxItems = 30) {
    try {
        const list = document.getElementById(listId);
        if (!list) {
            // console.warn(`Timeline list element "#${listId}" not found.`); // Reduce noise
            return;
        }

        const item = document.createElement('li');
        const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");

        item.innerHTML = `<span class="timeline-time">${timestamp}</span> ${sanitizedMessage}`;
        item.title = `${timestamp}: ${message}`; // Full message on hover
        list.appendChild(item); // Append to bottom

        while (list.children.length > maxItems) {
            list.removeChild(list.firstChild); // Remove oldest from top
        }

        // Scroll to bottom
        try { list.scrollTo({ top: list.scrollHeight, behavior: 'auto' }); }
        catch (e) { list.scrollTop = list.scrollHeight; }
    } catch (e) {
        console.error("Error logging to timeline:", e);
    }
}


/**
 * Displays the content of a tensor or other data in a designated HTML <pre> element.
 * Handles tensors, arrays, numbers, strings, and basic objects.
 * @param {tf.Tensor | Array<any> | number | string | object | null | undefined} data - The data to inspect.
 * @param {string} elementId - The ID of the HTML `<pre>` element.
 */
export function inspectTensor(data, elementId) {
    try {
        const el = document.getElementById(elementId);
        if (!el) {
            console.warn(`Inspector element "#${elementId}" not found.`);
            return;
        }

        let outputContent = "";
        let headerInfo = "";
        let dataSummary = "";
        let status = "";

        if (data === null || data === undefined) {
            headerInfo = "Type: Null/Undefined";
            dataSummary = "null";
        } else if (data instanceof tf.Tensor) {
            headerInfo = `Type: tf.Tensor | Shape: [${data.shape.join(', ')}] | Rank: ${data.rank} | DType: ${data.dtype}`;
            if (data.isDisposed) {
                status = " (Disposed)";
                dataSummary = "[Tensor Disposed]";
            } else {
                try {
                    headerInfo += ` | Size: ${data.size}`;
                    const displayLimit = 50;
                    if (data.size > displayLimit) {
                        // Show a slice for larger tensors (might need adjustment for high ranks)
                        const sliceSize = Array(data.rank).fill(0);
                        const sliceShape = [...data.shape];
                        sliceShape[0] = Math.min(sliceShape[0] ?? 10, 10); // Limit first dim
                        dataSummary = data.slice(sliceSize, sliceShape).arraySync();
                        status = ` (Showing slice [${sliceShape.join(', ')}])`;
                    } else {
                        dataSummary = data.arraySync();
                    }
                } catch (e) {
                    console.error("Error accessing tensor data for inspection:", e);
                    dataSummary = "[Error accessing tensor data]";
                    status = " (Error)";
                }
            }
        } else if (Array.isArray(data)) {
            headerInfo = `Type: Array | Length: ${data.length}`;
            const displayLimit = 50;
            dataSummary = data.slice(0, displayLimit);
            if (data.length > displayLimit) status = ` (Showing first ${displayLimit} elements)`;
        } else if (typeof data === 'number') {
            headerInfo = "Type: Number";
            dataSummary = data;
        } else if (typeof data === 'string') {
            headerInfo = `Type: String | Length: ${data.length}`;
            const displayLimit = 200;
            dataSummary = data.substring(0, displayLimit);
            if (data.length > displayLimit) status = ` (Showing first ${displayLimit} chars)`;
        } else if (typeof data === 'object') {
            headerInfo = `Type: Object`;
            try { dataSummary = data; } catch (e) { dataSummary = "[Cannot display object]"; }
        } else {
            headerInfo = `Type: ${typeof data}`;
            dataSummary = String(data);
        }

        // Format the data summary for display
        let formattedData;
        try {
            if (typeof dataSummary === 'number') {
                formattedData = isFinite(dataSummary) ? dataSummary.toPrecision(5) : String(dataSummary);
            } else if (Array.isArray(dataSummary) || typeof dataSummary === 'object') {
                formattedData = JSON.stringify(dataSummary, (key, value) =>
                    typeof value === 'number' && isFinite(value) ? parseFloat(value.toPrecision(5)) : value,
                2); // Pretty print with indentation and number formatting
                const maxLength = 1500; // Limit output length
                if (formattedData.length > maxLength) {
                    formattedData = formattedData.substring(0, maxLength) + "\n... (Truncated)";
                }
            } else {
                formattedData = String(dataSummary); // Fallback
            }
        } catch (formatError) {
            console.error("Error formatting inspector data:", formatError);
            formattedData = "[Error formatting data]";
        }

        // Combine header and data for final output
        const separator = headerInfo || status ? '-'.repeat(Math.max(10, (headerInfo + status).length)) + '\n' : '';
        outputContent = `${headerInfo}${status}\n${separator}${formattedData}`;
        el.textContent = outputContent;

    } catch (e) {
        console.error(`Error inspecting data for element ${elementId}:`, e);
        const el = document.getElementById(elementId);
        if (el) el.textContent = `Error inspecting data: ${e.message}`;
    }
}