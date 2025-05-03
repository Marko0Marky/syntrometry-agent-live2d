// @ts-nocheck
// js/viz-live2d.ts
// If using Pixi via modules:
// import * as PIXI from 'pixi.js';
// Assuming pixi-live2d-display adds to the PIXI namespace or needs specific import
// import '@pixi/live2d'; // Or specific import depending on library structure
import { Config } from './config.js';
import { clamp, displayError, zeros, lerp } from './utils.js';
// --- Module State ---
let pixiApp = null;
let live2dModel = null;
export let live2dInitialized = false;
let targetHeadRotation = { x: 0, y: 0, z: 0 };
let currentHeadRotation = { x: 0, y: 0, z: 0 };
const headMovementDuration = 0.4; // Smoother transition
// Expression blending state
let currentExpression = null;
let targetExpression = null;
let expressionTransitionProgress = 0;
const EXPRESSION_TRANSITION_DURATION = 0.5; // Duration in seconds
/**
 * Initializes the Pixi.js application and loads the Live2D model.
 */
export async function initLive2D() {
    // Check dependencies
    if (typeof PIXI === 'undefined' || typeof Live2DCubismCore === 'undefined' || typeof PIXI.live2d === 'undefined') {
        console.error("Live2D/Pixi dependencies not fully loaded.", {
            PIXI: typeof PIXI,
            Live2DCubismCore: typeof Live2DCubismCore,
            PIXILive2D: typeof PIXI.live2d
        });
        displayError("Live2D or Pixi.js dependencies not loaded.", false, 'error-message');
        live2dInitialized = false;
        return false;
    }
    try {
        cleanupLive2D(); // Ensure clean state
        const container = document.getElementById('live2d-container');
        if (!container) {
            displayError("Live2D container not found.", false, 'error-message');
            return false;
        }
        // Create PixiJS app
        pixiApp = new PIXI.Application();
        await pixiApp.init({
            width: container.clientWidth || 150,
            height: container.clientHeight || 200,
            transparent: true,
            antialias: true,
            autoStart: true,
            resizeTo: container,
            backgroundColor: 0x000000,
            backgroundAlpha: 0.0, // Ensure transparency
        });
        container.appendChild(pixiApp.canvas); // Use canvas instead of view in v7+
        // Load model (use 'any' for Live2DModel if type causes issues)
        const modelUrl = 'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Hiyori/Hiyori.model3.json';
        console.log(`[Live2D] Loading model from ${modelUrl}`);
        // Access the Live2DModel class through the PIXI namespace (potentially casting to any)
        live2dModel = await PIXI.live2d.Live2DModel.from(modelUrl);
        pixiApp.stage.addChild(live2dModel);
        // Model positioning and scaling
        live2dModel.anchor.set(0.5, 0.5);
        adjustModelLayout(); // Use helper function for initial layout and resize
        // Setup interaction (if needed)
        setupLive2DHitAreas();
        // Start custom ticker if autoStart=false or for precise control
        // pixiApp.ticker.add(updateLive2D); // Add our update function to Pixi's ticker
        live2dInitialized = true;
        console.log('[Live2D] Initialized successfully.');
        return true;
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        displayError(`Error initializing Live2D: ${message}.`, false, 'error-message');
        console.error('[Live2D] Full error:', e);
        cleanupLive2D(); // Attempt cleanup on error
        live2dInitialized = false;
        return false;
    }
}
/** Adjusts model scale and position based on container size */
function adjustModelLayout() {
    if (!pixiApp || !live2dModel)
        return;
    const viewWidth = pixiApp.screen.width;
    const viewHeight = pixiApp.screen.height;
    // Scale model to fit height primarily, with some padding
    const modelBaseHeight = 2000; // Approximate natural height of Hiyori model
    const scale = viewHeight / modelBaseHeight * 0.9; // 90% of height
    live2dModel.scale.set(scale);
    // Center horizontally, position slightly above bottom vertically
    live2dModel.x = viewWidth / 2;
    // live2dModel.y = viewHeight * 0.85; // Adjust Y position (e.g., 85% down)
    live2dModel.y = viewHeight / 2 + 50 * scale; // Adjust based on scaled offset
    // console.log(`[Live2D] Layout Adjusted - Scale: ${scale.toFixed(3)}, Pos: (${live2dModel.x.toFixed(0)}, ${live2dModel.y.toFixed(0)}), View: ${viewWidth}x${viewHeight}`);
}
/** Sets up interaction regions */
function setupLive2DHitAreas() {
    if (!live2dModel)
        return;
    live2dModel.on('hit', (hitAreaNames) => {
        console.log('[Live2D Hit]', hitAreaNames);
        // Trigger expressions based on hit areas
        if (hitAreaNames.includes('Body')) { // Check standard names
            setTargetExpressionByName('Flicker'); // Example standard expression
        }
        else if (hitAreaNames.includes('Head')) {
            setTargetExpressionByName('TapBody'); // Example standard expression
        }
        // Add more hit area checks as needed
    });
}
/** Helper to set expression, simplifying potential direct manipulation */
function setModelExpression(expressionValues) {
    if (!live2dModel?.expression)
        return;
    try {
        live2dModel.expression(expressionValues);
    }
    catch (e) {
        console.warn("[Live2D] Failed to set expression:", e, expressionValues);
    }
}
/** Helper to set parameter value, simplifying potential direct manipulation */
function setModelParameter(id, value) {
    if (!live2dModel?.setParameterValueById)
        return;
    try {
        live2dModel.setParameterValueById(id, value);
    }
    catch (e) {
        // console.warn(`[Live2D] Failed to set parameter ${id}:`, e); // Can be noisy
    }
}
/** Sets the target expression for smooth transition */
export function setTargetExpression(expressionMap) {
    targetExpression = { ...expressionMap }; // Create a copy
    // If no current expression, set immediately
    if (!currentExpression) {
        currentExpression = { ...targetExpression };
        expressionTransitionProgress = 1; // Mark as complete
        setModelExpression(currentExpression);
    }
    else {
        // Start transition only if target is different from current goal
        expressionTransitionProgress = 0;
    }
}
/** Sets a standard expression by name (if the model supports it) */
export function setTargetExpressionByName(name) {
    if (!live2dModel || !live2dModel.expression)
        return;
    // The pixi-live2d-display library handles setting expressions by name directly.
    // We might not need the complex blending if we just want to trigger named expressions.
    try {
        live2dModel.expression(name);
        // Reset our internal blending state if setting by name
        currentExpression = null;
        targetExpression = null;
        expressionTransitionProgress = 0;
        console.log(`[Live2D] Set expression by name: ${name}`);
    }
    catch (e) {
        console.warn(`[Live2D] Failed to set expression by name "${name}":`, e);
    }
}
/** Interpolates between two expression maps */
function interpolateExpressions(a, b, t) {
    const result = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const clampedT = clamp(t, 0, 1); // Ensure t is between 0 and 1
    for (const key of keys) {
        result[key] = lerp(a[key] || 0, b[key] || 0, clampedT);
    }
    return result;
}
/** Called every frame (e.g., by Pixi ticker or app's animation loop) */
export function updateLive2D(deltaTime) {
    if (!live2dInitialized || !live2dModel)
        return;
    // --- Update Expression Blending ---
    if (targetExpression && currentExpression) {
        if (expressionTransitionProgress < 1) {
            expressionTransitionProgress += deltaTime / EXPRESSION_TRANSITION_DURATION;
            const blended = interpolateExpressions(currentExpression, targetExpression, expressionTransitionProgress);
            setModelExpression(blended);
        }
        else {
            // Transition complete
            currentExpression = { ...targetExpression }; // Update current to the target
            setModelExpression(currentExpression); // Ensure final state is set
            targetExpression = null; // Clear target
            expressionTransitionProgress = 0;
        }
    }
    else if (targetExpression && !currentExpression) {
        // If current was null, set target immediately (handled in setTargetExpression)
    }
    // --- Update Head Movement Interpolation ---
    // Note: updateLive2DHeadMovement sets the *target* rotation
    // This part handles the smooth interpolation towards the target
    // Apply smoothing only if difference is significant to avoid jitter
    const threshold = 0.001;
    if (Math.abs(currentHeadRotation.x - targetHeadRotation.x) > threshold ||
        Math.abs(currentHeadRotation.y - targetHeadRotation.y) > threshold ||
        Math.abs(currentHeadRotation.z - targetHeadRotation.z) > threshold) {
        const lerpFactor = clamp(deltaTime / headMovementDuration, 0, 1); // Use duration
        currentHeadRotation.x = lerp(currentHeadRotation.x, targetHeadRotation.x, lerpFactor);
        currentHeadRotation.y = lerp(currentHeadRotation.y, targetHeadRotation.y, lerpFactor);
        currentHeadRotation.z = lerp(currentHeadRotation.z, targetHeadRotation.z, lerpFactor);
        // Apply interpolated values to model parameters
        setModelParameter('ParamAngleX', currentHeadRotation.x * 30); // Standard param names
        setModelParameter('ParamAngleY', currentHeadRotation.y * 30);
        setModelParameter('ParamAngleZ', currentHeadRotation.z * 30);
    }
    // Update model's internal state (important for animations, physics)
    // The deltaTime for update is expected in seconds
    live2dModel.update(deltaTime);
    // Adjust layout if needed on resize (can be called from app resize handler)
    // adjustModelLayout();
}
/** Applies emotion-based expression blending by setting a target */
export function updateLive2DEmotions(emotionsTensor) {
    if (!live2dInitialized || !live2dModel || !emotionsTensor || emotionsTensor.isDisposed)
        return;
    let emotions = [];
    try {
        emotions = emotionsTensor.arraySync()[0];
        if (emotions.length !== Config.Agent.EMOTION_DIM) {
            emotions = zeros([Config.Agent.EMOTION_DIM]);
        }
    }
    catch (e) {
        console.error("Error getting emotion array for Live2D:", e);
        return;
    }
    const joy = emotions[0] || 0;
    const fear = emotions[1] || 0;
    const curiosity = emotions[2] || 0;
    const frustration = emotions[3] || 0;
    const calm = emotions[4] || 0;
    const surprise = emotions[5] || 0;
    // Example blending logic (adjust weights and mappings based on desired effect)
    // This map might need adjustment based on the actual expressions available in the Hiyori model
    let blendedExpression = {
        // Map simulation emotions to potential model expressions
        // Weights determine the influence. Normalize at the end.
        'Idle': calm * 0.6 + (1 - emotionAvg(emotions)) * 0.4,
        'F01': joy * (1 - frustration) * 0.8,
        'F05': fear * 0.7 + frustration * 0.3,
        'F04': frustration * (1 - calm) * 0.9,
        'F07': surprise * 0.8 + curiosity * 0.2,
        'F03': curiosity * (1 - fear) * 0.6,
        'F08': calm * (1 - surprise) * 0.5, // Calm/Neutral expression
        // Add other expressions from the model if needed
    };
    // Normalize weights so they sum roughly to 1 (or use softmax logic if preferred)
    const totalWeight = Object.values(blendedExpression).reduce((sum, val) => sum + Math.max(val, 0), 0); // Sum positive weights
    if (totalWeight > 0) {
        for (const key in blendedExpression) {
            blendedExpression[key] = Math.max(blendedExpression[key], 0) / totalWeight; // Normalize positive weights
        }
    }
    else {
        blendedExpression['Idle'] = 1.0; // Default to Idle if no positive weights
    }
    setTargetExpression(blendedExpression); // Set this as the target for smooth transition
}
// Helper to calculate average emotion intensity
function emotionAvg(emotions) {
    if (!emotions || emotions.length === 0)
        return 0;
    return emotions.reduce((sum, val) => sum + clamp(val, 0, 1), 0) / emotions.length;
}
/** Sets the *target* head rotation based on label */
export function updateLive2DHeadMovement(hmLabel, deltaTime) {
    if (!live2dInitialized || !live2dModel)
        return;
    const tiltAmount = 15; // Max tilt in degrees for head X/Y/Z parameters
    const nodAmount = 10;
    // Set the *target* rotation based on the label
    // The actual movement is smoothed in updateLive2D
    switch (hmLabel) {
        case 'nod':
            // Simple nod: Target slightly down, then reset
            targetHeadRotation.x = nodAmount / 30; // ParamAngleX often ranges -30 to 30
            // Could add logic to alternate target between up/down over time
            break;
        case 'shake':
            // Simple shake: Target slightly side, then reset (or alternate)
            targetHeadRotation.y = tiltAmount / 30; // ParamAngleY
            break;
        case 'tilt_left':
            targetHeadRotation.z = tiltAmount / 30; // ParamAngleZ
            break;
        case 'tilt_right':
            targetHeadRotation.z = -tiltAmount / 30;
            break;
        case 'idle':
        default:
            targetHeadRotation = { x: 0, y: 0, z: 0 }; // Target neutral position
            break;
    }
    // Note: Smoothing/interpolation happens in the main updateLive2D function
}
/** Cleans up Pixi.js and Live2D resources. */
export function cleanupLive2D() {
    if (!pixiApp)
        return; // Already cleaned or never initialized
    console.log("Cleaning up Live2D/Pixi.js...");
    try {
        // Remove ticker function if added
        // pixiApp.ticker.remove(updateLive2D);
        // Destroy Pixi app (removes canvas, stops ticker, releases WebGL context)
        pixiApp.destroy(true, { children: true, texture: true, baseTexture: true }); // Thorough cleanup
    }
    catch (e) {
        console.error("Error during Pixi.js cleanup:", e);
    }
    finally {
        // Nullify references
        pixiApp = null;
        live2dModel = null; // Model is child of stage, should be destroyed by app.destroy
        live2dInitialized = false;
        currentExpression = null;
        targetExpression = null;
        console.log("Live2D/Pixi.js cleanup complete.");
    }
}
//# sourceMappingURL=viz-live2d.js.map