import { displayError, lerp } from './utils.js';
import { toNumberArray } from './tensorTypeUtils.js';
// Assumes PIXI, Live2DCubismCore, PIXI.live2d are available globally via CDN
let pixiApp = null; // Pixi Application instance
let live2dModel = null; // Live2D Model instance
export let live2dInitialized = false; // Flag to check if Live2D is initialized
// Variables for smoother head movement
let targetHeadRotation = { x: 0, y: 0, z: 0 }; // Target rotation angles
let currentHeadRotation = { x: 0, y: 0, z: 0 }; // Interpolated values
let headMovementTransition = 0; // 0 to 1
let headMovementDuration = 1.0; // Transition duration in seconds
// Expression variables
let currentExpression = null;
let targetExpression = null;
let transitionProgress = 0;
const TRANSITION_DURATION = 0.5;
/**
 * Initializes the Pixi.js application and loads the Live2D model.
 * @returns {Promise<boolean>} Resolves with true if successful, false otherwise.
 */
export async function initLive2D() {
    try {
        const container = document.getElementById('live2d-container');
        if (!container) {
            displayError("Live2D container not found.", false, 'error-message');
            return false;
        }
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width <= 0 || height <= 0) {
            displayError("Live2D container has zero dimensions.", false, 'error-message');
            return false;
        }
        // Create PixiJS app
        pixiApp = new PIXI.Application({
            width,
            height,
            transparent: true,
            antialias: true,
            autoStart: true,
            resizeTo: container,
        });
        // Append canvas to container
        container.appendChild(pixiApp.view);
        // Load model
        const modelUrl = 'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Hiyori/Hiyori.model3.json';
        console.log(`[Live2D] Loading model from ${modelUrl}`);
        // Load the Live2D model
        live2dModel = await PIXI.live2d.Live2DModel.from(modelUrl);
        // Make sure pixiApp is still valid (not null) before using it
        if (!pixiApp) {
            displayError("PixiJS application was destroyed during model loading.", false, 'error-message');
            return false;
        }
        // Add model to stage
        pixiApp.stage.addChild(live2dModel);
        // Adjust scale to fit container
        const modelBaseSize = 2000; // Hiyori model approximate size
        const scaleFactor = Math.min(width, height) / modelBaseSize * 1.0; // Adjusted for visibility
        live2dModel.scale.set(scaleFactor, scaleFactor);
        console.log(`[Live2D] Model scale set to ${scaleFactor}`);
        // Center the model with manual offset
        live2dModel.anchor.set(0.5, 0.5);
        // Use non-null assertion operator since we've already checked pixiApp isn't null
        live2dModel.x = pixiApp.screen.width / 2;
        live2dModel.y = pixiApp.screen.height / 2 + 20; // Manual offset to adjust for Hiyori
        console.log(`[Live2D] Initial position: x=${live2dModel.x}, y=${live2dModel.y}, canvas: ${pixiApp.screen.width}x${pixiApp.screen.height}`);
        // Log bounds for debugging
        const bounds = live2dModel.getBounds();
        console.log(`[Live2D] Model bounds: width=${bounds.width}, height=${bounds.height}, x=${bounds.x}, y=${bounds.y}`);
        // Set up event listeners
        setupHitAreas();
        live2dInitialized = true;
        console.log('[Live2D] Initialized successfully.');
        return true;
    }
    catch (e) {
        displayError(`Error initializing Live2D: ${e.message}.`, false, 'error-message');
        console.error('[Live2D] Full error:', e);
        live2dInitialized = false;
        return false;
    }
}
/**
 * Sets up interaction regions like body, head, etc.
 */
function setupHitAreas() {
    if (!live2dModel)
        return;
    live2dModel.on('hit', (hitAreas) => {
        if (hitAreas.includes('body')) {
            setTargetExpression({ playful: 0.8, happy: 0.2 });
        }
        else if (hitAreas.includes('head')) {
            setTargetExpression({ surprised: 0.7, curious: 0.3 });
        }
    });
}
/**
 * Updates expression with optional blending.
 * @param {Object} expression - e.g., { happy: 0.6, surprised: 0.4 }
 */
export function setTargetExpression(expression) {
    targetExpression = expression;
    transitionProgress = 0;
}
function interpolateExpressions(a, b, t) {
    const result = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
        result[key] = (a[key] || 0) * (1 - t) + (b[key] || 0) * t;
    }
    return result;
}
/**
 * Called every frame to animate Live2D model.
 * @param {number} deltaTime - Time since last frame (in seconds)
 */
export function updateLive2D(deltaTime) {
    if (!live2dInitialized || !live2dModel || !pixiApp) return;

    try {
        // Keep model centered with manual offset
        live2dModel.x = pixiApp.screen.width / 2;
        live2dModel.y = pixiApp.screen.height / 2 + 20; // Manual offset
        console.log(`[Live2D] Update position: x=${live2dModel.x}, y=${live2dModel.y}, canvas: ${pixiApp.screen.width}x${pixiApp.screen.height}`);
    } catch (e) {
        console.error("Error updating Live2D position:", e);
    }
}
/**
 * Updates head movement parameters for the Live2D model
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateHeadMovement(deltaTime) {
    // Skip head movement for now as it's causing issues
    // We'll implement this properly once the basic model is working
}
/**
 * Updates Live2D model's expression parameters based on emotion values
 * @param {tf.Tensor|number[]} emotions - Emotion values as tensor or array
 */
export function updateLive2DEmotions(emotions) {
    if (!live2dInitialized || !live2dModel) {
        console.warn("[Live2D] Model not initialized in updateLive2DEmotions");
        return;
    }
    
    // For now, just log that we received emotions but don't try to set parameters
    // This avoids errors while we debug the Live2D model structure
    console.log("[Live2D] Received emotions update:", 
                Array.isArray(emotions) ? emotions.slice(0, 5) : "non-array");
}

/**
 * Maps a value from [0,1] to [min,max] range
 * @param {number} value - Input value (0-1)
 * @param {number} min - Minimum output value
 * @param {number} max - Maximum output value
 * @returns {number} Mapped value
 */
function mapRange(value, min, max) {
    // Ensure value is in 0-1 range
    const clampedValue = Math.max(0, Math.min(1, value));
    // Map to target range
    return min + clampedValue * (max - min);
}
/**
 * Updates Live2D model's head movement based on the current head movement label
 * @param {string} hmLabel - Head movement label
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function updateLive2DHeadMovement(hmLabel, deltaTime) {
    if (!live2dInitialized || !live2dModel) return;
    
    // For now, just log the head movement label but don't try to set parameters
    // This avoids errors while we debug the Live2D model structure
    console.log("[Live2D] Received head movement update:", hmLabel);
}
/**
 * Cleans up Pixi.js and Live2D resources.
 */
export function cleanupLive2D() {
    if (!live2dInitialized)
        return;
    console.log("Cleaning up Live2D/Pixi.js...");
    if (pixiApp) {
        pixiApp.destroy(true);
        pixiApp = null;
    }
    live2dModel = null;
    live2dInitialized = false;
    console.log("Live2D/Pixi.js cleanup complete.");
}





