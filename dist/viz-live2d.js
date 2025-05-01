var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Live2DModel, } from 'pixi-live2d-display';
import { displayError, lerp } from './utils';
import * as PIXI from 'pixi.js';
let pixiApp = null;
let live2dModel = null;
export let live2dInitialized = false;
;
// Variables for smoother head movement
let targetHeadRotation = { x: 0, y: 0, z: 0 }; // Target rotation angles
let currentHeadRotation = { x: 0, y: 0, z: 0 }; // Interpolated values
let headMovementTransition = 0; // 0 to 1
let headMovementDuration = 1.0; // Transition duration in seconds
/**
 * Initializes the Pixi.js application and loads the Live2D model.
 * @returns {Promise<boolean>} Resolves with true if successful, false otherwise.
 */
export function initLive2D() {
    return __awaiter(this, void 0, void 0, function* () {
        const container = document.getElementById('live2d-container');
        if (!container) {
            displayError("Live2D container not found.");
            return false;
        }
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width <= 0 || height <= 0) {
            displayError("Live2D container has zero dimensions.");
            return false;
        }
        // Create PixiJS app
        pixiApp = new PIXI.Application({
            width,
            height,
            backgroundAlpha: 0,
            backgroundColor: 0xFFFFFF,
            antialias: true,
            autoStart: true,
            resizeTo: container,
        });
        // Append canvas to container
        container.appendChild(pixiApp.view);
        // Load model
        const modelUrl = 'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Hiyori/Hiyori.model3.json';
        console.log(`[Live2D] Loading model from ${modelUrl}`);
        live2dModel = yield Live2DModel.from(modelUrl);
        if (live2dModel) {
            // Adjust scale to fit container
            const modelBaseSize = 2000; // Hiyori model approximate size
            const scaleFactor = Math.min(width, height) / modelBaseSize * 1.0; // Adjusted for visibility
            live2dModel.scale.set(scaleFactor, scaleFactor);
            console.log(`[Live2D] Model scale set to ${scaleFactor}`);
            // Center the model with manual offset
            live2dModel.anchor.set(0.5, 0.5);
            live2dModel.x = pixiApp.screen.width / 2;
            live2dModel.y = pixiApp.screen.height / 2 + 20; // Manual offset
            console.log(`[Live2D] Initial position: x=${live2dModel.x}, y=${live2dModel.y}, canvas: ${pixiApp.screen.width}x${pixiApp.screen.height}`);
            // Log bounds for debugging
            const bounds = live2dModel.getBounds();
            console.log(`[Live2D] Model bounds: width=${bounds.width}, height=${bounds.height}, x=${bounds.x}, y=${bounds.y}`);
            // Set up event listeners
            setupHitAreas();
            live2dInitialized = true;
            console.log('[Live2D] Initialized successfully.');
        }
        pixiApp.stage.addChild(live2dModel);
        return true;
    });
}
function setupHitAreas() {
    if (!live2dModel)
        return;
    live2dModel.on('hit', (hitAreas) => {
        if (hitAreas.includes('body')) {
            setTargetExpression({ playful: 0.8, happy: 0.2, surprised: 0, curious: 0, neutral: 0, sad: 0, angry: 0, anxious: 0, thoughtful: 0 });
        }
        else if (hitAreas.includes('head')) {
            setTargetExpression({ playful: 0, happy: 0, surprised: 0.7, curious: 0, neutral: 0, sad: 0, angry: 0, anxious: 0, thoughtful: 0 });
        }
    });
}
/**
 * Updates expression with optional blending.
 * @param {Object} expression - e.g., { happy: 0.6, surprised: 0.4 }
 */
let currentExpression = null;
let targetExpression = null;
let transitionProgress = 0;
const TRANSITION_DURATION = 0.5;
export function setTargetExpression(expression) {
    targetExpression = expression;
    transitionProgress = 0;
}
function interpolateExpressions(a, b, t) {
    const result = { neutral: 0, happy: 0, sad: 0, angry: 0, surprised: 0, anxious: 0, thoughtful: 0, playful: 0 };
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (let key of keys) {
        result[key] = ((a && a[key]) || 0) * (1 - t) + ((b && b[key]) || 0) * t;
    }
    return result;
}
/**
 * Called every frame to update Live2D model.
 * @param {number} deltaTime - Time since last frame (in seconds)
 */
export function updateLive2D(deltaTime) {
    if (!live2dInitialized || !live2dModel || !pixiApp)
        return;
    // Keep model centered with manual offset
    live2dModel.x = pixiApp.screen.width / 2;
    live2dModel.y = pixiApp.screen.height / 2 + 20; // Manual offset
    console.log(`[Live2D] Update position: x=${live2dModel.x}, y=${live2dModel.y}, canvas: ${pixiApp.screen.width}x${pixiApp.screen.height}`);
    // Update expression
    if (targetExpression && !currentExpression) {
        currentExpression = targetExpression;
    }
    else if (targetExpression && currentExpression) {
        transitionProgress += deltaTime / TRANSITION_DURATION;
        if (transitionProgress >= 1) {
            currentExpression = targetExpression;
            targetExpression = null;
            transitionProgress = 0;
        }
        else {
            interpolateExpressions(currentExpression, targetExpression, transitionProgress);
        }
    }
    // Update head movement
    updateLive2DHeadMovement(deltaTime);
}
/**
 * Applies emotion-based expression blending.
 * @param {tf.Tensor|null} emotionsTensor Tensor of emotion intensities
 */
export function updateLive2DEmotions(emotionsTensor) {
    if (!live2dInitialized || !live2dModel || !emotionsTensor || !emotionsTensor.arraySync)
        return;
    const emotions = emotionsTensor.arraySync()[0];
    const joy = emotions[0] || 0;
    const fear = emotions[1] || 0;
    const curiosity = emotions[2] || 0;
    const frustration = emotions[3] || 0;
    const calm = emotions[4] || 0;
    const surprise = emotions[5] || 0;
    const blendedExpression = {
        neutral: 1,
        happy: joy * (1 - frustration),
        sad: fear * (calm < 0.5 ? 1 : 0),
        angry: frustration * (joy < 0.3 ? 1 : 0),
        surprised: surprise * (fear + curiosity),
        anxious: fear * (calm * 0.5),
        thoughtful: curiosity * calm * 0.5,
        playful: (joy + curiosity) * (1 - frustration)
    };
    let total = 0;
    for (const k in blendedExpression) {
        total += blendedExpression[k] || 0;
    }
    if (total > 0) {
        for (const k in blendedExpression) {
            blendedExpression[k] = (blendedExpression[k] || 0) / total;
        }
    }
    setTargetExpression(blendedExpression);
}
export function updateLive2DHeadMovement(deltaTime) {
    var _a, _b;
    if (live2dInitialized && live2dModel) {
        if (!((_a = live2dModel.internalModel) === null || _a === void 0 ? void 0 : _a.coreModel))
            return;
        const baseScale = 0.05;
        targetHeadRotation.x = baseScale;
        targetHeadRotation.y = 0;
        targetHeadRotation.z = 0;
        // Interpolate
        currentHeadRotation.x = lerp(currentHeadRotation.x, targetHeadRotation.x, deltaTime / headMovementDuration);
        currentHeadRotation.y = lerp(currentHeadRotation.y, targetHeadRotation.y, deltaTime / headMovementDuration);
        currentHeadRotation.z = lerp(currentHeadRotation.z, targetHeadRotation.z, deltaTime / headMovementDuration);
        if ((_b = live2dModel.internalModel) === null || _b === void 0 ? void 0 : _b.coreModel) {
            const coreModel = live2dModel.internalModel.coreModel;
            coreModel.setParameterValueById('ParamAngleX', currentHeadRotation.x * 30);
            coreModel.setParameterValueById('ParamAngleY', currentHeadRotation.y * 30);
            coreModel.setParameterValueById('ParamAngleZ', currentHeadRotation.z * 30);
        }
    }
}
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
