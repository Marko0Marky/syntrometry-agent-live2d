import { Config, emotionNames } from './config.js';
import { clamp, displayError, zeros, lerp, debounce } from './utils.js';

// Enhanced configuration with validation
const DEFAULT_LIVE2D_CONFIG = {
    ModelPath: 'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Hiyori/Hiyori.model3.json',
    Scale: 0.103125,
    FallbackModels: [
        'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Hiyori/Hiyori.model3.json',
        'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Rice/Rice.model3.json',
        'https://cdn.jsdelivr.net/gh/Live2D/CubismWebSamples@master/Samples/Resources/Mao/Mao.model3.json'
    ],
    LoadTimeout: 10000, // 10 seconds
    RetryAttempts: 3,
    AnimationSpeed: 1.0,
    AutoBlink: true,
    AutoBreath: true
};

// Enhanced state management
class Live2DState {
    constructor() {
        this.reset();
    }
    
    reset() {
        this.pixiApp = null;
        this.model = null;
        this.container = null;
        this.initialized = false;
        this.loading = false;
        this.error = null;
        
        // Animation state
        this.currentExpression = null;
        this.targetExpression = null;
        this.expressionTransition = { progress: 0, duration: 0.5 };
        
        // Head movement state
        this.headMovement = {
            current: { x: 0, y: 0, z: 0 },
            target: { x: 0, y: 0, z: 0 },
            duration: 1.0,
            smoothing: 0.1
        };
        
        // Available parameters cache
        this.availableParameters = new Set();
        this.availableExpressions = [];
        
        // Performance tracking
        this.lastFrameTime = 0;
        this.frameCount = 0;
    }
}

const state = new Live2DState();

// Enhanced event system
class Live2DEventEmitter {
    constructor() {
        this.events = new Map();
    }
    
    on(event, callback) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(callback);
    }
    
    off(event, callback) {
        if (this.events.has(event)) {
            this.events.get(event).delete(callback);
        }
    }
    
    emit(event, ...args) {
        if (this.events.has(event)) {
            this.events.get(event).forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`[Live2D Event] Error in ${event} handler:`, error);
                }
            });
        }
    }
}

const eventEmitter = new Live2DEventEmitter();

// Debounced resize handler
const debouncedResize = debounce(handleResize, 250);

/**
 * Enhanced model loading with better error handling and retry logic
 */
async function loadModelWithRetry(modelPath, retryCount = 0) {
    const config = { ...DEFAULT_LIVE2D_CONFIG, ...(Config.Live2D || {}) };
    const maxRetries = config.RetryAttempts;
    
    try {
        console.log(`[Live2D] Loading model: ${modelPath} (attempt ${retryCount + 1})`);
        
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Model loading timeout')), config.LoadTimeout);
        });
        
        // Race between model loading and timeout
        const modelPromise = PIXI.live2d.Live2DModel.from(modelPath);
        const model = await Promise.race([modelPromise, timeoutPromise]);
        
        return model;
    } catch (error) {
        console.warn(`[Live2D] Failed to load model (attempt ${retryCount + 1}): ${error.message}`);
        
        if (retryCount < maxRetries - 1) {
            // Wait before retry with exponential backoff
            const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
            return loadModelWithRetry(modelPath, retryCount + 1);
        }
        
        throw error;
    }
}

/**
 * Enhanced initialization with better validation and error handling
 */
export async function initLive2D() {
    if (state.loading) {
        console.warn('[Live2D] Already initializing, please wait...');
        return false;
    }
    
    if (state.initialized) {
        console.log('[Live2D] Already initialized');
        return true;
    }
    
    console.log('[Live2D] Starting initialization...');
    state.loading = true;
    state.error = null;
    
    try {
        // Validate dependencies
        if (!validateDependencies()) {
            throw new Error('Required dependencies not available');
        }
        
        // Setup container
        if (!setupContainer()) {
            throw new Error('Failed to setup container');
        }
        
        // Create PIXI application
        if (!createPixiApplication()) {
            throw new Error('Failed to create PIXI application');
        }
        
        // Load model with fallbacks
        await loadModel();
        
        // Configure model
        configureModel();
        
        // Setup interactions and parameters
        setupModelFeatures();
        
        // Setup event listeners
        setupEventListeners();
        
        // Initialize default state
        initializeDefaultState();
        
        state.initialized = true;
        state.loading = false;
        
        eventEmitter.emit('initialized');
        console.log('[Live2D] Initialization complete');
        
        return true;
        
    } catch (error) {
        state.error = error;
        state.loading = false;
        
        displayError(`Live2D initialization failed: ${error.message}`, false, 'error-message');
        console.error('[Live2D] Initialization error:', error);
        
        cleanupLive2D();
        eventEmitter.emit('error', error);
        
        return false;
    }
}

/**
 * Validate required dependencies
 */
function validateDependencies() {
    const checks = [
        { name: 'PIXI', test: () => typeof window.PIXI !== 'undefined' },
        { name: 'Live2DCubismCore', test: () => typeof window.Live2DCubismCore !== 'undefined' },
        { name: 'PIXI.live2d', test: () => typeof window.PIXI !== 'undefined' && typeof window.PIXI.live2d !== 'undefined' }
    ];
    
    const missing = checks.filter(check => !check.test()).map(check => check.name);
    
    if (missing.length > 0) {
        console.error(`[Live2D] Missing dependencies: ${missing.join(', ')}`);
        
        // Provide helpful error messages
        if (missing.includes('PIXI.live2d')) {
            console.error('[Live2D] PIXI.live2d plugin not found. Make sure to load the Live2D PIXI plugin after PIXI.js');
            console.error('[Live2D] Expected script order: PIXI.js → Live2DCubismCore → PIXI Live2D plugin');
        }
        
        return false;
    }
    
    return true;
}

/**
 * Setup and validate container
 */
function setupContainer() {
    state.container = document.getElementById('live2d-container');
    
    if (!state.container) {
        console.error('[Live2D] Container #live2d-container not found');
        return false;
    }
    
    const { clientWidth: width, clientHeight: height } = state.container;
    
    if (width <= 0 || height <= 0) {
        console.warn('[Live2D] Container has invalid dimensions, will use fallback');
    }
    
    return true;
}

/**
 * Create PIXI application with enhanced settings
 */
function createPixiApplication() {
    const { clientWidth: width, clientHeight: height } = state.container;
    
    try {
        state.pixiApp = new PIXI.Application({
            width: width || 300,
            height: height || 400,
            transparent: true,
            antialias: true,
            autoStart: true,
            resolution: Math.min(window.devicePixelRatio || 1, 2), // Cap at 2x for performance
            powerPreference: 'high-performance'
        });
        
        state.container.appendChild(state.pixiApp.view);
        return true;
        
    } catch (error) {
        console.error('[Live2D] Failed to create PIXI application:', error);
        return false;
    }
}

/**
 * Enhanced model loading with comprehensive fallback system
 */
async function loadModel() {
    const config = { ...DEFAULT_LIVE2D_CONFIG, ...(Config.Live2D || {}) };
    const modelsToTry = [config.ModelPath, ...config.FallbackModels];
    
    let lastError = null;
    
    for (const modelPath of modelsToTry) {
        try {
            state.model = await loadModelWithRetry(modelPath);
            console.log(`[Live2D] Successfully loaded model: ${modelPath}`);
            
            // Update loading UI
            updateLoadingStatus('Agent Ready');
            
            return;
            
        } catch (error) {
            console.warn(`[Live2D] Failed to load model ${modelPath}:`, error.message);
            lastError = error;
        }
    }
    
    throw lastError || new Error('All model loading attempts failed');
}

/**
 * Configure the loaded model
 */
function configureModel() {
    const config = { ...DEFAULT_LIVE2D_CONFIG, ...(Config.Live2D || {}) };
    
    // Set scale and position
    state.model.scale.set(config.Scale);
    state.model.anchor.set(0.5, 0.5);
    
    // Center the model
    centerModel();
    
    // Add to stage
    state.pixiApp.stage.addChild(state.model);
}

/**
 * Center the model in the container
 */
function centerModel() {
    if (!state.model || !state.pixiApp) return;
    
    state.model.x = state.pixiApp.screen.width / 2;
    state.model.y = state.pixiApp.screen.height / 2;
}

/**
 * Setup model features and cache available parameters
 */
function setupModelFeatures() {
    cacheAvailableParameters();
    cacheAvailableExpressions();
    setupHitAreas();
    setupAutoAnimations();
}

/**
 * Cache available model parameters for performance
 */
function cacheAvailableParameters() {
    if (!state.model?.internalModel?.coreModel) return;
    
    try {
        const coreModel = state.model.internalModel.coreModel;
        const paramCount = coreModel.getParameterCount();
        
        state.availableParameters.clear();
        
        for (let i = 0; i < paramCount; i++) {
            const paramId = coreModel.getParameterId(i);
            if (paramId) {
                state.availableParameters.add(paramId);
            }
        }
        
        console.log(`[Live2D] Cached ${state.availableParameters.size} parameters`);
        
    } catch (error) {
        console.error('[Live2D] Error caching parameters:', error);
        // Ensure we have a valid Set even if caching fails
        state.availableParameters = new Set();
    }
}

/**
 * Cache available expressions
 */
function cacheAvailableExpressions() {
    try {
        if (state.model?.internalModel?.settings?.expressions && Array.isArray(state.model.internalModel.settings.expressions)) {
            state.availableExpressions = state.model.internalModel.settings.expressions.map(e => e.name || e).filter(Boolean);
            console.log(`[Live2D] Available expressions: ${state.availableExpressions.join(', ')}`);
        } else {
            state.availableExpressions = [];
            console.log('[Live2D] No expressions found on model');
        }
    } catch (error) {
        console.error('[Live2D] Error caching expressions:', error);
        state.availableExpressions = [];
    }
}

/**
 * Enhanced hit area setup with better interaction feedback
 */
function setupHitAreas() {
    if (!state.model) return;
    
    state.model.on('hit', (hitAreas) => {
        console.log(`[Live2D] Hit areas: ${hitAreas.join(', ')}`);
        
        // Enhanced interaction responses
        if (hitAreas.includes('body')) {
            setTargetExpression({ playful: 0.8, happy: 0.2 });
            eventEmitter.emit('interaction', 'body', hitAreas);
        } else if (hitAreas.includes('head')) {
            setTargetExpression({ surprised: 0.7, curious: 0.3 });
            eventEmitter.emit('interaction', 'head', hitAreas);
        } else if (hitAreas.includes('face')) {
            setTargetExpression({ happy: 0.6, playful: 0.4 });
            eventEmitter.emit('interaction', 'face', hitAreas);
        }
    });
}

/**
 * Setup automatic animations like blinking and breathing
 */
function setupAutoAnimations() {
    const config = { ...DEFAULT_LIVE2D_CONFIG, ...(Config.Live2D || {}) };
    
    if (config.AutoBlink && state.availableParameters.has('ParamEyeLOpen')) {
        // Auto-blink implementation would go here
        console.log('[Live2D] Auto-blink enabled');
    }
    
    if (config.AutoBreath && state.availableParameters.has('ParamBreath')) {
        // Auto-breath implementation would go here
        console.log('[Live2D] Auto-breath enabled');
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    window.addEventListener('resize', debouncedResize);
    
    // Add visibility change listener for performance optimization
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * Initialize default model state
 */
function initializeDefaultState() {
    setTargetExpression({ neutral: 1.0 });
}

/**
 * Enhanced expression system with validation and smooth transitions
 */
export function setTargetExpression(expression) {
    if (!state.initialized || !state.model) {
        console.warn('[Live2D] Cannot set expression: not initialized');
        return false;
    }
    
    // Validate expression object
    if (!expression || typeof expression !== 'object') {
        console.warn('[Live2D] Invalid expression object');
        return false;
    }
    
    // Filter out expressions that don't exist on the model
    const validExpression = {};
    let hasValidExpressions = false;
    
    for (const [name, value] of Object.entries(expression)) {
        if (state.availableExpressions.length === 0 || state.availableExpressions.includes(name)) {
            validExpression[name] = Math.max(0, Math.min(1, value || 0));
            hasValidExpressions = true;
        }
    }
    
    if (!hasValidExpressions) {
        console.warn('[Live2D] No valid expressions found in:', Object.keys(expression));
        return false;
    }
    
    state.targetExpression = validExpression;
    state.expressionTransition.progress = 0;
    
    eventEmitter.emit('expressionChanged', validExpression);
    return true;
}

/**
 * Enhanced emotion mapping with better validation
 */
export function updateLive2DEmotions(emotionsTensor) {
    if (!state.initialized || !state.model || !emotionsTensor) return;
    
    try {
        const emotions = emotionsTensor.arraySync()[0];
        if (!Array.isArray(emotions) || emotions.length < 6) {
            console.warn("[Live2D] Invalid emotions tensor format");
            return;
        }
        
        const [joy, fear, curiosity, frustration, calm, surprise] = emotions;
        
        // Enhanced emotion mapping
        const expressionMap = createExpressionMapping({
            joy: clamp(joy, 0, 1),
            fear: clamp(fear, 0, 1),
            curiosity: clamp(curiosity, 0, 1),
            frustration: clamp(frustration, 0, 1),
            calm: clamp(calm, 0, 1),
            surprise: clamp(surprise, 0, 1)
        });
        
        setTargetExpression(expressionMap);
        
    } catch (error) {
        console.error("[Live2D] Error updating emotions:", error);
    }
}

/**
 * Create expression mapping based on available expressions
 */
function createExpressionMapping(emotions) {
    const { joy, fear, curiosity, frustration, calm, surprise } = emotions;
    const mapping = {};
    
    // Prioritize expressions that exist on the model
    if (state.availableExpressions.includes('neutral')) {
        mapping.neutral = calm * 0.8;
    }
    
    if (state.availableExpressions.includes('happy')) {
        mapping.happy = joy * (1 - frustration * 0.5);
    }
    
    if (state.availableExpressions.includes('sad')) {
        mapping.sad = fear * (1 - calm);
    }
    
    if (state.availableExpressions.includes('angry')) {
        mapping.angry = frustration * (1 - joy * 0.7);
    }
    
    if (state.availableExpressions.includes('surprised')) {
        mapping.surprised = surprise * Math.min(fear + curiosity, 1);
    }
    
    if (state.availableExpressions.includes('playful')) {
        mapping.playful = (joy + curiosity) * 0.5 * (1 - frustration);
    }
    
    // Normalize the mapping
    const total = Object.values(mapping).reduce((sum, val) => sum + val, 0);
    if (total > 0) {
        for (const key in mapping) {
            mapping[key] /= total;
        }
    } else {
        // Fallback to neutral or first available expression
        const fallback = state.availableExpressions.includes('neutral') 
            ? 'neutral' 
            : state.availableExpressions[0] || 'neutral';
        mapping[fallback] = 1.0;
    }
    
    return mapping;
}

/**
 * Enhanced head movement with better parameter handling
 */
export function updateLive2DHeadMovement(hmLabel, deltaTime) {
    if (!state.initialized || !state.model?.internalModel?.coreModel) return;
    
    const intensity = 0.05;
    const movements = {
        'nod': { x: intensity, y: 0, z: 0 },
        'shake': { x: 0, y: intensity, z: 0 },
        'tilt-left': { x: 0, y: 0, z: intensity },
        'tilt-right': { x: 0, y: 0, z: -intensity },
        'default': { x: 0, y: 0, z: 0 }
    };
    
    state.headMovement.target = movements[hmLabel] || movements.default;
}

/**
 * Enhanced update loop with performance optimization
 */
export function updateLive2D(deltaTime) {
    if (!state.initialized || !state.model?.internalModel?.coreModel) return;
    
    try {
        // Performance tracking
        state.frameCount++;
        const now = performance.now();
        
        // Skip updates if running too fast (cap at 60fps)
        if (now - state.lastFrameTime < 16.67) return;
        state.lastFrameTime = now;
        
        // Update model position
        centerModel();
        
        // Update expressions
        updateExpressions(deltaTime);
        
        // Update head movement
        updateHeadMovement(deltaTime);
        
        // Update automatic animations
        updateAutoAnimations(deltaTime);
        
        eventEmitter.emit('updated', deltaTime);
        
    } catch (error) {
        console.error("[Live2D] Update error:", error);
        eventEmitter.emit('updateError', error);
    }
}

/**
 * Enhanced expression updating with smooth transitions
 */
function updateExpressions(deltaTime) {
    if (!state.targetExpression) return;
    
    if (!state.currentExpression) {
        state.currentExpression = { ...state.targetExpression };
        state.model.expression(state.currentExpression);
        return;
    }
    
    // Update transition progress
    state.expressionTransition.progress += deltaTime / state.expressionTransition.duration;
    
    if (state.expressionTransition.progress >= 1) {
        // Transition complete
        state.model.expression(state.targetExpression);
        state.currentExpression = { ...state.targetExpression };
        state.targetExpression = null;
        state.expressionTransition.progress = 0;
    } else {
        // Interpolate between current and target
        const blended = interpolateExpressions(
            state.currentExpression, 
            state.targetExpression, 
            state.expressionTransition.progress
        );
        state.model.expression(blended);
    }
}

/**
 * Enhanced head movement with smoother interpolation
 */
function updateHeadMovement(deltaTime) {
    const hm = state.headMovement;
    const coreModel = state.model.internalModel.coreModel;
    
    // Smooth interpolation
    hm.current.x = lerp(hm.current.x, hm.target.x, hm.smoothing);
    hm.current.y = lerp(hm.current.y, hm.target.y, hm.smoothing);
    hm.current.z = lerp(hm.current.z, hm.target.z, hm.smoothing);
    
    // Apply parameters if they exist
    const parameterMap = {
        'ParamAngleX': hm.current.x * 30,
        'ParamAngleY': hm.current.y * 30,
        'ParamAngleZ': hm.current.z * 30,
        'ParamEyeBallX': hm.current.y * 0.8,
        'ParamEyeBallY': -hm.current.x * 0.8,
        'ParamBodyAngleX': hm.current.x * 10,
        'ParamBodyAngleY': hm.current.y * 10,
        'ParamBodyAngleZ': hm.current.z * 10
    };
    
    for (const [param, value] of Object.entries(parameterMap)) {
        if (state.availableParameters.has(param)) {
            coreModel.setParameterValueById(param, value);
        }
    }
}

/**
 * Update automatic animations
 */
function updateAutoAnimations(deltaTime) {
    const config = { ...DEFAULT_LIVE2D_CONFIG, ...(Config.Live2D || {}) };
    const time = performance.now() * 0.001;
    
    if (config.AutoBlink && state.availableParameters.has('ParamEyeLOpen')) {
        // Simple blink animation
        const blinkValue = Math.abs(Math.sin(time * 0.5)) > 0.95 ? 0 : 1;
        state.model.internalModel.coreModel.setParameterValueById('ParamEyeLOpen', blinkValue);
        
        if (state.availableParameters.has('ParamEyeROpen')) {
            state.model.internalModel.coreModel.setParameterValueById('ParamEyeROpen', blinkValue);
        }
    }
    
    if (config.AutoBreath && state.availableParameters.has('ParamBreath')) {
        // Breathing animation
        const breathValue = Math.sin(time * 2) * 0.5 + 0.5;
        state.model.internalModel.coreModel.setParameterValueById('ParamBreath', breathValue);
    }
}

/**
 * Improved interpolation function
 */
function interpolateExpressions(a, b, t) {
    if (!a || !b) return b || a || { neutral: 1.0 };
    
    const result = {};
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    
    for (const key of allKeys) {
        const valueA = a[key] || 0;
        const valueB = b[key] || 0;
        result[key] = valueA * (1 - t) + valueB * t;
    }
    
    return result;
}

/**
 * Enhanced resize handling
 */
function handleResize() {
    if (!state.initialized || !state.pixiApp || !state.container) return;
    
    try {
        const { clientWidth: width, clientHeight: height } = state.container;
        
        if (width <= 0 || height <= 0) return;
        
        state.pixiApp.renderer.resize(width, height);
        centerModel();
        
        console.log(`[Live2D] Resized to ${width}x${height}`);
        eventEmitter.emit('resized', { width, height });
        
    } catch (error) {
        console.error("[Live2D] Resize error:", error);
    }
}

/**
 * Handle visibility changes for performance
 */
function handleVisibilityChange() {
    if (!state.initialized || !state.pixiApp) return;
    
    if (document.hidden) {
        state.pixiApp.stop();
        console.log('[Live2D] Paused due to visibility change');
    } else {
        state.pixiApp.start();
        console.log('[Live2D] Resumed due to visibility change');
    }
}

/**
 * Update loading status UI
 */
function updateLoadingStatus(text) {
    const loadingText = document.getElementById('avatar-loading-text');
    const avatarLoading = document.getElementById('avatar-loading');
    
    if (loadingText) {
        loadingText.textContent = text;
    }
    
    if (avatarLoading && text === 'Agent Ready') {
        avatarLoading.style.opacity = '0';
        setTimeout(() => {
            avatarLoading.style.display = 'none';
        }, 500);
    }
}

/**
 * Enhanced cleanup with complete resource management
 */
export function cleanupLive2D() {
    console.log("[Live2D] Starting cleanup...");
    
    // Remove event listeners
    window.removeEventListener('resize', debouncedResize);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    
    // Clean up PIXI resources
    if (state.pixiApp) {
        if (state.model) {
            state.pixiApp.stage.removeChild(state.model);
        }
        
        state.pixiApp.destroy(true, { children: true, texture: true, baseTexture: true });
    }
    
    // Remove canvas from DOM
    if (state.container) {
        const canvases = state.container.querySelectorAll('canvas');
        canvases.forEach(canvas => {
            if (canvas.parentNode === state.container) {
                state.container.removeChild(canvas);
            }
        });
    }
    
    // Reset state
    state.reset();
    
    // Clear event listeners
    eventEmitter.events.clear();
    
    console.log("[Live2D] Cleanup complete");
}

/**
 * Enhanced scale management
 */
export function setLive2DScale(scaleFactor) {
    if (!state.initialized || !state.model) {
        console.warn('[Live2D] Cannot set scale: not initialized');
        return false;
    }
    
    try {
        const clampedScale = clamp(scaleFactor, 0.01, 2.0);
        state.model.scale.set(clampedScale);
        console.log(`[Live2D] Model scale set to ${clampedScale}`);
        
        eventEmitter.emit('scaleChanged', clampedScale);
        return true;
        
    } catch (error) {
        console.error("[Live2D] Error setting scale:", error);
        return false;
    }
}

/**
 * Apply current configuration scale
 */
export function applyCurrentScale() {
    const config = { ...DEFAULT_LIVE2D_CONFIG, ...(Config.Live2D || {}) };
    return setLive2DScale(config.Scale);
}

// Utility functions and exports
export function isLive2DReady() {
    return state.initialized && state.pixiApp !== null && state.model !== null;
}

export function getLive2DState() {
    return {
        initialized: state.initialized,
        loading: state.loading,
        error: state.error,
        availableExpressions: [...state.availableExpressions],
        availableParameters: [...state.availableParameters],
        frameCount: state.frameCount
    };
}

export function onLive2DEvent(event, callback) {
    eventEmitter.on(event, callback);
}

export function offLive2DEvent(event, callback) {
    eventEmitter.off(event, callback);
}

// Legacy exports for compatibility
export { state as live2dInitialized };
export const onLive2DResize = handleResize;
