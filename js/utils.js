// Utility functions here// js/utils.js

/**
 * Handles script loading errors and displays messages.
 * Note: A fallback handleScriptError is in index.html for very early failures.
 */
export function handleScriptError(library, fallback, message) {
    console.error(`[Error] Failed to load ${library}. ${message || ''}`);
    const errorDiv = document.getElementById('error-message'); // Assuming one central error div
    if (errorDiv) {
         errorDiv.innerHTML += `[Error] Failed to load ${library}. ${message || ''}<br>`;
         errorDiv.style.display = 'block';
    } else {
         console.error("Error message container not found.");
    }

    if (fallback) {
        console.log(`[Error] Attempting to load fallback: ${fallback}`);
        const script = document.createElement('script');
        script.src = fallback;
        script.onerror = () => console.error(`[Error] Fallback script ${fallback} also failed.`);
        document.head.appendChild(script);
    }
}

/**
 * Displays an error message in a specific container.
 * @param {string} message The error message.
 * @param {boolean} isCritical Whether this is a critical error.
 * @param {string} targetId The ID of the HTML element to display the error in.
 */
export function displayError(message, isCritical = false, targetId = 'error-message') {
    console.error(message);
    const errorDiv = document.getElementById(targetId);
     if (errorDiv) {
        errorDiv.innerHTML += message + '<br>';
        errorDiv.style.display = 'block';
     } else {
        console.error("Target error message container not found:", targetId);
     }

    // Critical error handling is managed in app.js
    if (isCritical) {
        // You might want to set a global flag or trigger an event here
        // For now, the app.js main loop checks a global criticalError flag.
    }
}


/**
 * Creates an array (or nested array) filled with zeros.
 * @param {number[]} shape Array representing the dimensions.
 * @returns {number|number[]|Array<number[]>} The zero-filled structure.
 */
export function zeros(shape) {
    if (!Array.isArray(shape) || shape.length === 0) return 0;
    if (shape.length === 1) return new Array(shape[0]).fill(0);
    return Array(shape[0]).fill(null).map(() => zeros(shape.slice(1)));
}

/**
 * Creates a TensorFlow.js tensor. Requires tf global.
 * @param {any} data The data to create the tensor from.
 * @param {number[]} shape The desired shape of the tensor.
 * @returns {tf.Tensor|null} The TensorFlow.js tensor or null if tf is not available or error occurs.
 */
export function tensor(data, shape) {
    if (typeof tf === 'undefined') {
        displayError("TensorFlow.js not loaded, cannot create tensor.", false);
        return null;
    }
    try {
        return tf.tensor(data, shape);
    } catch (e) {
        displayError(`TensorFlow Error creating tensor: ${e.message}`, false);
        return null;
    }
}


/**
 * Clamps a value between a minimum and maximum.
 * @param {number} value The value to clamp.
 * @param {number} min The minimum boundary.
 * @param {number} max The maximum boundary.
 * @returns {number} The clamped value.
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Clamps all values in an array between a minimum and maximum.
 * @param {number[]} arr The array to clamp.
 * @param {number} min The minimum boundary.
 * @param {number} max The maximum boundary.
 * @returns {number[]} The clamped array.
 */
export function clampArray(arr, min, max) {
    return arr.map(x => clamp(x, min, max));
}

/**
 * Computes the L2 norm (Euclidean norm) of an array.
 * @param {number[]} arr The array.
 * @returns {number} The L2 norm.
 */
export function norm(arr) {
    return Math.sqrt(arr.reduce((sum, x) => sum + x * x, 0));
}

/**
 * Computes the softmax function for an array.
 * @param {number[]} arr The array of values.
 * @returns {number[]} The array with softmax applied.
 */
export function softmax(arr) {
    const maxVal = Math.max(...arr);
    const exps = arr.map(x => Math.exp(x - maxVal));
    const sumExps = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sumExps);
}

/**
 * Linear interpolation between two values.
 * @param {number} start The start value.
 * @param {number} end The end value.
 * @param {number} t The interpolation factor (0 to 1).
 * @returns {number} The interpolated value.
 */
export function lerp(start, end, t) {
    return start + (end - start) * t;
}


/**
 * Appends a message to the chat output display.
 * @param {string} sender The name of the sender.
 * @param {string} message The message text.
 */
export function appendChatMessage(sender, message) {
    const chatOutput = document.getElementById('chat-output');
    if (!chatOutput) return;
    const messageDiv = document.createElement('div');
    messageDiv.innerHTML = `<b>${sender}:</b> ${message}`;
    chatOutput.appendChild(messageDiv);
    chatOutput.scrollTop = chatOutput.scrollHeight; // Auto-scroll to bottom
}
