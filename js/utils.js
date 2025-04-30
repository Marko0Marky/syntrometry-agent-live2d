// js/utils.js

// Assume tf is loaded globally via CDN and checked where used

/**
 * Handles script loading errors and displays messages in the main error div.
 * Note: A simpler fallback handleScriptError is in index.html for very early failures.
 */
export function handleScriptError(library, fallback, message) {
    console.error(`[Error] Failed to load ${library}. ${message || ''}`);
    // Use displayError to show the message in the designated area
    displayError(`Failed to load library: ${library}. ${message || ''}`, true); // Treat library load failure as potentially critical

    if (fallback) {
        console.log(`[Fallback] Attempting to load fallback: ${fallback}`);
        const script = document.createElement('script');
        script.src = fallback;
        script.onerror = () => {
             console.error(`[Fallback Error] Fallback script ${fallback} also failed.`);
             displayError(`Fallback library ${library} also failed to load.`, true);
        }
        script.async = false; // Try loading fallback synchronously? Might block. Defer might be better.
        document.head.appendChild(script);
    }
}

/**
 * Displays an error message in a specific container element.
 * @param {string} message The error message to display.
 * @param {boolean} [isCritical=false] If true, indicates a more severe error. (Currently mainly for logging distinction).
 * @param {string} [targetId='error-message'] The ID of the HTML element to display the error in.
 */
export function displayError(message, isCritical = false, targetId = 'error-message') {
    const errorPrefix = isCritical ? "[Critical Error] " : "[Error] ";
    console.error(errorPrefix + message); // Log to console regardless

    const errorDiv = document.getElementById(targetId);
     if (errorDiv) {
        // Basic check to prevent flooding with identical messages
        if (!errorDiv.innerHTML.includes(message)) {
             // Sanitize message before inserting as HTML
             const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");
             errorDiv.innerHTML += errorPrefix + sanitizedMessage + '<br>';
             errorDiv.style.display = 'block'; // Ensure visible
             errorDiv.scrollTop = errorDiv.scrollHeight; // Scroll to bottom
        }
     } else {
        console.error("Target error message container not found:", targetId);
     }
}


/**
 * Creates an array (or nested array) filled with zeros.
 * @param {number[]} shape Array representing the dimensions (e.g., [2, 3]).
 * @returns {number|number[]|Array<number[]>} The zero-filled structure. Returns 0 if shape is empty.
 */
export function zeros(shape) {
    if (!Array.isArray(shape) || shape.length === 0) {
         console.warn("[zeros] Invalid or empty shape provided. Returning 0.");
         return 0;
    }

    // Recursive function to build nested arrays
    const buildArray = (currentShape) => {
        if (currentShape.length === 1) {
            const len = Math.max(0, Math.floor(currentShape[0])); // Ensure non-negative integer length
             if (!isFinite(len)) { console.warn("[zeros] Invalid length in shape:", currentShape[0]); return []; }
            return new Array(len).fill(0);
        }
        const len = Math.max(0, Math.floor(currentShape[0]));
         if (!isFinite(len)) { console.warn("[zeros] Invalid length in shape:", currentShape[0]); return []; }
        const remainingShape = currentShape.slice(1);
        return Array(len).fill(null).map(() => buildArray(remainingShape));
    };

    return buildArray(shape);
}

/**
 * Creates a TensorFlow.js tensor. Requires tf global. Includes error handling.
 * @param {any} data The data to create the tensor from. Can be scalar, array, typed array.
 * @param {number[]} [shape] Optional. The desired shape of the tensor. If not provided, inferred from data.
 * @param {string} [dtype] Optional data type (e.g., 'float32', 'int32').
 * @returns {tf.Tensor|null} The TensorFlow.js tensor or null if tf is not available or an error occurs.
 */
export function tensor(data, shape, dtype) {
    if (typeof tf === 'undefined') {
        // displayError("TensorFlow.js (tf) not loaded, cannot create tensor.", false); // Can be noisy
        console.error("TensorFlow (tf) is undefined in tensor()");
        return null;
    }
    try {
        // Basic validation
        if (data === undefined && shape === undefined) {
             console.error("Cannot create tensor: both data and shape are undefined.");
             return null;
        }
        // tf.tensor can often handle undefined data if shape is provided (creates uninitialized tensor),
        // but explicitly creating zeros might be safer if that's the intent.
        if (data === undefined && shape !== undefined) {
            console.warn("Creating tensor with undefined data and shape:", shape, ". Using tf.zeros instead.");
            return tf.zeros(shape, dtype);
        }

        return tf.tensor(data, shape, dtype);

    } catch (e) {
        console.error(`TensorFlow Error creating tensor: ${e.message}`, { data_type: typeof data, shape, dtype });
        // Avoid flooding UI with TF errors unless critical
        // displayError(`TF Error creating tensor: ${e.message}`, false);
        return null;
    }
}


/**
 * Clamps a numerical value between a minimum and maximum boundary.
 * @param {number} value The value to clamp.
 * @param {number} min The minimum allowed value.
 * @param {number} max The maximum allowed value.
 * @returns {number} The clamped value. Returns NaN if inputs are not numbers.
 */
export function clamp(value, min, max) {
     if (typeof value !== 'number' || typeof min !== 'number' || typeof max !== 'number') return NaN;
    return Math.max(min, Math.min(max, value));
}

/**
 * Computes the L2 norm (Euclidean norm) of a numerical array.
 * @param {number[]} arr The array of numbers.
 * @returns {number} The L2 norm. Returns 0 for non-arrays, empty arrays, or arrays with non-finite values.
 */
export function norm(arr) {
     if (!Array.isArray(arr) || arr.length === 0) return 0.0;
     let sumSq = 0;
     for (const val of arr) {
         if (typeof val === 'number' && isFinite(val)) {
             sumSq += val * val;
         } else {
              // If any value is non-numeric or non-finite, the norm is arguably undefined or should be handled.
              // Returning 0 might be misleading. Consider NaN or throwing an error depending on use case.
              console.warn("[norm] Input array contains non-finite values. Result might be inaccurate.", arr);
              return 0.0; // Return 0 for now to avoid breaking calculations
         }
     }
    return Math.sqrt(sumSq);
}

/**
 * Linear interpolation (lerp) between two values.
 * @param {number} start The starting value.
 * @param {number} end The ending value.
 * @param {number} t The interpolation factor (progress), clamped between 0 and 1.
 * @returns {number} The interpolated value. Returns NaN if inputs are not numbers.
 */
export function lerp(start, end, t) {
     if (typeof start !== 'number' || typeof end !== 'number' || typeof t !== 'number') return NaN;
     const clampedT = clamp(t, 0, 1);
    return start * (1 - clampedT) + end * clampedT;
}


/**
 * Appends a formatted message to the chat output display element.
 * @param {string} sender The name of the sender (e.g., 'You', 'System', 'Agent').
 * @param {string} message The message text.
 */
export function appendChatMessage(sender, message) {
    const chatOutput = document.getElementById('chat-output');
    if (!chatOutput) {
         console.warn("Chat output element not found.");
         return;
    }

    // Check if user is scrolled near the bottom before appending new message
    const shouldScroll = chatOutput.scrollTop + chatOutput.clientHeight >= chatOutput.scrollHeight - 30; // Threshold for auto-scroll

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message'); // Add class for potential styling

    // Basic sanitization: Replace HTML tags to prevent injection
    const sanitizedSender = sender.replace(/</g, "<").replace(/>/g, ">");
    const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");

    // Use classList for sender type styling if needed
    messageDiv.classList.add(`sender-${sender.toLowerCase().replace(/\s+/g, '-')}`);

    messageDiv.innerHTML = `<strong class="chat-sender">${sanitizedSender}:</strong> <span class="chat-text">${sanitizedMessage}</span>`;
    chatOutput.appendChild(messageDiv);

    // Auto-scroll to bottom only if the user was already near the bottom
    if(shouldScroll) {
        // Use smooth scroll if available, fallback to direct assignment
        try { chatOutput.scrollTo({ top: chatOutput.scrollHeight, behavior: 'smooth' }); }
        catch(e) { chatOutput.scrollTop = chatOutput.scrollHeight; }
    }
}

/**
 * Logs a message with a timestamp to a timeline list UI element.
 * @param {string} message The message to log.
 * @param {string} listId The ID of the UL element for the timeline.
 * @param {number} [maxItems=20] Maximum number of items to keep in the timeline.
 */
export function logToTimeline(message, listId, maxItems = 20) { // Increased default max items
    const list = document.getElementById(listId);
    if (!list) {
         console.warn(`Timeline list element "${listId}" not found.`);
         return;
    }

    const item = document.createElement('li');
    // More concise timestamp
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Basic sanitization
    const sanitizedMessage = message.replace(/</g, "<").replace(/>/g, ">");
    item.innerHTML = `<span class="timeline-time">${timestamp}</span> ${sanitizedMessage}`;
    item.title = `${timestamp}: ${message}`; // Full message on hover

    // Prepend new items to the top for chronological order (newest first)
    // list.insertBefore(item, list.firstChild);
    // OR Append to bottom (more conventional log)
     list.appendChild(item);


    // Limit the number of items for performance and UI clarity
    while (list.children.length > maxItems) {
        // Remove oldest item (first child if prepending, last child if appending)
        // list.removeChild(list.lastChild); // If prepending
         list.removeChild(list.firstChild); // If appending
    }

     // Scroll to bottom if appending
     try { list.scrollTo({ top: list.scrollHeight, behavior: 'auto' }); } // Use auto for faster scroll in logs
     catch(e) { list.scrollTop = list.scrollHeight; }
}


/**
 * Displays the content of a tensor or array in a designated HTML <pre> element.
 * Handles disposed tensors and provides basic formatting.
 * @param {tf.Tensor | number[] | number | string | null | undefined} data The tensor, array, or other data to inspect.
 * @param {string} elementId The ID of the HTML <pre> element to display the content in.
 */
export function inspectTensor(data, elementId) {
    const el = document.getElementById(elementId);
    if (!el) {
        console.warn(`Inspector element "${elementId}" not found.`);
        return;
    }

    let outputContent = ""; // Build the string to display

    try {
        let dataSummary;
        let headerInfo = "";
        let status = "";

        if (data === null || data === undefined) {
            status = " (Null/Undefined)";
            dataSummary = "null";
            headerInfo = "Type: Null/Undefined";
        } else if (data instanceof tf.Tensor) {
            headerInfo = `Type: tf.Tensor | Shape: [${data.shape.join(', ')}] | Rank: ${data.rank} | DType: ${data.dtype}`;
            if (data.isDisposed) {
                status = " (Disposed)";
                dataSummary = "[Tensor Disposed]";
            } else {
                const size = data.size;
                headerInfo += ` | Size: ${size}`;
                // For large tensors, show summary/slice
                const displayLimit = 50; // Max elements to display fully
                if (size > displayLimit) {
                    // Example: Show slice of the first dimension
                    const sliceSize = Math.min(10, data.shape[0] || 10);
                    dataSummary = data.slice(0, sliceSize).arraySync(); // Slice first dimension
                    status += ` (Showing first ${sliceSize} element(s))`;
                } else {
                    dataSummary = data.arraySync(); // Show full data
                }
            }
        } else if (Array.isArray(data)) {
             headerInfo = `Type: Array | Length: ${data.length}`;
             const displayLimit = 50;
             dataSummary = data.slice(0, displayLimit); // Show first elements
             if(data.length > displayLimit) status += ` (Showing first ${displayLimit} elements)`;
        } else if (typeof data === 'number') {
             headerInfo = "Type: Number (Scalar)";
             dataSummary = data;
        } else if (typeof data === 'string') {
             headerInfo = `Type: String | Length: ${data.length}`;
             const displayLimit = 200;
             dataSummary = data.substring(0, displayLimit);
              if(data.length > displayLimit) status += ` (Showing first ${displayLimit} chars)`;
        } else {
             status = " (Unknown Type)";
             headerInfo = `Type: ${typeof data}`;
             try { dataSummary = JSON.stringify(data); } // Try to stringify unknown types
             catch (e) { dataSummary = "[Cannot display value]"; }
        }

        // Format the data summary for display
        let formattedData;
        try {
             if (typeof dataSummary === 'number') {
                 formattedData = dataSummary.toFixed ? dataSummary.toFixed(4) : String(dataSummary);
             } else if (Array.isArray(dataSummary) || typeof dataSummary === 'object') {
                 // Pretty print array/object, formatting numbers
                 formattedData = JSON.stringify(dataSummary, (key, value) =>
                     typeof value === 'number' && value.toFixed ? parseFloat(value.toFixed(4)) : value,
                 2); // Indent with 2 spaces
                 // Limit overall string length for display
                 const maxLength = 1500;
                 if (formattedData.length > maxLength) {
                     formattedData = formattedData.substring(0, maxLength) + "\n... (Truncated)";
                 }
             } else {
                 formattedData = String(dataSummary); // Fallback to string
             }
        } catch(formatError) {
             console.error("Error formatting inspector data:", formatError);
             formattedData = "[Error formatting data]";
        }

        outputContent = `${headerInfo}${status}\n${'-'.repeat(headerInfo.length + status.length)}\n${formattedData}`;

    } catch (e) {
        console.error(`Error inspecting data for element ${elementId}:`, e);
        outputContent = `Error inspecting data: ${e.message}`;
    }

    // Update the <pre> element content
    el.textContent = outputContent;
}

// --- Add clampArray and softmax if they were used ---
// (They weren't explicitly used in the provided app.js/agent.js,
// but are generally useful math functions)

/**
 * Clamps all values in a numerical array between a minimum and maximum.
 * @param {number[]} arr The array to clamp.
 * @param {number} min The minimum boundary.
 * @param {number} max The maximum boundary.
 * @returns {number[]} The clamped array. Returns empty array if input invalid.
 */
export function clampArray(arr, min, max) {
     if (!Array.isArray(arr)) return [];
     if (typeof min !== 'number' || typeof max !== 'number') return arr; // Return original if bounds invalid
    return arr.map(x => (typeof x === 'number' ? clamp(x, min, max) : x)); // Clamp only numbers
}

/**
 * Computes the softmax function for an array, handling potential numeric issues.
 * Converts logits/scores into probabilities that sum to 1.
 * @param {number[]} arr The array of raw scores/logits.
 * @returns {number[]} The array with softmax applied. Returns array of zeros if input invalid or results are unstable.
 */
export function softmax(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return [];

    // Filter out non-finite numbers first
    const finiteArr = arr.filter(x => typeof x === 'number' && isFinite(x));
    if (finiteArr.length === 0) return zeros([arr.length]); // Return zeros if no valid numbers

    // Subtract max for numeric stability (prevents large exponents)
    const maxVal = Math.max(...finiteArr);
    const exps = finiteArr.map(x => Math.exp(x - maxVal));
    const sumExps = exps.reduce((a, b) => a + b, 0);

    // Handle edge case where sum is zero or infinite (e.g., all inputs were -Infinity or overflow)
    if (sumExps === 0 || !isFinite(sumExps)) {
        console.warn("[softmax] Sum of exponents is zero or non-finite. Returning uniform distribution over finite inputs.");
        const uniformProb = 1 / finiteArr.length;
        const result = zeros([arr.length]);
        let k = 0;
        for(let i = 0; i < arr.length; i++){
            if(typeof arr[i] === 'number' && isFinite(arr[i])){
                result[i] = uniformProb; // Assign uniform probability to original positions of finite numbers
            }
        }
        return result;
    }

    // Map results back to the original array structure, inserting probabilities
    const softmaxResult = zeros([arr.length]); // Initialize with zeros
    let expIndex = 0;
    for(let i=0; i<arr.length; i++) {
        if(typeof arr[i] === 'number' && isFinite(arr[i])) {
            softmaxResult[i] = exps[expIndex] / sumExps; // Calculate probability
            expIndex++;
        }
        // Non-finite inputs remain zero probability
    }
    return softmaxResult;
}
