// js/app.ts

// --- Imports ---
import * as tf from '@tensorflow/tfjs';
import { Tensor } from '@tensorflow/tfjs-core';
import { 
    Chart, registerables
} from 'chart.js';
import 'chartjs-adapter-luxon';
import ChartStreaming, { RealTimeScale } from 'chartjs-plugin-streaming';
import * as THREE from 'three'; // Use THREE namespace
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'; // Import needed class

import { Config, emotionKeywords, emotionNames, HeadMovementLabel, HEAD_MOVEMENT_LABELS } from './config.js';
// Use consolidated tensor utilities and utils
import { displayError, appendChatMessage, zeros, clamp, inspectTensor, logToTimeline, norm } from './utils.js';
import { safeDispose, tensorToArray, tensorToArrayAsync, containsNaNOrInf } from './tensorUtils.js'; // Use consolidated utils
import { SyntrometricAgent } from './agent.js'; // Agent class (AgentProcessResponse type imported from appTypes)
import { EmotionalSpace } from './environment.js';
// Import types used in this file
import type { 
    UIMode, AgentProcessResponse, ChartPoint, SafeTooltipItem,
    ChartEvent, LegendItem, LegendElement, ExtendedCSS2DObject,
    ExtendedChart, ChartConfiguration, ChartDataset, TooltipItem
} from './appTypes.js';

import {
    initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel,
    threeInitialized, calculateGraphFeatures, scene as syntroScene
} from './viz-syntrometry.js';
import {
    initConceptVisualization, updateAgentSimulationVisuals, animateConceptNodes,
    updateInfoPanel as updateConceptInfoPanel, cleanupConceptVisualization, conceptInitialized,
    conceptRenderer, conceptLabelRenderer, conceptScene, conceptCamera, conceptControls
} from './viz-concepts.js';
import { initLive2D, updateLive2DEmotions, updateLive2DHeadMovement, live2dInitialized, cleanupLive2D, updateLive2D } from './viz-live2d.js';
import { initializeDraggablePanels } from './draggablePanels.js';
import { 
    asTensor, asNullableTensor, asNonNullTensor, 
    asNumberTensor, asNullableNumberTensor, 
    asRankTensor, asNullableRankTensor, 
    asEnvStepResult, asVariable, arrayToTensor,
    toLive2DFormat, toNumberArray
} from './tensorTypeUtils.js';

// Define interface for environment step result
interface EnvStepResult {
    state: Tensor | null;
    reward: number;
    done: boolean;
    context: string;
    eventType: string | null;
}

// Type guard for HeadMovementLabel
function isValidHeadMovement(label: string): label is HeadMovementLabel {
    return (HEAD_MOVEMENT_LABELS as readonly string[]).includes(label);
}

// Register Chart.js components
Chart.register(...registerables, ChartStreaming);

// --- Global State ---
let criticalError: boolean = false;
let agent: SyntrometricAgent | null = null;
let environment: EmotionalSpace | null = null;
let animationFrameId: number | null = null;

// Interface for local simulation metrics state
interface SimulationMetrics {
    currentStateVector: number[] | null; // Holds BASE_STATE_DIM array
    currentAgentEmotions: Tensor | null; // Holds the *kept* TF.js Tensor [1, EMOTION_DIM] from agent
    currentRIHScore: number;
    currentAvgAffinity: number;
    currentTrustScore: number;
    currentBeliefNorm: number;
    currentSelfStateNorm: number;
    currentHmLabel: HeadMovementLabel;
    currentContext: string;
    currentCascadeHistory: number[][];
    currentIntegrationParam: number;
    currentReflexivityParam: number;
}

const simulationMetrics: SimulationMetrics = {
    currentStateVector: null,
    currentAgentEmotions: null, // Will be initialized as kept tensor
    currentRIHScore: 0,
    currentAvgAffinity: 0,
    currentTrustScore: 1.0,
    currentBeliefNorm: 0.0,
    currentSelfStateNorm: 0.0,
    currentHmLabel: "idle",
    currentContext: "Initializing...",
    currentCascadeHistory: [],
    currentIntegrationParam: 0.5,
    currentReflexivityParam: 0.5,
};

const appClock = new THREE.Clock();
const SAVED_STATE_KEY = 'syntrometrySimulationState_v2_3_1'; // Updated version key

// Timestamps for Input Feedback Visualization
let lastIntegrationInputTime: number = -1;
let lastReflexivityInputTime: number = -1;
let lastChatImpactTime: number = -1;
// Input feedback duration defined in viz-concepts.ts, reference if needed externally

// Chart.js Instance (Typed based on appTypes.ts)
let metricsChart: ExtendedChart | null = null;
const MAX_CHART_POINTS: number = 150; // Max history points for chart

// --- DOM Element Type Guards ---
function getElement<T extends HTMLElement>(id: string): T | null {
    const el = document.getElementById(id);
    if (el && el instanceof HTMLElement) { // Basic check
        return el as T; // Use cast carefully, or check specific type like HTMLInputElement
    }
    return null;
}
function getInputElement(id: string): HTMLInputElement | null {
    return document.getElementById(id) as HTMLInputElement | null;
}
function getCanvasElement(id: string): HTMLCanvasElement | null {
    return document.getElementById(id) as HTMLCanvasElement | null;
}
function getProgressElement(id: string): HTMLProgressElement | null {
    return document.getElementById(id) as HTMLProgressElement | null;
}


// --- Resize Handler for Concept Graph ---
function resizeConceptGraphRenderer(): void {
    if (!conceptInitialized || !conceptRenderer || !conceptLabelRenderer || !conceptCamera) {
        return;
    }
    const container = getElement('concept-panel');
    if (!container) {
        console.error('Concept panel container not found for resize.');
        return;
    }
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;

    conceptRenderer.setSize(width, height);
    conceptRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
    conceptLabelRenderer.setSize(width, height);
    conceptCamera.aspect = width / height;
    conceptCamera.updateProjectionMatrix();
}

// --- Helper Functions ---

function updateHeatmap(stateVector: number[] | tf.TypedArray | null, targetElementId: string): void {
    const heatmapContainer = getElement(targetElementId);
    if (!heatmapContainer) {
        console.warn(`Heatmap container #${targetElementId} not found.`);
        return;
    }
    if (!stateVector || stateVector.length === 0) {
        heatmapContainer.innerHTML = '<p class="heatmap-placeholder">No Data</p>';
        return;
    }
    // Convert TypedArray to number[] if necessary
    const vectorArray = Array.isArray(stateVector) ? stateVector : Array.from(stateVector);

    const vectorLength = vectorArray.length;
    const gridDim = Math.ceil(Math.sqrt(vectorLength));
    const containerWidth = heatmapContainer.clientWidth;
    // Ensure minimum cell size, prevent division by zero
    const cellSize = Math.max(5, Math.floor(containerWidth / gridDim) - 1);

    heatmapContainer.style.gridTemplateColumns = `repeat(${gridDim}, ${cellSize}px)`;
    heatmapContainer.style.gridTemplateRows = `repeat(${gridDim}, ${cellSize}px)`;
    heatmapContainer.innerHTML = ''; // Clear previous content efficiently

    // Use DocumentFragment for performance when adding many cells
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < vectorLength; i++) {
        const value = typeof vectorArray[i] === 'number' ? vectorArray[i] : 0;
        const absValue = Math.abs(value);
        let r = 30, g = 30, b = 30;
        const intensity = clamp(absValue * 1.5, 0, 1); // Use clamp util

        // Simplified color mapping
        if (value > 0.01) { // Positive leaning towards Red/Orange
            r = 30 + Math.round(200 * intensity); g = 30 + Math.round(50 * intensity);
        } else if (value < -0.01) { // Negative leaning towards Blue/Purple
            g = 30 + Math.round(50 * intensity); b = 30 + Math.round(200 * intensity);
        } // Else: stays gray for near-zero values

        r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);

        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        cell.title = `Idx ${i}: ${value.toFixed(4)}`;
        fragment.appendChild(cell);
    }

    // Add filler cells if needed
    const totalCells = gridDim * gridDim;
    for (let i = vectorLength; i < totalCells; i++) {
        const fillerCell = document.createElement('div');
        fillerCell.className = 'heatmap-cell filler';
        // Size set by CSS grid, explicit size might not be needed
        // fillerCell.style.width = `${cellSize}px`;
        // fillerCell.style.height = `${cellSize}px`;
        fragment.appendChild(fillerCell);
    }
    heatmapContainer.appendChild(fragment);
}


function updateMetricsChart(): void {
    if (!metricsChart || criticalError || agent === null) return;
    const now = Date.now();
    try {
        // Ensure datasets exist before pushing
        if (metricsChart.data && metricsChart.data.datasets && metricsChart.data.datasets.length >= 5) {
            metricsChart.data.datasets[0].data.push({ x: now, y: simulationMetrics.currentRIHScore });
            metricsChart.data.datasets[1].data.push({ x: now, y: simulationMetrics.currentAvgAffinity });
            metricsChart.data.datasets[2].data.push({ x: now, y: simulationMetrics.currentTrustScore });
            metricsChart.data.datasets[3].data.push({ x: now, y: simulationMetrics.currentBeliefNorm });
            metricsChart.data.datasets[4].data.push({ x: now, y: simulationMetrics.currentSelfStateNorm });

            // Chart.js streaming plugin handles data limiting, manual check might not be needed
            // while (metricsChart.data.datasets[0].data.length > MAX_CHART_POINTS) {
            //     metricsChart.data.datasets.forEach(dataset => dataset.data.shift());
            // }

            metricsChart.update('quiet'); // Use quiet update for streaming
        }
    } catch (e) {
        console.error("Error updating metrics chart:", e);
    }
}

function updateDashboardDisplay(): void {
    const updateElement = (id: string, value: number, text: string | null = null, isProgress: boolean = false, range: [number, number] = [0, 1]): void => {
        const element = getElement(id);
        if (!element) return;
        const displayValue = text !== null ? text : (typeof value === 'number' && isFinite(value) ? value.toFixed(3) : 'N/A');

        if (isProgress && element instanceof HTMLProgressElement) {
            const [min, max] = range;
            const scaledValue = (typeof value === 'number' && isFinite(value) && (max - min) !== 0)
                ? clamp(((value - min) / (max - min)) * 100, 0, 100) // Clamp result
                : 50;
            element.value = scaledValue;
        } else {
            element.textContent = displayValue; // Use textContent for safety
        }
    };

    updateElement('metric-rih-value', simulationMetrics.currentRIHScore, `${(simulationMetrics.currentRIHScore * 100).toFixed(1)}%`);
    updateElement('metric-rih-progress', simulationMetrics.currentRIHScore, null, true);
    updateElement('metric-affinity-value', simulationMetrics.currentAvgAffinity); // Keep default toFixed(3)
    updateElement('metric-affinity-progress', simulationMetrics.currentAvgAffinity, null, true, [-1, 1]);
    updateElement('metric-trust-value', simulationMetrics.currentTrustScore, `${(simulationMetrics.currentTrustScore * 100).toFixed(1)}%`);
    updateElement('metric-trust-progress', simulationMetrics.currentTrustScore, null, true);
    updateElement('metric-belief-norm', simulationMetrics.currentBeliefNorm);
    updateElement('metric-self-norm', simulationMetrics.currentSelfStateNorm);
    updateElement('metric-context', 0, simulationMetrics.currentContext);
}

// Update emotion bars using tensorToArray helper
async function updateEmotionBars(emotionsTensor: Tensor | null): Promise<void> {
    const container = getElement('emotion-intensities');
    if (!container) return;

    const isValidTensor = emotionsTensor && !emotionsTensor.isDisposed;
    container.style.opacity = isValidTensor ? '1' : '0.5';

    // Use async helper for potential backend tensors
    const emotions = isValidTensor ? await tensorToArrayAsync(emotionsTensor) : [];

    emotionNames.forEach((name, index) => {
        const barFill = container.querySelector<HTMLElement>(`.${name.toLowerCase()} .bar-fill`);
        if (barFill) {
            const intensityValue = (index < emotions.length && typeof emotions[index] === 'number' && isFinite(emotions[index]))
                ? emotions[index] : 0;
            const intensityPercent = clamp(intensityValue * 100, 0, 100);
            barFill.style.width = `${intensityPercent}%`;
        }
    });

    // If tensor was invalid, ensure bars are zeroed
    if (!isValidTensor) {
         emotionNames.forEach(name => {
             const barFill = container.querySelector<HTMLElement>(`.${name.toLowerCase()} .bar-fill`);
             if (barFill) barFill.style.width = `0%`;
         });
    }
}

function updateCascadeViewer(): void {
    const contentDiv = getElement('cascade-viewer-content');
    if (!contentDiv) return;

    const history = simulationMetrics.currentCascadeHistory;

    if (!Array.isArray(history) || history.length === 0 || history.every(level => !Array.isArray(level) || level.length === 0)) {
        contentDiv.innerHTML = '<span class="cascade-placeholder">No cascade data.</span>';
        return;
    }

    const containerBaseHeight = 50;
    const maxBarHeight = containerBaseHeight - 4;
    const fragment = document.createDocumentFragment();

    history.forEach((levelArray, index) => {
        const levelDiv = document.createElement('div');
        levelDiv.className = 'cv-level';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'cv-level-title';

        const containerDiv = document.createElement('div');
        containerDiv.className = 'cv-syndrome-container';
        containerDiv.style.height = `${containerBaseHeight}px`;

        if (!Array.isArray(levelArray)) {
            titleDiv.textContent = `Level ${index} (Invalid Data)`;
            levelDiv.appendChild(titleDiv);
        } else {
            titleDiv.textContent = `Level ${index} (${levelArray.length} syndromes)`;
            levelDiv.appendChild(titleDiv);

            if (levelArray.length > 0) {
                levelArray.forEach((valueUntyped, sIndex) => {
                    const value = (typeof valueUntyped === 'number' && isFinite(valueUntyped)) ? valueUntyped : 0;
                    const absValue = Math.abs(value);
                    const colorIntensity = clamp(absValue * 1.2, 0, 1);
                    const barHeightPx = clamp(absValue * maxBarHeight * 1.5, 2, maxBarHeight);

                    let r = 50, g = 50, b = 50;
                    if (value > 0.01) { r = 50 + Math.round(180 * colorIntensity); g = 50 + Math.round(30 * colorIntensity); }
                    else if (value < -0.01) { g = 50 + Math.round(80 * colorIntensity); b = 50 + Math.round(180 * colorIntensity); }
                    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);

                    const bar = document.createElement('div');
                    bar.className = 'cv-syndrome-bar';
                    bar.style.backgroundColor = `rgb(${r},${g},${b})`;
                    bar.style.height = `${barHeightPx}px`;
                    bar.title = `Lvl ${index}, Idx ${sIndex}: ${value.toFixed(4)}`;
                    containerDiv.appendChild(bar);
                });
            } else {
                const placeholder = document.createElement('span');
                placeholder.className = 'cascade-placeholder';
                placeholder.textContent = '[Empty Level]';
                containerDiv.appendChild(placeholder);
            }
            levelDiv.appendChild(containerDiv);
        }
        fragment.appendChild(levelDiv);
    });
    contentDiv.innerHTML = ''; // Clear previous
    contentDiv.appendChild(fragment);
    contentDiv.scrollTop = contentDiv.scrollHeight;
}

// --- Initialization ---
async function initialize(): Promise<void> {
    console.log("Initializing application (Agent V2.3)...");
    const coreInitSuccess = initAgentAndEnvironment();
    const threeSuccess = initThreeJS(); // Syntrometry
    const conceptSuccess = initConceptVisualization(appClock); // Concepts
    const live2dSuccess = await initLive2D(); // Live2D Avatar

    // Handle critical core failure first
    if (!coreInitSuccess) {
        criticalError = true;
        displayError("Core simulation components (Agent/Environment/TF) failed to initialize. Simulation disabled.", true, 'error-message');
        // Still try to initialize UI parts that don't depend on core
    }
    // Log non-critical visualization errors
    if (!threeSuccess) displayError("Syntrometry visualization failed to initialize.", false, 'syntrometry-error-message');
    if (!conceptSuccess) displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
    if (!live2dSuccess) displayError("Live2D avatar failed to initialize.", false, 'error-message');

    // Init UI elements
    initMetricsChart();
    setupControls();
    setupChat();
    setupInspectorToggle();

    let initialStateLoaded = false;
    if (coreInitSuccess) { // Only try to load if core is okay
        initialStateLoaded = await loadState(false); // await loadState
    }

    // If core is okay but no state was loaded, initialize a new simulation state
    if (coreInitSuccess && !initialStateLoaded && agent && environment) {
        console.log("No valid saved state found or load skipped, initializing new simulation state...");
        let envResetResult = null;
        try {
            // Define the expected return type
            interface EnvResetResult {
                state: tf.Tensor | null;
            }
            
            const envResetResult = await environment.reset() as EnvResetResult;
            const initialStateTensor = envResetResult?.state;

            if (!initialStateTensor || initialStateTensor.isDisposed) {
                 throw new Error("Environment reset returned invalid state tensor.");
            }
            // Use async helper, dispose tensor from reset() after getting data
            simulationMetrics.currentStateVector = await tensorToArrayAsync(initialStateTensor);
            safeDispose(initialStateTensor);

            if (simulationMetrics.currentStateVector.length !== Config.Agent.BASE_STATE_DIM) {
                 console.warn(`Initial state vector length mismatch (${simulationMetrics.currentStateVector.length}). Resetting.`);
                 simulationMetrics.currentStateVector = zeros(Config.Agent.BASE_STATE_DIM) as number[];
            }

            // Initialize emotions tensor
            safeDispose(simulationMetrics.currentAgentEmotions);
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));

            // Perform initial agent process to get initial metrics
            const initialGraphFeatures = calculateGraphFeatures();
            const initialAgentResponse = await agent.process(
                simulationMetrics.currentStateVector,
                initialGraphFeatures,
                { eventType: null, reward: 0 }
            );

            // Update metrics, disposing old emotion tensor, assigning new one
            safeDispose(simulationMetrics.currentAgentEmotions);
            simulationMetrics.currentAgentEmotions = initialAgentResponse.emotions; // Assign kept tensor from agent
            simulationMetrics.currentRIHScore = initialAgentResponse.rihScore;
            simulationMetrics.currentAvgAffinity = (initialAgentResponse.affinities?.length > 0) ? initialAgentResponse.affinities.reduce((a, b) => a + b, 0) / initialAgentResponse.affinities.length : 0;
            const hmLabel = initialAgentResponse.hmLabel;
            simulationMetrics.currentHmLabel = isValidHeadMovement(hmLabel) ? hmLabel : "idle";
            simulationMetrics.currentContext = "Simulation initialized (New State).";
            simulationMetrics.currentCascadeHistory = initialAgentResponse.cascadeHistory;
            simulationMetrics.currentIntegrationParam = initialAgentResponse.integration;
            simulationMetrics.currentReflexivityParam = initialAgentResponse.reflexivity;
            simulationMetrics.currentTrustScore = initialAgentResponse.trustScore;
            simulationMetrics.currentBeliefNorm = initialAgentResponse.beliefNorm ?? 0.0;
            simulationMetrics.currentSelfStateNorm = initialAgentResponse.selfStateNorm ?? 0.0;

            console.log("Initialized V2.3 with fresh agent state.");

        } catch (initialProcessError: unknown) {
             console.error("Error during initial agent/environment processing:", initialProcessError);
             displayError(`Error initializing agent state: ${initialProcessError instanceof Error ? initialProcessError.message : String(initialProcessError)}. Simulation may be unstable.`, true, 'error-message');
             criticalError = true; // Mark as critical if initialization fails badly
             // Reset metrics to default
             simulationMetrics.currentStateVector = zeros(Config.Agent.BASE_STATE_DIM) as number[];
             safeDispose(simulationMetrics.currentAgentEmotions);
             simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Keep zeros
             // Other metrics will be reset below
        }

    } else if (!coreInitSuccess || !agent || !environment) {
        // Handle core failure or state load failure where core is invalid
        console.warn("Core components not available or initial state failed. Setting default metrics.");
        simulationMetrics.currentStateVector = zeros(Config.Agent.BASE_STATE_DIM) as number[];
        safeDispose(simulationMetrics.currentAgentEmotions);
        if (typeof tf !== 'undefined') { // Only create tensor if TF is available
             simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        } else {
             simulationMetrics.currentAgentEmotions = null; // No TF available
        }
        simulationMetrics.currentRIHScore = 0; simulationMetrics.currentAvgAffinity = 0;
        simulationMetrics.currentHmLabel = "idle"; simulationMetrics.currentContext = criticalError ? "Simulation core failed." : "Simulation state error.";
        simulationMetrics.currentCascadeHistory = []; simulationMetrics.currentIntegrationParam = 0.5;
        simulationMetrics.currentReflexivityParam = 0.5; simulationMetrics.currentTrustScore = 1.0;
        simulationMetrics.currentBeliefNorm = 0.0; simulationMetrics.currentSelfStateNorm = 0.0;
    }

    // Update UI based on the final initial state
    updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);

    // --- Initialize Visualizations with Initial State (Use Frame Clone Pattern) ---
    let initialFrameEmotions: Tensor | null = null;
    if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
        initialFrameEmotions = tf.keep(simulationMetrics.currentAgentEmotions.clone());
    } else if (typeof tf !== 'undefined') {
         initialFrameEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
    }

    if (threeInitialized) {
        try {
            updateThreeJS(0, simulationMetrics.currentStateVector, simulationMetrics.currentRIHScore, agent?.latestAffinities || [], simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, simulationMetrics.currentCascadeHistory, simulationMetrics.currentContext);
            updateSyntrometryInfoPanel();
        } catch (e) { console.error("Error during initial syntrometry viz update:", e); }
    }
    if (conceptInitialized) {
        try {
            updateAgentSimulationVisuals(initialFrameEmotions, simulationMetrics.currentRIHScore, simulationMetrics.currentAvgAffinity, simulationMetrics.currentHmLabel, simulationMetrics.currentTrustScore);
            animateConceptNodes(appClock.getElapsedTime(), simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, -1, -1, -1);
            resizeConceptGraphRenderer(); // Resize after initial setup
        } catch (e) { console.error("Error during initial concept viz update:", e); }
    }
    if (live2dInitialized) {
        try {
            if (initialFrameEmotions) updateLive2DEmotions(toLive2DFormat(initialFrameEmotions.dataSync()));
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, 0);
            updateLive2D(0); // Initial render
        } catch (e) { console.error("Error during initial Live2D update:", e); }
    }

    // --- Update Remaining UI ---
    updateDashboardDisplay();
    if (initialFrameEmotions) await updateEmotionBars(initialFrameEmotions); // await UI update
    updateCascadeViewer();
    logToTimeline("System Initialized", 'expressions-list');

    // Update heatmap with initial self-state
    let selfStateData: number[] = [];
    if (agent?.selfState && !agent.selfState.isDisposed) {
        try { selfStateData = tensorToArray(agent.selfState); } // Use safe util
        catch (e) { console.error("Initial heatmap update failed:", e); }
    }
    updateHeatmap(selfStateData, 'heatmap-content');

    // Dispose the initial frame clone
    safeDispose(initialFrameEmotions);

    // Enable/disable controls based on final state
    if (criticalError) {
        disableControls();
    }

    // Add resize listener
    window.addEventListener('resize', resizeConceptGraphRenderer);

    // Initialize Draggable Panels AFTER elements are in the DOM
    initializeDraggablePanels(
         '.overlay-panel',
         '.visualization-container',
         ['input', 'button', 'textarea', 'select', 'progress', 'canvas', '.no-drag', '[role="button"]', 'a', 'pre', '.chart-container', '.cv-syndrome-container', '.label'], // Add .label to prevent drag
         ['heatmap-cell', 'cv-syndrome-bar', 'bar-fill', 'metric-value', 'metric-label', 'chat-output', 'tensor-inspector-content', 'label'] // Add label class
    );

    // Start animation loop if no critical errors
    if (!criticalError) {
        console.log("Initialization complete (V2.3). Starting animation loop.");
        requestAnimationFrame(animate); // Start the loop
    } else {
        console.error("Initialization encountered critical errors. Animation loop will not start.");
    }
}


function initAgentAndEnvironment(): boolean {
    if (typeof tf === 'undefined' || typeof tf.layers === 'undefined') {
        console.error("CRITICAL: TensorFlow.js is required for Agent/Environment but not loaded/incomplete.");
        agent = null; environment = null; return false;
    }
    try {
        // Ensure cleanup runs before creating new instances
        agent?.cleanup();
        environment?.cleanup();

        agent = new SyntrometricAgent();
        environment = new EmotionalSpace();

        // Perform validation immediately after construction
        agent.validateComponents(); // Use public method instead of private _validateComponents
        if (!environment || !environment.baseEmotions) { // Basic env check
             throw new Error("Environment components failed validation.");
        }

        console.log("Agent (V2.3) and Environment initialized and validated successfully.");
        return true;
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[Init] Agent/Environment creation/validation error:', e);
        displayError(`Initialization Error: ${message}. Simulation logic disabled.`, true, 'error-message');
        agent?.cleanup();
        environment?.cleanup();
        agent = null; environment = null; return false;
    }
}

function initMetricsChart(): void {
    const canvas = getCanvasElement('metrics-chart');
    if (!canvas) { console.error("Metrics chart canvas not found!"); return; }
    if (metricsChart) { try { metricsChart.destroy(); } catch(e) { /* ignore */ } metricsChart = null; }

    const computedStyle = getComputedStyle(document.documentElement);
    const chartGridColor = computedStyle.getPropertyValue('--chart-grid-color').trim() || 'rgba(200, 200, 220, 0.15)';
    const colorRIHBorder = 'rgb(102, 255, 102)';
    const colorAffinityBorder = 'rgb(255, 170, 102)';
    const colorTrustBorder = 'rgb(102, 170, 255)';
    const colorBeliefNormBorder = 'rgb(255, 255, 102)';
    const colorSelfNormBorder = 'rgb(200, 150, 255)';
    const textColor = '#eee'; // Example text color

    const chartConfig: ChartConfiguration = {
        type: 'line',
        data: {
            datasets: [
                { label: 'RIH', data: [], borderColor: colorRIHBorder, backgroundColor: 'rgba(102, 255, 102, 0.1)', borderWidth: 1.5, pointRadius: 0, yAxisID: 'yPercentage', tension: 0.1 },
                { label: 'Affinity', data: [], borderColor: colorAffinityBorder, backgroundColor: 'rgba(255, 170, 102, 0.1)', borderWidth: 1.5, pointRadius: 0, yAxisID: 'yBipolar', tension: 0.1 },
                { label: 'Trust', data: [], borderColor: colorTrustBorder, backgroundColor: 'rgba(102, 170, 255, 0.1)', borderWidth: 1.5, pointRadius: 0, yAxisID: 'yPercentage', tension: 0.1 },
                { label: 'Belief Norm', data: [], borderColor: colorBeliefNormBorder, backgroundColor: 'rgba(255, 255, 102, 0.1)', borderWidth: 1, pointRadius: 0, yAxisID: 'yNorm', tension: 0.1, hidden: true },
                { label: 'Self Norm', data: [], borderColor: colorSelfNormBorder, backgroundColor: 'rgba(200, 150, 255, 0.1)', borderWidth: 1, pointRadius: 0, yAxisID: 'yNorm', tension: 0.1, hidden: true }
            ] as ChartDataset[]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            scales: {
                x: {
                    type: 'realtime', // Use the streaming plugin
                    // Cast to RealTimeScale type to access realtime options
                    realtime: {
                        duration: 30000, // 30 seconds
                        refresh: 1000, // Update interval
                        delay: 500,
                        pause: false,
                        ttl: 60000 // Data time-to-live
                    },
                    ticks: { display: false },
                    grid: { color: chartGridColor }
                },
                yPercentage: { beginAtZero: true, max: 1.0, position: 'left', ticks: { color: textColor, font: { size: 10 }, stepSize: 0.25, callback: (value: number) => `${(Number(value) * 100).toFixed(0)}%` }, grid: { color: chartGridColor } },
                yBipolar: { min: -1.0, max: 1.0, position: 'right', ticks: { color: textColor, font: { size: 10 }, stepSize: 0.5 }, grid: { display: false } },
                yNorm: { beginAtZero: true, position: 'right', display: false, ticks: { color: textColor, font: { size: 10 }, maxTicksLimit: 5 }, grid: { display: false } } // Added maxTicksLimit
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    align: 'start',
                    labels: { 
                        color: textColor, 
                        font: { size: 10 }, 
                        boxWidth: 12, 
                        padding: 10 
                    },
                    onClick: function(this: any, e: ChartEvent, legendItem: LegendItem) {
                        const index = legendItem.datasetIndex;
                        if (index === undefined) return;
                        
                        const ci = this.chart;
                        const meta = ci.getDatasetMeta(index);
                        
                        if (meta) {
                            // Convert null to false to satisfy TypeScript
                            const isCurrentlyHidden = meta.hidden === null ? false : meta.hidden;
                            meta.hidden = !isCurrentlyHidden;
                        }
                        
                        // Toggle yNorm axis visibility based on Norm datasets
                        if (ci.options.scales?.yNorm && (index === 3 || index === 4)) {
                            const normVisible = !ci.getDatasetMeta(3)?.hidden || !ci.getDatasetMeta(4)?.hidden;
                            ci.options.scales.yNorm.display = normVisible;
                        }
                        
                        ci.update();
                    }
                },
                tooltip: { // Use SafeTooltipItem type
                    enabled: true, mode: 'index', intersect: false, backgroundColor: 'rgba(18, 18, 34, 0.85)', titleColor: '#0af', bodyColor: textColor, boxPadding: 5,
                    callbacks: {
                        title: (tooltipItems: TooltipItem[]) => { // Keep specific TooltipItem here
                             const item = tooltipItems[0];
                             return item?.parsed?.x ? new Date(item.parsed.x).toLocaleTimeString([], { hour12: false }) : '';
                        },
                        label: (context: TooltipItem) => {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed?.y !== null && context.parsed?.y !== undefined) {
                                const value = context.parsed.y;
                                // Safely determine axis ID and format
                                const yAxisID = context.dataset.yAxisID;
                                label += (yAxisID === 'yPercentage') ? `${(value * 100).toFixed(1)}%` : value.toFixed(3);
                            }
                            return label;
                        }
                    }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false }
        }
    };

    try {
        // Use a double type assertion to satisfy TypeScript
        metricsChart = new Chart(canvas, chartConfig) as unknown as ExtendedChart;
        console.log("Metrics chart initialized.");
    } catch (chartError: unknown) {
        console.error("Error initializing Chart.js:", chartError);
        displayError(`Chart initialization failed: ${chartError instanceof Error ? chartError.message : String(chartError)}`, false, 'error-message');
    }
}

function updateSliderDisplays(integration: number, reflexivity: number): void {
    const integrationValue = getElement('integration-value');
    const reflexivityValue = getElement('reflexivity-value');
    const integrationSlider = getInputElement('integration-slider');
    const reflexivitySlider = getInputElement('reflexivity-slider');

    if (integrationValue) integrationValue.textContent = (typeof integration === 'number' && isFinite(integration)) ? integration.toFixed(2) : 'N/A';
    if (reflexivityValue) reflexivityValue.textContent = (typeof reflexivity === 'number' && isFinite(reflexivity)) ? reflexivity.toFixed(2) : 'N/A';

    // Only update slider value if it's not being actively dragged
    if (integrationSlider && typeof integration === 'number' && isFinite(integration) && !integrationSlider.matches(':active')) {
        integrationSlider.value = String(integration);
    }
    if (reflexivitySlider && typeof reflexivity === 'number' && isFinite(reflexivity) && !reflexivitySlider.matches(':active')) {
        reflexivitySlider.value = String(reflexivity);
    }
}

function setupControls(): void {
    const integrationSlider = getInputElement('integration-slider');
    const reflexivitySlider = getInputElement('reflexivity-slider');
    const integrationValue = getElement('integration-value');
    const reflexivityValue = getElement('reflexivity-value');
    const saveButton = getElement<HTMLButtonElement>('save-state-button');
    const loadButton = getElement<HTMLButtonElement>('load-state-button');
    const labelToggle = getInputElement('labels-toggle'); // Label toggle

    // Sliders are read-only, reflecting agent state
    if (integrationSlider && integrationValue) {
        integrationSlider.disabled = true; // Make it read-only visually/functionally
        integrationSlider.classList.add('read-only-slider');
        // No event listener needed for input if read-only
    } else { console.warn("Integration slider/value elements not found."); }

    if (reflexivitySlider && reflexivityValue) {
        reflexivitySlider.disabled = true;
        reflexivitySlider.classList.add('read-only-slider');
    } else { console.warn("Reflexivity slider/value elements not found."); }

    // Save/Load Buttons
    if (saveButton) {
        saveButton.addEventListener('click', saveState);
        saveButton.disabled = criticalError; // Disable if core error
    } else { console.warn("Save button not found."); }

    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true)); // await loadState inside handler
        loadButton.disabled = criticalError;
        // Check local storage to add indicator class
        if (localStorage.getItem(SAVED_STATE_KEY)) {
            loadButton.classList.add('has-saved-state');
        } else {
            loadButton.classList.remove('has-saved-state');
        }
    } else { console.warn("Load button not found."); }

    // Label Toggle Logic (Concept Graph)
    if (labelToggle) {
        const toggleLabels = (show: boolean): void => {
            if (conceptScene) {
                conceptScene.traverse((object: THREE.Object3D) => {
                    // Check if it's a CSS2DObject and has the 'label' class
                    if (object instanceof CSS2DObject && 
                        object.element && 
                        object.element.classList && 
                        object.element.classList.contains('label')) {
                        // Use type assertion to add visible property
                        (object as any).visible = show;
                    }
                });
            }
        };
        labelToggle.addEventListener('change', () => toggleLabels(labelToggle.checked));
        toggleLabels(labelToggle.checked); // Set initial state
    } else { console.warn("Labels toggle checkbox not found."); }
}

function disableControls(): void {
    const selectors = [
        '#integration-slider', '#reflexivity-slider',
        '#save-state-button', '#load-state-button',
        '#chat-input'
    ];
    selectors.forEach(sel => {
        const el = document.querySelector(sel) as HTMLInputElement | HTMLButtonElement | null;
        if (el) {
            el.disabled = true;
            if (el.id === 'chat-input') {
                (el as HTMLInputElement).placeholder = "Simulation disabled.";
            }
        }
    });
}

function setupChat(): void {
    const chatInput = getInputElement('chat-input');
    const chatOutput = getElement('chat-output');
    if (!chatInput || !chatOutput) {
        console.warn("Chat elements not found.");
        return;
    }

    chatInput.disabled = criticalError;
    chatInput.placeholder = criticalError ? "Simulation disabled." : "Interact with the simulation...";

    chatInput.addEventListener('keypress', async (e: KeyboardEvent) => {
        if (e.key === 'Enter' && chatInput.value.trim() && !criticalError && agent && environment) {
            const userInput = chatInput.value.trim();
            appendChatMessage('You', userInput);
            chatInput.value = '';
            chatInput.disabled = true; // Disable input during processing

            try {
                // Environment returns kept tensor or null
                const impactTensor = await environment.getEmotionalImpactFromText(userInput);
                logToTimeline(`Chat Input: "${userInput.substring(0, 25)}..."`, 'expressions-list');
                appendChatMessage('System', 'Input processed, influencing environment state.');
                lastChatImpactTime = appClock.getElapsedTime();
                safeDispose(impactTensor); // Dispose the tensor after use
            } catch (chatError: unknown) {
                console.error("Error processing chat input:", chatError);
                appendChatMessage('System', 'Error processing input.');
            } finally {
                 chatInput.disabled = criticalError; // Re-enable (or keep disabled if critical error occurred)
            }
        } else if (e.key === 'Enter' && (!agent || !environment)) {
             appendChatMessage('System', 'Environment/Agent not ready for interaction.');
        }
    });
}

function setupInspectorToggle(): void {
    const toggleButton = getElement<HTMLButtonElement>('toggle-inspector');
    const inspectorPanel = getElement('tensor-inspector-panel');
    const inspectorContent = getElement('tensor-inspector-content');

    if (toggleButton && inspectorPanel && inspectorContent) {
        toggleButton.addEventListener('click', async () => { // Make async for inspectTensor
            const isVisible = inspectorPanel.classList.toggle('visible');
            toggleButton.setAttribute('aria-expanded', String(isVisible));
            if (isVisible && agent) {
                 let beliefEmbeddingTensor: Tensor | null = null;
                 try {
                     beliefEmbeddingTensor = agent.getLatestBeliefEmbedding(); // Returns disposable clone or null
                     await inspectTensor(beliefEmbeddingTensor, 'tensor-inspector-content'); // Await inspection
                 } catch (e: unknown) {
                     console.error("Error getting/inspecting tensor:", e);
                     await inspectTensor(`[Error: ${e instanceof Error ? e.message : String(e)}]`, 'tensor-inspector-content');
                 } finally {
                      safeDispose(beliefEmbeddingTensor); // Dispose the clone after inspection
                 }
            } else if (isVisible) {
                 await inspectTensor(null, 'tensor-inspector-content'); // Show null if agent unavailable
            }
        });
        toggleButton.setAttribute('aria-expanded', String(inspectorPanel.classList.contains('visible')));
    } else {
        console.warn("Tensor inspector toggle/panel/content elements not found.");
    }
}

// --- State Management ---
function saveState(): void {
    if (criticalError || !agent || !environment) {
        console.warn("Cannot save state: Simulation not ready or critical error detected.");
        appendChatMessage('System', 'Save failed: Simulation not ready or error detected.');
        return;
    }
    try {
        const envState = environment.getState();
        const agentState = agent.getState();

        // Agent state now includes check for internal errors during serialization potentially
        if (!envState || !agentState || agentState.error) {
             throw new Error(`Failed to retrieve state: ${agentState?.error || 'Agent/Env state missing'}`);
        }

        const stateToSave = {
            version: "2.3.1", // Match version check in loadState
            timestamp: new Date().toISOString(),
            environment: envState,
            agent: agentState,
            metrics: { // Save relevant primitive metrics for quick view / compatibility
                rih: simulationMetrics.currentRIHScore,
                affinity: simulationMetrics.currentAvgAffinity,
                trust: simulationMetrics.currentTrustScore,
                context: simulationMetrics.currentContext,
                intParam: simulationMetrics.currentIntegrationParam, // Save params used by agent
                refParam: simulationMetrics.currentReflexivityParam,
            }
        };

        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave));
        console.log(`Simulation state (V${stateToSave.version}) saved.`);
        appendChatMessage('System', 'Simulation state saved.');
        logToTimeline('State Saved', 'expressions-list');

        const loadButton = getElement<HTMLButtonElement>('load-state-button');
        if (loadButton) loadButton.classList.add('has-saved-state');

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("Error saving state:", e);
        appendChatMessage('System', `Save failed: ${message}`);
        displayError(`Error saving state: ${message}`, false, 'error-message');
    }
}

// Made async to allow awaiting agent.loadState
async function loadState(showMessages: boolean = false): Promise<boolean> {
    criticalError = true; // Halt simulation during load
    if (animationFrameId) cancelAnimationFrame(animationFrameId); animationFrameId = null; // Stop loop if running

    if (!agent || !environment) {
        console.warn("Agent/Environment not initialized, cannot load state.");
        if (showMessages) appendChatMessage('System', 'Load failed: Simulation components not ready.');
        criticalError = false; // Allow potential re-init or start
        return false;
    }

    const stateString = localStorage.getItem(SAVED_STATE_KEY);
    if (!stateString) {
        console.log("No saved state found in localStorage.");
        if (showMessages) appendChatMessage('System', 'No saved state found.');
        criticalError = false;
        return false;
    }

    try {
        const stateToLoad = JSON.parse(stateString);

        if (!stateToLoad || stateToLoad.version !== "2.3.1") { // Match saved version key
            throw new Error(`Incompatible state version: ${stateToLoad?.version}. Expected 2.3.1`);
        }
        if (!stateToLoad.environment || !stateToLoad.agent) {
             throw new Error("Saved state is missing critical environment or agent data.");
        }

        console.log(`Loading state V${stateToLoad.version} saved at ${stateToLoad.timestamp}...`);

        // --- Load State into Components ---
        environment.loadState(stateToLoad.environment); // Load env first
        await agent.loadState(stateToLoad.agent); // Await agent load (handles internal TF setup)

        // --- Restore Simulation Metrics from Loaded Agent/Env State ---
        simulationMetrics.currentStateVector = environment.currentStateVector; // Get vector from loaded env

        // Restore emotions from agent's loaded state
        safeDispose(simulationMetrics.currentAgentEmotions); // Dispose old tensor
        if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
            simulationMetrics.currentAgentEmotions = tf.keep(agent.prevEmotions.clone()); // Keep clone from agent
        } else {
            console.warn("Agent prevEmotions tensor invalid after load. Resetting to zeros.");
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        simulationMetrics.currentRIHScore = agent.lastRIH; // Use agent's loaded value
        simulationMetrics.currentTrustScore = agent.latestTrustScore; // Use agent's loaded value
        simulationMetrics.currentIntegrationParam = agent.getScalarParam('integrationParam'); // Use public method
        simulationMetrics.currentReflexivityParam = agent.getScalarParam('reflexivityParam'); // Use public method
        simulationMetrics.currentAvgAffinity = stateToLoad.metrics?.affinity ?? 0; // Restore from metrics or default
        simulationMetrics.currentContext = "State loaded.";
        simulationMetrics.currentHmLabel = "idle"; // Reset on load
        simulationMetrics.currentCascadeHistory = []; // Reset on load
        simulationMetrics.currentBeliefNorm = 0.0; // Recalculated on next step
        simulationMetrics.currentSelfStateNorm = agent.selfState ? norm(toNumberArray(agent.selfState.dataSync())) : 0.0; // Calc from loaded state

        // --- Reset / Update UI ---
        if (metricsChart) {
            metricsChart.data.datasets.forEach((dataset: ChartDataset) => dataset.data = []);
            metricsChart.update('quiet');
        }
        const timelineList = getElement('expressions-list');
        if (timelineList) timelineList.innerHTML = ''; // Clear timeline
        logToTimeline('State Loaded', 'expressions-list');

        updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);
        updateDashboardDisplay();
        if (simulationMetrics.currentAgentEmotions) await updateEmotionBars(simulationMetrics.currentAgentEmotions); // await UI update
        updateCascadeViewer();
        if (agent.selfState) updateHeatmap(toNumberArray(agent.selfState.dataSync()), 'heatmap-content');

        // --- Update Visualizations (Use Frame Clone Pattern) ---
        let loadFrameEmotions: Tensor | null = null;
        if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
             loadFrameEmotions = tf.keep(simulationMetrics.currentAgentEmotions.clone());
        } else if (typeof tf !== 'undefined') {
             loadFrameEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        if (threeInitialized) { // Syntrometry
            updateThreeJS(0, simulationMetrics.currentStateVector, simulationMetrics.currentRIHScore, agent.latestAffinities || [], simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, [], simulationMetrics.currentContext);
            updateSyntrometryInfoPanel();
        }
        if (conceptInitialized) { // Concepts
            updateAgentSimulationVisuals(loadFrameEmotions, simulationMetrics.currentRIHScore, simulationMetrics.currentAvgAffinity, simulationMetrics.currentHmLabel, simulationMetrics.currentTrustScore);
            animateConceptNodes(0, simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, -1, -1, -1);
        }
        if (live2dInitialized) { // Live2D
            if (loadFrameEmotions) updateLive2DEmotions(toLive2DFormat(loadFrameEmotions.dataSync()));
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, 0);
            updateLive2D(0); // Render update
        }
        safeDispose(loadFrameEmotions); // Dispose frame clone

        if (showMessages) appendChatMessage('System', 'Simulation state loaded successfully.');
        console.log(`Simulation state loaded successfully.`);
        criticalError = false; // Load successful, allow animation to restart

        // Restart animation loop
        requestAnimationFrame(animate);
        return true;

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("Error loading state:", e);
        if (showMessages) appendChatMessage('System', `Load failed: ${message}`);
        displayError(`Load failed: ${message}. Check console.`, false, 'error-message');
        criticalError = false; // Allow potential re-init or restart attempt
        // If loop was stopped, potentially restart it even on failure? Or require manual start?
        // requestAnimationFrame(animate); // Optional: restart loop even on load fail
        return false;
    }
}


// --- Main Animation Loop ---
async function animate(): Promise<void> {
    if (criticalError) {
        console.warn("Animation loop stopped due to critical error.");
        // Ensure loop doesn't restart itself
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        disableControls(); // Ensure controls are disabled
        return;
    }

    // Schedule next frame immediately
    animationFrameId = requestAnimationFrame(animate);

    const deltaTime = appClock.getDelta();
    const elapsedTime = appClock.getElapsedTime();

    // Tensor to use for *this frame's rendering* - created by cloning agent output
    let currentFrameEmotions: Tensor | null = null;

    // --- Simulation Step ---
    if (agent && environment && simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
        let envStepResult = null;
        let agentResponse: AgentProcessResponse | null = null;

        try {
            // 1. Environment Step
            const envStepResult: EnvStepResult | null = environment ? 
                await environment.step(
                    simulationMetrics.currentAgentEmotions,
                    simulationMetrics.currentRIHScore,
                    simulationMetrics.currentAvgAffinity
                ) : null;

            if (!envStepResult) {
                console.error("Environment step returned null result");
                return; // Exit early if no result
            }
            
            const envStateTensor = envStepResult.state; // This is a kept clone
            if (!envStateTensor || envStateTensor.isDisposed) {
                 throw new Error("Environment returned invalid state tensor in step.");
            }

            // Use async helper and dispose env tensor after getting data
            const envStateArray = await tensorToArrayAsync(envStateTensor);
            safeDispose(envStateTensor); // Dispose the env's kept clone

            if (envStateArray.length !== Config.Agent.BASE_STATE_DIM) {
                 throw new Error(`Env state array length mismatch (${envStateArray.length}). Expected ${Config.Agent.BASE_STATE_DIM}.`);
            }
            simulationMetrics.currentStateVector = envStateArray; // Update state

            // 2. Agent Processing Step
            const graphFeatures = calculateGraphFeatures();
            agentResponse = await agent.process(
                simulationMetrics.currentStateVector,
                graphFeatures,
                { 
                    eventType: envStepResult.eventType, 
                    reward: envStepResult.reward 
                }
            );
            // agentResponse.emotions is the agent's *new kept* internal state tensor for emotions

            // 3. Manage Emotion Tensors for State & Rendering
            // Dispose the *previous* frame's main simulation tensor *before* assigning the new one
            safeDispose(simulationMetrics.currentAgentEmotions);
            // Update the main simulation state with the new kept tensor from agentResponse
            simulationMetrics.currentAgentEmotions = agentResponse.emotions; // Takes ownership of the kept tensor

            // Clone the new main tensor for this frame's rendering needs
            const emotionsTensor = simulationMetrics.currentAgentEmotions;
            if (emotionsTensor && !emotionsTensor.isDisposed) {
                currentFrameEmotions = tf.keep(emotionsTensor.clone());
            } else {
                // Should not happen if agent.process works, but handle defensively
                console.error("Agent returned invalid emotion tensor!");
                if (typeof tf !== 'undefined') {
                    // Create a new tensor and store it
                    const zerosTensor = tf.zeros([1, Config.Agent.EMOTION_DIM]);
                    // Keep it for the simulation state
                    simulationMetrics.currentAgentEmotions = tf.keep(zerosTensor);
                    // Create a separate clone for the current frame
                    currentFrameEmotions = tf.keep(zerosTensor.clone());
                } else {
                    simulationMetrics.currentAgentEmotions = null;
                    currentFrameEmotions = null;
                }
                criticalError = true; // Treat as critical
            }


            // 4. Update Other Metrics from Agent Response
            simulationMetrics.currentRIHScore = agentResponse.rihScore;
            simulationMetrics.currentAvgAffinity = (agentResponse.affinities?.length > 0) ? agentResponse.affinities.reduce((a, b) => a + b, 0) / agentResponse.affinities.length : 0;
            const hmLabel = agentResponse.hmLabel;
            simulationMetrics.currentHmLabel = isValidHeadMovement(hmLabel) ? hmLabel : "idle";
            simulationMetrics.currentContext = envStepResult ? envStepResult.context : "No context available";
            simulationMetrics.currentCascadeHistory = agentResponse.cascadeHistory || [];
            simulationMetrics.currentIntegrationParam = agentResponse.integration;
            simulationMetrics.currentReflexivityParam = agentResponse.reflexivity;
            simulationMetrics.currentTrustScore = agentResponse.trustScore;
            simulationMetrics.currentBeliefNorm = agentResponse.beliefNorm ?? 0.0;
            simulationMetrics.currentSelfStateNorm = agentResponse.selfStateNorm ?? 0.0;

            // Update sliders only if needed (values derived from agent params now)
            updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);

        } catch (e: unknown) {
            console.error("Error during simulation step:", e);
            displayError(`Simulation Step Error: ${e instanceof Error ? e.message : String(e)}. Attempting recovery.`, false, 'error-message');

            // Dispose potentially invalid frame clone if created before error
            safeDispose(currentFrameEmotions);
            currentFrameEmotions = null;

            // Attempt to recover main emotion state if it became invalid
            const mainEmotionsTensor = simulationMetrics.currentAgentEmotions;
            if (!mainEmotionsTensor || mainEmotionsTensor.isDisposed) {
                if (typeof tf !== 'undefined') {
                    console.warn("Agent emotions tensor invalid during error, resetting to zeros.");
                    simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM])); // Reset main state
                } else {
                    simulationMetrics.currentAgentEmotions = null; criticalError = true;
                    displayError("TensorFlow unavailable during error recovery. Stopping simulation.", true, 'error-message');
                }
            }

            // Ensure currentFrameEmotions is valid for rendering (clone potentially recovered state)
            const updatedEmotionsTensor = simulationMetrics.currentAgentEmotions;
            if (updatedEmotionsTensor && !updatedEmotionsTensor.isDisposed) {
                currentFrameEmotions = tf.keep(updatedEmotionsTensor.clone());
            } else if (!criticalError && typeof tf !== 'undefined') {
                 // If not critical but tensor is bad, create zeros clone for frame
                 const zerosTensor = tf.zeros([1, Config.Agent.EMOTION_DIM]);
                 currentFrameEmotions = tf.keep(zerosTensor);
            } // If critical error or no TF, currentFrameEmotions remains null

            simulationMetrics.currentContext = "Simulation error occurred.";
            // Avoid updating other possibly inconsistent metrics
            if (criticalError) { // If error was critical, stop the loop now
                 if (animationFrameId) cancelAnimationFrame(animationFrameId); animationFrameId = null; return;
            }
        }
    } else {
        // Handle case where simulation prerequisites aren't met (e.g., initial load failed)
        // Ensure emotion state and frame clone are valid or null
        const prereqEmotionsTensor = simulationMetrics.currentAgentEmotions;
        if (!prereqEmotionsTensor || prereqEmotionsTensor.isDisposed) {
             if (typeof tf !== 'undefined') {
                console.warn("Initializing/Resetting simulation emotions in animation loop (prereq failed).");
                safeDispose(simulationMetrics.currentAgentEmotions);
                simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
             } else {
                 simulationMetrics.currentAgentEmotions = null; criticalError = true;
                 displayError("TensorFlow unavailable. Stopping simulation.", true, 'error-message');
             }
        }

        // Create frame clone if possible
        const finalEmotionsTensor = simulationMetrics.currentAgentEmotions;
        if (finalEmotionsTensor && !finalEmotionsTensor.isDisposed) {
             currentFrameEmotions = tf.keep(finalEmotionsTensor.clone());
        } else if (!criticalError && typeof tf !== 'undefined') {
             // Create a new zeros tensor directly
             const zerosTensor = tf.zeros([1, Config.Agent.EMOTION_DIM]);
             currentFrameEmotions = tf.keep(zerosTensor);
        } else {
             currentFrameEmotions = null; // No TF or critical error
        }
        if (!agent || !environment) simulationMetrics.currentContext = "Simulation components missing.";

        if (criticalError) { // Stop loop if critical error identified here
             if (animationFrameId) cancelAnimationFrame(animationFrameId); animationFrameId = null; return;
        }
    }

    // --- Update UI and Visualizations ---
    // Use the kept clone `currentFrameEmotions` for all UI updates this frame

    updateDashboardDisplay();
    updateMetricsChart();
    if (currentFrameEmotions) await updateEmotionBars(currentFrameEmotions); // Pass frame clone
    updateCascadeViewer();

    // Update Syntrometry Viz
    try {
        if (threeInitialized) {
            updateThreeJS(deltaTime, simulationMetrics.currentStateVector, simulationMetrics.currentRIHScore, agent?.latestAffinities || [], simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam, simulationMetrics.currentCascadeHistory, simulationMetrics.currentContext);
            updateSyntrometryInfoPanel();
        }
    } catch (e) { console.error("Error updating Syntrometry Viz:", e); }

    // Update Concept Viz
    try {
        if (conceptInitialized) {
            updateAgentSimulationVisuals(currentFrameEmotions, simulationMetrics.currentRIHScore, simulationMetrics.currentAvgAffinity, simulationMetrics.currentHmLabel, simulationMetrics.currentTrustScore);
            animateConceptNodes(appClock.getElapsedTime(), simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam,
                 elapsedTime - lastIntegrationInputTime, // Pass raw time difference
                 elapsedTime - lastReflexivityInputTime,
                 elapsedTime - lastChatImpactTime
                 // Let animateConceptNodes handle the duration check
            );
            if (conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
                conceptRenderer.render(conceptScene, conceptCamera);
                conceptLabelRenderer.render(conceptScene, conceptCamera);
            }
            conceptControls?.update();
        }
    } catch (e) { console.error("Error updating/rendering Concept Viz:", e); }

    // Update Live2D Avatar
    try {
        if (live2dInitialized && currentFrameEmotions) {
            updateLive2DEmotions(
                toNumberArray(currentFrameEmotions.dataSync())
            );
            updateLive2DHeadMovement(simulationMetrics.currentHmLabel, deltaTime);
            updateLive2D(deltaTime);
        }
    } catch (e) { console.error("Error updating Live2D:", e); }

    // Update Heatmap
    let selfStateData: number[] = [];
     if (agent?.selfState && !agent.selfState.isDisposed) {
         try { selfStateData = tensorToArray(agent.selfState); } // Use safe util
         catch (e) { console.error("Heatmap update failed:", e); }
     }
    updateHeatmap(selfStateData, 'heatmap-content');

    // Update Tensor Inspector
    const inspectorPanel = getElement('tensor-inspector-panel');
    if (inspectorPanel?.classList.contains('visible') && agent) {
         let beliefEmbeddingTensor: Tensor | null = null;
         try {
             beliefEmbeddingTensor = agent.getLatestBeliefEmbedding(); // Returns disposable clone or null
             await inspectTensor(beliefEmbeddingTensor, 'tensor-inspector-content'); // Await inspection
         } catch(e: unknown) {
             await inspectTensor(`[Error: ${e instanceof Error ? e.message : String(e)}]`, 'tensor-inspector-content');
         } finally {
              safeDispose(beliefEmbeddingTensor); // Dispose the clone after inspection
         }
    }

    // --- Dispose the temporary clone used for this frame's updates ---
    safeDispose(currentFrameEmotions);

} // End animate()


// --- Cleanup ---
function cleanup(): void {
    console.log("Cleaning up application resources (V2.3)...");
    criticalError = true; // Prevent animation loop from restarting during cleanup
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Remove global listeners
    window.removeEventListener('resize', resizeConceptGraphRenderer);
    window.removeEventListener('beforeunload', cleanup);

    // Destroy chart
    if (metricsChart) { try { metricsChart.destroy(); metricsChart = null; } catch (e) { console.error("Chart destroy error:", e); } }

    // Cleanup visualizations and core components
    try { cleanupLive2D(); } catch (e) { console.error("Live2D cleanup error:", e); }
    try { cleanupConceptVisualization(); } catch (e) { console.error("ConceptViz cleanup error:", e); }
    try { cleanupThreeJS(); } catch (e) { console.error("ThreeJS (Syntrometry) cleanup error:", e); }
    try { agent?.cleanup(); agent = null; } catch (e) { console.error("Agent cleanup error:", e); }
    try { environment?.cleanup(); environment = null; } catch (e) { console.error("Environment cleanup error:", e); }

    // Dispose global simulation state tensor
    safeDispose(simulationMetrics.currentAgentEmotions);
    simulationMetrics.currentAgentEmotions = null;
    simulationMetrics.currentStateVector = null;

    console.log("Application cleanup complete.");
}

// --- Global Event Listeners ---
window.addEventListener('load', initialize);
window.addEventListener('beforeunload', cleanup); // Ensure cleanup runs when closing tab/window

// --- END OF FILE app.ts ---
