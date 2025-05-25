// js/utils.js

// Assume tf is loaded globally via CDN and checked where used

// Cache for DOM elements to avoid repeated lookups
const elementCache = new Map();

/**
 * Gets a DOM element by ID with caching for performance
 * @param {string} id - The element ID
 * @returns {HTMLElement|null} The DOM element or null if not found
 */
function getCachedElement(id) {
    if (elementCache.has(id)) {
        const element = elementCache.get(id);
        // Verify element is still in DOM
        if (document.contains(element)) {
            return element;
        }
        elementCache.delete(id);
    }
    
    const element = document.getElementById(id);
    if (element) {
        elementCache.set(id, element);
    }
    return element;
}

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param {string} content - Content to sanitize
 * @returns {string} Sanitized content
 */
function sanitizeHTML(content) {
    if (typeof content !== 'string') return '';
    return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * Validates if a value is a finite number
 * @param {any} value - Value to check
 * @returns {boolean} True if value is a finite number
 */
function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
}

/**
 * Handles script loading errors and displays messages in the main error div.
 * Note: A simpler fallback handleScriptError is in index.html for very early failures.
 * @param {string} library - Name of the library that failed to load
 * @param {string} [fallback] - Optional fallback URL to try
 * @param {string} [message] - Optional additional error message
 */
export function handleScriptError(library, fallback, message) {
    const errorMsg = `Failed to load ${library}. ${message || ''}`;
    console.error(`[Error] ${errorMsg}`);
    displayError(`Failed to load library: ${library}. ${message || ''}`, true);

    if (fallback) {
        console.log(`[Fallback] Attempting to load fallback: ${fallback}`);
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = fallback;
            script.async = true; // Use async for better performance
            script.defer = true;  // Defer execution
            
            script.onload = () => {
                console.log(`[Fallback Success] ${library} loaded successfully`);
                resolve();
            };
            
            script.onerror = () => {
                const fallbackError = `Fallback library ${library} also failed to load.`;
                console.error(`[Fallback Error] ${fallbackError}`);
                displayError(fallbackError, true);
                reject(new Error(fallbackError));
            };
            
            document.head.appendChild(script);
        });
    }
    
    return Promise.reject(new Error(errorMsg));
}

/**
 * Displays an error message in a specific container element.
 * @param {string} message - The error message to display
 * @param {boolean} [isCritical=false] - If true, indicates a more severe error
 * @param {string} [targetId='error-message'] - The ID of the HTML element to display the error in
 */
export function displayError(message, isCritical = false, targetId = 'error-message') {
    const errorPrefix = isCritical ? "[Critical Error] " : "[Error] ";
    const fullMessage = errorPrefix + message;
    
    console.error(fullMessage);

    const errorDiv = getCachedElement(targetId);
    if (errorDiv) {
        // Use Set to track unique messages more efficiently
        if (!errorDiv.dataset.messages) {
            errorDiv.dataset.messages = JSON.stringify(new Set());
        }
        
        const existingMessages = new Set(JSON.parse(errorDiv.dataset.messages));
        
        if (!existingMessages.has(message)) {
            existingMessages.add(message);
            errorDiv.dataset.messages = JSON.stringify([...existingMessages]);
            
            const sanitizedMessage = sanitizeHTML(fullMessage);
            const messageElement = document.createElement('div');
            messageElement.className = `error-item ${isCritical ? 'critical' : 'standard'}`;
            messageElement.innerHTML = sanitizedMessage;
            
            errorDiv.appendChild(messageElement);
            errorDiv.style.display = 'block';
            errorDiv.scrollTop = errorDiv.scrollHeight;
        }
    } else {
        console.error("Target error message container not found:", targetId);
    }
}

/**
 * Creates an array (or nested array) filled with zeros.
 * @param {number[]} shape - Array representing the dimensions (e.g., [2, 3])
 * @returns {number|number[]|Array<number[]>} The zero-filled structure
 */
export function zeros(shape) {
    if (!Array.isArray(shape) || shape.length === 0) {
        console.warn("[zeros] Invalid or empty shape provided. Returning 0.");
        return 0;
    }

    // Validate all dimensions are positive integers
    for (let i = 0; i < shape.length; i++) {
        const dim = shape[i];
        if (!isFiniteNumber(dim) || dim < 0 || !Number.isInteger(dim)) {
            console.warn(`[zeros] Invalid dimension at index ${i}: ${dim}`);
            return [];
        }
    }

    const buildArray = (currentShape) => {
        if (currentShape.length === 1) {
            return new Array(currentShape[0]).fill(0);
        }
        
        const [firstDim, ...remainingShape] = currentShape;
        return Array.from({ length: firstDim }, () => buildArray(remainingShape));
    };

    return buildArray(shape);
}

/**
 * Creates a TensorFlow.js tensor with enhanced error handling and validation.
 * @param {any} data - The data to create the tensor from
 * @param {number[]} [shape] - Optional shape of the tensor
 * @param {string} [dtype='float32'] - Optional data type
 * @returns {tf.Tensor|null} The TensorFlow.js tensor or null if creation fails
 */
export function tensor(data, shape, dtype = 'float32') {
    if (typeof tf === 'undefined') {
        console.error("TensorFlow (tf) is undefined in tensor()");
        return null;
    }
    
    try {
        // Enhanced validation
        if (data === undefined && shape === undefined) {
            console.error("Cannot create tensor: both data and shape are undefined.");
            return null;
        }
        
        // Validate shape if provided
        if (shape && (!Array.isArray(shape) || shape.some(dim => !isFiniteNumber(dim) || dim < 0))) {
            console.error("Invalid shape provided:", shape);
            return null;
        }
        
        // Create tensor with undefined data using zeros
        if (data === undefined && shape !== undefined) {
            return tf.zeros(shape, dtype);
        }
        
        // Validate data type compatibility
        if (Array.isArray(data)) {
            const flatData = data.flat(Infinity);
            if (flatData.some(val => val !== null && val !== undefined && !isFiniteNumber(val))) {
                console.warn("Data contains non-numeric values, tensor creation may fail");
            }
        }

        return tf.tensor(data, shape, dtype);

    } catch (error) {
        const errorDetails = {
            message: error.message,
            dataType: typeof data,
            dataShape: Array.isArray(data) ? `Array[${data.length}]` : 'Not Array',
            shape,
            dtype
        };
        
        console.error("TensorFlow Error creating tensor:", errorDetails);
        return null;
    }
}

/**
 * Clamps a numerical value between a minimum and maximum boundary.
 * @param {number} value - The value to clamp
 * @param {number} min - The minimum allowed value
 * @param {number} max - The maximum allowed value
 * @returns {number} The clamped value
 */
export function clamp(value, min, max) {
    if (!isFiniteNumber(value) || !isFiniteNumber(min) || !isFiniteNumber(max)) {
        console.warn("[clamp] Non-finite input values:", { value, min, max });
        return NaN;
    }
    
    if (min > max) {
        console.warn("[clamp] min is greater than max, swapping values");
        [min, max] = [max, min];
    }
    
    return Math.max(min, Math.min(max, value));
}

/**
 * Computes the L2 norm (Euclidean norm) of a numerical array.
 * @param {number[]} arr - The array of numbers
 * @returns {number} The L2 norm
 */
export function norm(arr) {
    if (!Array.isArray(arr) || arr.length === 0) {
        return 0.0;
    }
    
    let sumSq = 0;
    let validCount = 0;
    
    for (const val of arr) {
        if (isFiniteNumber(val)) {
            sumSq += val * val;
            validCount++;
        }
    }
    
    if (validCount === 0) {
        console.warn("[norm] No valid finite numbers found in array");
        return 0.0;
    }
    
    if (validCount !== arr.length) {
        console.warn(`[norm] ${arr.length - validCount} non-finite values ignored`);
    }
    
    return Math.sqrt(sumSq);
}

/**
 * Linear interpolation (lerp) between two values.
 * @param {number} start - The starting value
 * @param {number} end - The ending value
 * @param {number} t - The interpolation factor (0-1)
 * @param {boolean} [clampT=true] - Whether to clamp t between 0 and 1
 * @returns {number} The interpolated value
 */
export function lerp(start, end, t, clampT = true) {
    if (!isFiniteNumber(start) || !isFiniteNumber(end) || !isFiniteNumber(t)) {
        console.warn("[lerp] Non-finite input values:", { start, end, t });
        return NaN;
    }
    
    const factor = clampT ? clamp(t, 0, 1) : t;
    return start + factor * (end - start); // More numerically stable than start * (1 - t) + end * t
}

/**
 * Appends a formatted message to the chat output display element.
 * @param {string} sender - The name of the sender
 * @param {string} message - The message text
 * @param {Object} [options] - Additional options
 * @param {string} [options.targetId='chat-output'] - Target element ID
 * @param {boolean} [options.autoScroll=true] - Whether to auto-scroll
 * @param {string} [options.messageClass=''] - Additional CSS class for the message
 */
export function appendChatMessage(sender, message, options = {}) {
    const {
        targetId = 'chat-output',
        autoScroll = true,
        messageClass = ''
    } = options;
    
    const chatOutput = getCachedElement(targetId);
    if (!chatOutput) {
        console.warn(`Chat output element "${targetId}" not found.`);
        return;
    }

    // Check scroll position before adding message
    const shouldScroll = autoScroll && (
        chatOutput.scrollTop + chatOutput.clientHeight >= chatOutput.scrollHeight - 30
    );

    // Create message container
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message sender-${sender.toLowerCase().replace(/\s+/g, '-')} ${messageClass}`.trim();

    // Create message content with better structure
    const senderSpan = document.createElement('strong');
    senderSpan.className = 'chat-sender';
    senderSpan.textContent = sender + ':';

    const messageSpan = document.createElement('span');
    messageSpan.className = 'chat-text';
    messageSpan.textContent = message;

    messageDiv.appendChild(senderSpan);
    messageDiv.appendChild(document.createTextNode(' '));
    messageDiv.appendChild(messageSpan);

    // Add timestamp as data attribute for potential styling/sorting
    messageDiv.dataset.timestamp = Date.now().toString();

    chatOutput.appendChild(messageDiv);

    // Auto-scroll with smooth behavior
    if (shouldScroll) {
        requestAnimationFrame(() => {
            try {
                chatOutput.scrollTo({ 
                    top: chatOutput.scrollHeight, 
                    behavior: 'smooth' 
                });
            } catch (e) {
                chatOutput.scrollTop = chatOutput.scrollHeight;
            }
        });
    }
}

/**
 * Logs a message with a timestamp to a timeline list UI element.
 * @param {string} message - The message to log
 * @param {string} listId - The ID of the UL element for the timeline
 * @param {Object} [options] - Additional options
 * @param {number} [options.maxItems=20] - Maximum number of items to keep
 * @param {boolean} [options.showMilliseconds=false] - Include milliseconds in timestamp
 */
export function logToTimeline(message, listId, options = {}) {
    const { maxItems = 20, showMilliseconds = false } = options;
    
    const list = getCachedElement(listId);
    if (!list) {
        console.warn(`Timeline list element "${listId}" not found.`);
        return;
    }

    const item = document.createElement('li');
    item.className = 'timeline-item';
    
    const now = new Date();
    const timeOptions = { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
    };
    
    let timestamp = now.toLocaleTimeString([], timeOptions);
    if (showMilliseconds) {
        timestamp += `.${now.getMilliseconds().toString().padStart(3, '0')}`;
    }

    const timeSpan = document.createElement('span');
    timeSpan.className = 'timeline-time';
    timeSpan.textContent = timestamp;

    const messageSpan = document.createElement('span');
    messageSpan.className = 'timeline-message';
    messageSpan.textContent = message;

    item.appendChild(timeSpan);
    item.appendChild(document.createTextNode(' '));
    item.appendChild(messageSpan);
    item.title = `${timestamp}: ${message}`;
    item.dataset.timestamp = now.getTime().toString();

    list.appendChild(item);

    // Efficiently remove old items
    while (list.children.length > maxItems) {
        list.removeChild(list.firstChild);
    }

    // Smooth scroll to bottom
    requestAnimationFrame(() => {
        try {
            list.scrollTo({ top: list.scrollHeight, behavior: 'auto' });
        } catch (e) {
            list.scrollTop = list.scrollHeight;
        }
    });
}

/**
 * Displays tensor or data content in a designated HTML element with enhanced formatting.
 * @param {tf.Tensor|number[]|number|string|null|undefined} data - The data to inspect
 * @param {string} elementId - The ID of the HTML element to display content in
 * @param {Object} [options] - Formatting options
 * @param {number} [options.precision=4] - Number of decimal places for numbers
 * @param {number} [options.maxElements=50] - Maximum elements to display
 * @param {number} [options.maxLength=1500] - Maximum string length for display
 */
export function inspectTensor(data, elementId, options = {}) {
    const {
        precision = 4,
        maxElements = 50,
        maxLength = 1500
    } = options;
    
    const element = getCachedElement(elementId);
    if (!element) {
        console.warn(`Inspector element "${elementId}" not found.`);
        return;
    }

    try {
        let headerInfo = "";
        let status = "";
        let dataSummary;

        // Enhanced type detection and info gathering
        if (data === null || data === undefined) {
            status = " (Null/Undefined)";
            dataSummary = String(data);
            headerInfo = `Type: ${data === null ? 'Null' : 'Undefined'}`;
        } else if (typeof tf !== 'undefined' && data instanceof tf.Tensor) {
            const memoryInfo = tf.memory ? ` | Memory: ${tf.memory().numTensors} tensors` : '';
            headerInfo = `Type: tf.Tensor | Shape: [${data.shape.join(', ')}] | Rank: ${data.rank} | DType: ${data.dtype} | Size: ${data.size}${memoryInfo}`;
            
            if (data.isDisposed) {
                status = " (Disposed)";
                dataSummary = "[Tensor Disposed]";
            } else {
                if (data.size > maxElements) {
                    const sliceSize = Math.min(10, data.shape[0] || 10);
                    dataSummary = data.slice(0, sliceSize).arraySync();
                    status += ` (Showing first ${sliceSize} element(s) of ${data.size})`;
                } else {
                    dataSummary = data.arraySync();
                }
            }
        } else if (Array.isArray(data)) {
            const flatLength = data.flat(Infinity).length;
            headerInfo = `Type: Array | Length: ${data.length} | Flat Length: ${flatLength}`;
            
            if (flatLength > maxElements) {
                dataSummary = data.slice(0, maxElements);
                status += ` (Showing first ${maxElements} elements of ${flatLength})`;
            } else {
                dataSummary = data;
            }
        } else if (isFiniteNumber(data)) {
            headerInfo = `Type: Number (Scalar) | Value: ${data}`;
            dataSummary = data;
        } else if (typeof data === 'string') {
            headerInfo = `Type: String | Length: ${data.length}`;
            if (data.length > maxLength) {
                dataSummary = data.substring(0, maxLength);
                status += ` (Showing first ${maxLength} chars of ${data.length})`;
            } else {
                dataSummary = data;
            }
        } else {
            headerInfo = `Type: ${typeof data} | Constructor: ${data.constructor?.name || 'Unknown'}`;
            try {
                dataSummary = JSON.stringify(data, null, 2);
                if (dataSummary.length > maxLength) {
                    dataSummary = dataSummary.substring(0, maxLength);
                    status += " (Truncated)";
                }
            } catch (e) {
                dataSummary = "[Cannot serialize object]";
                status += " (Serialization failed)";
            }
        }

        // Enhanced formatting with better number precision
        let formattedData;
        if (isFiniteNumber(dataSummary)) {
            formattedData = dataSummary.toFixed(precision);
        } else if (Array.isArray(dataSummary) || (typeof dataSummary === 'object' && dataSummary !== null)) {
            formattedData = JSON.stringify(dataSummary, (key, value) => {
                if (isFiniteNumber(value)) {
                    return parseFloat(value.toFixed(precision));
                }
                return value;
            }, 2);
            
            if (formattedData.length > maxLength) {
                formattedData = formattedData.substring(0, maxLength) + "\n... (Truncated)";
            }
        } else {
            formattedData = String(dataSummary);
        }

        const separatorLength = Math.min(80, (headerInfo + status).length);
        const separator = '='.repeat(separatorLength);
        
        element.textContent = `${headerInfo}${status}\n${separator}\n${formattedData}`;

    } catch (error) {
        console.error(`Error inspecting data for element ${elementId}:`, error);
        element.textContent = `Error inspecting data: ${error.message}\nStack: ${error.stack}`;
    }
}

/**
 * Clamps all values in a numerical array between boundaries.
 * @param {number[]} arr - The array to clamp
 * @param {number} min - The minimum boundary
 * @param {number} max - The maximum boundary
 * @returns {number[]} The clamped array
 */
export function clampArray(arr, min, max) {
    if (!Array.isArray(arr)) {
        console.warn("[clampArray] Input is not an array");
        return [];
    }
    
    if (!isFiniteNumber(min) || !isFiniteNumber(max)) {
        console.warn("[clampArray] Invalid min/max values");
        return [...arr]; // Return copy of original array
    }
    
    return arr.map(x => isFiniteNumber(x) ? clamp(x, min, max) : x);
}

/**
 * Computes the softmax function with numerical stability improvements.
 * @param {number[]} arr - The array of raw scores/logits
 * @param {number} [temperature=1.0] - Temperature parameter for softmax
 * @returns {number[]} The array with softmax applied
 */
export function softmax(arr, temperature = 1.0) {
    if (!Array.isArray(arr) || arr.length === 0) {
        return [];
    }
    
    if (!isFiniteNumber(temperature) || temperature <= 0) {
        console.warn("[softmax] Invalid temperature, using 1.0");
        temperature = 1.0;
    }

    // Filter and scale by temperature
    const validIndices = [];
    const validValues = [];
    
    for (let i = 0; i < arr.length; i++) {
        if (isFiniteNumber(arr[i])) {
            validIndices.push(i);
            validValues.push(arr[i] / temperature);
        }
    }
    
    if (validValues.length === 0) {
        console.warn("[softmax] No valid finite values found");
        return new Array(arr.length).fill(0);
    }

    // Numerical stability: subtract max value
    const maxVal = Math.max(...validValues);
    const exps = validValues.map(x => Math.exp(x - maxVal));
    const sumExps = exps.reduce((sum, exp) => sum + exp, 0);

    if (!isFiniteNumber(sumExps) || sumExps === 0) {
        console.warn("[softmax] Sum of exponentials is invalid, using uniform distribution");
        const uniformProb = 1 / validValues.length;
        const result = new Array(arr.length).fill(0);
        validIndices.forEach(idx => { result[idx] = uniformProb; });
        return result;
    }

    // Create result array
    const result = new Array(arr.length).fill(0);
    validIndices.forEach((idx, i) => {
        result[idx] = exps[i] / sumExps;
    });

    return result;
}

/**
 * Enhanced debounce function with immediate execution option and cancellation.
 * @param {Function} func - The function to debounce
 * @param {number} delay - Delay in milliseconds
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.immediate=false] - Execute immediately on first call
 * @returns {Function & {cancel: Function}} Debounced function with cancel method
 */
export function debounce(func, delay, options = {}) {
    const { immediate = false } = options;
    let timeoutId;
    let lastCallTime;
    
    const debounced = function(...args) {
        const callNow = immediate && !timeoutId;
        lastCallTime = Date.now();
        
        clearTimeout(timeoutId);
        
        timeoutId = setTimeout(() => {
            timeoutId = null;
            if (!immediate) func.apply(this, args);
        }, delay);
        
        if (callNow) func.apply(this, args);
    };
    
    debounced.cancel = function() {
        clearTimeout(timeoutId);
        timeoutId = null;
    };
    
    debounced.flush = function() {
        if (timeoutId) {
            clearTimeout(timeoutId);
            func.apply(this, arguments);
            timeoutId = null;
        }
    };
    
    return debounced;
}

/**
 * Throttle function to limit execution frequency.
 * @param {Function} func - The function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Creates a retry mechanism for async functions.
 * @param {Function} fn - Async function to retry
 * @param {number} [maxRetries=3] - Maximum number of retry attempts
 * @param {number} [delay=1000] - Delay between retries in milliseconds
 * @returns {Function} Function that will retry on failure
 */
export function withRetry(fn, maxRetries = 3, delay = 1000) {
    return async function(...args) {
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                lastError = error;
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    };
}

/**
 * Clears the element cache. Useful when DOM structure changes significantly.
 */
export function clearElementCache() {
    elementCache.clear();
}
