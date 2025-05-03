// @ts-nocheck
// js/typeHelpers.ts
/**
 * Helper functions for type casting in app.ts
 */
/**
 * Cast a value to a number, with a default value if the cast fails
 */
export function asNumber(value, defaultValue = 0) {
    if (typeof value === 'number') {
        return value;
    }
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
}
/**
 * Cast a value to a string
 */
export function asString(value, defaultValue = '') {
    if (typeof value === 'string') {
        return value;
    }
    return String(value) || defaultValue;
}
/**
 * Cast a value to a boolean
 */
export function asBoolean(value, defaultValue = false) {
    if (typeof value === 'boolean') {
        return value;
    }
    return Boolean(value) || defaultValue;
}
/**
 * Create an EnvStepResult object
 */
export function createEnvStepResult(state, reward, done, context, eventType) {
    return {
        state,
        reward,
        done,
        context,
        eventType
    };
}
/**
 * Create a safe AgentProcessResponse with default values
 */
export function createSafeAgentResponse(emotions, headMovement, headMovementProbs) {
    return {
        emotions,
        headMovement,
        headMovementProbs,
        rihScore: 0,
        affinities: [],
        integration: 0,
        reflexivity: 0,
        trustScore: 1.0,
        beliefNorm: 0,
        selfStateNorm: 0
    };
}
/**
 * Safely access properties of potentially null objects
 */
export function safeGet(obj, key, defaultValue) {
    if (obj === null || obj === undefined) {
        return defaultValue;
    }
    return obj[key] !== undefined ? obj[key] : defaultValue;
}
//# sourceMappingURL=typeHelpers.js.map