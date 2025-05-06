/**
 * Converts a TypedArray to a regular JavaScript array
 */
export function typedArrayToArray(typedArray) {
    return Array.from(typedArray);
}
/**
 * Extracts data from a tensor and converts to a regular array
 */
export function tensorDataToArray(tensor) {
    if (!tensor || tensor.isDisposed)
        return null;
    try {
        // Cast to any to avoid type issues, then cast result to number[]
        return Array.from(tensor.dataSync());
    }
    catch (e) {
        console.error("Error converting tensor data to array:", e);
        return null;
    }
}
/**
 * Safely extracts a scalar value from a tensor
 */
export function extractScalar(tensor) {
    if (!tensor || tensor.isDisposed)
        return 0;
    try {
        const data = tensor.dataSync();
        // Cast to number to ensure type safety
        return Number(data[0]) || 0;
    }
    catch (e) {
        console.error("Error extracting scalar from tensor:", e);
        return 0;
    }
}
/**
 * Safely gets the first element from a tensor array
 */
export function getFirstElement(tensorArray) {
    if (!tensorArray || tensorArray.isDisposed)
        return null;
    try {
        const data = tensorArray.arraySync();
        if (Array.isArray(data) && data.length > 0) {
            return Array.isArray(data[0]) ? data[0] : [data[0]];
        }
        return null;
    }
    catch (e) {
        console.error("Error getting first element from tensor array:", e);
        return null;
    }
}
