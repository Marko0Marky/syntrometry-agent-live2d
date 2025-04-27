// js/viz-live2d.js

import { Config, emotionNames } from './config.js';
import { clamp, displayError, zeros, lerp } from './utils.js';

// Assumes PIXI, Live2DCubismCore, PIXI.live2d are available globally via CDN

let pixiApp = null; // Pixi Application instance
let live2dModel = null; // Live2D Model instance
export let live2dInitialized = false; // Flag to check if Live2D is initialized

// Variables for smoother head movement (parameter control)
let targetHeadRotation = { x: 0, y: 0, z: 0 }; // Target rotation angles (scaled units)
let currentHeadRotation = { x: 0, y: 0, z: 0 }; // Current interpolated rotation angles (scaled units)
let headMovementTransition = 0; // Transition progress (0 to 1)
let headMovementDuration = 1.0; // Duration for the current transition

/**
 * Initializes the Pixi.js application and loads the Live2D model.
 * @returns {Promise<boolean>} Resolves with true if successful, false otherwise.
 */
export async function initLive2D() {
    // Check if required libraries are loaded (criticalError check is in app.js)
    if (typeof PIXI === 'undefined' || typeof PIXI.live2d === 'undefined' || typeof Live2DCubismCore === 'undefined') {
        displayError("Pixi.js, pixi-live2d-display, or Cubism Core not loaded. Live2D avatar will not be displayed.", false, 'error-message');
        live2dInitialized = false;
        return false;
    }
    try {
        // Get the container element
        const container = document.getElementById('live2d-container');
        if (!container) {
            displayError("Live2D container not found.", false, 'error-message');
            live2dInitialized = false;
            return false;
        }

        // Get container dimensions
        const width = container.clientWidth;
        const height = container.clientHeight;
         if (width <= 0 || height <= 0) {
             displayError("Live2D container has zero dimensions.", false, 'error-message');
             live2dInitialized = false;
             return false;
         }

        // Use the offscreen canvas as the view if available and configured
        const offscreenCanvas = document.getElementById('live2d-offscreen-canvas');
        const viewElement = offscreenCanvas || container.querySelector('canvas');


         // Revert to original logic: render directly to container's canvas.
         pixiApp = new PIXI.Application({
            width: width,
            height: height,
            transparent: true,
            antialias: true,
            view: container.querySelector('canvas') // Use existing canvas if present
        });

         // If canvas was not found and created by Pixi, append it to the container
         if (!container.contains(pixiApp.view)) {
             container.appendChild(pixiApp.view);
             // Add resize observer if not using resizeTo container
             // new ResizeObserver(entries => {
             //     for (const entry of entries) {
             //         if (entry.target === container) {
             //             pixiApp.renderer.resize(entry.contentRect.width, entry.contentRect.height);
             //             // Re-center model if needed
             //             if (live2dModel) {
             //                 live2dModel.position.set(pixiApp.view.width / 2, pixiApp.view.height / 2);
             //             }
             //         }
             //     }
             // }).observe(container);
         }


        // Define the Live2D model URL
        const modelUrl = 'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Hiyori/Hiyori.model3.json';
        console.log(`[Live2D] Loading model from ${modelUrl}`);

        // Load the Live2D model using pixi-live2d-display
        live2dModel = await PIXI.live2d.Live2DModel.from(modelUrl);

        // Add the model to the Pixi stage
        pixiApp.stage.addChild(live2dModel);

        // --- Positioning and Scaling (like in Version 2 for centering) ---
        live2dModel.scale.set(0.15, 0.15); // Adjust scale to fit container
        live2dModel.anchor.set(0.5, 0.5); // Set anchor point to the center of the model
        // Position the model at the center of the container's canvas
        live2dModel.position.set(pixiApp.view.width / 2, pixiApp.view.height / 2);

        // Optional: Add interaction event (e.g., trigger expression on click)
        live2dModel.on('hit', (hitAreas) => {
            console.log('[Live2D] Hit areas:', hitAreas);
            if (hitAreas.includes('body')) {
                // Trigger a 'happy' expression if the body is hit
                 try {
                     // Check if the model has an expression function
                     if (live2dModel.expression) {
                         live2dModel.expression('happy');
                     } else {
                         console.warn('[Live2D] Model does not support expressions.');
                     }
                 } catch (e) {
                     console.warn(`[Live2D] Error triggering hit expression: ${e.message}`);
                 }
            }
        });

        live2dInitialized = true; // Set initialization flag
        console.log('[Live2D] Initialized successfully.');
        return true;
    } catch (e) {
        // Handle errors during Live2D initialization
        displayError(`Error initializing Live2D: ${e.message}. Live2D avatar will not be displayed.`, false, 'error-message');
        console.error('[Live2D] Full error:', e);
        live2dInitialized = false; // Ensure flag is false on failure
        return false; // Indicate failure
    }
}

/**
 * Updates Live2D model's emotional expression and body movements based on agent emotions.
 * @param {tf.Tensor|null} emotionsTensor Tensor of current emotion intensities.
 */
export function updateLive2DEmotions(emotionsTensor) {
    // Only update if initialized and model exists and is ready for parameter access
    if (!live2dInitialized || !live2dModel || !live2dModel.internalModel || !live2dModel.internalModel.coreModel) return;

    // Get emotion values as array safely
    const emotions = emotionsTensor && typeof emotionsTensor.arraySync === 'function' ? emotionsTensor.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]);
    if (emotions.length !== Config.Agent.EMOTION_DIM) {
         console.warn('[Live2D] Emotion tensor has unexpected size:', emotions.length);
         return; // Cannot process if dimensions mismatch
    }

    // Extract individual emotion values safely
    const joyVal = emotions[0] || 0;
    const fearVal = emotions[1] || 0;
    const curiosityVal = emotions[2] || 0;
    const frustrationVal = emotions[3] || 0;
    const calmVal = emotions[4] || 0;
    const surpriseVal = emotions[5] || 0;


    try {
         // Find the index of the dominant emotion
         const dominantEmotionIdx = emotions.length === Config.Agent.EMOTION_DIM ? emotions.indexOf(Math.max(...emotions)) : -1;

         // Get the name of the dominant emotion
         const dominantEmotion = dominantEmotionIdx !== -1 ? emotionNames[dominantEmotionIdx] : null;

         // Map dominant emotion names to Live2D expression names
         // Check your model's .model3.json file for available expressions (e.g., "expressions": [ ... ])
         const expressionMap = {
             'Joy': 'happy',
             'Fear': 'sad', // Using sad for fear as scared might not exist in all models
             'Curiosity': 'curious',
             'Frustration': 'angry',
             'Calm': 'neutral', // Using neutral for calm
             'Surprise': 'surprised'
             // Add more mappings if needed based on your model's expressions
         };

         // Get the expression name, defaulting to 'neutral' or null if no dominant emotion/mapping
         const expression = dominantEmotion ? expressionMap[dominantEmotion] : null;

         // Set the expression if a valid expression name was found and model supports expressions
         if (expression && live2dModel.expression) {
             live2dModel.expression(expression);
         } else if (live2dModel.expression) {
             // Optionally set a default expression if no dominant emotion/mapping or dominant emotion is 'Unknown'
             // live2dModel.expression('neutral'); // uncomment if you want a fallback expression
         }

         // --- Control Body Parameters based on Overall Intensity or Specific Emotions ---
         // Calculate overall intensity
         const intensity = emotions.reduce((sum, val) => sum + val, 0) / Config.Agent.EMOTION_DIM;

         // Example: Control body angle and breathing based on intensity (V1 parameter control)
         // Parameter names vary by model (e.g., ParamBodyAngleX, ParamBreath)
         // Check your model's .model3.json file for available parameters
         // Standard parameters often start with 'Param'
         const coreModel = live2dModel.internalModel.coreModel;
         if (coreModel && coreModel.setParameterValueById) {
             // Make body angle slightly sway based on intensity and time
             // ParamBodyAngleX typically ranges [-30, 30]
             const bodyAngleX = (Math.sin(Date.now() * 0.002) * 10 + (intensity - 0.5) * 20) * 0.5; // scaled to roughly [-15, 15]
             coreModel.setParameterValueById('ParamBodyAngleX', bodyAngleX);

             // Control breathing parameter (often ParamBreath or similar). Range might be [0, 1] or [-1, 1].
             // Assuming standard [0, 1] or similar, map intensity to [0.5, 1.0] for subtle effect
             const breathValue = intensity * 0.5 + 0.5; // min 0.5, max 1.0 breath
             coreModel.setParameterValueById('ParamBreath', breathValue);

             // Optional: Control eye open based on calm/fear
             const eyeOpenValue = clamp(0.7 + (calmVal - fearVal) * 0.6, 0, 1); // More open with calm, less with fear
              coreModel.setParameterValueById('ParamEyeLOpen', eyeOpenValue);
              coreModel.setParameterValueById('ParamEyeROpen', eyeOpenValue);

             // Optional: Control mouth open based on joy/surprise
             const mouthOpenValue = clamp(0.1 + joyVal * 0.4 + surpriseVal * 0.3, 0, 1); // Open with joy/surprise
              coreModel.setParameterValueById('ParamMouthOpenY', mouthOpenValue);
         } else {
             console.warn('[Live2D] Core model or setParameterValueById not available.');
         }

    } catch (e) {
        console.warn(`[Live2D] Error setting emotions/parameters: ${e.message}`);
        console.error('[Live2D] Full emotion update error:', e);
    }
}

/**
 * Updates Live2D model's head movement parameters based on predicted label and time delta.
 * Uses interpolation for smooth movement.
 * @param {string} hmLabel The predicted head movement label ('nod', 'shake', etc.).
 * @param {number} deltaTime The time elapsed since the last frame.
 */
export function updateLive2DHeadMovement(hmLabel, deltaTime) {
     // Only update if initialized and model exists with core model access
    if (!live2dInitialized || !live2dModel || !live2dModel.internalModel || !live2dModel.internalModel.coreModel) return;

     // Define target rotation values for each label (in arbitrary scaled units, then mapped to degrees)
     // These scaled units (e.g., 0.3, 0.4) will be multiplied by a factor (e.g., 30) to get degrees.
    let targetX = 0, targetY = 0, targetZ = 0;

    switch (hmLabel) {
        case 'nod':
            // Simulate a nodding motion (up/down on X axis)
            targetX = Math.sin(Date.now() * 0.005) * 0.5; // Oscillate on X axis (more pronounced)
            targetY = 0;
            targetZ = 0;
            headMovementDuration = 0.8; // Shorter duration for nods
            break;
        case 'shake':
            // Simulate a shaking motion (left/right on Y axis)
            targetX = 0;
            targetY = Math.sin(Date.now() * 0.007) * 0.6; // Oscillate on Y axis (more pronounced)
            targetZ = 0;
            headMovementDuration = 0.7; // Shorter duration for shakes
            break;
        case 'tilt_left':
             // Static tilt left (on Y axis)
            targetX = 0;
            targetY = 0.5; // Tilt on Y axis (positive)
            targetZ = 0.2; // Subtle tilt on Z axis
            headMovementDuration = 1.5; // Longer duration for static tilts
            break;
        case 'tilt_right':
             // Static tilt right (on Y axis)
            targetX = 0;
            targetY = -0.5; // Tilt on Y axis (negative)
            targetZ = -0.2; // Subtle tilt on Z axis
            headMovementDuration = 1.5; // Longer duration for static tilts
            break;
        case 'idle':
        default:
             // Subtle idle movement (small random-ish oscillations on X and Y)
            targetX = Math.sin(Date.now() * 0.001) * 0.1;
            targetY = Math.cos(Date.now() * 0.001) * 0.1;
            targetZ = 0; // Z is less common for idle head movement
            headMovementDuration = 2.0; // Longer duration for subtle idle
            break;
    }

     // Set the target rotation based on the label
     // Note: We are directly setting the *target* for the next interpolation step, not the current rotation.
     // The interpolation happens below using deltaTime.
     // The `targetHeadRotation` variable holds the desired final value for the current transition.

     // Smoothly interpolate current rotation towards the target rotation using lerp
     // Update transition progress
    headMovementTransition += deltaTime / headMovementDuration;
    // Reset transition if target is reached or label changes significantly
     // A simple approach: always lerp towards the *current* label's target.
     // If the label changes, the targetHeadRotation instantly updates, and the lerp smooths the change.
     // This is simpler than managing multiple transitions or detecting label changes explicitly here.

     // Let's use a fixed smooth factor for simplicity, independent of headMovementDuration
     const smoothFactor = 0.1; // 10% of the way towards the target each frame

    currentHeadRotation.x = lerp(currentHeadRotation.x, targetX, smoothFactor);
    currentHeadRotation.y = lerp(currentHeadRotation.y, targetY, smoothFactor);
    currentHeadRotation.z = lerp(currentHeadRotation.z, targetZ, smoothFactor);


     // Apply interpolated values to Live2D parameters (assuming standard parameter names)
     // Multipliers (e.g., *30) depend on the Live2D model's parameter ranges.
     // Standard Cubism parameters are often in degrees.
    const coreModel = live2dModel.internalModel.coreModel;
    if (coreModel && coreModel.setParameterValueById) {
        try {
            coreModel.setParameterValueById('ParamAngleX', currentHeadRotation.x * 30); // Map internal unit to degrees
            coreModel.setParameterValueById('ParamAngleY', currentHeadRotation.y * 30); // Map internal unit to degrees
            coreModel.setParameterValueById('ParamAngleZ', currentHeadRotation.z * 30); // Map internal unit to degrees
            // Optional: Link body angle to head Y angle subtly (V1 parameter control)
             coreModel.setParameterValueById('ParamBodyAngleX', currentHeadRotation.y * 10); // Subtle influence
        } catch (e) {
            // Avoid flooding console if parameter ID isn't found on every frame
             // console.warn(`[Live2D] Error setting head movement parameters: ${e.message}`);
        }
    }
    // Note: Pixi.js handles rendering internally via its ticker loop if it's running.
    // Manual rendering with `pixiApp.render()` is usually not needed unless ticker is stopped.
}

/**
 * Cleans up Pixi.js and Live2D resources.
 */
export function cleanupLive2D() {
    if (!live2dInitialized) return;
    console.log("Cleaning up Live2D/Pixi.js...");

    // Destroy Pixi.js application instance
    if (pixiApp) {
         // Destroy the view element (canvas) as well
        pixiApp.destroy(true);
        pixiApp = null;
    }

    // live2dModel itself might hold references, but pixiApp.destroy(true)
    // should handle most of the cleanup including removing the model from the stage
    // and disposing textures/geometries if the model is managed by Pixi's loader/resources.
    live2dModel = null; // Clear reference

    live2dInitialized = false;
    console.log("Live2D/Pixi.js cleanup complete.");
}