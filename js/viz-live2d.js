import { Config, emotionNames } from './config.js';
import { clamp, displayError, zeros, lerp, debounce } from './utils.js';

// Default configuration fallbacks in case Config.Live2D is missing
const DEFAULT_LIVE2D_CONFIG = {
    // Use a CDN-hosted model as fallback
    ModelPath: 'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Hiyori/Hiyori.model3.json',
    Scale: 0.06875, // Increased by 10% from 0.0625
    FallbackModels: [
        'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Hiyori/Hiyori.model3.json',
        'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Rice/Rice.model3.json',
        'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Mao/Mao.model3.json'
    ]
};

// Assumes PIXI, Live2DCubismCore, PIXI.live2d are available globally via CDN
let pixiApp = null; // Pixi Application instance
let live2dModel = null; // Live2D Model instance
export let live2dInitialized = false; // Flag to check if Live2D is initialized
let live2dContainer = null; // DOM container reference

// Variables for smoother head movement
let targetHeadRotation = { x: 0, y: 0, z: 0 }; // Target rotation angles
let currentHeadRotation = { x: 0, y: 0, z: 0 }; // Interpolated values
let headMovementTransition = 0; // 0 to 1
let headMovementDuration = 1.0; // Transition duration in seconds

// Expression state
let currentExpression = null;
let targetExpression = null;
let transitionProgress = 0;
const TRANSITION_DURATION = 0.5;

// Debounced resize handler
const debouncedOnLive2DResize = debounce(onLive2DResize, 250);

/**
 * Initializes the Live2D avatar.
 * @returns {Promise<boolean>} True if initialization was successful
 */
export async function initLive2D() {
    console.log('[Live2D] Initializing...');
    
    // Cleanup previous instance if any
    cleanupLive2D();
    
    // Check for required dependencies
    if (typeof PIXI === 'undefined' || 
        typeof Live2DCubismCore === 'undefined' || 
        typeof PIXI.live2d === 'undefined') {
        displayError("Live2D dependencies not loaded. Check network connections.", false, 'error-message');
        console.error('[Live2D] Missing dependencies: PIXI, Live2DCubismCore, or PIXI.live2d');
        live2dInitialized = false;
        return false;
    }
    
    try {
        live2dContainer = document.getElementById('live2d-container');
        if (!live2dContainer) {
            displayError("Live2D container not found in DOM.", false, 'error-message');
            console.error('[Live2D] Container element #live2d-container not found');
            live2dInitialized = false;
            return false;
        }
        
        // Get container dimensions
        const width = live2dContainer.clientWidth;
        const height = live2dContainer.clientHeight;
        if (width <= 0 || height <= 0) {
            console.warn('[Live2D] Container has zero dimensions, using fallback size');
        }
        
        // Create PIXI Application
        pixiApp = new PIXI.Application({
            width: width || 300,
            height: height || 400,
            transparent: true,
            antialias: true,
            autoStart: true,
            resolution: window.devicePixelRatio || 1
        });
        live2dContainer.appendChild(pixiApp.view);
        
        // Get model path from config or use default
        const live2dConfig = Config.Live2D || DEFAULT_LIVE2D_CONFIG;
        let modelPath = live2dConfig.ModelPath;
        const modelScale = live2dConfig.Scale || 0.25;
        
        console.log(`[Live2D] Attempting to load model from: ${modelPath}`);
        
        // Try to load the model with fallbacks
        let modelLoadSuccess = false;
        let loadError = null;
        
        // First try the configured model path
        try {
            live2dModel = await PIXI.live2d.Live2DModel.from(modelPath);
            modelLoadSuccess = true;
        } catch (e) {
            console.warn(`[Live2D] Failed to load primary model: ${e.message}`);
            loadError = e;
            
            // Try fallback models if available
            const fallbackModels = live2dConfig.FallbackModels || DEFAULT_LIVE2D_CONFIG.FallbackModels;
            
            for (const fallbackPath of fallbackModels) {
                try {
                    console.log(`[Live2D] Trying fallback model: ${fallbackPath}`);
                    live2dModel = await PIXI.live2d.Live2DModel.from(fallbackPath);
                    modelLoadSuccess = true;
                    console.log(`[Live2D] Successfully loaded fallback model: ${fallbackPath}`);
                    break;
                } catch (fallbackError) {
                    console.warn(`[Live2D] Failed to load fallback model: ${fallbackError.message}`);
                }
            }
        }
        
        if (!modelLoadSuccess) {
            throw loadError || new Error("All model loading attempts failed");
        }
        
        // Configure model
        live2dModel.scale.set(modelScale);
        live2dModel.anchor.set(0.5, 0.5);
        live2dModel.x = pixiApp.screen.width / 2;
        live2dModel.y = pixiApp.screen.height / 2; // Removed the +20 offset to better center the smaller model
        
        // Add to stage
        pixiApp.stage.addChild(live2dModel);
        
        // Setup interaction
        setupHitAreas();
        
        // Add window resize listener
        window.addEventListener('resize', debouncedOnLive2DResize);
        
        // Set initial expression
        setTargetExpression({ neutral: 1.0 });
        
        live2dInitialized = true;
        console.log('[Live2D] Initialized successfully.');
        return true;

    } catch (e) {
        displayError(`Error initializing Live2D: ${e.message}.`, false, 'error-message');
        console.error('[Live2D] Full error:', e);
        cleanupLive2D();
        live2dInitialized = false;
        return false;
    }
}

/**
 * Sets up interaction regions like body, head, etc.
 */
function setupHitAreas() {
    if (!live2dModel) return;

    live2dModel.on('hit', (hitAreas) => {
        if (hitAreas.includes('body')) {
            setTargetExpression({ playful: 0.8, happy: 0.2 });
        } else if (hitAreas.includes('head')) {
            setTargetExpression({ surprised: 0.7, curious: 0.3 });
        }
    });
}

/**
 * Updates expression with optional blending.
 * @param {Object} expression - e.g., { happy: 0.6, surprised: 0.4 }
 */
export function setTargetExpression(expression) {
    if (!live2dInitialized || !live2dModel) return;
    
    targetExpression = expression;
    transitionProgress = 0;
}

/**
 * Interpolates between two expression states
 * @param {Object} a - Starting expression state
 * @param {Object} b - Target expression state
 * @param {number} t - Interpolation factor (0-1)
 * @returns {Object} Blended expression
 */
function interpolateExpressions(a, b, t) {
    if (!a || !b) return b || a || { neutral: 1.0 };
    
    const result = {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (let key of keys) {
        result[key] = (a[key] || 0) * (1 - t) + (b[key] || 0) * t;
    }
    return result;
}

/**
 * Called every frame to animate Live2D model.
 * @param {number} deltaTime - Time since last frame (in seconds)
 */
export function updateLive2D(deltaTime) {
    if (!live2dInitialized || !live2dModel?.setParameterValueById) return;

    try {
        // Keep model centered with no offset for very small model
        live2dModel.x = pixiApp.screen.width / 2;
        live2dModel.y = pixiApp.screen.height / 2;

        // Update expression
        if (targetExpression && !currentExpression) {
            currentExpression = targetExpression;
            live2dModel.expression(currentExpression);
        } else if (targetExpression && currentExpression) {
            transitionProgress += deltaTime / TRANSITION_DURATION;
            if (transitionProgress >= 1) {
                live2dModel.expression(targetExpression);
                currentExpression = targetExpression;
                targetExpression = null;
                transitionProgress = 0;
            } else {
                const blended = interpolateExpressions(currentExpression, targetExpression, transitionProgress);
                live2dModel.expression(blended);
            }
        }

        // Update head movement
        updateHeadMovement(deltaTime);
    } catch (e) {
        console.error("[Live2D] Update error:", e);
    }
}

/**
 * Updates head movement based on current rotation values
 * @param {number} deltaTime - Time since last frame
 */
function updateHeadMovement(deltaTime) {
    if (!live2dInitialized || !live2dModel?.internalModel?.coreModel) return;
    
    try {
        // Apply interpolated values to model
        const coreModel = live2dModel.internalModel.coreModel;
        
        // Get all available parameters
        const parameterIds = [];
        const parameterCount = coreModel.getParameterCount();
        
        for (let i = 0; i < parameterCount; i++) {
            parameterIds.push(coreModel.getParameterId(i));
        }
        
        // Check for standard head parameters
        const hasAngleX = parameterIds.includes('ParamAngleX');
        const hasAngleY = parameterIds.includes('ParamAngleY');
        const hasAngleZ = parameterIds.includes('ParamAngleZ');
        
        // Apply head rotation if parameters exist
        if (hasAngleX) {
            coreModel.setParameterValueById('ParamAngleX', currentHeadRotation.x * 30);
        }
        
        if (hasAngleY) {
            coreModel.setParameterValueById('ParamAngleY', currentHeadRotation.y * 30);
        }
        
        if (hasAngleZ) {
            coreModel.setParameterValueById('ParamAngleZ', currentHeadRotation.z * 30);
        }
        
        // Apply eye movement if parameters exist
        if (parameterIds.includes('ParamEyeBallX')) {
            coreModel.setParameterValueById('ParamEyeBallX', currentHeadRotation.y * 0.8);
        }
        
        if (parameterIds.includes('ParamEyeBallY')) {
            coreModel.setParameterValueById('ParamEyeBallY', -currentHeadRotation.x * 0.8);
        }
        
        // Apply body movement if parameters exist
        if (parameterIds.includes('ParamBodyAngleX')) {
            coreModel.setParameterValueById('ParamBodyAngleX', currentHeadRotation.x * 10);
        }
        
        if (parameterIds.includes('ParamBodyAngleY')) {
            coreModel.setParameterValueById('ParamBodyAngleY', currentHeadRotation.y * 10);
        }
        
        if (parameterIds.includes('ParamBodyAngleZ')) {
            coreModel.setParameterValueById('ParamBodyAngleZ', currentHeadRotation.z * 10);
        }
    } catch (e) {
        console.error("[Live2D] Head movement error:", e);
    }
}

/**
 * Applies emotion-based expression blending.
 * @param {tf.Tensor|null} emotionsTensor Tensor of emotion intensities
 */
export function updateLive2DEmotions(emotionsTensor) {
    if (!live2dInitialized || !live2dModel || !emotionsTensor) return;

    try {
        const emotions = emotionsTensor.arraySync()[0];
        if (!Array.isArray(emotions)) {
            console.warn("[Live2D] Invalid emotions tensor format");
            return;
        }
        
        const joy = emotions[0] || 0;
        const fear = emotions[1] || 0;
        const curiosity = emotions[2] || 0;
        const frustration = emotions[3] || 0;
        const calm = emotions[4] || 0;
        const surprise = emotions[5] || 0;

        // Map our emotions to the model's available expressions
        // This mapping works well with the Hiyori model
        let blendedExpression = {};
        
        // Check which expressions are available on the model
        const availableExpressions = live2dModel.internalModel?.settings?.expressions?.map(e => e.name) || [];
        
        if (availableExpressions.length > 0) {
            console.log("[Live2D] Available expressions:", availableExpressions);
            
            // Map emotions to available expressions
            if (availableExpressions.includes('neutral')) {
                blendedExpression.neutral = calm * 0.8;
            }
            
            if (availableExpressions.includes('happy')) {
                blendedExpression.happy = joy * (1 - frustration);
            } else if (availableExpressions.includes('joy')) {
                blendedExpression.joy = joy * (1 - frustration);
            }
            
            if (availableExpressions.includes('sad')) {
                blendedExpression.sad = fear * (calm < 0.5 ? 1 : 0);
            }
            
            if (availableExpressions.includes('angry')) {
                blendedExpression.angry = frustration * (joy < 0.3 ? 1 : 0);
            } else if (availableExpressions.includes('anger')) {
                blendedExpression.anger = frustration * (joy < 0.3 ? 1 : 0);
            }
            
            if (availableExpressions.includes('surprised')) {
                blendedExpression.surprised = surprise * (fear + curiosity) * 1.2;
            } else if (availableExpressions.includes('surprise')) {
                blendedExpression.surprise = surprise * (fear + curiosity) * 1.2;
            }
            
            if (availableExpressions.includes('anxious')) {
                blendedExpression.anxious = fear * (calm * 0.5);
            } else if (availableExpressions.includes('fear')) {
                blendedExpression.fear = fear * (calm * 0.5);
            }
            
            if (availableExpressions.includes('thoughtful')) {
                blendedExpression.thoughtful = curiosity * calm;
            } else if (availableExpressions.includes('thinking')) {
                blendedExpression.thinking = curiosity * calm;
            }
            
            if (availableExpressions.includes('playful')) {
                blendedExpression.playful = (joy + curiosity) * (1 - frustration);
            }
        } else {
            // Fallback to generic expressions if none are detected
            blendedExpression = {
                neutral: calm,
                happy: joy * (1 - frustration),
                sad: fear * (calm < 0.5 ? 1 : 0),
                angry: frustration * (joy < 0.3 ? 1 : 0),
                surprised: surprise * (fear + curiosity) * 1.2
            };
        }

        // Normalize
        const total = Object.values(blendedExpression).reduce((a, b) => a + b, 0);
        if (total > 0) {
            for (let k in blendedExpression) {
                blendedExpression[k] /= total;
            }
        } else {
            // If all values are zero, default to neutral
            if (availableExpressions.includes('neutral')) {
                blendedExpression.neutral = 1.0;
            } else if (availableExpressions.length > 0) {
                blendedExpression[availableExpressions[0]] = 1.0;
            } else {
                blendedExpression.neutral = 1.0;
            }
        }

        setTargetExpression(blendedExpression);
    } catch (e) {
        console.error("[Live2D] Emotion update error:", e);
    }
}

/**
 * Updates head position based on label ('nod', 'shake', etc.)
 * @param {string} hmLabel
 * @param {number} deltaTime
 */
export function updateLive2DHeadMovement(hmLabel, deltaTime) {
    if (!live2dInitialized || !live2dModel?.internalModel?.coreModel) return;

    try {
        // Define target rotations
        const baseScale = 0.05;
        switch (hmLabel) {
            case 'nod': // Down/up motion
                targetHeadRotation.x = baseScale;
                break;
            case 'shake': // Side to side
                targetHeadRotation.y = baseScale;
                break;
            case 'tilt-left':
                targetHeadRotation.z = baseScale;
                break;
            case 'tilt-right':
                targetHeadRotation.z = -baseScale;
                break;
            default:
                targetHeadRotation = { x: 0, y: 0, z: 0 };
        }

        // Interpolate
        currentHeadRotation.x = lerp(currentHeadRotation.x, targetHeadRotation.x, deltaTime / headMovementDuration);
        currentHeadRotation.y = lerp(currentHeadRotation.y, targetHeadRotation.y, deltaTime / headMovementDuration);
        currentHeadRotation.z = lerp(currentHeadRotation.z, targetHeadRotation.z, deltaTime / headMovementDuration);
    } catch (e) {
        console.error("[Live2D] Head movement update error:", e);
    }
}

/**
 * Handles window resize events for the Live2D container
 */
function onLive2DResize() {
    if (!live2dInitialized || !pixiApp || !live2dContainer) return;
    
    try {
        const width = live2dContainer.clientWidth;
        const height = live2dContainer.clientHeight;
        
        if (width <= 0 || height <= 0) return; // Ignore resize if container is hidden
        
        // Resize PIXI application
        pixiApp.renderer.resize(width, height);
        
        // Recenter model
        if (live2dModel) {
            live2dModel.x = pixiApp.screen.width / 2;
            live2dModel.y = pixiApp.screen.height / 2; // Centered without offset for smaller model
        }
        
        console.log(`[Live2D] Resized to ${width}x${height}`);
    } catch (e) {
        console.error("[Live2D] Resize error:", e);
    }
}

/**
 * Checks if Live2D is ready for rendering
 * @returns {boolean} True if Live2D is initialized and ready
 */
export function isLive2DReady() {
    return live2dInitialized && pixiApp !== null && live2dModel !== null;
}

/**
 * Cleans up Pixi.js and Live2D resources.
 */
export function cleanupLive2D() {
    if (!live2dInitialized && !pixiApp && !live2dModel) return; // Skip if already clean
    
    console.log("[Live2D] Cleaning up resources...");
    
    // Remove event listeners
    window.removeEventListener('resize', debouncedOnLive2DResize);
    
    // Clean up PIXI resources
    if (pixiApp) {
        if (live2dModel) {
            pixiApp.stage.removeChild(live2dModel);
            live2dModel = null;
        }
        
        pixiApp.destroy(true, { children: true, texture: true, baseTexture: true });
        pixiApp = null;
    }
    
    // Remove canvas from DOM if it exists
    if (live2dContainer) {
        const canvasElements = live2dContainer.querySelectorAll('canvas');
        canvasElements.forEach(canvas => {
            if (canvas.parentNode === live2dContainer) {
                live2dContainer.removeChild(canvas);
            }
        });
    }
    
    // Reset state variables
    currentExpression = null;
    targetExpression = null;
    transitionProgress = 0;
    currentHeadRotation = { x: 0, y: 0, z: 0 };
    targetHeadRotation = { x: 0, y: 0, z: 0 };
    
    live2dInitialized = false;
    console.log("[Live2D] Cleanup complete");
}

/**
 * Adjusts the scale of the Live2D model
 * @param {number} scaleFactor - New scale factor (e.g., 0.125 for 50% reduction from 0.25)
 */
export function setLive2DScale(scaleFactor) {
    if (!live2dInitialized || !live2dModel) return;
    
    try {
        live2dModel.scale.set(scaleFactor);
        console.log(`[Live2D] Model scale set to ${scaleFactor}`);
    } catch (e) {
        console.error("[Live2D] Error setting model scale:", e);
    }
}

/**
 * Immediately applies the new scale to the current model
 */
export function applyCurrentScale() {
    if (!live2dInitialized || !live2dModel) return;
    
    try {
        const live2dConfig = Config.Live2D || DEFAULT_LIVE2D_CONFIG;
        const modelScale = live2dConfig.Scale || 0.06875;
        live2dModel.scale.set(modelScale);
        console.log(`[Live2D] Applied current scale: ${modelScale}`);
    } catch (e) {
        console.error("[Live2D] Error applying scale:", e);
    }
}

// Call this function at the end of initLive2D to ensure scale is applied
applyCurrentScale();
