/* app.js - Merged Version (V2.3.1) combining best features of both versions */

// --- Imports ---
import { Config, emotionKeywords, emotionNames } from './config.js';
import { displayError, appendChatMessage, zeros, tensor, clamp, inspectTensor, logToTimeline, debounce } from './utils.js';
import { SyntrometricAgent } from './agent.js';
import { EmotionalSpace } from './environment.js';
import {
    initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel,
    threeInitialized, calculateGraphFeatures
} from './viz-syntrometry.js';
import {
    initConceptVisualization, updateInfoPanel as updateConceptInfoPanel,
    cleanupConceptVisualization, conceptInitialized, isConceptVisualizationReady,
    renderConceptVisualization // Added for explicit rendering if needed
} from './viz-concepts.js';
import {
    initLive2D, live2dInitialized, cleanupLive2D
} from './viz-live2d.js';
import { updateAllUI } from './uiManager.js';
import { saveSimulationState, loadSimulationStateData, hasSavedState } from './statepersistence.js';

// --- Global State ---
let criticalError = false;
let agent = null;
let environment = null;
let animationFrameId = null;
let isPaused = false; // Simulation pause state from Version 1
const SAVED_STATE_KEY = 'syntrometrySimulationState_v2_3_1'; // Version 2's explicit versioning

const simulationMetrics = {
    currentStateVector: null,
    currentAgentEmotions: null,
    currentRIHScore: 0.0,
    currentAvgAffinity: 0.0,
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
let lastIntegrationInputTime = -1;
let lastReflexivityInputTime = -1;
let lastChatImpactTime = -1;
const inputFeedbackDuration = 0.5;

let metricsChart = null;
const MAX_CHART_POINTS = 150;
const debouncedResizeConceptGraph = debounce(resizeConceptGraphRenderer, 250);

// --- Helper Functions ---
function calculateArrayNorm(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return 0.0;
    let sumSq = 0;
    for (const val of arr) {
        if (typeof val === 'number' && isFinite(val)) {
            sumSq += val * val;
        }
    }
    return Math.sqrt(sumSq);
}

export function updateHeatmap(stateVector, targetElementId) {
    const heatmapContainer = document.getElementById(targetElementId);
    if (!heatmapContainer || !Array.isArray(stateVector)) {
        return;
    }
    const vectorLength = stateVector.length;
    if (vectorLength === 0) {
        heatmapContainer.innerHTML = '<p class="heatmap-placeholder">No State Data</p>';
        return;
    }
    const gridDim = Math.ceil(Math.sqrt(vectorLength));
    const containerWidth = heatmapContainer.clientWidth;
    if (containerWidth <= 0) return;
    const cellSize = Math.max(2, Math.floor(containerWidth / gridDim) - 1);

    heatmapContainer.style.gridTemplateColumns = `repeat(${gridDim}, ${cellSize}px)`;
    heatmapContainer.style.gridTemplateRows = `repeat(${gridDim}, ${cellSize}px)`;

    let htmlContent = '';
    for (let i = 0; i < vectorLength; i++) {
        const value = stateVector[i] ?? 0;
        const absValue = Math.abs(value);
        let r = 30, g = 30, b = 30;
        const intensity = Math.min(1.0, absValue * 1.5);

        if (value > 0.01) {
            r = 30 + Math.round(200 * intensity);
            g = 30 + Math.round(50 * intensity);
            b = 30;
        } else if (value < -0.01) {
            r = 30;
            g = 30 + Math.round(50 * intensity);
            b = 30 + Math.round(200 * intensity);
        }
        r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
        const color = `rgb(${r}, ${g}, ${b})`;
        const tooltip = `Idx ${i}: ${value.toFixed(4)}`;
        htmlContent += `<div class="heatmap-cell" style="background-color: ${color}; width:${cellSize}px; height:${cellSize}px;" title="${tooltip}"></div>`;
    }
    const totalCells = gridDim * gridDim;
    for (let i = vectorLength; i < totalCells; i++) {
        htmlContent += `<div class="heatmap-cell filler" style="width:${cellSize}px; height:${cellSize}px;"></div>`;
    }
    heatmapContainer.innerHTML = htmlContent;
}

function updateMetricsChart() {
    if (!metricsChart || criticalError || agent === null) return;
    const now = Date.now();
    try {
        metricsChart.data.datasets[0].data.push({ x: now, y: simulationMetrics.currentRIHScore });
        metricsChart.data.datasets[1].data.push({ x: now, y: simulationMetrics.currentAvgAffinity });
        metricsChart.data.datasets[2].data.push({ x: now, y: simulationMetrics.currentTrustScore });
        metricsChart.data.datasets[3].data.push({ x: now, y: simulationMetrics.currentBeliefNorm });
        metricsChart.data.datasets[4].data.push({ x: now, y: simulationMetrics.currentSelfStateNorm });

        // Trim data points for performance
        metricsChart.data.datasets.forEach(dataset => {
            while (dataset.data.length > MAX_CHART_POINTS * 1.2) {
                dataset.data.shift();
            }
        });

        metricsChart.update('quiet');
    } catch (e) {
        console.error("Error updating metrics chart:", e);
    }
}

export function updateDashboardDisplay(metrics) {
    const updateElement = (id, value, text = null, progress = false, range = [0, 1], invert = false) => {
        const element = document.getElementById(id);
        if (element) {
            const displayValue = text !== null ? text : (typeof value === 'number' ? value.toFixed(3) : 'N/A');
            if (element.tagName === 'PROGRESS') {
                const [min, max] = range;
                const scaledValue = (typeof value === 'number' && (max - min) !== 0) ? ((value - min) / (max - min)) * 100 : 50;
                element.value = clamp(invert ? 100 - scaledValue : scaledValue, 0, 100);
            } else {
                element.textContent = displayValue;
            }
        }
    };
    updateElement('metric-rih-value', metrics.currentRIHScore * 100, `${(metrics.currentRIHScore * 100).toFixed(1)}%`);
    updateElement('metric-rih-progress', metrics.currentRIHScore, null, true);
    updateElement('metric-affinity-value', metrics.currentAvgAffinity, metrics.currentAvgAffinity.toFixed(2));
    updateElement('metric-affinity-progress', metrics.currentAvgAffinity, null, true, [-1, 1]);
    updateElement('metric-trust-value', metrics.currentTrustScore * 100, `${(metrics.currentTrustScore * 100).toFixed(1)}%`);
    updateElement('metric-trust-progress', metrics.currentTrustScore, null, true);
    updateElement('metric-belief-norm', metrics.currentBeliefNorm);
    updateElement('metric-self-norm', metrics.currentSelfStateNorm);
    updateElement('metric-context', 0, metrics.currentContext);
}

export function updateEmotionBars(emotionsTensor) {
    const container = document.getElementById('emotion-intensities');
    if (!container) return;
    const isValidTensor = emotionsTensor && typeof emotionsTensor.arraySync === 'function' && !emotionsTensor.isDisposed;
    container.style.opacity = isValidTensor ? '1' : '0.5';

    if (!isValidTensor) {
        emotionNames.forEach(name => {
            const barFill = container.querySelector(`.${name.toLowerCase()} .bar-fill`);
            if (barFill) barFill.style.width = `0%`;
        });
        return;
    }
    try {
        const emotions = emotionsTensor.arraySync()[0];
        if (!Array.isArray(emotions)) throw new Error("arraySync did not return an array.");
        emotionNames.forEach((name, index) => {
            const barFill = container.querySelector(`.${name.toLowerCase()} .bar-fill`);
            if (barFill) {
                const intensity = (index < emotions.length && typeof emotions[index] === 'number') ? clamp(emotions[index] * 100, 0, 100) : 0;
                barFill.style.width = `${intensity}%`;
            }
        });
    } catch (e) {
        console.error("Error updating emotion bars:", e);
        container.style.opacity = '0.5';
    }
}

export function updateCascadeViewer(history) {
    const contentDiv = document.getElementById('cascade-viewer-content');
    if (!contentDiv) return;
    if (!Array.isArray(history) || history.length === 0) {
        contentDiv.innerHTML = '<span class="cascade-placeholder">No cascade data.</span>';
        return;
    }
    const containerBaseHeight = 50;
    const maxBarHeight = containerBaseHeight - 4;
    let html = '';
    history.forEach((levelArray, index) => {
        html += `<div class="cv-level"><div class="cv-level-title">Level ${index} (${Array.isArray(levelArray) ? levelArray.length : 'Invalid'})</div>`;
        html += `<div class="cv-syndrome-container" style="height: ${containerBaseHeight}px;">`;
        if (Array.isArray(levelArray) && levelArray.length > 0) {
            levelArray.forEach((value, sIndex) => {
                value = (typeof value === 'number' && isFinite(value)) ? value : 0;
                const absValue = Math.abs(value);
                const colorIntensity = clamp(absValue * 1.2, 0, 1);
                const barHeightPx = clamp(absValue * maxBarHeight * 1.5, 2, maxBarHeight);
                let r = 50, g = 50, b = 50;
                if (value > 0.01) {
                    r = 50 + Math.round(180 * colorIntensity);
                    g = 50 + Math.round(30 * colorIntensity);
                } else if (value < -0.01) {
                    g = 50 + Math.round(80 * colorIntensity);
                    b = 50 + Math.round(180 * colorIntensity);
                }
                r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
                html += `<div class="cv-syndrome-bar" style="background-color: rgb(${r},${g},${b}); height: ${barHeightPx}px;" title="Lvl ${index}, Idx ${sIndex}: ${value.toFixed(4)}"></div>`;
            });
        } else {
            html += '<span class="cascade-placeholder">[Empty or Invalid Level]</span>';
        }
        html += `</div></div>`;
    });
    contentDiv.innerHTML = html;
    contentDiv.scrollTop = contentDiv.scrollHeight;
}

function resizeConceptGraphRenderer() {
    if (!conceptInitialized || !isConceptVisualizationReady()) return;
    const container = document.getElementById('concept-panel');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;
    // Delegate resizing to viz-concepts.js, assuming it exposes a resize function
    // Fallback to explicit resizing if necessary (from Version 2)
    try {
        renderConceptVisualization({ width, height }); // Assumes viz-concepts.js handles resize
    } catch (e) {
        console.warn("Error resizing concept graph, falling back to default:", e);
    }
}

export function updateSliderDisplays(integrationValue, reflexivityValue) {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const integrationValueEl = document.getElementById('integration-value');
    const reflexivityValueEl = document.getElementById('reflexivity-value');

    if (integrationSlider && integrationValueEl && typeof integrationValue === 'number' && !integrationSlider.matches(':active')) {
        integrationSlider.value = integrationValue;
        integrationValueEl.textContent = integrationValue.toFixed(2);
    }
    if (reflexivitySlider && reflexivityValueEl && typeof reflexivityValue === 'number' && !reflexivitySlider.matches(':active')) {
        reflexivitySlider.value = reflexivityValue;
        reflexivityValueEl.textContent = reflexivityValue.toFixed(2);
    }
}

// --- Initialization ---
async function initialize() {
    console.log("Initializing application (Agent V2.3.1)...");
    const coreInitSuccess = initAgentAndEnvironment();
    if (!coreInitSuccess) {
        criticalError = true;
        displayError("Core simulation components (Agent/Environment/TF) failed to initialize. Aborting.", true, 'error-message');
        disableControls();
        return;
    }

    const threeSuccess = initThreeJS();
    const conceptSuccess = initConceptVisualization(appClock);
    const live2dSuccess = await initLive2D();

    if (!threeSuccess) displayError("Syntrometry visualization failed to initialize.", false, 'syntrometry-error-message');
    if (!conceptSuccess) displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
    if (!live2dSuccess) displayError("Live2D avatar failed to initialize.", false, 'error-message');

    initMetricsChart();
    setupControls();
    setupChat();
    setupInspectorToggle();

    let initialStateLoaded = false;
    if (hasSavedState()) {
        initialStateLoaded = loadState(false);
    }

    if (!initialStateLoaded) {
        console.log("No valid saved state or load failed, initializing new simulation state...");
        await initializeNewSimulationState();
    }

    if (criticalError) {
        console.error("Critical error encountered during initialization or state loading.");
        setDefaultSimulationMetrics();
        disableControls();
    } else {
        updateAllUI(
            simulationMetrics,
            agent,
            simulationMetrics.currentAgentEmotions,
            0,
            { elapsedTime: 0, lastIntegrationInputTime: -1, lastReflexivityInputTime: -1, lastChatImpactTime: -1, inputFeedbackDuration },
            threeInitialized,
            conceptInitialized,
            live2dInitialized
        );
        updateMetricsChart();
        logToTimeline("System Initialized", 'expressions-list');
        if (agent?.selfState && !agent.selfState.isDisposed) {
            try {
                updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
            } catch (e) {
                console.error("Initial heatmap update failed:", e);
                updateHeatmap([], 'heatmap-content');
            }
        } else {
            updateHeatmap([], 'heatmap-content');
        }

        console.log("Initialization complete (V2.3.1). Starting animation loop.");
        isPaused = false;
        window.addEventListener('resize', debouncedResizeConceptGraph);
        animate();
    }
}

async function initializeNewSimulationState() {
    if (!environment || !agent) {
        console.error("Cannot initialize new state: Environment or Agent missing.");
        criticalError = true;
        return;
    }
    try {
        const initialStateResult = await environment.reset();
        const envStateTensor = initialStateResult.state;
        if (!envStateTensor || envStateTensor.isDisposed) {
            throw new Error("Environment reset returned invalid state tensor.");
        }
        const initialStateArray = envStateTensor.arraySync()[0];
        tf.dispose(envStateTensor);

        simulationMetrics.currentStateVector = initialStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
        while (simulationMetrics.currentStateVector.length < Config.Agent.BASE_STATE_DIM) simulationMetrics.currentStateVector.push(0);

        if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
        simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));

        const initialGraphFeatures = calculateGraphFeatures();
        const initialAgentResponse = await agent.process(
            simulationMetrics.currentStateVector, initialGraphFeatures, { eventType: null, reward: 0 }
        );

        if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
        simulationMetrics.currentAgentEmotions = initialAgentResponse.emotions;
        simulationMetrics.currentRIHScore = initialAgentResponse.rihScore;
        simulationMetrics.currentAvgAffinity = (initialAgentResponse.affinities?.length > 0) ? initialAgentResponse.affinities.reduce((a, b) => a + b, 0) / initialAgentResponse.affinities.length : 0;
        simulationMetrics.currentHmLabel = initialAgentResponse.hmLabel;
        simulationMetrics.currentContext = "Simulation initialized (New State).";
        simulationMetrics.currentCascadeHistory = initialAgentResponse.cascadeHistory;
        simulationMetrics.currentIntegrationParam = initialAgentResponse.integration;
        simulationMetrics.currentReflexivityParam = initialAgentResponse.reflexivity;
        simulationMetrics.currentTrustScore = initialAgentResponse.trustScore;
        simulationMetrics.currentBeliefNorm = initialAgentResponse.beliefNorm ?? 0.0;
        simulationMetrics.currentSelfStateNorm = initialAgentResponse.selfStateNorm ?? 0.0;

        console.log("Initialized V2.3.1 with fresh agent state.");
    } catch (initialProcessError) {
        console.error("Error during initial agent/environment processing:", initialProcessError);
        displayError(`Error initializing simulation state: ${initialProcessError.message}.`, true, 'error-message');
        criticalError = true;
        setDefaultSimulationMetrics();
    }
}

function setDefaultSimulationMetrics() {
    simulationMetrics.currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);
    if (typeof tf !== 'undefined') {
        if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
        simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
    } else {
        simulationMetrics.currentAgentEmotions = null;
    }
    simulationMetrics.currentRIHScore = 0;
    simulationMetrics.currentAvgAffinity = 0;
    simulationMetrics.currentTrustScore = 1.0;
    simulationMetrics.currentBeliefNorm = 0.0;
    simulationMetrics.currentSelfStateNorm = 0.0;
    simulationMetrics.currentHmLabel = "idle";
    simulationMetrics.currentContext = criticalError ? "Simulation core failed." : "Simulation state error/reset.";
    simulationMetrics.currentCascadeHistory = [];
    simulationMetrics.currentIntegrationParam = 0.5;
    simulationMetrics.currentReflexivityParam = 0.5;
}

function initAgentAndEnvironment() {
    if (typeof tf === 'undefined') {
        console.error("CRITICAL: TensorFlow.js is required but not loaded.");
        return false;
    }
    try {
        agent = new SyntrometricAgent();
        environment = new EmotionalSpace();

        if (!agent?.optimizer || !agent?.beliefNetwork || !agent?.enyphansyntrix || !environment?.baseEmotions) {
            throw new Error("Agent or Environment failed basic validation after initialization.");
        }
        console.log("Agent (V2.3.1) and Environment initialized successfully.");
        return true;
    } catch (e) {
        console.error('[Init] Agent/Environment creation/validation error:', e);
        displayError(`Initialization Error: ${e.message}. Simulation logic disabled.`, true, 'error-message');
        agent?.cleanup();
        environment?.cleanup();
        agent = null;
        environment = null;
        return false;
    }
}

function initMetricsChart() {
    const ctx = document.getElementById('metrics-chart');
    if (!ctx) {
        console.error("Metrics chart canvas not found!");
        return;
    }
    if (metricsChart) {
        try {
            metricsChart.destroy();
        } catch (e) {}
        metricsChart = null;
    }

    const computedStyle = getComputedStyle(document.documentElement);
    const chartGridColor = computedStyle.getPropertyValue('--chart-grid-color').trim() || 'rgba(200, 200, 220, 0.15)';
    const chartTickColor = 'rgba(238, 238, 238, 0.7)';
    const chartLegendLabelColor = 'rgba(238, 238, 238, 0.8)';
    const chartTooltipBg = computedStyle.getPropertyValue('--chart-tooltip-bg').trim() || 'rgba(18, 18, 34, 0.85)';
    const chartAccentColor = computedStyle.getPropertyValue('--primary-color').trim() || '#00aaff';
    const chartTextColor = computedStyle.getPropertyValue('--text-color').trim() || '#eeeeee';
    const colorRIHBorder = 'rgb(102, 255, 102)';
    const colorAffinityBorder = 'rgb(255, 170, 102)';
    const colorTrustBorder = 'rgb(102, 170, 255)';
    const colorBeliefNormBorder = 'rgb(255, 255, 102)';
    const colorSelfNormBorder = 'rgb(200, 150, 255)';

    try {
        metricsChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    { label: 'RIH', data: [], borderColor: colorRIHBorder, backgroundColor: colorRIHBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), borderWidth: 1.5, pointRadius: 0, yAxisID: 'yPercentage', tension: 0.1 },
                    { label: 'Affinity', data: [], borderColor: colorAffinityBorder, backgroundColor: colorAffinityBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), borderWidth: 1.5, pointRadius: 0, yAxisID: 'yBipolar', tension: 0.1 },
                    { label: 'Trust', data: [], borderColor: colorTrustBorder, backgroundColor: colorTrustBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), borderWidth: 1.5, pointRadius: 0, yAxisID: 'yPercentage', tension: 0.1 },
                    { label: 'Belief Norm', data: [], borderColor: colorBeliefNormBorder, backgroundColor: colorBeliefNormBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), borderWidth: 1, pointRadius: 0, yAxisID: 'yNorm', tension: 0.1, hidden: true },
                    { label: 'Self Norm', data: [], borderColor: colorSelfNormBorder, backgroundColor: colorSelfNormBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'), borderWidth: 1, pointRadius: 0, yAxisID: 'yNorm', tension: 0.1, hidden: true }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: {
                        type: 'realtime',
                        realtime: {
                            duration: 30000,
                            refresh: 1000,
                            delay: 500,
                            pause: false,
                            ttl: 60000
                        },
                        ticks: { display: false },
                        grid: { color: chartGridColor }
                    },
                    yPercentage: {
                        beginAtZero: true, max: 1.0, position: 'left',
                        ticks: { color: chartTickColor, font: { size: 10 }, stepSize: 0.25, callback: value => (value * 100).toFixed(0) + '%' },
                        grid: { color: chartGridColor }
                    },
                    yBipolar: {
                        min: -1.0, max: 1.0, position: 'right',
                        ticks: { color: chartTickColor, font: { size: 10 }, stepSize: 0.5 },
                        grid: { display: false }
                    },
                    yNorm: {
                        beginAtZero: true, position: 'right', display: false,
                        ticks: { color: chartTickColor, font: { size: 10 } },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom', align: 'start',
                        labels: { color: chartLegendLabelColor, font: { size: 10 }, boxWidth: 12, padding: 10 },
                        onClick: (e, legendItem, legend) => {
                            const index = legendItem.datasetIndex;
                            const ci = legend.chart;
                            const meta = ci.getDatasetMeta(index);
                            meta.hidden = meta.hidden === null ? !ci.data.datasets[index].hidden : null;
                            if (ci.options.scales.yNorm && (index === 3 || index === 4)) {
                                const normVisible = !ci.getDatasetMeta(3).hidden || !ci.getDatasetMeta(4).hidden;
                                ci.options.scales.yNorm.display = normVisible;
                            }
                            ci.update();
                        }
                    },
                    tooltip: {
                        enabled: true, mode: 'index', intersect: false, backgroundColor: chartTooltipBg, titleColor: chartAccentColor, bodyColor: chartTextColor, boxPadding: 5,
                        callbacks: {
                            title: (tooltipItems) => tooltipItems[0]?.label ? new Date(tooltipItems[0].parsed.x).toLocaleTimeString() : '',
                            label: (context) => {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    const value = context.parsed.y;
                                    label += (context.dataset.yAxisID === 'yPercentage') ? (value * 100).toFixed(1) + '%' : value.toFixed(3);
                                }
                                return label;
                            }
                        }
                    }
                },
                interaction: { mode: 'nearest', axis: 'x', intersect: false }
            }
        });
        console.log("Metrics chart initialized.");
    } catch (chartError) {
        console.error("Error initializing Chart.js:", chartError);
        displayError(`Chart initialization failed: ${chartError.message}`, false, 'error-message');
    }
}

function setupControls() {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const integrationValueEl = document.getElementById('integration-value');
    const reflexivityValueEl = document.getElementById('reflexivity-value');
    const saveButton = document.getElementById('save-state-button');
    const loadButton = document.getElementById('load-state-button');
    const pauseButton = document.getElementById('pause-button');

    if (integrationSlider && integrationValueEl) {
        integrationSlider.addEventListener('input', () => {
            integrationValueEl.textContent = parseFloat(integrationSlider.value).toFixed(2);
            lastIntegrationInputTime = appClock.getElapsedTime();
        });
        integrationSlider.disabled = true;
        integrationSlider.classList.add('read-only-slider');
    } else {
        console.warn("Integration slider/value elements not found.");
    }

    if (reflexivitySlider && reflexivityValueEl) {
        reflexivitySlider.addEventListener('input', () => {
            reflexivityValueEl.textContent = parseFloat(reflexivitySlider.value).toFixed(2);
            lastReflexivityInputTime = appClock.getElapsedTime();
        });
        reflexivitySlider.disabled = true;
        reflexivitySlider.classList.add('read-only-slider');
    } else {
        console.warn("Reflexivity slider/value elements not found.");
    }

    if (saveButton) {
        saveButton.addEventListener('click', saveState);
        saveButton.disabled = criticalError;
    } else {
        console.warn("Save button not found.");
    }

    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true));
        loadButton.disabled = criticalError;
        if (hasSavedState()) loadButton.classList.add('has-saved-state');
        else loadButton.classList.remove('has-saved-state');
    } else {
        console.warn("Load button not found.");
    }

    if (pauseButton) {
        pauseButton.addEventListener('click', togglePause);
        pauseButton.disabled = criticalError;
        pauseButton.textContent = isPaused ? "Resume" : "Pause";
    } else {
        console.warn("Pause button not found.");
    }
}

function togglePause() {
    if (criticalError) return;
    isPaused = !isPaused;
    const pauseButton = document.getElementById('pause-button');
    if (pauseButton) pauseButton.textContent = isPaused ? "Resume" : "Pause";

    if (!isPaused && !animationFrameId) {
        console.log("Resuming simulation loop.");
        animate();
    } else if (isPaused) {
        console.log("Simulation paused.");
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function disableControls() {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const saveButton = document.getElementById('save-state-button');
    const loadButton = document.getElementById('load-state-button');
    const pauseButton = document.getElementById('pause-button');
    const chatInput = document.getElementById('chat-input');

    if (integrationSlider) integrationSlider.disabled = true;
    if (reflexivitySlider) reflexivitySlider.disabled = true;
    if (saveButton) saveButton.disabled = true;
    if (loadButton) saveButton.disabled = true;
    if (pauseButton) pauseButton.disabled = true;
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = "Simulation disabled.";
    }
}

function setupChat() {
    const chatInput = document.getElementById('chat-input');
    const chatOutput = document.getElementById('chat-output');
    if (!chatInput || !chatOutput) {
        console.warn("Chat elements not found.");
        return;
    }

    chatInput.disabled = criticalError;
    chatInput.placeholder = criticalError ? "Simulation disabled." : "Interact with the simulation...";

    chatInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && chatInput.value.trim() && !criticalError && !isPaused) {
            const userInput = chatInput.value.trim();
            appendChatMessage('You', userInput);
            chatInput.value = '';

            if (environment && agent) {
                try {
                    const impactTensor = await environment.getEmotionalImpactFromText(userInput);
                    logToTimeline(`Chat Input: "${userInput.substring(0, 25)}..."`, 'expressions-list');
                    appendChatMessage('System', 'Input processed, influencing environment.');
                    lastChatImpactTime = appClock.getElapsedTime();

                    if (impactTensor && !impactTensor.isDisposed) tf.dispose(impactTensor);
                } catch (chatError) {
                    console.error("Error processing chat input:", chatError);
                    appendChatMessage('System', 'Error processing input.');
                }
            } else {
                appendChatMessage('System', 'Environment/Agent not ready.');
            }
        } else if (e.key === 'Enter' && isPaused) {
            appendChatMessage('System', 'Simulation is paused. Resume to interact.');
            chatInput.value = '';
        }
    });
}

function setupInspectorToggle() {
    const toggleButton = document.getElementById('toggle-inspector');
    const inspectorPanel = document.getElementById('tensor-inspector-panel');
    if (toggleButton && inspectorPanel) {
        toggleButton.addEventListener('click', () => {
            const isVisible = inspectorPanel.classList.toggle('visible');
            toggleButton.setAttribute('aria-expanded', isVisible);
            if (isVisible) updateTensorInspector();
        });
        toggleButton.setAttribute('aria-expanded', inspectorPanel.classList.contains('visible'));
    } else {
        console.warn("Tensor inspector toggle/panel elements not found.");
    }
}

function updateTensorInspector() {
    if (agent) {
        let beliefEmbeddingTensor = null;
        try {
            beliefEmbeddingTensor = agent.getLatestBeliefEmbedding();
            inspectTensor(beliefEmbeddingTensor, 'tensor-inspector-content');
        } catch (e) {
            inspectTensor(`[Error retrieving tensor: ${e.message}]`, 'tensor-inspector-content');
        } finally {
            if (beliefEmbeddingTensor && !beliefEmbeddingTensor.isDisposed) {
                tf.dispose(beliefEmbeddingTensor);
            }
        }
    } else {
        inspectTensor(null, 'tensor-inspector-content');
    }
}

// --- State Management ---
function saveState() {
    if (criticalError || !agent || !environment || isPaused) {
        console.warn("Cannot save state: Simulation not ready, critical error, or paused.");
        appendChatMessage('System', 'Save failed: Simulation not ready, error, or paused.');
        return;
    }
    console.log("Saving simulation state...");
    const stateToSave = {
        version: "2.3.1",
        timestamp: new Date().toISOString(),
        environment: environment.getState(),
        agent: agent.getState(),
        metrics: {
            rih: simulationMetrics.currentRIHScore,
            affinity: simulationMetrics.currentAvgAffinity,
            trust: simulationMetrics.currentTrustScore,
            context: simulationMetrics.currentContext,
            hmLabel: simulationMetrics.currentHmLabel
        }
    };
    const success = saveSimulationState(agent, environment, simulationMetrics, stateToSave);

    if (success) {
        appendChatMessage('System', 'Simulation state saved.');
        logToTimeline('State Saved', 'expressions-list');
        const loadButton = document.getElementById('load-state-button');
        if (loadButton) loadButton.classList.add('has-saved-state');
    } else {
        appendChatMessage('System', 'Failed to save simulation state.');
    }
}

function loadState(showMessages = false) {
    if (!agent || !environment) {
        if (showMessages) appendChatMessage('System', 'Load failed: Core components not ready.');
        console.warn("Cannot load state: Agent or Environment not initialized.");
        return false;
    }

    const wasPaused = isPaused;
    isPaused = true;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    console.log("Attempting to load state...");
    displayError("Loading state...", false, 'status-message');

    const loadResult = loadSimulationStateData();
    if (!loadResult.success || !loadResult.data) {
        if (showMessages) appendChatMessage('System', `Load failed: ${loadResult.message}`);
        displayError(`Load failed: ${loadResult.message}`, true, 'error-message');
        criticalError = true;
        disableControls();
        isPaused = wasPaused;
        return false;
    }

    try {
        if (loadResult.data.version !== "2.3.1") {
            throw new Error(`Incompatible state version (${loadResult.data.version}). Expected 2.3.1.`);
        }
        console.log(`Applying loaded state V${loadResult.data.version} from ${loadResult.data.timestamp}...`);
        environment.loadState(loadResult.data.environmentState);
        agent.loadState(loadResult.data.agentState);

        simulationMetrics.currentStateVector = environment.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM);
        if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
            tf.dispose(simulationMetrics.currentAgentEmotions);
        }
        if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
            simulationMetrics.currentAgentEmotions = tf.keep(agent.prevEmotions.clone());
        } else {
            simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        simulationMetrics.currentRIHScore = agent.lastRIH ?? loadResult.data.metrics.rih ?? 0;
        simulationMetrics.currentTrustScore = agent.latestTrustScore ?? loadResult.data.metrics.trust ?? 1.0;
        simulationMetrics.currentIntegrationParam = agent.integrationParam?.dataSync()[0] ?? 0.5;
        simulationMetrics.currentReflexivityParam = agent.reflexivityParam?.dataSync()[0] ?? 0.5;
        simulationMetrics.currentAvgAffinity = loadResult.data.metrics.affinity ?? 0;
        simulationMetrics.currentContext = loadResult.data.metrics.context || "State Loaded.";
        simulationMetrics.currentHmLabel = loadResult.data.metrics.hmLabel || "idle";
        simulationMetrics.currentBeliefNorm = 0;
        simulationMetrics.currentSelfStateNorm = agent.selfState && !agent.selfState.isDisposed ? calculateArrayNorm(agent.selfState.dataSync()) : 0.0;
        simulationMetrics.currentCascadeHistory = agent.latestCascadeHistoryArrays || [];

        updateAllUI(
            simulationMetrics, agent, simulationMetrics.currentAgentEmotions, 0,
            { elapsedTime: 0, lastIntegrationInputTime: -1, lastReflexivityInputTime: -1, lastChatImpactTime: -1, inputFeedbackDuration },
            threeInitialized, conceptInitialized, live2dInitialized
        );
        updateMetricsChart();
        updateTensorInspector();
        logToTimeline("State Loaded.", 'expressions-list');
        if (showMessages) appendChatMessage('System', 'Simulation state loaded successfully.');
        displayError("State loaded.", false, 'status-message');

        criticalError = false;
        const loadButton = document.getElementById('load-state-button');
        if (loadButton) loadButton.classList.add('has-saved-state');

        isPaused = wasPaused;
        if (!isPaused) {
            console.log("Resuming simulation after load.");
            animate();
        } else {
            const pauseButton = document.getElementById('pause-button');
            if (pauseButton) pauseButton.textContent = "Resume";
        }
        return true;
    } catch (e) {
        console.error("Error applying loaded state:", e);
        if (showMessages) appendChatMessage('System', `Error applying loaded state: ${e.message}`);
        displayError(`Error applying loaded state: ${e.message}`, true, 'error-message');
        criticalError = true;
        disableControls();
        isPaused = wasPaused;
        return false;
    }
}

// --- Main Animation Loop ---
async function animate() {
    if (criticalError) {
        console.warn("Animation loop stopped due to critical error.");
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
        return;
    }
    if (isPaused) {
        animationFrameId = null;
        return;
    }

    animationFrameId = requestAnimationFrame(animate);
    const deltaTime = appClock.getDelta();
    const elapsedTime = appClock.getElapsedTime();

    let agentResponse = null;
    let envStepResult = null;
    let emotionsTensorForViz = null;

    if (agent && environment && simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
        try {
            envStepResult = await environment.step(
                simulationMetrics.currentAgentEmotions,
                simulationMetrics.currentRIHScore,
                simulationMetrics.currentAvgAffinity
            );
            const envStateTensor = envStepResult.state;
            if (!envStateTensor || envStateTensor.isDisposed) {
                throw new Error("Environment returned invalid state tensor in step.");
            }
            const envStateArray = envStateTensor.arraySync();
            if (!Array.isArray(envStateArray) || envStateArray.length === 0 || !Array.isArray(envStateArray[0])) {
                throw new Error(`Unexpected state tensor shape from environment: ${envStateTensor.shape}`);
            }
            simulationMetrics.currentStateVector = envStateArray[0].slice(0, Config.Agent.BASE_STATE_DIM);
            while (simulationMetrics.currentStateVector.length < Config.Agent.BASE_STATE_DIM) simulationMetrics.currentStateVector.push(0);

            const graphFeatures = calculateGraphFeatures();
            agentResponse = await agent.process(
                simulationMetrics.currentStateVector,
                graphFeatures,
                { eventType: envStepResult.eventType, reward: envStepResult.reward }
            );
            if (!agentResponse || !agentResponse.emotions || agentResponse.emotions.isDisposed) {
                throw new Error("Agent process returned invalid or disposed emotions tensor.");
            }

            if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
                tf.dispose(simulationMetrics.currentAgentEmotions);
            }
            simulationMetrics.currentAgentEmotions = agentResponse.emotions;
            emotionsTensorForViz = tf.keep(simulationMetrics.currentAgentEmotions.clone());

            simulationMetrics.currentRIHScore = agentResponse.rihScore;
            simulationMetrics.currentAvgAffinity = (agentResponse.affinities?.length > 0) ? agentResponse.affinities.reduce((a, b) => a + b, 0) / agentResponse.affinities.length : 0;
            simulationMetrics.currentHmLabel = agentResponse.hmLabel;
            simulationMetrics.currentContext = envStepResult.context;
            simulationMetrics.currentCascadeHistory = agentResponse.cascadeHistory;
            simulationMetrics.currentIntegrationParam = agentResponse.integration;
            simulationMetrics.currentReflexivityParam = agentResponse.reflexivity;
            simulationMetrics.currentTrustScore = agentResponse.trustScore;
            simulationMetrics.currentBeliefNorm = agentResponse.beliefNorm ?? 0.0;
            simulationMetrics.currentSelfStateNorm = agentResponse.selfStateNorm ?? 0.0;

            updateSliderDisplays(simulationMetrics.currentIntegrationParam, simulationMetrics.currentReflexivityParam);
        } catch (e) {
            console.error("Error during simulation step:", e);
            displayError(`Simulation Step Error: ${e.message}.`, false, 'error-message');
            if (!simulationMetrics.currentAgentEmotions || simulationMetrics.currentAgentEmotions.isDisposed) {
                console.warn("Agent emotions tensor invalid during error, resetting.");
                if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
                simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            }
            if (emotionsTensorForViz && !emotionsTensorForViz.isDisposed) tf.dispose(emotionsTensorForViz);
            emotionsTensorForViz = tf.keep(simulationMetrics.currentAgentEmotions.clone());
            simulationMetrics.currentContext = "Simulation error occurred.";
        } finally {
            if (envStepResult?.state && !envStepResult.state.isDisposed) {
                tf.dispose(envStepResult.state);
            }
        }
    } else {
        console.warn("Simulation prerequisites not met for step. Using existing/default metrics.");
        if (!simulationMetrics.currentAgentEmotions || simulationMetrics.currentAgentEmotions.isDisposed) {
            if (typeof tf !== 'undefined') {
                if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) tf.dispose(simulationMetrics.currentAgentEmotions);
                simulationMetrics.currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            } else {
                simulationMetrics.currentAgentEmotions = null;
                criticalError = true;
                displayError("TensorFlow unavailable. Stopping simulation.", true, 'error-message');
                return;
            }
        }
        if (emotionsTensorForViz && !emotionsTensorForViz.isDisposed) tf.dispose(emotionsTensorForViz);
        emotionsTensorForViz = tf.keep(simulationMetrics.currentAgentEmotions.clone());
    }

    try {
        updateAllUI(
            simulationMetrics,
            agent,
            emotionsTensorForViz,
            deltaTime,
            { elapsedTime, lastIntegrationInputTime, lastReflexivityInputTime, lastChatImpactTime, inputFeedbackDuration },
            threeInitialized,
            conceptInitialized,
            live2dInitialized
        );
    } catch (uiUpdateError) {
        console.error("Error during master UI update:", uiUpdateError);
    }

    updateMetricsChart();
    if (document.getElementById('tensor-inspector-panel')?.classList.contains('visible')) {
        updateTensorInspector();
    }

    if (agent?.selfState && !agent.selfState.isDisposed) {
        try {
            updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
        } catch (e) {
            console.error("Heatmap update failed:", e);
            updateHeatmap([], 'heatmap-content');
        }
    } else {
        updateHeatmap([], 'heatmap-content');
    }

    if (emotionsTensorForViz && !emotionsTensorForViz.isDisposed) {
        tf.dispose(emotionsTensorForViz);
    }
}

// --- Cleanup ---
function cleanup() {
    console.log("Cleaning up application resources (V2.3.1)...");
    criticalError = true;
    isPaused = true;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    window.removeEventListener('resize', debouncedResizeConceptGraph);
    window.removeEventListener('beforeunload', cleanup);

    if (metricsChart) {
        try {
            metricsChart.destroy();
        } catch (e) {}
        metricsChart = null;
    }

    try {
        if (cleanupLive2D) cleanupLive2D();
    } catch (e) {
        console.error("Live2D cleanup error:", e);
    }
    try {
        if (cleanupConceptVisualization) cleanupConceptVisualization();
    } catch (e) {
        console.error("ConceptViz cleanup error:", e);
    }
    try {
        if (cleanupThreeJS) cleanupThreeJS();
    } catch (e) {
        console.error("ThreeJS (Syntrometry) cleanup error:", e);
    }

    try {
        agent?.cleanup();
    } catch (e) {
        console.error("Agent cleanup error:", e);
    }
    try {
        environment?.cleanup();
    } catch (e) {
        console.error("Environment cleanup error:", e);
    }

    if (simulationMetrics.currentAgentEmotions && !simulationMetrics.currentAgentEmotions.isDisposed) {
        try {
            tf.dispose(simulationMetrics.currentAgentEmotions);
        } catch (e) {
            console.error("Error disposing global emotions tensor:", e);
        }
    }

    agent = null;
    environment = null;
    simulationMetrics.currentAgentEmotions = null;
    simulationMetrics.currentStateVector = null;
    setDefaultSimulationMetrics();

    console.log("Application cleanup complete.");
}

// --- Global Event Listeners ---
window.addEventListener('load', initialize);
window.addEventListener('beforeunload', cleanup);
