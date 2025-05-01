import { Live2DModel, InternalModel, } from 'pixi-live2d-display';
import {displayError, lerp} from './utils';
import * as PIXI from 'pixi.js'
let pixiApp: PIXI.Application | null = null;
let live2dModel: Live2DModel | null = null;
export let live2dInitialized: boolean = false;
;

export interface Rotation {
    x: number;
    y: number;
    z: number;
}

// Variables for smoother head movement
let targetHeadRotation: Rotation = { x: 0, y: 0, z: 0 }; // Target rotation angles
let currentHeadRotation: Rotation = { x: 0, y: 0, z: 0 }; // Interpolated values
let headMovementTransition: number = 0; // 0 to 1
let headMovementDuration: number = 1.0; // Transition duration in seconds

/** 
 * Initializes the Pixi.js application and loads the Live2D model.
 * @returns {Promise<boolean>} Resolves with true if successful, false otherwise.
 */
export async function initLive2D(): Promise<boolean> {
    const container = document.getElementById('live2d-container');

    if (!container) {
        displayError("Live2D container not found.");
        return false;
    }

    const width: number = container.clientWidth;
    const height: number = container.clientHeight;
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
    const modelUrl: string = 'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Hiyori/Hiyori.model3.json';
    console.log(`[Live2D] Loading model from ${modelUrl}`);
    live2dModel = await Live2DModel.from(modelUrl);

    if (live2dModel) {
        // Adjust scale to fit container
        const modelBaseSize: number = 2000; // Hiyori model approximate size
        const scaleFactor: number = Math.min(width, height) / modelBaseSize * 1.0; // Adjusted for visibility
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
    pixiApp.stage.addChild(live2dModel as any);
    return true;
}


function setupHitAreas(): void {
    if (!live2dModel) return;

    live2dModel.on('hit', (hitAreas: string[]) => {
        if (hitAreas.includes('body')) {
            setTargetExpression({ playful: 0.8, happy: 0.2, surprised: 0, curious: 0, neutral: 0, sad: 0, angry: 0, anxious: 0, thoughtful: 0 } as Expression);
        } else if (hitAreas.includes('head')) {
            setTargetExpression({ playful: 0, happy: 0, surprised: 0.7, curious: 0, neutral: 0, sad: 0, angry: 0, anxious: 0, thoughtful: 0 } as Expression);
        }
    })
}


export interface Expression {
    neutral: number;
    happy: number;
    sad: number;
    angry: number;
    surprised: number;
    anxious: number;
    thoughtful: number;
    playful: number;
}

/**
 * Updates expression with optional blending.
 * @param {Object} expression - e.g., { happy: 0.6, surprised: 0.4 }
 */
let currentExpression: Expression | null = null;
let targetExpression: Expression | null = null;
let transitionProgress: number = 0;
const TRANSITION_DURATION: number = 0.5;

export function setTargetExpression(expression: Expression): void {
    targetExpression = expression;
    transitionProgress = 0;
}

function interpolateExpressions(a: Expression | null, b: Expression | null, t: number): Expression {
    const result: Expression = { neutral: 0, happy: 0, sad: 0, angry: 0, surprised: 0, anxious: 0, thoughtful: 0, playful: 0 };
    const keys: Set<string> = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    for (let key of keys) {
        result[key as keyof Expression] = ((a && a[key as keyof Expression]) || 0) * (1 - t) + ((b && b[key as keyof Expression]) || 0) * t;
    }
    return result as Expression;
}

/**
 * Called every frame to update Live2D model.
 * @param {number} deltaTime - Time since last frame (in seconds)
 */
export function updateLive2D(deltaTime: number): void {
    if (!live2dInitialized || !live2dModel || !pixiApp) return;

    // Keep model centered with manual offset
    live2dModel.x = pixiApp!.screen.width / 2;
    live2dModel.y = pixiApp!.screen.height / 2 + 20; // Manual offset
    console.log(`[Live2D] Update position: x=${live2dModel.x}, y=${live2dModel.y}, canvas: ${pixiApp!.screen.width}x${pixiApp!.screen.height}`);

    // Update expression
    if (targetExpression && !currentExpression) {
        currentExpression = targetExpression;
    } else if (targetExpression && currentExpression) {
        transitionProgress += deltaTime / TRANSITION_DURATION;
        if (transitionProgress >= 1) {
            currentExpression = targetExpression;
            targetExpression = null;
            transitionProgress = 0;
    } else { interpolateExpressions(currentExpression, targetExpression, transitionProgress); }
}
    
    // Update head movement
    updateLive2DHeadMovement(deltaTime);
}

/**
 * Applies emotion-based expression blending.
 * @param {tf.Tensor|null} emotionsTensor Tensor of emotion intensities
 */
export function updateLive2DEmotions(emotionsTensor: any | null): void {    
    if (!live2dInitialized || !live2dModel || !emotionsTensor || !emotionsTensor.arraySync) return;

    const emotions: number[] = emotionsTensor.arraySync()[0];
    const joy: number = emotions[0] || 0;
    const fear: number = emotions[1] || 0;
    const curiosity: number = emotions[2] || 0;
    const frustration: number = emotions[3] || 0;
    const calm: number = emotions[4] || 0;
    const surprise: number = emotions[5] || 0;

    const blendedExpression: Expression = {
        neutral: 1,
        happy: joy * (1 - frustration),
        sad: fear * (calm < 0.5 ? 1 : 0),
        angry: frustration * (joy < 0.3 ? 1 : 0),
        surprised: surprise * (fear + curiosity),
        anxious: fear * (calm * 0.5),
        thoughtful: curiosity * calm*0.5,
        playful: (joy + curiosity) * (1 - frustration)
    };    
    
    let total: number = 0;    
    for (const k in blendedExpression) { 
         total += blendedExpression[k as keyof Expression] || 0; }    
        if (total > 0) {    
        
        for (const k in blendedExpression) {
            blendedExpression[k as keyof Expression] = (blendedExpression[k as keyof Expression] || 0) / total; }
        }

    setTargetExpression(blendedExpression);
    }

export function updateLive2DHeadMovement(deltaTime: number): void {
    if (live2dInitialized && live2dModel) {
        if (!live2dModel.internalModel?.coreModel) return;
        const baseScale: number = 0.05;
        targetHeadRotation.x = baseScale;
        targetHeadRotation.y = 0;
        targetHeadRotation.z = 0;
        // Interpolate
        currentHeadRotation.x = lerp(currentHeadRotation.x, targetHeadRotation.x, deltaTime / headMovementDuration);
        currentHeadRotation.y = lerp(currentHeadRotation.y, targetHeadRotation.y, deltaTime / headMovementDuration);
        currentHeadRotation.z = lerp(currentHeadRotation.z, targetHeadRotation.z, deltaTime / headMovementDuration);

        if (live2dModel.internalModel?.coreModel) {
            const coreModel: any = live2dModel.internalModel.coreModel;
            coreModel.setParameterValueById('ParamAngleX', currentHeadRotation.x * 30);
            coreModel.setParameterValueById('ParamAngleY', currentHeadRotation.y * 30);
            coreModel.setParameterValueById('ParamAngleZ', currentHeadRotation.z * 30);
        }
    }
}


export function cleanupLive2D(): void {
    if (!live2dInitialized) return;

    console.log("Cleaning up Live2D/Pixi.js...");

    if (pixiApp) {
        pixiApp.destroy(true);
        pixiApp = null;
    }

    live2dModel = null;
    live2dInitialized = false;

    console.log("Live2D/Pixi.js cleanup complete.");
}