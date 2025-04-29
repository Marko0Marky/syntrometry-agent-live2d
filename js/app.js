// --- Imports ---
import { Config, emotionKeywords, emotionNames } from './config.js';
import { displayError, appendChatMessage, zeros, tensor, clamp, inspectTensor, logToTimeline } from './utils.js';
import { SyntrometricAgent } from './agent.js';
import { EmotionalSpace } from './environment.js';
import {
    initThreeJS, updateThreeJS, cleanupThreeJS, updateSyntrometryInfoPanel,
    threeInitialized, calculateGraphFeatures,
    rihNode
} from './viz-syntrometry.js';
import {
    initConceptVisualization, updateAgentSimulationVisuals, animateConceptNodes,
    updateInfoPanel, cleanupConceptVisualization, conceptInitialized,
    conceptRenderer, conceptLabelRenderer, conceptScene, conceptCamera, conceptControls
} from './viz-concepts.js';
import { initLive2D, updateLive2DEmotions, updateLive2DHeadMovement, live2dInitialized, cleanupLive2D } from './viz-live2d.js';

// --- Global State ---
let criticalError = false;
let agent = null;
let environment = null;
let currentStateVector = null;
let currentAgentEmotions = null;
let currentRIHScore = 0;
let currentAvgAffinity = 0;
let currentHmLabel = "idle";
let currentContext = "Initializing...";
let currentCascadeHistory = [];
let currentIntegrationParam = 0.5;
let currentReflexivityParam = 0.5;
let currentTrustScore = 1.0;
let currentBeliefNorm = 0.0;
let currentSelfStateNorm = 0.0;

const appClock = new THREE.Clock();
const SAVED_STATE_KEY = 'syntrometrySimulationState_v2_3_1';

// Timestamps for Input Feedback
let lastIntegrationInputTime = -1;
let lastReflexivityInputTime = -1;
let lastChatImpactTime = -1;
const inputFeedbackDuration = 0.5;

// --- NEW: Chart.js Instance ---
let metricsChart = null;
const MAX_CHART_POINTS = 150;

// --- NEW: Resize Handler for Concept Graph Visualization ---
function resizeConceptGraphRenderer() {
    if (!conceptInitialized || !conceptRenderer || !conceptLabelRenderer || !conceptCamera) {
        return;
    }

    const container = document.getElementById('concept-panel');
    if (!container) {
        console.error('Concept panel container not found');
        return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Update Three.js renderer
    conceptRenderer.setSize(width, height);
    conceptRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Update CSS2DRenderer
    conceptLabelRenderer.setSize(width, height);

    // Update camera aspect ratio
    conceptCamera.aspect = width / height;
    conceptCamera.updateProjectionMatrix();
}

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

function updateHeatmap(stateVector, targetElementId) {
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
    const cellSize = Math.max(2, Math.floor(Math.min(heatmapContainer.clientWidth, heatmapContainer.clientHeight) / gridDim) - 1);

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
            g = 30;
            b = 30;
        } else if (value < -0.01) {
            r = 30;
            g = 30 + Math.round(50 * intensity);
            b = 30 + Math.round(200 * intensity);
        }
        r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);

        const color = `rgb(${r}, ${g}, ${b})`;
        const tooltip = `Idx ${i}: ${value.toFixed(4)}`;
        htmlContent += `<div class="heatmap-cell" style="background-color: ${color};" title="${tooltip}"></div>`;
    }

    const totalCells = gridDim * gridDim;
    for (let i = vectorLength; i < totalCells; i++) {
        htmlContent += `<div class="heatmap-cell filler"></div>`;
    }

    heatmapContainer.innerHTML = htmlContent;
}

function updateMetricsChart() {
    if (!metricsChart || criticalError || agent === null) return;

    const now = Date.now();

    try {
        metricsChart.data.datasets[0].data.push({ x: now, y: currentRIHScore });
        metricsChart.data.datasets[1].data.push({ x: now, y: currentAvgAffinity });
        metricsChart.data.datasets[2].data.push({ x: now, y: currentTrustScore });
        metricsChart.data.datasets[3].data.push({ x: now, y: currentBeliefNorm });
        metricsChart.data.datasets[4].data.push({ x: now, y: currentSelfStateNorm });

        metricsChart.update('quiet');
    } catch (e) {
        console.error("Error updating metrics chart:", e);
    }
}

function updateDashboardDisplay() {
    const updateElement = (id, value, text = null, progress = false, range = [0, 1], invert = false) => {
        const element = document.getElementById(id);
        if (element) {
            const displayValue = text !== null ? text : value.toFixed(3);
            if (element.tagName === 'PROGRESS') {
                const [min, max] = range;
                const scaledValue = ((value - min) / (max - min)) * 100;
                element.value = invert ? 100 - scaledValue : scaledValue;
            } else {
                element.textContent = displayValue;
            }
        }
    };

    updateElement('metric-rih-value', currentRIHScore * 100, `${(currentRIHScore * 100).toFixed(1)}%`);
    updateElement('metric-rih-progress', currentRIHScore, null, true);
    updateElement('metric-affinity-value', currentAvgAffinity, currentAvgAffinity.toFixed(2));
    updateElement('metric-affinity-progress', currentAvgAffinity, null, true, [-1, 1]);
    updateElement('metric-trust-value', currentTrustScore * 100, `${(currentTrustScore * 100).toFixed(1)}%`);
    updateElement('metric-trust-progress', currentTrustScore, null, true);
    updateElement('metric-belief-norm', currentBeliefNorm);
    updateElement('metric-self-norm', currentSelfStateNorm);
    updateElement('metric-context', 0, currentContext);
}

function updateEmotionBars(emotionsTensor) {
    const container = document.getElementById('emotion-intensities');
    if (!container || !emotionsTensor || emotionsTensor.isDisposed) {
        if (container) container.style.opacity = '0.5';
        return;
    }
    if (container) container.style.opacity = '1';

    try {
        const emotions = emotionsTensor.arraySync()[0];
        emotionNames.forEach((name, index) => {
            const barFill = container.querySelector(`.${name.toLowerCase()} .bar-fill`);
            if (barFill && emotions.length > index) {
                const intensity = clamp(emotions[index] * 100, 0, 100);
                barFill.style.width = `${intensity}%`;
            }
        });
    } catch (e) {
        console.error("Error updating emotion bars:", e);
    }
}

function updateCascadeViewer() {
    const contentDiv = document.getElementById('cascade-viewer-content');
    if (!contentDiv) return;

    if (!currentCascadeHistory || currentCascadeHistory.length === 0) {
        contentDiv.innerHTML = '<span class="cascade-placeholder">No cascade data.</span>';
        return;
    }

    const containerBaseHeight = 35;
    const maxBarHeight = containerBaseHeight - 4;

    let html = '';
    currentCascadeHistory.forEach((levelArray, index) => {
        html += `<div class="cv-level">`;
        html += `<div class="cv-level-title">Level ${index} (${levelArray.length} syndromes)</div>`;
        html += `<div class="cv-syndrome-container" style="height: ${containerBaseHeight}px;">`;

        if (levelArray.length > 0) {
            levelArray.forEach((value, sIndex) => {
                const absValue = Math.abs(value);
                const colorIntensity = clamp(absValue * 1.2, 0, 1);
                const barHeightPx = clamp(absValue * maxBarHeight * 1.5, 2, maxBarHeight);

                let r = 50, g = 50, b = 50;
                if (value > 0.01) {
                    r = 50 + Math.round(180 * colorIntensity);
                    g = 50 + Math.round(30 * colorIntensity);
                    b = 50;
                } else if (value < -0.01) {
                    r = 50;
                    g = 50 + Math.round(80 * colorIntensity);
                    b = 50 + Math.round(180 * colorIntensity);
                }
                r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
                const color = `rgb(${r},${g},${b})`;

                html += `<div class="cv-syndrome-bar" style="background-color: ${color}; height: ${barHeightPx}px;" title="Lvl ${index}, Idx ${sIndex}: ${value.toFixed(4)}"></div>`;
            });
        } else {
            html += '<span class="cascade-placeholder">[Empty Level]</span>';
        }
        html += `</div></div>`;
    });
    contentDiv.innerHTML = html;
}

// --- Initialization ---
async function initialize() {
    console.log("Initializing application (Agent V2.3)...");
    const coreInitSuccess = initAgentAndEnvironment();
    const threeSuccess = initThreeJS();
    const conceptSuccess = initConceptVisualization(appClock);
    const live2dSuccess = await initLive2D();

    if (!coreInitSuccess) {
        criticalError = true;
        displayError("Core simulation components failed to initialize. Check console for TF/Agent errors.", true, 'error-message');
    }
    if (!threeSuccess) displayError("Syntrometry visualization failed to initialize.", false, 'syntrometry-error-message');
    if (!conceptSuccess) displayError("Concept Graph visualization failed to initialize.", false, 'concept-error-message');
    if (!live2dSuccess) displayError("Live2D avatar failed to initialize.", false, 'error-message');

    initMetricsChart();

    let initialStateLoaded = false;
    if (coreInitSuccess) {
        initialStateLoaded = loadState(false);
    }

    if (!initialStateLoaded && coreInitSuccess && agent && environment) {
        const initialState = environment.reset();
        const initialStateArray = initialState.state ? initialState.state.arraySync()[0] : zeros([Config.Agent.BASE_STATE_DIM]);
        currentStateVector = initialStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
        while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);

        const initialGraphFeatures = calculateGraphFeatures();
        const initialAgentResponse = await agent.process(
            currentStateVector,
            initialGraphFeatures,
            { eventType: null, reward: 0 }
        );

        if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
        currentAgentEmotions = initialAgentResponse.emotions;
        currentRIHScore = initialAgentResponse.rihScore;
        currentAvgAffinity = (initialAgentResponse.affinities?.length > 0) ? initialAgentResponse.affinities.reduce((a, b) => a + b, 0) / initialAgentResponse.affinities.length : 0;
        currentHmLabel = initialAgentResponse.hmLabel;
        currentContext = "Simulation initialized (V2.3).";
        currentCascadeHistory = initialAgentResponse.cascadeHistory;
        currentIntegrationParam = initialAgentResponse.integration;
        currentReflexivityParam = initialAgentResponse.reflexivity;
        currentTrustScore = initialAgentResponse.trustScore;
        currentBeliefNorm = initialAgentResponse.beliefNorm ?? 0.0;
        currentSelfStateNorm = initialAgentResponse.selfStateNorm ?? 0.0;

        console.log("Initialized V2.3 with new state.");
    } else if (!coreInitSuccess) {
        currentStateVector = zeros([Config.Agent.BASE_STATE_DIM]);
        if (typeof tf !== 'undefined') {
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
            currentAgentEmotions = tf.keep(tensor(zeros([1, Config.Agent.EMOTION_DIM]), [1, Config.Agent.EMOTION_DIM]));
        } else {
            currentAgentEmotions = null;
        }
        currentRIHScore = 0;
        currentAvgAffinity = 0;
        currentHmLabel = "idle";
        currentContext = "Simulation core failed to load.";
        currentCascadeHistory = [];
        currentIntegrationParam = 0.5;
        currentReflexivityParam = 0.5;
        currentTrustScore = 1.0;
        currentBeliefNorm = 0.0;
        currentSelfStateNorm = 0.0;
    }

    updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);

    if (threeInitialized) {
        updateThreeJS(0, currentStateVector, currentRIHScore, agent?.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext);
        updateSyntrometryInfoPanel();
    }
    if (conceptInitialized) {
        try {
            let initialEmotionsForViz = null;
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) {
                initialEmotionsForViz = currentAgentEmotions;
            } else if (typeof tf !== 'undefined') {
                initialEmotionsForViz = tf.zeros([1, Config.Agent.EMOTION_DIM]);
            }
            if (initialEmotionsForViz) {
                updateAgentSimulationVisuals(initialEmotionsForViz, currentRIHScore, currentAvgAffinity, currentHmLabel, currentTrustScore);
                if (initialEmotionsForViz !== currentAgentEmotions && typeof tf !== 'undefined' && !initialEmotionsForViz.isDisposed) tf.dispose(initialEmotionsForViz);
            }
        } catch (e) {
            console.error("Error initial concept viz update:", e);
        }
        animateConceptNodes(0, currentIntegrationParam, currentReflexivityParam, -1, -1, -1);
    }
    if (live2dInitialized) {
        try {
            let initialEmotionsForLive2D = null;
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) {
                initialEmotionsForLive2D = currentAgentEmotions;
            } else if (typeof tf !== 'undefined') {
                initialEmotionsForLive2D = tf.zeros([1, Config.Agent.EMOTION_DIM]);
            }
            if (initialEmotionsForLive2D) {
                updateLive2DEmotions(initialEmotionsForLive2D);
                if (initialEmotionsForLive2D !== currentAgentEmotions && typeof tf !== 'undefined' && !initialEmotionsForLive2D.isDisposed) tf.dispose(initialEmotionsForLive2D);
            }
        } catch (e) {
            console.error("Error initial Live2D update:", e);
        }
        updateLive2DHeadMovement(currentHmLabel, 0);
    }

    updateDashboardDisplay();
    updateEmotionBars(currentAgentEmotions);
    updateCascadeViewer();
    logToTimeline("System Initialized", 'expressions-list');

    if (agent?.selfState && !agent.selfState.isDisposed) {
        try {
            updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
        } catch (e) {
            console.error("Initial heatmap update failed:", e);
        }
    } else {
        updateHeatmap([], 'heatmap-content');
    }

    setupControls();
    setupChat();
    setupInspectorToggle();

    // Add resize event listener for Concept Graph Visualization
    window.addEventListener('resize', resizeConceptGraphRenderer);
    // Initial resize to ensure correct size on load
    resizeConceptGraphRenderer();

    console.log("Initialization complete (V2.3). Starting animation loop.");
    animate();
}

function initAgentAndEnvironment() {
    if (typeof tf === 'undefined') {
        console.error("TensorFlow.js is required for Agent/Environment.");
        criticalError = true;
        agent = null;
        environment = null;
        return false;
    }
    try {
        console.log("Attempting to create SyntrometricAgent...");
        agent = new SyntrometricAgent();
        console.log("SyntrometricAgent instance created (or constructor finished). Agent object:", agent);

        environment = new EmotionalSpace();

        if (!agent || !agent.optimizer || !agent.beliefNetwork) {
            console.error("Validation Failed *after* agent constructor finished.", {
                agentExists: !!agent,
                optimizerExists: !!agent?.optimizer,
                beliefNetExists: !!agent?.beliefNetwork
            });
            throw new Error("Agent core components failed validation immediately after initialization.");
        }

        console.log("Agent (V2.3) and Environment validation passed.");
        return true;
    } catch (e) {
        console.error('[Init] Agent/Env error:', e);
        displayError(`Error initializing Agent/Environment: ${e.message}. Simulation logic disabled.`, true, 'error-message');
        criticalError = true;
        if (agent && typeof agent.cleanup === 'function') {
            agent.cleanup();
        }
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
        metricsChart.destroy();
    }

    const computedStyle = getComputedStyle(document.documentElement);
    const chartGridColor = computedStyle.getPropertyValue('--chart-grid-color').trim();
    const chartTickColor = 'rgba(238, 238, 238, 0.7)';
    const chartLegendLabelColor = 'rgba(238, 238, 238, 0.8)';
    const chartTooltipBg = computedStyle.getPropertyValue('--chart-tooltip-bg').trim();
    const chartAccentColor = computedStyle.getPropertyValue('--accent-color').trim();
    const chartTextColor = computedStyle.getPropertyValue('--text-color').trim();
    const colorRIHBorder = 'rgb(102, 255, 102)';
    const colorAffinityBorder = 'rgb(255, 170, 102)';
    const colorTrustBorder = 'rgb(102, 170, 255)';
    const colorBeliefNormBorder = 'rgb(255, 255, 102)';
    const colorSelfNormBorder = 'rgb(200, 150, 255)';

    metricsChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'RIH',
                    data: [],
                    borderColor: colorRIHBorder,
                    backgroundColor: colorRIHBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'),
                    borderWidth: 1.5,
                    pointRadius: 0,
                    yAxisID: 'yPercentage',
                    tension: 0.1
                },
                {
                    label: 'Affinity',
                    data: [],
                    borderColor: colorAffinityBorder,
                    backgroundColor: colorAffinityBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'),
                    borderWidth: 1.5,
                    pointRadius: 0,
                    yAxisID: 'yBipolar',
                    tension: 0.1
                },
                {
                    label: 'Trust',
                    data: [],
                    borderColor: colorTrustBorder,
                    backgroundColor: colorTrustBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'),
                    borderWidth: 1.5,
                    pointRadius: 0,
                    yAxisID: 'yPercentage',
                    tension: 0.1
                },
                {
                    label: 'Belief Norm',
                    data: [],
                    borderColor: colorBeliefNormBorder,
                    backgroundColor: colorBeliefNormBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'),
                    borderWidth: 1,
                    pointRadius: 0,
                    yAxisID: 'yNorm',
                    tension: 0.1,
                    hidden: true
                },
                {
                    label: 'Self Norm',
                    data: [],
                    borderColor: colorSelfNormBorder,
                    backgroundColor: colorSelfNormBorder.replace('rgb(', 'rgba(').replace(')', ', 0.1)'),
                    borderWidth: 1,
                    pointRadius: 0,
                    yAxisID: 'yNorm',
                    tension: 0.1,
                    hidden: true
                }
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
                        ttl: 60000,
                        delay: 500,
                        pause: false
                    },
                    ticks: { display: false },
                    grid: {
                        color: chartGridColor
                    }
                },
                yPercentage: {
                    beginAtZero: true,
                    max: 1.0,
                    position: 'left',
                    ticks: {
                        color: chartTickColor,
                        font: { size: 10 },
                        stepSize: 0.25,
                        callback: value => (value * 100).toFixed(0) + '%'
                    },
                    grid: {
                        color: chartGridColor
                    }
                },
                yBipolar: {
                    min: -1.0,
                    max: 1.0,
                    position: 'right',
                    ticks: {
                        color: chartTickColor,
                        font: { size: 10 },
                        stepSize: 0.5
                    },
                    grid: {
                        display: false
                    }
                },
                yNorm: {
                    beginAtZero: true,
                    position: 'right',
                    display: false,
                    ticks: {
                        color: chartTickColor,
                        font: { size: 10 }
                    },
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: chartLegendLabelColor,
                        font: { size: 10 },
                        boxWidth: 12,
                        padding: 10
                    }
                },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    backgroundColor: chartTooltipBg,
                    titleColor: chartAccentColor,
                    bodyColor: chartTextColor,
                    boxPadding: 5,
                    callbacks: {
                        title: function(tooltipItems) {
                            const timestamp = tooltipItems[0]?.parsed?.x;
                            return timestamp ? new Date(timestamp).toLocaleTimeString() : '';
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                if (context.dataset.yAxisID === 'yPercentage') {
                                    label += (context.parsed.y * 100).toFixed(1) + '%';
                                } else {
                                    label += context.parsed.y.toFixed(3);
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
    console.log("Metrics chart initialized.");
}

function updateSliderDisplays(integration, reflexivity) {
    const integrationValue = document.getElementById('integration-value');
    const reflexivityValue = document.getElementById('reflexivity-value');
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');

    if (integrationValue) integrationValue.textContent = integration?.toFixed(2) ?? 'N/A';
    if (reflexivityValue) reflexivityValue.textContent = reflexivity?.toFixed(2) ?? 'N/A';
    if (integrationSlider && typeof integration === 'number' && !integrationSlider.matches(':active')) integrationSlider.value = integration;
    if (reflexivitySlider && typeof reflexivity === 'number' && !reflexivitySlider.matches(':active')) reflexivitySlider.value = reflexivity;
}

function setupControls() {
    const integrationSlider = document.getElementById('integration-slider');
    const reflexivitySlider = document.getElementById('reflexivity-slider');
    const integrationValue = document.getElementById('integration-value');
    const reflexivityValue = document.getElementById('reflexivity-value');
    const saveButton = document.getElementById('save-state-button');
    const loadButton = document.getElementById('load-state-button');

    if (integrationSlider && integrationValue) {
        integrationSlider.addEventListener('input', () => {
            integrationValue.textContent = parseFloat(integrationSlider.value).toFixed(2);
            lastIntegrationInputTime = appClock.getElapsedTime();
        });
        integrationSlider.removeAttribute('disabled');
        integrationSlider.classList.remove('read-only-slider');
    }
    if (reflexivitySlider && reflexivityValue) {
        reflexivitySlider.addEventListener('input', () => {
            reflexivityValue.textContent = parseFloat(reflexivitySlider.value).toFixed(2);
            lastReflexivityInputTime = appClock.getElapsedTime();
        });
        reflexivitySlider.removeAttribute('disabled');
        reflexivitySlider.classList.remove('read-only-slider');
    }

    if (saveButton) saveButton.addEventListener('click', saveState);
    if (loadButton) {
        loadButton.addEventListener('click', () => loadState(true));
        if (localStorage.getItem(SAVED_STATE_KEY)) {
            loadButton.classList.add('has-saved-state');
        }
    }
    if (criticalError) {
        if (saveButton) saveButton.disabled = true;
        if (loadButton) loadButton.disabled = true;
    }
}

function setupChat() {
    const chatInput = document.getElementById('chat-input');
    const chatOutput = document.getElementById('chat-output');
    if (!chatInput || !chatOutput) {
        console.warn("Chat elements not found.");
        return;
    }
    if (criticalError) {
        chatInput.disabled = true;
        chatInput.placeholder = "Simulation disabled.";
        return;
    }

    chatInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && chatInput.value.trim()) {
            const userInput = chatInput.value.trim();
            appendChatMessage('You', userInput);
            chatInput.value = '';
            if (environment && agent) {
                const impactTensor = environment.getEmotionalImpactFromText(userInput);
                tf.dispose(impactTensor);
                lastChatImpactTime = appClock.getElapsedTime();
                appendChatMessage('System', 'Input processed, influencing environment.');
                logToTimeline(`Chat: "${userInput.substring(0, 20)}..."`, 'expressions-list');
            } else {
                appendChatMessage('System', 'Environment/Agent not initialized.');
            }
        }
    });
}

function setupInspectorToggle() {
    const toggleButton = document.getElementById('toggle-inspector');
    const inspectorPanel = document.getElementById('tensor-inspector-panel');
    if (toggleButton && inspectorPanel) {
        toggleButton.addEventListener('click', () => {
            inspectorPanel.classList.toggle('visible');
        });
    }
}

function saveState() {
    if (!agent || !environment || criticalError) {
        console.warn("Agent/Env not ready or critical error, cannot save.");
        appendChatMessage('System', 'Save failed: Simulation not ready or error detected.');
        return;
    }
    try {
        const envState = environment.getState();
        const agentState = agent.getState();
        const stateToSave = {
            version: "2.3.1",
            environment: envState,
            agent: agentState,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(SAVED_STATE_KEY, JSON.stringify(stateToSave));
        console.log(`Simulation state saved to localStorage (Key: ${SAVED_STATE_KEY}).`);
        appendChatMessage('System', 'Simulation state saved.');
        logToTimeline('State Saved', 'expressions-list');
        document.getElementById('load-state-button')?.classList.add('has-saved-state');
    } catch (e) {
        console.error("Error saving state:", e);
        appendChatMessage('System', `Save failed: ${e.message}`);
        displayError(`Error saving state: ${e.message}`, false, 'error-message');
    }
}

function loadState(showMessages = false) {
    if (!agent || !environment || criticalError) {
        console.warn("Agent/Env not ready or critical error, cannot load.");
        if (showMessages) appendChatMessage('System', 'Load failed: Simulation not ready or error detected.');
        return false;
    }
    try {
        const stateString = localStorage.getItem(SAVED_STATE_KEY);
        if (!stateString) {
            console.log("No saved state found in localStorage.");
            if (showMessages) appendChatMessage('System', 'No saved state found.');
            return false;
        }

        const stateToLoad = JSON.parse(stateString);
        if (!stateToLoad || !stateToLoad.environment || !stateToLoad.agent || stateToLoad.version !== "2.3.1") {
            console.error("Invalid or incompatible saved state format.", stateToLoad?.version);
            if (showMessages) appendChatMessage('System', `Load failed: Invalid state format (Version: ${stateToLoad?.version}, Expected: 2.3.1).`);
            displayError(`Load failed: Invalid state format (Version: ${stateToLoad?.version}).`, false, 'error-message');
            return false;
        }

        criticalError = true;
        environment.loadState(stateToLoad.environment);
        agent.loadState(stateToLoad.agent);

        currentStateVector = Array.isArray(stateToLoad.environment.currentStateVector)
            ? stateToLoad.environment.currentStateVector.slice(0, Config.Agent.BASE_STATE_DIM)
            : zeros([Config.Agent.BASE_STATE_DIM]);
        while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);

        if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
        if (agent.prevEmotions && !agent.prevEmotions.isDisposed) {
            currentAgentEmotions = tf.keep(agent.prevEmotions.clone());
        } else {
            console.warn("Agent prevEmotions tensor invalid after load. Resetting.");
            currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
        }

        currentRIHScore = agent.lastRIH ?? 0;
        currentTrustScore = agent.latestTrustScore ?? 1.0;
        currentContext = "State loaded.";
        currentHmLabel = "idle";
        currentAvgAffinity = 0;
        currentCascadeHistory = [];
        currentIntegrationParam = agent.integrationParam?.dataSync()[0] ?? 0.5;
        currentReflexivityParam = agent.reflexivityParam?.dataSync()[0] ?? 0.5;
        currentBeliefNorm = 0.0;
        if (agent.selfState && !agent.selfState.isDisposed) {
            try {
                currentSelfStateNorm = calculateArrayNorm(Array.from(agent.selfState.dataSync()));
            } catch (e) {
                currentSelfStateNorm = 0.0;
            }
        } else {
            currentSelfStateNorm = 0.0;
        }

        if (metricsChart) {
            metricsChart.data.datasets.forEach(dataset => dataset.data = []);
            metricsChart.update();
        }

        const timelineList = document.getElementById('expressions-list');
        if (timelineList) timelineList.innerHTML = '';

        updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);
        updateDashboardDisplay();
        updateEmotionBars(currentAgentEmotions);
        updateCascadeViewer();
        if (agent.selfState && !agent.selfState.isDisposed) {
            updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
        } else {
            updateHeatmap([], 'heatmap-content');
        }

        console.log(`Simulation state loaded (Key: ${SAVED_STATE_KEY}).`);
        if (showMessages) appendChatMessage('System', 'Simulation state loaded.');
        logToTimeline('State Loaded', 'expressions-list');

        if (threeInitialized) {
            updateThreeJS(0, currentStateVector, currentRIHScore, [], currentIntegrationParam, currentReflexivityParam, [], currentContext);
            updateSyntrometryInfoPanel();
        }
        if (conceptInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
            updateAgentSimulationVisuals(currentAgentEmotions, currentRIHScore, 0, currentHmLabel, currentTrustScore);
            animateConceptNodes(0, currentIntegrationParam, currentReflexivityParam, -1, -1, -1);
        }
        if (live2dInitialized && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
            updateLive2DEmotions(currentAgentEmotions);
            updateLive2DHeadMovement(currentHmLabel, 0);
        }

        criticalError = false;
        if (!criticalError) animate();

        return true;
    } catch (e) {
        console.error("Error loading state:", e);
        if (showMessages) appendChatMessage('System', `Load failed: ${e.message}`);
        displayError(`Load failed: ${e.message}`, false, 'error-message');
        criticalError = false;
        return false;
    }
}

async function animate() {
    if (criticalError) {
        return;
    }
    requestAnimationFrame(animate);

    const deltaTime = appClock.getDelta();
    const elapsedTime = appClock.getElapsedTime();

    const graphFeatures = calculateGraphFeatures();

    let agentResponse = null;
    if (agent && environment && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
        try {
            const envStep = await environment.step(currentAgentEmotions, currentRIHScore, currentAvgAffinity);
            const envStateArray = envStep.state?.arraySync()[0] || zeros([Config.Agent.BASE_STATE_DIM]);
            currentStateVector = envStateArray.slice(0, Config.Agent.BASE_STATE_DIM);
            while (currentStateVector.length < Config.Agent.BASE_STATE_DIM) currentStateVector.push(0);

            agentResponse = await agent.process(
                currentStateVector,
                graphFeatures,
                { eventType: envStep.eventType, reward: envStep.reward }
            );

            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
            currentAgentEmotions = agentResponse.emotions;
            currentRIHScore = agentResponse.rihScore;
            currentAvgAffinity = (agentResponse.affinities?.length > 0) ? agentResponse.affinities.reduce((a, b) => a + b, 0) / agentResponse.affinities.length : 0;
            currentHmLabel = agentResponse.hmLabel;
            currentContext = envStep.context;
            currentCascadeHistory = agentResponse.cascadeHistory;
            currentIntegrationParam = agentResponse.integration;
            currentReflexivityParam = agentResponse.reflexivity;
            currentTrustScore = agentResponse.trustScore;
            currentBeliefNorm = agentResponse.beliefNorm ?? 0.0;
            currentSelfStateNorm = agentResponse.selfStateNorm ?? 0.0;

            updateSliderDisplays(currentIntegrationParam, currentReflexivityParam);
        } catch (e) {
            console.error("Error during simulation step:", e);
            displayError(`Simulation Error: ${e.message}. Attempting to continue.`, false, 'error-message');
            if (!currentAgentEmotions || currentAgentEmotions?.isDisposed) {
                if (typeof tf !== 'undefined') {
                    currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
                } else {
                    currentAgentEmotions = null;
                }
            }
        }
    } else {
        if (!currentAgentEmotions || currentAgentEmotions?.isDisposed) {
            if (typeof tf !== 'undefined') {
                if (currentAgentEmotions && !currentAgentEmotions.isDisposed) tf.dispose(currentAgentEmotions);
                currentAgentEmotions = tf.keep(tf.zeros([1, Config.Agent.EMOTION_DIM]));
            } else {
                currentAgentEmotions = null;
            }
        }
        currentBeliefNorm = 0.0;
        currentSelfStateNorm = 0.0;
    }

    updateDashboardDisplay();
    updateMetricsChart();
    updateEmotionBars(currentAgentEmotions);
    updateCascadeViewer();

    if (agentResponse && agentResponse.hmLabel !== currentHmLabel && agentResponse.hmLabel !== 'idle') {
        // logToTimeline(`Action: ${agentResponse.hmLabel}`, 'expressions-list');
        // currentHmLabel = agentResponse.hmLabel;
    }

    try {
        if (threeInitialized) {
            updateThreeJS(deltaTime, currentStateVector, currentRIHScore, agent?.latestAffinities || [], currentIntegrationParam, currentReflexivityParam, currentCascadeHistory, currentContext);
            updateSyntrometryInfoPanel();
        }
    } catch (e) {
        console.error("Error updating Syntrometry Viz:", e);
    }

    try {
        if (conceptInitialized) {
            let emotionsForViz = null;
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) emotionsForViz = currentAgentEmotions;
            else if (typeof tf !== 'undefined') emotionsForViz = tf.zeros([1, Config.Agent.EMOTION_DIM]);

            if (emotionsForViz) {
                updateAgentSimulationVisuals(emotionsForViz, currentRIHScore, currentAvgAffinity, currentHmLabel, currentTrustScore);
                if (emotionsForViz !== currentAgentEmotions && typeof tf !== 'undefined' && !emotionsForViz.isDisposed) tf.dispose(emotionsForViz);
            }
        }
    } catch (e) {
        console.error("Error updating Concept Viz placeholders:", e);
    }

    try {
        if (live2dInitialized) {
            let emotionsForLive2D = null;
            if (currentAgentEmotions && !currentAgentEmotions.isDisposed) emotionsForLive2D = currentAgentEmotions;
            else if (typeof tf !== 'undefined') emotionsForLive2D = tf.zeros([1, Config.Agent.EMOTION_DIM]);

            if (emotionsForLive2D) {
                updateLive2DEmotions(emotionsForLive2D);
                if (emotionsForLive2D !== currentAgentEmotions && typeof tf !== 'undefined' && !emotionsForLive2D.isDisposed) tf.dispose(emotionsForLive2D);
            }
            updateLive2DHeadMovement(currentHmLabel, deltaTime);
        }
    } catch (e) {
        console.error("Error updating Live2D:", e);
    }

    if (agent && agent.selfState && !agent.selfState.isDisposed) {
        try {
            updateHeatmap(Array.from(agent.selfState.dataSync()), 'heatmap-content');
        } catch (e) {
            console.error("Heatmap update failed:", e);
        }
    } else {
        updateHeatmap([], 'heatmap-content');
    }

    try {
        if (conceptInitialized && conceptControls) conceptControls.update();
        if (conceptInitialized) {
            animateConceptNodes(deltaTime, currentIntegrationParam, currentReflexivityParam, elapsedTime - lastIntegrationInputTime < inputFeedbackDuration ? lastIntegrationInputTime : -1, elapsedTime - lastReflexivityInputTime < inputFeedbackDuration ? lastReflexivityInputTime : -1, elapsedTime - lastChatImpactTime < inputFeedbackDuration ? lastChatImpactTime : -1);
        }
    } catch (e) {
        console.error("Error animating Concept Viz nodes:", e);
    }

    if (conceptInitialized && conceptRenderer && conceptLabelRenderer && conceptScene && conceptCamera) {
        try {
            conceptRenderer.render(conceptScene, conceptCamera);
            conceptLabelRenderer.render(conceptScene, conceptCamera);
        } catch (e) {
            console.error("Error rendering Concept Graph:", e);
        }
    }
}

function cleanup() {
    console.log("Cleaning up application resources (V2.3)...");
    criticalError = true;

    // Remove resize event listener
    window.removeEventListener('resize', resizeConceptGraphRenderer);

    if (metricsChart) {
        try {
            metricsChart.destroy();
            metricsChart = null;
        } catch (e) {
            console.error("Chart destroy error:", e);
        }
    }

    try {
        if (environment?.cleanup) environment.cleanup();
    } catch (e) {
        console.error("Env cleanup error:", e);
    }
    try {
        if (agent?.cleanup) agent.cleanup();
    } catch (e) {
        console.error("Agent cleanup error:", e);
    }
    try {
        if (cleanupThreeJS) cleanupThreeJS();
    } catch (e) {
        console.error("ThreeJS cleanup error:", e);
    }
    try {
        if (cleanupConceptVisualization) cleanupConceptVisualization();
    } catch (e) {
        console.error("ConceptViz cleanup error:", e);
    }
    try {
        if (cleanupLive2D) cleanupLive2D();
    } catch (e) {
        console.error("Live2D cleanup error:", e);
    }

    environment = null;
    agent = null;
    if (typeof tf !== 'undefined' && currentAgentEmotions && !currentAgentEmotions.isDisposed) {
        try {
            tf.dispose(currentAgentEmotions);
        } catch (e) {
            console.error("Error disposing global emotions tensor:", e);
        }
    }
    currentAgentEmotions = null;
    console.log("Cleanup complete.");
}

window.addEventListener('load', initialize);
window.addEventListener('beforeunload', cleanup);
