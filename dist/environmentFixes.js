// @ts-nocheck
import * as tf from '@tensorflow/tfjs';
import { tensorDataToArray } from './tensorArrayUtils.js';
/**
 * Utility functions to fix TypeScript errors in environment.ts
 */
// Define missing utility functions locally
function safeMul(a, b) {
    if (!a || a.isDisposed)
        return tf.zeros(a ? a.shape : []);
    if (typeof b === 'number')
        return a.mul(tf.scalar(b));
    if (!b || b.isDisposed)
        return tf.zeros(a.shape);
    return a.mul(b);
}
/**
 * Fix for line 170 - tensor data access
 */
export function fixLine170(tensor) {
    const result = tensorDataToArray(tensor);
    return result ? result : [];
}
/**
 * Fix for lines 191-193 - tensor operations
 */
export function fixLine191(tensor, other) {
    return safeMul(tensor, other);
}
export function fixLine192(scalar, other) {
    return safeMul(scalar, other);
}
/**
 * Fix for line 305 - TypedArray conversion
 */
export function fixLine305(tensor) {
    const result = tensorDataToArray(tensor);
    return result ? result : [];
}
/**
 * Fix for line 316 - TypedArray conversion
 */
export function fixLine316(tensor) {
    const result = tensorDataToArray(tensor);
    return result ? result : [];
}
/**
 * Fix for line 446 - TypedArray conversion
 */
export function fixLine446(tensor) {
    const result = tensorDataToArray(tensor);
    return result ? result : [];
}
/**
 * Fix for line 459 - TypedArray conversion
 */
export function fixLine459(tensor) {
    const result = tensorDataToArray(tensor);
    return result ? result : [];
}
/**
 * Fix for line 545 - TypedArray conversion
 */
export function fixLine545(tensor) {
    const result = tensorDataToArray(tensor);
    return result ? result : [];
}
//# sourceMappingURL=environmentFixes.js.map