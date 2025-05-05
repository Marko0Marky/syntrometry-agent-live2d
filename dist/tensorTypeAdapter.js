/**
 * This file provides type adapter functions to handle tensor type compatibility issues
 * between Tensor<Rank> and Tensor<number> without changing runtime behavior
 */
// Basic tensor type adapter
export function adaptTensor(tensor) {
    return tensor;
}
// Convert to number tensor
export function toNumberTensor(tensor) {
    return tensor;
}
// Convert to rank tensor
export function toRankTensor(tensor) {
    return tensor;
}
// Convert variable to tensor
export function variableToTensor(variable) {
    return variable;
}
export function adaptEnvStepResult(result) {
    return result;
}
// Apply tensor type adapter to a function
export function adaptFunction(fn, adapter) {
    return (arg) => fn(adapter(arg));
}
