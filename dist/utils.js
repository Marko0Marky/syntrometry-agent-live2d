// @ts-nocheck
// js/utils.ts
import * as tf from '@tensorflow/tfjs'; // Import TensorFlow
/**
 * Handles script loading errors and displays messages.
 */
export function handleScriptError(library, fallback, message) {
    console.error(`[Error] Failed to load ${library}. ${message || ''}`);
    displayError(`Failed to load library: ${library}. ${message || ''}`, true);
    if (fallback) {
        console.log(`[Fallback] Attempting to load fallback: ${fallback}`);
        const script = document.createElement('script');
        script.src = fallback;
        script.onerror = () => {
            console.error(`[Fallback Error] Fallback script ${fallback} also failed.`);
            displayError(`Fallback library ${library} also failed to load.`, true);
        };
        script.async = false; // Consider defer if needed
        document.head.appendChild(script);
    }
}
/**
 * Displays an error message in a specific container element.
 */
export function displayError(message, isCritical = false, elementId = 'error-message') {
    const errorPrefix = isCritical ? "[Critical Error] " : "[Error] ";
    console.error(errorPrefix + message);
    const errorDiv = document.getElementById(elementId);
    if (errorDiv) {
        if (!errorDiv.innerHTML.includes(message)) {
            const sanitizedMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            errorDiv.innerHTML += errorPrefix + sanitizedMessage + '<br>';
            errorDiv.style.display = 'block';
            errorDiv.scrollTop = errorDiv.scrollHeight;
        }
    }
    else {
        console.error("Target error message container not found:", elementId);
    }
}
/**
 * Creates an array of zeros with the specified shape
 * @param shape Either a single number or an array of dimensions
 * @returns An array filled with zeros
 */
export function zeros(shape) {
    if (typeof shape === 'number') {
        return new Array(shape).fill(0);
    }
    else if (Array.isArray(shape) && shape.length > 0) {
        return new Array(shape[0]).fill(0);
    }
    return [];
}
/**
 * Creates a TensorFlow.js tensor. Includes error handling.
 */
export function tensor(data, shape, dtype) {
    // tf is now imported, so check its methods
    if (typeof tf === 'undefined' || typeof tf.tensor !== 'function') {
        console.error("TensorFlow (tf) is undefined or not fully loaded in tensor()");
        return null;
    }
    try {
        if (data === undefined && shape === undefined) {
            console.error("Cannot create tensor: both data and shape are undefined.");
            return null;
        }
        if (data === undefined && shape !== undefined) {
            console.warn("Creating tensor with undefined data and shape:", shape, ". Using tf.zeros instead.");
            return tf.zeros(shape, dtype);
        }
        return tf.tensor(data, shape, dtype);
    }
    catch (e) { // Catch unknown type
        const message = e instanceof Error ? e.message : String(e);
        console.error(`TensorFlow Error creating tensor: ${message}`, { data_type: typeof data, shape, dtype });
        return null;
    }
}
/**
 * Clamps a numerical value between a minimum and maximum boundary.
 */
export function clamp(value, min, max) {
    // isFinite also checks for NaN
    if (!isFinite(value) || !isFinite(min) || !isFinite(max))
        return NaN;
    return Math.max(min, Math.min(max, value));
}
/**
 * Computes the L2 norm (Euclidean norm) of a numerical array.
 */
export function norm(arr) {
    if (!Array.isArray(arr) || arr.length === 0)
        return 0.0;
    let sumSq = 0;
    for (const val of arr) {
        if (typeof val === 'number' && isFinite(val)) {
            sumSq += val * val;
        }
        else {
            console.warn("[norm] Input array contains non-finite values. Result might be inaccurate.", arr);
            return 0.0; // Return 0 for now
        }
    }
    return Math.sqrt(sumSq);
}
/**
 * Linear interpolation (lerp) between two values.
 */
export function lerp(start, end, t) {
    if (!isFinite(start) || !isFinite(end) || !isFinite(t))
        return NaN;
    const clampedT = clamp(t, 0, 1);
    return start * (1 - clampedT) + end * clampedT;
}
/**
 * Appends a formatted message to the chat output display element.
 */
export function appendChatMessage(sender, message) {
    const chatOutput = document.getElementById('chat-output');
    if (!chatOutput) {
        console.warn("Chat output element not found.");
        return;
    }
    const shouldScroll = chatOutput.scrollTop + chatOutput.clientHeight >= chatOutput.scrollHeight - 30;
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message');
    const sanitizedSender = sender.replace(/</g, "<").replace(/>/g, ">");
    const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");
    messageDiv.classList.add(`sender-${sender.toLowerCase().replace(/\s+/g, '-')}`);
    // Use textContent for safety, or carefully construct innerHTML
    const strongEl = document.createElement('strong');
    strongEl.className = 'chat-sender';
    strongEl.textContent = `${sanitizedSender}: `;
    const spanEl = document.createElement('span');
    spanEl.className = 'chat-text';
    spanEl.textContent = sanitizedMessage;
    messageDiv.appendChild(strongEl);
    messageDiv.appendChild(spanEl);
    // Or using innerHTML (ensure sanitization is robust if complex HTML needed)
    // messageDiv.innerHTML = `<strong class="chat-sender">${sanitizedSender}:</strong> <span class="chat-text">${sanitizedMessage}</span>`;
    chatOutput.appendChild(messageDiv);
    if (shouldScroll) {
        try {
            chatOutput.scrollTo({ top: chatOutput.scrollHeight, behavior: 'smooth' });
        }
        catch (e) {
            chatOutput.scrollTop = chatOutput.scrollHeight;
        }
    }
}
/**
 * Logs a message with a timestamp to a timeline list UI element.
 */
export function logToTimeline(message, listId, maxItems = 20) {
    const list = document.getElementById(listId);
    if (!list) {
        console.warn(`Timeline list element "${listId}" not found.`);
        return;
    }
    const item = document.createElement('li');
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");
    item.innerHTML = `<span class="timeline-time">${timestamp}</span> ${sanitizedMessage}`;
    item.title = `${timestamp}: ${message}`;
    list.appendChild(item);
    while (list.children.length > maxItems) {
        if (list.firstChild) {
            list.removeChild(list.firstChild);
        }
        else {
            break; // Should not happen if children.length > 0
        }
    }
    try {
        list.scrollTo({ top: list.scrollHeight, behavior: 'auto' });
    }
    catch (e) {
        list.scrollTop = list.scrollHeight;
    }
}
/**
 * Displays the content of a tensor or array in a designated HTML <pre> element.
 * Handles disposed tensors and provides basic formatting.
 */
export function inspectTensor(data, elementId) {
    const el = document.getElementById(elementId);
    if (!el) {
        console.warn(`Inspector element "${elementId}" not found.`);
        return;
    }
    let outputContent = "";
    try {
        let dataSummary;
        let headerInfo = "";
        let status = "";
        if (data === null || data === undefined) {
            status = " (Null/Undefined)";
            dataSummary = "null";
            headerInfo = "Type: Null/Undefined";
        }
        else if (isTensor(data)) {
            // Now we can safely access tensor properties
            headerInfo = `Type: tf.Tensor | Shape: [${data.shape.join(', ')}] | Rank: ${data.rank} | DType: ${data.dtype}`;
            if (data.isDisposed) {
                status = " (Disposed)";
                dataSummary = "[Tensor Disposed]";
            }
            else {
                const size = data.size;
                headerInfo += ` | Size: ${size}`;
                const displayLimit = 50;
                if (size > displayLimit) {
                    // Example: Show slice (careful with multi-rank tensors)
                    const sliceShape = [...data.shape];
                    sliceShape[0] = Math.min(10, data.shape[0] || 10); // Limit first dim
                    try {
                        dataSummary = data.slice(Array(data.rank).fill(0), sliceShape).arraySync();
                    }
                    catch (e) {
                        dataSummary = "[Error slicing tensor]";
                    }
                }
                else {
                    try {
                        dataSummary = data.arraySync();
                    }
                    catch (e) {
                        dataSummary = "[Error accessing tensor data]";
                    }
                }
            }
        }
        else if (Array.isArray(data)) {
            headerInfo = `Type: Array | Length: ${data.length}`;
            const displayLimit = 50;
            dataSummary = data.slice(0, displayLimit);
            if (data.length > displayLimit)
                status += ` (Showing first ${displayLimit} elements)`;
        }
        else if (typeof data === 'number') {
            headerInfo = "Type: Number (Scalar)";
            dataSummary = data;
        }
        else if (typeof data === 'string') {
            headerInfo = `Type: String | Length: ${data.length}`;
            const displayLimit = 200;
            dataSummary = data.substring(0, displayLimit);
            if (data.length > displayLimit)
                status += ` (Showing first ${displayLimit} chars)`;
        }
        else {
            status = " (Unknown Type)";
            headerInfo = `Type: ${typeof data}`;
            try {
                dataSummary = JSON.stringify(data);
            }
            catch (e) {
                dataSummary = "[Cannot display value]";
            }
        }
        let formattedData;
        try {
            if (typeof dataSummary === 'number') {
                formattedData = dataSummary.toFixed ? dataSummary.toFixed(4) : String(dataSummary);
            }
            else if (Array.isArray(dataSummary) || typeof dataSummary === 'object') {
                formattedData = JSON.stringify(dataSummary, (key, value) => typeof value === 'number' && value.toFixed ? parseFloat(value.toFixed(4)) : value, 2);
                const maxLength = 1500;
                if (formattedData.length > maxLength) {
                    formattedData = formattedData.substring(0, maxLength) + "\n... (Truncated)";
                }
            }
            else {
                formattedData = String(dataSummary);
            }
        }
        catch (formatError) {
            console.error("Error formatting inspector data:", formatError);
            formattedData = "[Error formatting data]";
        }
        const separator = headerInfo || status ? '-'.repeat((headerInfo + status).length || 10) + '\n' : '';
        outputContent = `${headerInfo}${status}\n${separator}${formattedData}`;
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`Error inspecting data for element ${elementId}:`, e);
        outputContent = `Error inspecting data: ${message}`;
    }
    el.textContent = outputContent;
}
/**
 * Clamps all values in a numerical array between a minimum and maximum.
 */
export function clampArray(arr, min, max) {
    if (!Array.isArray(arr))
        return [];
    if (!isFinite(min) || !isFinite(max))
        return arr;
    return arr.map(x => (typeof x === 'number' ? clamp(x, min, max) : x)); // Assuming non-numbers should pass through?
}
/**
 * Computes the softmax function for an array, handling potential numeric issues.
 */
export function softmax(arr) {
    if (!Array.isArray(arr) || arr.length === 0)
        return [];
    const finiteArr = arr.filter(x => typeof x === 'number' && isFinite(x));
    if (finiteArr.length === 0)
        return zeros([arr.length]);
    const maxVal = Math.max(...finiteArr);
    const exps = finiteArr.map(x => Math.exp(x - maxVal));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    if (sumExps === 0 || !isFinite(sumExps)) {
        console.warn("[softmax] Sum of exponents is zero or non-finite. Returning uniform distribution over finite inputs.");
        const uniformProb = 1 / finiteArr.length;
        const result = zeros([arr.length]);
        let k = 0;
        for (let i = 0; i < arr.length; i++) {
            if (typeof arr[i] === 'number' && isFinite(arr[i])) {
                result[i] = uniformProb;
            }
        }
        return result;
    }
    const softmaxResult = zeros([arr.length]);
    let expIndex = 0;
    for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] === 'number' && isFinite(arr[i])) {
            softmaxResult[i] = exps[expIndex] / sumExps;
            expIndex++;
        }
    }
    return softmaxResult;
}
/**
 * Type guard to check if a value is a TensorFlow.js Tensor
 */
export function isTensor(value) {
    return value !== null &&
        typeof value === 'object' &&
        'shape' in value &&
        'rank' in value &&
        'dtype' in value &&
        typeof value.arraySync === 'function';
}
/**
 * Safely access tensor properties with type checking
 */
export function getTensorInfo(data) {
    if (!isTensor(data)) {
        return null;
    }
    return {
        shape: data.shape,
        rank: data.rank,
        dtype: data.dtype,
        size: data.size
    };
}
/**
 * Safely access cascade history data at a specific level
 * @param cascadeHistory The cascade history data
 * @param level The level to access (default: 0)
 * @returns The data at the specified level, or an empty array if not available
 */
export function getCascadeLevel(cascadeHistory, level = 0) {
    if (Array.isArray(cascadeHistory) &&
        cascadeHistory.length > level &&
        Array.isArray(cascadeHistory[level])) {
        return cascadeHistory[level];
    }
    return [];
}
//# sourceMappingURL=utils.js.map