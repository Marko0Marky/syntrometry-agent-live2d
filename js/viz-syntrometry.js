// js/viz-syntrometry.js

import { Config } from './config.js';
import { clamp, displayError, zeros, lerp, debounce } from './utils.js';

// Assumes THREE, OrbitControls (optional here), CSS2DRenderer are available globally via CDN

export let scene = null;
export let camera = null;
export let renderer = null;
export let labelRenderer = null;
export let controls = null; // Added orbit controls support
let nodes = [];
let edgesData = [];
let edgesGroup = null;
export let rihNode = null;
export let threeInitialized = false;

// Container and UI references
let syntrometryContainer = null;
let syntrometryInfoPanel = null;
let hoveredDimension = null;
let selectedDimension = null;

// Cached state for performance
let latestStateVector = null;
let latestRihScore = 0;
let latestAffinities = [];
let latestCascadeHistory = [];
let latestContext = "Initializing...";
let latestIntegrationParam = 0.5;
let latestReflexivityParam = 0.5;

// Visual constants
const VISUAL_CONFIG = {
    NODE_BASE_SCALE: 0.08,
    RIH_SCALE_MULTIPLIER: 1.5,
    CIRCLE_RADIUS: 1.5,
    LERP_SPEED: 8,
    MAX_LERP_FACTOR: 0.2,
    MIN_LERP_FACTOR: 0.01,
    EDGE_BASE_OPACITY: 0.5,
    LABEL_OFFSET_MULTIPLIER: 1.5
};

// Color constants
const COLORS = {
    SCENE_BACKGROUND: 0x1a1a1a,
    FOG_COLOR: 0x1a1a1a,
    AMBIENT_LIGHT: 0x606080,
    DIR_LIGHT_1: 0xffffff,
    DIR_LIGHT_2: 0x88aaff,
    NODE_DEFAULT: 0x888888,
    NODE_EMISSIVE: 0x111111,
    NODE_SPECULAR: 0x555555,
    RIH_DEFAULT: 0xff4444,
    RIH_EMISSIVE: 0x331111,
    RIH_SPECULAR: 0x888888,
    EDGE_DEFAULT: 0x888888,
    HIGHLIGHT: 0xffffff,
    LINKED: 0xaaaaee,
    EDGE_HIGHLIGHT: 0x00aaff
};

// Reusable objects to reduce garbage collection
const tempVector3 = new THREE.Vector3();
const tempColor = new THREE.Color();
const tempColor2 = new THREE.Color();

// Materials pool for better memory management
let sharedGeometries = {
    nodeGeometry: null,
    rihGeometry: null,
    edgeGeometry: null
};

let materialPool = {
    baseMaterials: new Map(),
    edgeMaterials: []
};

// Performance monitoring
let frameCount = 0;
let lastFPSUpdate = 0;
let currentFPS = 0;

// Create debounced version of onWindowResize
const debouncedOnWindowResize = debounce(onWindowResize, 250);

/**
 * Initializes shared geometries to reduce memory usage
 */
function initSharedGeometries() {
    sharedGeometries.nodeGeometry = new THREE.SphereGeometry(VISUAL_CONFIG.NODE_BASE_SCALE, 16, 12);
    sharedGeometries.rihGeometry = new THREE.SphereGeometry(
        VISUAL_CONFIG.NODE_BASE_SCALE * VISUAL_CONFIG.RIH_SCALE_MULTIPLIER, 
        20, 
        16
    );
    const edgePositionsArray = new Float32Array(6); // 2 vertices * 3 coordinates
    sharedGeometries.edgeGeometry = new THREE.BufferGeometry();
    sharedGeometries.edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositionsArray, 3));
}

/**
 * Creates a material with given parameters, reusing from pool when possible
 */
function createMaterial(type, color, emissive, specular, shininess = 30, opacity = 1.0) {
    const key = `${type}_${color}_${emissive}_${specular}_${shininess}_${opacity}`;
    if (materialPool.baseMaterials.has(key)) {
        return materialPool.baseMaterials.get(key).clone();
    }
    let material;
    if (type === 'phong') {
        material = new THREE.MeshPhongMaterial({
            color: color,
            emissive: emissive,
            specular: specular,
            shininess: shininess,
            transparent: opacity < 1.0,
            opacity: opacity
        });
    } else if (type === 'line') {
        material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity
        });
    }
    materialPool.baseMaterials.set(key, material);
    return material.clone();
}

/**
 * Disposes of shared geometries and material pools
 */
function disposeSharedResources() {
    Object.values(sharedGeometries).forEach(geometry => {
        if (geometry) geometry.dispose();
    });
    materialPool.baseMaterials.forEach(material => material.dispose());
    materialPool.baseMaterials.clear();
    materialPool.edgeMaterials.forEach(material => material.dispose());
    materialPool.edgeMaterials = [];
    sharedGeometries = { nodeGeometry: null, rihGeometry: null, edgeGeometry: null };
}

/**
 * Initializes the Three.js visualization for the Syntrometry panel.
 */
export function initThreeJS() {
    if (typeof THREE === 'undefined' || typeof THREE.CSS2DRenderer === 'undefined') {
        displayError("Three.js or CSS2DRenderer not loaded for Syntrometry panel.", false, 'error-message');
        threeInitialized = false;
        return false;
    }
    try {
        cleanupThreeJS();
        syntrometryContainer = document.getElementById('syntrometry-panel');
        syntrometryInfoPanel = document.getElementById('dashboard-panel');
        if (!syntrometryContainer) {
            displayError("Syntrometry panel container not found.", true, 'syntrometry-error-message');
            threeInitialized = false;
            return false;
        }
        if (!syntrometryInfoPanel) {
            console.warn("Dashboard panel (for info updates) not found.");
        }
        const width = syntrometryContainer.clientWidth;
        const height = syntrometryContainer.clientHeight;
        if (width <= 0 || height <= 0) {
            console.warn("Syntrometry panel has zero dimensions. Allowing init, rendering might start on resize.");
            return true;
        }
        initSharedGeometries();
        scene = new THREE.Scene();
        scene.background = new THREE.Color(COLORS.SCENE_BACKGROUND);
        scene.fog = new THREE.Fog(COLORS.FOG_COLOR, 4, 10);
        camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.set(0, 0, 3.5);
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = false;
        syntrometryContainer.appendChild(renderer.domElement);
        labelRenderer = new THREE.CSS2DRenderer();
        labelRenderer.setSize(width, height);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        labelRenderer.domElement.style.left = '0px';
        labelRenderer.domElement.style.pointerEvents = 'none';
        syntrometryContainer.appendChild(labelRenderer.domElement);
        if (typeof THREE.OrbitControls !== 'undefined') {
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.enableZoom = true;
            controls.enableRotate = true;
            controls.enablePan = true;
            controls.maxDistance = 10;
            controls.minDistance = 1;
        }
        setupLighting();
        createNodes();
        createRIHNode();
        createEdges();
        setupSyntrometryInteraction();
        window.addEventListener('resize', debouncedOnWindowResize, false);
        console.log('Syntrometry Three.js initialized successfully.');
        threeInitialized = true;
        return true;
    } catch (e) {
        displayError(`Error initializing Syntrometry Three.js: ${e.message}`, false, 'syntrometry-error-message');
        console.error("Syntrometry Three.js Init Error:", e);
        cleanupThreeJS();
        threeInitialized = false;
        return false;
    }
}

/**
 * Sets up optimized lighting for the scene
 */
function setupLighting() {
    const ambientLight = new THREE.AmbientLight(COLORS.AMBIENT_LIGHT, 0.6);
    scene.add(ambientLight);
    const dirLight1 = new THREE.DirectionalLight(COLORS.DIR_LIGHT_1, 0.8);
    dirLight1.position.set(1, 1, 1);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(COLORS.DIR_LIGHT_2, 0.4);
    dirLight2.position.set(-1, -0.5, -1);
    scene.add(dirLight2);
}

/**
 * Creates dimension nodes with optimized materials and geometries
 */
function createNodes() {
    nodes = [];
    const angleStep = (2 * Math.PI) / Config.DIMENSIONS;
    for (let i = 0; i < Config.DIMENSIONS; i++) {
        const material = createMaterial('phong', COLORS.NODE_DEFAULT, COLORS.NODE_EMISSIVE, COLORS.NODE_SPECULAR);
        const node = new THREE.Mesh(sharedGeometries.nodeGeometry, material);
        const x = Math.cos(i * angleStep) * VISUAL_CONFIG.CIRCLE_RADIUS;
        const y = Math.sin(i * angleStep) * VISUAL_CONFIG.CIRCLE_RADIUS;
        node.position.set(x, y, 0);
        node.userData = {
            originalColor: material.color.getHex(),
            originalEmissive: material.emissive.getHex(),
            originalPosition: new THREE.Vector3(x, y, 0),
            dimensionIndex: i,
            type: 'dimension'
        };
        scene.add(node);
        nodes.push(node);
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label';
        labelDiv.textContent = `D${i}`;
        labelDiv.style.cssText = `
            color: white;
            font-family: Arial, sans-serif;
            font-size: 12px;
            text-align: center;
            pointer-events: none;
            user-select: none;
        `;
        const label = new THREE.CSS2DObject(labelDiv);
        label.position.set(0, VISUAL_CONFIG.NODE_BASE_SCALE * VISUAL_CONFIG.LABEL_OFFSET_MULTIPLIER, 0);
        node.add(label);
        node.userData.label = label;
    }
}

/**
 * Creates the central RIH node
 */
function createRIHNode() {
    const rihMaterial = createMaterial('phong', COLORS.RIH_DEFAULT, COLORS.RIH_EMISSIVE, COLORS.RIH_SPECULAR, 50);
    rihNode = new THREE.Mesh(sharedGeometries.rihGeometry, rihMaterial);
    rihNode.position.set(0, 0, 0);
    rihNode.userData = {
        originalColor: rihMaterial.color.getHex(),
        originalEmissive: rihMaterial.emissive.getHex(),
        originalPosition: new THREE.Vector3(0, 0, 0),
        type: 'rih_node',
        label: null
    };
    scene.add(rihNode);
}

/**
 * Creates edges with optimized geometry sharing
 */
function createEdges() {
    edgesGroup = new THREE.Group();
    scene.add(edgesGroup);
    edgesData = [];
    for (let i = 0; i < Config.DIMENSIONS; i++) {
        for (let j = i + 1; j < Config.DIMENSIONS; j++) {
            const material = createMaterial('line', COLORS.EDGE_DEFAULT, 0, 0, 0, VISUAL_CONFIG.EDGE_BASE_OPACITY);
            const lineGeometry = sharedGeometries.edgeGeometry.clone();
            const line = new THREE.Line(lineGeometry, material);
            edgesGroup.add(line);
            edgesData.push({ line: line, nodeA_idx: i, nodeB_idx: j, type: 'dim-dim' });
            materialPool.edgeMaterials.push(material);
        }
    }
    for (let i = 0; i < Config.DIMENSIONS; i++) {
        const material = createMaterial('line', COLORS.EDGE_DEFAULT, 0, 0, 0, VISUAL_CONFIG.EDGE_BASE_OPACITY);
        const lineGeometry = sharedGeometries.edgeGeometry.clone();
        const line = new THREE.Line(lineGeometry, material);
        edgesGroup.add(line);
        edgesData.push({ line: line, nodeA_idx: i, nodeB_idx: -1, type: 'dim-rih' });
        materialPool.edgeMaterials.push(material);
    }
}

/**
 * Sets up raycasting and event listeners for interaction within the Syntrometry panel.
 */
function setupSyntrometryInteraction() {
    if (!syntrometryContainer || !camera) {
        console.warn("Cannot setup interaction: Syntrometry container or camera not ready.");
        return;
    }
    const getInteractableObjects = () => [...nodes, rihNode].filter(Boolean);

    syntrometryContainer.removeEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
    syntrometryContainer.removeEventListener('click', handleSyntrometryClickWrapper, false);

    syntrometryContainer.addEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
    syntrometryContainer.addEventListener('click', handleSyntrometryClickWrapper, false);

    updateSyntrometryInfoPanel();
}

// Reusable raycaster and mouse vector to reduce garbage collection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/**
 * Handles mouse movement over the Syntrometry canvas for hover effects.
 */
function onSyntrometryMouseMove(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects || interactableObjects.length === 0) return;
    const rect = syntrometryContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, false);
    let newHoveredObject = null;
    if (intersects.length > 0 && intersects[0].object?.userData) {
        newHoveredObject = intersects[0].object;
    }
    if (!selectedDimension) {
        if (newHoveredObject !== hoveredDimension) {
            hoveredDimension = newHoveredObject;
            updateSyntrometryInfoPanel();
        }
    } else {
        if (hoveredDimension && hoveredDimension !== selectedDimension) {
            hoveredDimension = null;
            updateSyntrometryInfoPanel();
        } else if (newHoveredObject === selectedDimension && hoveredDimension !== selectedDimension) {
            hoveredDimension = newHoveredObject;
            updateSyntrometryInfoPanel();
        }
    }
    syntrometryContainer.style.cursor = (selectedDimension || hoveredDimension) ? 'pointer' : 'default';
}

/**
 * Handles mouse clicks on the Syntrometry canvas for selection.
 */
function onSyntrometryClick(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects || interactableObjects.length === 0) return;
    const rect = syntrometryContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, false);
    let clickedObject = null;
    if (intersects.length > 0 && intersects[0].object?.userData) {
        clickedObject = intersects[0].object;
    }
    if (clickedObject) {
        if (selectedDimension === clickedObject) {
            selectedDimension = null;
            hoveredDimension = clickedObject;
        } else {
            selectedDimension = clickedObject;
            hoveredDimension = null;
        }
    } else {
        selectedDimension = null;
    }
    syntrometryContainer.style.cursor = (selectedDimension || hoveredDimension) ? 'pointer' : 'default';
    updateSyntrometryInfoPanel();
}

/**
 * Updates the Syntrometry info panel with current focus information.
 */
export function updateSyntrometryInfoPanel() {
    let displayObject = selectedDimension || hoveredDimension;
    let infoText = "Syntrometry: No focus.";
    if (displayObject?.userData) {
        const data = displayObject.userData;
        if (data.type === 'rih_node') {
            infoText = `Syntrometry Focus: RIH Node (Score: ${latestRihScore.toFixed(3)})`;
        } else if (data.type === 'dimension' && data.dimensionIndex !== undefined) {
            const dimIndex = data.dimensionIndex;
            const value = (latestStateVector && latestStateVector.length > dimIndex) ? latestStateVector[dimIndex] : NaN;
            infoText = `Syntrometry Focus: Dimension ${dimIndex} (Value: ${isNaN(value) ? 'N/A' : value.toFixed(3)})`;
        }
    }
    const event = new CustomEvent('syntrometryFocusUpdate', { 
        detail: { infoText, displayObject: displayObject?.userData } 
    });
    document.dispatchEvent(event);
}

/**
 * Updates the Three.js visualization based on the latest simulation state.
 * Optimized for better performance with reduced garbage collection.
 */
export function updateThreeJS(deltaTime, stateVector, rihScore, affinities, integrationParam, reflexivityParam, cascadeHistory, context) {
    if (!threeInitialized || !scene || !camera || !renderer || !labelRenderer || !nodes || nodes.length === 0 || !rihNode || !edgesGroup) return;
    latestStateVector = stateVector;
    latestRihScore = rihScore;
    latestAffinities = affinities;
    latestCascadeHistory = cascadeHistory;
    latestContext = context;
    latestIntegrationParam = integrationParam;
    latestReflexivityParam = reflexivityParam;
    frameCount++;
    const now = performance.now();
    if (now - lastFPSUpdate > 1000) {
        currentFPS = Math.round((frameCount * 1000) / (now - lastFPSUpdate));
        frameCount = 0;
        lastFPSUpdate = now;
    }
    const avgAffinity = (affinities && affinities.length > 0) ? 
        affinities.reduce((a, b) => a + b, 0) / affinities.length : 0;
    const time = now * 0.001;
    const lerpFactor = clamp(deltaTime * VISUAL_CONFIG.LERP_SPEED, VISUAL_CONFIG.MIN_LERP_FACTOR, VISUAL_CONFIG.MAX_LERP_FACTOR);
    updateDimensionNodes(time, lerpFactor);
    updateRIHNode(time, lerpFactor, avgAffinity);
    updateEdges(lerpFactor, avgAffinity);
    if (controls) controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}

/**
 * Updates dimension nodes with optimized calculations
 */
function updateDimensionNodes(time, lerpFactor) {
    for (let i = 0; i < Config.DIMENSIONS; i++) {
        const node = nodes[i];
        if (!node?.material?.color || !node.userData?.originalPosition) continue;
        const data = node.userData;
        const originalPosition = data.originalPosition;
        tempColor.setHex(data.originalColor);
        tempColor2.setHex(data.originalEmissive);
        const isSelected = selectedDimension === node;
        const isHovered = !isSelected && hoveredDimension === node;
        const isLinkedToRihSelected = !isSelected && selectedDimension === rihNode;
        const isLinkedToRihHovered = !isSelected && !isLinkedToRihSelected && hoveredDimension === rihNode;
        const value = (latestStateVector && latestStateVector.length > i && typeof latestStateVector[i] === 'number') ? 
            latestStateVector[i] : 0;
        const absValue = Math.abs(value);
        const hue = value > 0 ? lerp(0.5, 0.33, absValue) : (value < 0 ? lerp(0.5, 0.66, absValue) : 0.5);
        const saturation = 0.6 + absValue * 0.3;
        const lightness = 0.4 + absValue * 0.2;
        tempColor.setHSL(hue, saturation, lightness);
        tempColor2.copy(tempColor).multiplyScalar(0.3 + absValue * 0.4);
        tempVector3.copy(originalPosition);
        tempVector3.z = originalPosition.z + value * (0.3 + latestIntegrationParam * 0.5);
        const valueScale = absValue * 0.3;
        const scaleFactor = 1.0 + valueScale + latestReflexivityParam * 0.2;
        if (isSelected) {
            tempColor.setHex(COLORS.HIGHLIGHT);
            tempColor2.setHex(COLORS.HIGHLIGHT).multiplyScalar(0.5);
            node.scale.setScalar(scaleFactor * 1.3);
            tempVector3.z += 0.1;
            node.material.opacity = 1.0;
        } else if (isHovered) {
            tempColor.setHex(COLORS.HIGHLIGHT);
            tempColor2.setHex(COLORS.HIGHLIGHT).multiplyScalar(0.5);
            node.scale.setScalar(scaleFactor * 1.15);
            tempVector3.z += 0.05;
            node.material.opacity = 1.0;
        } else if (isLinkedToRihSelected || isLinkedToRihHovered) {
            tempColor.lerp(new THREE.Color(COLORS.LINKED), 0.5);
            tempColor2.lerp(new THREE.Color(COLORS.LINKED).multiplyScalar(0.3), 0.5);
            node.scale.setScalar(scaleFactor * 1.05);
            node.material.opacity = 0.9;
        } else {
            node.scale.setScalar(scaleFactor);
            node.material.opacity = 1.0;
        }
        node.position.lerp(tempVector3, lerpFactor);
        node.material.color.lerp(tempColor, lerpFactor);
        if (node.material.emissive) {
            node.material.emissive.lerp(tempColor2, lerpFactor);
        }
        node.material.transparent = node.material.opacity < 1.0;
        if (!isSelected) {
            const rotSpeed = lerpFactor * (0.05 + latestReflexivityParam * 0.1 + absValue * 0.2);
            node.rotation.y += rotSpeed;
            node.rotation.x += rotSpeed * 0.5 * Math.sin(time * 0.8 + i);
        }
        if (node.userData.label) {
            const label = node.userData.label;
            label.position.y = (VISUAL_CONFIG.NODE_BASE_SCALE * VISUAL_CONFIG.LABEL_OFFSET_MULTIPLIER) * node.scale.x;
            label.element.style.opacity = clamp(node.material.opacity, 0.2, 1.0);
            label.element.style.display = label.element.style.opacity < 0.25 ? 'none' : 'block';
        }
    }
}

/**
 * Updates the RIH node with optimized calculations
 */
function updateRIHNode(time, lerpFactor, avgAffinity) {
    if (!rihNode?.material?.color || !rihNode.userData?.originalPosition) return;
    const originalPosition = rihNode.userData.originalPosition;
    tempColor.setHex(rihNode.userData.originalColor);
    tempColor2.setHex(rihNode.userData.originalEmissive);
    const isSelected = selectedDimension === rihNode;
    const isHovered = !isSelected && hoveredDimension === rihNode;
    const rihFactor = clamp(latestRihScore, 0, 1);
    tempColor.lerp(new THREE.Color(1, 1, 1), rihFactor * 0.6);
    tempColor2.copy(tempColor).multiplyScalar(clamp(rihFactor * 0.7 + Math.abs(avgAffinity) * 0.2, 0.2, 0.8));
    const rihScaleFactor = 1.0 + rihFactor * 0.5 + latestReflexivityParam * 0.1;
    const pulseSpeed = 2.0 + rihFactor * 4.0;
    const pulseAmount = 0.15 * rihFactor;
    const pulse = (Math.sin(time * pulseSpeed) * 0.5 + 0.5) * pulseAmount;
    if (isSelected) {
        tempColor.setHex(COLORS.HIGHLIGHT);
        tempColor2.setHex(COLORS.HIGHLIGHT).multiplyScalar(0.5);
        rihNode.scale.setScalar((VISUAL_CONFIG.NODE_BASE_SCALE * VISUAL_CONFIG.RIH_SCALE_MULTIPLIER) * 1.4);
        rihNode.material.opacity = 1.0;
    } else if (isHovered) {
        tempColor.setHex(COLORS.HIGHLIGHT);
        tempColor2.setHex(COLORS.HIGHLIGHT).multiplyScalar(0.5);
        rihNode.scale.setScalar((VISUAL_CONFIG.NODE_BASE_SCALE * VISUAL_CONFIG.RIH_SCALE_MULTIPLIER) * 1.2);
        rihNode.material.opacity = 1.0;
    } else {
        rihNode.scale.setScalar((VISUAL_CONFIG.NODE_BASE_SCALE * VISUAL_CONFIG.RIH_SCALE_MULTIPLIER) * (rihScaleFactor + pulse));
        rihNode.material.opacity = 0.8 + rihFactor * 0.2;
    }
    rihNode.position.copy(originalPosition);
    rihNode.material.color.lerp(tempColor, lerpFactor);
    if (rihNode.material.emissive) {
        rihNode.material.emissive.lerp(tempColor2, lerpFactor);
    }
    rihNode.material.transparent = rihNode.material.opacity < 1.0;
    if (!isSelected) {
        const rotSpeed = lerpFactor * (0.1 + latestRihScore * 0.3 + latestIntegrationParam * 0.2);
        rihNode.rotation.y += rotSpeed;
        rihNode.rotation.x += rotSpeed * 0.6 * Math.cos(time * 0.5);
    }
}

/**
 * Updates edges with optimized geometry updates
 */
function updateEdges(lerpFactor, avgAffinity) {
    const edgeHighlightColor = new THREE.Color(COLORS.EDGE_HIGHLIGHT);
    for (const edgeItem of edgesData) {
        const { line, nodeA_idx, nodeB_idx, type } = edgeItem;
        const nodeA = nodes[nodeA_idx];
        const nodeB = (type === 'dim-rih') ? rihNode : nodes[nodeB_idx];
        if (!nodeA || !nodeB || !line.material || !line.geometry || !line.geometry.attributes.position) continue;
        const positions = line.geometry.attributes.position.array;
        positions[0] = nodeA.position.x; positions[1] = nodeA.position.y; positions[2] = nodeA.position.z;
        positions[3] = nodeB.position.x; positions[4] = nodeB.position.y; positions[5] = nodeB.position.z;
        line.geometry.attributes.position.needsUpdate = true;
        line.geometry.computeBoundingSphere();
        const metric = (type === 'dim-rih') ? latestRihScore : avgAffinity;
        const param = (type === 'dim-rih') ? latestReflexivityParam : latestIntegrationParam;
        const isSelectedA = selectedDimension === nodeA;
        const isSelectedB = selectedDimension === nodeB;
        const isHoveredA = hoveredDimension === nodeA;
        const isHoveredB = hoveredDimension === nodeB;
        const isEdgeSelected = isSelectedA || isSelectedB;
        const isEdgeHovered = !isEdgeSelected && (isHoveredA || isHoveredB);
        let targetEdgeColor = new THREE.Color(COLORS.EDGE_DEFAULT);
        let targetEdgeOpacity = clamp(Math.abs(metric) * 0.4 + param * 0.2, 0.1, 0.6);
        if (isEdgeSelected || isEdgeHovered) {
            targetEdgeColor.copy(edgeHighlightColor);
            targetEdgeOpacity = clamp(targetEdgeOpacity * 1.5 + (isEdgeSelected ? 0.2 : 0.1), 0.5, 0.9);
        } else {
            const startColor = nodeA.material.color;
            const endColor = nodeB.material.color;
            const blendFactor = clamp(0.5 + metric * 0.5, 0, 1);
            targetEdgeColor.lerpColors(startColor, endColor, blendFactor);
        }
        line.material.color.lerp(targetEdgeColor, lerpFactor);
        line.material.opacity = lerp(line.material.opacity, targetEdgeOpacity, lerpFactor);
        line.material.transparent = line.material.opacity < 1.0;
    }
}

/**
 * Handles window resize events for the Syntrometry panel.
 */
function onWindowResize() {
    if (!threeInitialized || !camera || !renderer || !labelRenderer || !syntrometryContainer) return;
    const isFullscreen = document.fullscreenElement === syntrometryContainer || 
        document.webkitFullscreenElement === syntrometryContainer ||
        document.mozFullScreenElement === syntrometryContainer ||
        document.msFullscreenElement === syntrometryContainer;
    let width, height;
    if (isFullscreen) {
        width = window.innerWidth;
        height = window.innerHeight;
        console.log(`[SyntrometryViz] Resizing for fullscreen: ${width}x${height}`);
    } else {
        width = syntrometryContainer.clientWidth;
        height = syntrometryContainer.clientHeight;
        console.log(`[SyntrometryViz] Resizing for normal view: ${width}x${height}`);
    }
    if (width <= 0 || height <= 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
    if (renderer && scene && camera) renderer.render(scene, camera);
    if (labelRenderer && scene && camera) labelRenderer.render(scene, camera);
}

export function resizeSyntrometryVisualization() {
    onWindowResize();
}

/** Cleans up Three.js resources used by the Syntrometry visualization. */
export function cleanupThreeJS() {
    if (!threeInitialized && !scene) return;
    window.removeEventListener('resize', debouncedOnWindowResize);
    if (syntrometryContainer) {
        syntrometryContainer.removeEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
        syntrometryContainer.removeEventListener('click', handleSyntrometryClickWrapper, false);
    }
    edgesData.forEach(edgeItem => {
        if (edgeItem.line) {
            if (edgeItem.line.geometry) edgeItem.line.geometry.dispose();
            if (edgeItem.line.material) edgeItem.line.material.dispose();
            edgesGroup?.remove(edgeItem.line);
        }
    });
    edgesData = [];
    scene?.traverse(object => {
        if (object.isMesh) {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                } else {
                    object.material.dispose();
                }
            }
        }
        if (object.isCSS2DObject && object.element.parentNode) {
            object.element.parentNode.removeChild(object.element);
        }
    });
    disposeSharedResources();
    if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        if (renderer.domElement && syntrometryContainer?.contains(renderer.domElement)) {
            syntrometryContainer.removeChild(renderer.domElement);
        }
        renderer = null;
    }
    if (labelRenderer?.domElement?.parentNode) {
        labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
        labelRenderer = null;
    }
    nodes = [];
    edgesGroup = null;
    rihNode = null;
    scene = null;
    camera = null;
    syntrometryInfoPanel = null;
    hoveredDimension = null;
    selectedDimension = null;
    latestStateVector = null;
    threeInitialized = false;
}

// --- Wrapper functions for event listeners to pass interactable objects ---
function handleSyntrometryMouseMoveWrapper(event) {
    const interactableObjects = [...nodes, rihNode].filter(Boolean);
    onSyntrometryMouseMove(event, interactableObjects);
}
function handleSyntrometryClickWrapper(event) {
    const interactableObjects = [...nodes, rihNode].filter(Boolean);
    onSyntrometryClick(event, interactableObjects);
}

// --- Exported calculateGraphFeatures Function ---
export function calculateGraphFeatures() {
    if (!threeInitialized || !Array.isArray(nodes) || nodes.length === 0 || nodes.length !== Config.DIMENSIONS || !rihNode?.position) {
        return [0.0, 0.0];
    }
    try {
        const dimensionNodePositions = nodes.map(node => node.position);
        const rihPosition = rihNode.position;
        const zPositions = dimensionNodePositions.map(pos => pos.z);
        let meanZ = 0, varianceZ = 0;
        if (zPositions.length > 0) {
            meanZ = zPositions.reduce((sum, z) => sum + z, 0) / zPositions.length;
            varianceZ = zPositions.reduce((sum, z) => sum + Math.pow(z - meanZ, 2), 0) / zPositions.length;
        }
        let avgDistToRih = 0;
        if (dimensionNodePositions.length > 0) {
            const distances = dimensionNodePositions.map(pos => pos.distanceTo(rihPosition));
            avgDistToRih = distances.reduce((sum, d) => sum + d, 0) / distances.length;
        }
        const clampedVarZ = clamp(varianceZ, 0, 5.0);
        const clampedAvgDist = clamp(avgDistToRih, 0, 5.0);
        return [clampedVarZ, clampedAvgDist];
    } catch (e) {
        console.error("Error calculating graph features in viz-syntrometry:", e);
        return [0.0, 0.0];
    }
}

/**
 * Resets the camera view to the default position
 */
export function resetSyntrometryView() {
    if (!camera) return;
    camera.position.set(0, 0, 3.5);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    if (camera.isPerspectiveCamera || camera.isOrthographicCamera) {
        camera.rotation.set(0, 0, 0);
        camera.updateProjectionMatrix();
    }
    if (controls && typeof controls.reset === "function") {
        controls.reset();
    }
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
    if (labelRenderer && scene && camera) {
        labelRenderer.render(scene, camera);
    }
}
