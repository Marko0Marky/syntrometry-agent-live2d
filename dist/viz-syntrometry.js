// @ts-nocheck
// js/viz-syntrometry.ts
// Import THREE properly with explicit type imports
import * as THREE from 'three';
// Import CSS2DRenderer from examples
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Config } from './config.js';
import { clamp, displayError, zeros, lerp } from './utils.js';
// Define types for module-level variables
export let scene = null;
export let camera = null;
export let renderer = null;
export let labelRenderer = null;
let nodes = []; // Array of dimension node meshes
let edgesGroup = null;
export let rihNode = null; // Central RIH node mesh
export let threeInitialized = false;
let syntrometryContainer = null;
let syntrometryInfoPanel = null; // Might be dashboard panel now
let hoveredDimension = null; // Hovered object
let selectedDimension = null; // Selected object
// Cached state with types
let latestStateVector = null;
let latestRihScore = 0;
let latestAffinities = [];
let latestCascadeHistory = []; // Nested array
let latestContext = "Initializing...";
let latestIntegrationParam = 0.5;
let latestReflexivityParam = 0.5;
const nodeBaseScale = 0.08;
let baseEdgeMaterial = null;
/**
 * Initializes the Three.js visualization for the Syntrometry panel.
 */
export function initThreeJS() {
    // Check for THREE and Renderer availability
    if (typeof THREE === 'undefined' || typeof CSS2DRenderer === 'undefined') {
        displayError("Three.js or CSS2DRenderer not loaded for Syntrometry panel.", false, 'error-message');
        threeInitialized = false;
        return false;
    }
    try {
        syntrometryContainer = document.getElementById('syntrometry-panel');
        syntrometryInfoPanel = document.getElementById('syntrometry-info-panel');
        if (!syntrometryContainer) {
            console.error("Syntrometry container element not found.");
            return false;
        }
        const width = syntrometryContainer.clientWidth;
        const height = syntrometryContainer.clientHeight;
        if (width <= 0 || height <= 0) {
            console.warn("Syntrometry panel has zero dimensions initially.");
            // Allow init, rendering might start on resize
            // Don't return false here unless you absolutely cannot proceed
        }
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        scene.fog = new THREE.Fog(0x1a1a1a, 4, 10);
        camera = new THREE.PerspectiveCamera(75, width / Math.max(height, 1), 0.1, 1000); // Avoid div by zero
        camera.position.z = 3.5;
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        syntrometryContainer.appendChild(renderer.domElement);
        labelRenderer = new CSS2DRenderer(); // Use imported/global class
        labelRenderer.setSize(width, height);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        labelRenderer.domElement.style.left = '0px';
        labelRenderer.domElement.style.pointerEvents = 'none';
        syntrometryContainer.appendChild(labelRenderer.domElement);
        scene.add(new THREE.AmbientLight(0x606080));
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(1, 1, 1);
        scene.add(dirLight1);
        const dirLight2 = new THREE.DirectionalLight(0x88aaff, 0.4);
        dirLight2.position.set(-1, -0.5, -1);
        scene.add(dirLight2);
        nodes = [];
        const nodeGeometry = new THREE.SphereGeometry(nodeBaseScale, 16, 12); // Shared geometry
        const angleStep = (2 * Math.PI) / Config.DIMENSIONS;
        const radius = 1.5;
        for (let i = 0; i < Config.DIMENSIONS; i++) {
            const material = new THREE.MeshPhongMaterial({ color: 0x888888, emissive: 0x111111, specular: 0x555555, shininess: 30 });
            const node = new THREE.Mesh(nodeGeometry, material);
            const x = Math.cos(i * angleStep) * radius;
            const y = Math.sin(i * angleStep) * radius;
            node.position.set(x, y, 0);
            // Define userData structure explicitly if desired
            node.userData = {
                originalColor: material.color.getHex(),
                originalEmissive: material.emissive.getHex(),
                originalPosition: new THREE.Vector3(x, y, 0),
                dimensionIndex: i,
                type: 'dimension',
                label: null // Will hold CSS2DObject
            };
            scene.add(node);
            nodes.push(node);
            const labelDiv = document.createElement('div');
            labelDiv.className = 'label';
            labelDiv.textContent = `D${i}`;
            const label = new CSS2DObject(labelDiv); // Use imported/global class
            label.position.set(0, nodeBaseScale * 1.5, 0);
            node.add(label);
            node.userData.label = label;
        }
        const rihGeometry = new THREE.SphereGeometry(nodeBaseScale * 1.5, 20, 16);
        const rihMaterial = new THREE.MeshPhongMaterial({ color: 0xff4444, emissive: 0x331111, specular: 0x888888, shininess: 50 });
        rihNode = new THREE.Mesh(rihGeometry, rihMaterial);
        rihNode.position.set(0, 0, 0);
        rihNode.userData = {
            originalColor: rihMaterial.color.getHex(),
            originalEmissive: rihMaterial.emissive.getHex(),
            originalPosition: new THREE.Vector3(0, 0, 0),
            type: 'rih_node',
            label: null
        };
        scene.add(rihNode);
        edgesGroup = new THREE.Group();
        scene.add(edgesGroup);
        baseEdgeMaterial = new THREE.LineBasicMaterial({
            vertexColors: false,
            transparent: true,
            opacity: 0.5,
            color: 0x888888
        });
        setupSyntrometryInteraction();
        window.addEventListener('resize', onWindowResize, false);
        console.log('Syntrometry Three.js initialized successfully.');
        threeInitialized = true;
        return true;
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        displayError(`Error initializing Syntrometry Three.js: ${message}`, false, 'syntrometry-error-message');
        console.error("Syntrometry Three.js Init Error:", e);
        cleanupThreeJS();
        threeInitialized = false;
        return false;
    }
}
/** Sets up raycasting and event listeners. */
function setupSyntrometryInteraction() {
    if (!syntrometryContainer || !camera) {
        console.warn("Cannot setup interaction: Syntrometry container or camera not ready.");
        return;
    }
    // Ensure interactable objects are defined
    const getInteractableObjects = () => [...nodes, rihNode].filter((o) => o !== null); // Type guard
    // Clear previous listeners
    syntrometryContainer.removeEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
    syntrometryContainer.removeEventListener('click', handleSyntrometryClickWrapper, false);
    // Add new listeners
    syntrometryContainer.addEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
    syntrometryContainer.addEventListener('click', handleSyntrometryClickWrapper, false);
    updateSyntrometryInfoPanel();
}
// Create ONE raycaster instance to reuse
const syntrometryRaycaster = new THREE.Raycaster();
const syntrometryMouse = new THREE.Vector2();
/** Handles mouse movement over the Syntrometry canvas. */
function onSyntrometryMouseMove(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects || interactableObjects.length === 0)
        return;
    const rect = syntrometryContainer.getBoundingClientRect();
    syntrometryMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    syntrometryMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    syntrometryRaycaster.setFromCamera(syntrometryMouse, camera);
    const intersects = syntrometryRaycaster.intersectObjects(interactableObjects, false);
    let newHoveredObject = null;
    if (intersects.length > 0 && intersects[0].object?.userData) {
        newHoveredObject = intersects[0].object;
    }
    if (!selectedDimension) {
        if (newHoveredObject !== hoveredDimension) {
            hoveredDimension = newHoveredObject;
            updateSyntrometryInfoPanel();
        }
    }
    else {
        if (hoveredDimension && hoveredDimension !== selectedDimension) {
            hoveredDimension = null;
            updateSyntrometryInfoPanel();
        }
        else if (newHoveredObject === selectedDimension) {
            // Allow hover effect on the selected item itself if needed
            hoveredDimension = newHoveredObject;
        }
    }
    syntrometryContainer.style.cursor = (selectedDimension || hoveredDimension) ? 'pointer' : 'default';
}
/** Handles mouse clicks on the Syntrometry canvas. */
function onSyntrometryClick(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects || interactableObjects.length === 0)
        return;
    const rect = syntrometryContainer.getBoundingClientRect();
    syntrometryMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    syntrometryMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    syntrometryRaycaster.setFromCamera(syntrometryMouse, camera);
    const intersects = syntrometryRaycaster.intersectObjects(interactableObjects, false);
    let clickedObject = null;
    if (intersects.length > 0 && intersects[0].object?.userData) {
        clickedObject = intersects[0].object;
    }
    if (clickedObject) {
        if (selectedDimension === clickedObject) {
            selectedDimension = null;
            hoveredDimension = clickedObject;
        }
        else {
            selectedDimension = clickedObject;
            hoveredDimension = null;
        }
    }
    else {
        selectedDimension = null;
    }
    syntrometryContainer.style.cursor = (selectedDimension || hoveredDimension) ? 'pointer' : 'default';
    updateSyntrometryInfoPanel();
}
/** Updates the Syntrometry info panel (part of dashboard). */
export function updateSyntrometryInfoPanel() {
    // This function is less critical now, mostly for debugging hover/select
    let displayObject = selectedDimension || hoveredDimension;
    if (displayObject?.userData) {
        const data = displayObject.userData;
        // Example logging, replace with actual UI update if needed
        // if (data.type === 'rih_node') {
        //     console.log(`Info Panel Focus: RIH Node (Score: ${latestRihScore.toFixed(3)})`);
        // } else if (data.type === 'dimension' && data.dimensionIndex !== undefined) {
        //     const dimIndex = data.dimensionIndex;
        //     const value = (latestStateVector && latestStateVector.length > dimIndex) ? latestStateVector[dimIndex] : NaN;
        //     console.log(`Info Panel Focus: Dimension ${dimIndex} (Value: ${isNaN(value) ? 'N/A' : value.toFixed(3)})`);
        // }
    }
    else {
        // console.log("Info Panel Focus: None");
    }
}
/** Updates the Three.js visualization with current simulation state */
export function updateThreeJS(deltaTime, stateVector, rihScore, affinities, integrationParam, reflexivityParam, cascadeHistory, context) {
    if (!threeInitialized || !scene || !camera || !renderer || !labelRenderer || nodes.length === 0 || !rihNode || !edgesGroup || !baseEdgeMaterial)
        return;
    // Handle null state vector
    const safeStateVector = stateVector || [];
    // Cache latest state
    latestStateVector = stateVector;
    latestRihScore = rihScore;
    latestAffinities = affinities;
    latestCascadeHistory = cascadeHistory;
    latestContext = context;
    latestIntegrationParam = integrationParam;
    latestReflexivityParam = reflexivityParam;
    const validStateVector = Array.isArray(stateVector) ? stateVector : zeros([Config.DIMENSIONS]);
    const avgAffinity = (affinities && affinities.length > 0 ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0);
    const time = performance.now() * 0.001;
    // --- Edge Management ---
    // Clear old edges
    while (edgesGroup.children.length > 0) {
        const edge = edgesGroup.children[0]; // Assume Line for simplicity
        if (edge.geometry)
            edge.geometry.dispose();
        if (edge.material && edge.material instanceof THREE.Material) { // Check type before disposing
            edge.material.dispose();
        }
        edgesGroup.remove(edge);
    }
    // --- Node Animation & Highlighting ---
    const nodeHighlightColor = new THREE.Color(0xffffff);
    const nodeHighlightEmissive = new THREE.Color(0xffffff).multiplyScalar(0.5);
    const linkedColor = new THREE.Color(0xaaaaee);
    const linkedEmissive = new THREE.Color(0xaaaaee).multiplyScalar(0.3);
    const edgeHighlightColor = new THREE.Color(0x00aaff);
    const lerpFactor = clamp(deltaTime * 8, 0.01, 0.2);
    // Process Dimension Nodes
    for (let i = 0; i < Config.DIMENSIONS; i++) {
        const node = nodes[i];
        // Ensure node and its material/userData are valid
        if (!node?.material || !(node.material instanceof THREE.MeshPhongMaterial) || !node.userData?.originalPosition)
            continue;
        const data = node.userData;
        const originalPosition = data.originalPosition;
        const originalColor = new THREE.Color(data.originalColor);
        const originalEmissive = new THREE.Color(data.originalEmissive);
        const isSelected = selectedDimension === node;
        const isHovered = !isSelected && hoveredDimension === node;
        const isLinkedToRihSelected = !isSelected && selectedDimension === rihNode;
        const isLinkedToRihHovered = !isSelected && !isLinkedToRihSelected && hoveredDimension === rihNode;
        let targetPosition = originalPosition.clone();
        let targetScale = new THREE.Vector3(1.0, 1.0, 1.0);
        let targetColor = originalColor.clone();
        let targetEmissive = originalEmissive.clone();
        let targetOpacity = 1.0;
        // 1. Base state determined by dimension value
        const value = (validStateVector.length > i && typeof validStateVector[i] === 'number') ? validStateVector[i] : 0;
        const absValue = Math.abs(value);
        const hue = value > 0 ? lerp(0.5, 0.33, absValue) : (value < 0 ? lerp(0.5, 0.66, absValue) : 0.5);
        const saturation = 0.6 + absValue * 0.3;
        const lightness = 0.4 + absValue * 0.2;
        targetColor.setHSL(hue, saturation, lightness);
        targetEmissive.copy(targetColor).multiplyScalar(0.3 + absValue * 0.4);
        // 2. Apply metric influences
        targetPosition.z = originalPosition.z + value * (0.3 + integrationParam * 0.5);
        const valueScale = absValue * 0.3;
        const scaleFactor = 1.0 + valueScale + reflexivityParam * 0.2;
        targetScale.set(scaleFactor, scaleFactor, scaleFactor);
        // 3. Apply highlight/linked state
        if (isSelected) {
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            targetScale.multiplyScalar(1.3);
            targetPosition.z += 0.1;
            targetOpacity = 1.0;
        }
        else if (isHovered) {
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            targetScale.multiplyScalar(1.15);
            targetPosition.z += 0.05;
            targetOpacity = 1.0;
        }
        else if (isLinkedToRihSelected || isLinkedToRihHovered) {
            targetColor.lerp(linkedColor, 0.5);
            targetEmissive.lerp(linkedEmissive, 0.5);
            targetScale.multiplyScalar(1.05);
            targetOpacity = 0.9;
        }
        // --- Interpolate towards target state ---
        node.position.lerp(targetPosition, lerpFactor);
        node.scale.lerp(targetScale, lerpFactor);
        node.material.color.lerp(targetColor, lerpFactor);
        if (node.material.emissive) {
            node.material.emissive.lerp(targetEmissive, lerpFactor);
        }
        node.material.opacity = lerp(node.material.opacity ?? 1.0, targetOpacity, lerpFactor);
        node.material.transparent = node.material.opacity < 1.0;
        if (!isSelected) {
            const rotSpeed = deltaTime * (0.05 + reflexivityParam * 0.1 + absValue * 0.2);
            node.rotation.y += rotSpeed;
            node.rotation.x += rotSpeed * 0.5 * Math.sin(time * 0.8 + i);
        }
        // --- Create Edges ---
        for (let j = i + 1; j < Config.DIMENSIONS; j++) {
            const nodeJ = nodes[j];
            if (nodeJ?.position && nodeJ.userData && nodeJ.material) {
                createEdge(node, nodeJ, avgAffinity, integrationParam, edgeHighlightColor);
            }
        }
        if (rihNode?.position && rihNode.userData && rihNode.material) {
            createEdge(node, rihNode, rihScore, reflexivityParam, edgeHighlightColor);
        }
        // Update Label
        if (node.userData.label && node.userData.label instanceof CSS2DObject) { // Type check
            const label = node.userData.label;
            label.position.y = (nodeBaseScale * 1.5) * node.scale.y;
            label.element.style.opacity = String(clamp(node.material.opacity ?? 1.0, 0.2, 1.0));
            label.element.style.display = parseFloat(label.element.style.opacity) < 0.25 ? 'none' : 'block';
        }
    }
    // --- Animate RIH Node ---
    if (rihNode?.material && (rihNode.material instanceof THREE.MeshPhongMaterial) && rihNode.userData?.originalPosition) {
        const originalPosition = rihNode.userData.originalPosition;
        const originalColor = new THREE.Color(rihNode.userData.originalColor);
        const originalEmissive = new THREE.Color(rihNode.userData.originalEmissive);
        const baseScale = nodeBaseScale * 1.5;
        const isSelected = selectedDimension === rihNode;
        const isHovered = !isSelected && hoveredDimension === rihNode;
        let targetColor = originalColor.clone();
        let targetEmissive = originalEmissive.clone();
        let targetScale = new THREE.Vector3(1.0, 1.0, 1.0);
        let targetOpacity = 1.0;
        const rihFactor = clamp(rihScore, 0, 1);
        targetColor.lerp(new THREE.Color(1, 1, 1), rihFactor * 0.6);
        targetEmissive.copy(targetColor).multiplyScalar(clamp(rihFactor * 0.7 + Math.abs(avgAffinity) * 0.2, 0.2, 0.8));
        const rihScaleFactor = 1.0 + rihFactor * 0.5 + reflexivityParam * 0.1;
        const pulseSpeed = 2.0 + rihFactor * 4.0;
        const pulseAmount = 0.15 * rihFactor;
        const pulse = (Math.sin(time * pulseSpeed) * 0.5 + 0.5) * pulseAmount;
        targetScale.set(rihScaleFactor + pulse, rihScaleFactor + pulse, rihScaleFactor + pulse);
        targetOpacity = 0.8 + rihFactor * 0.2;
        if (isSelected) {
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            targetScale.set(1.4, 1.4, 1.4);
            targetOpacity = 1.0;
        }
        else if (isHovered) {
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            targetScale.set(1.2, 1.2, 1.2);
            targetOpacity = 1.0;
        }
        rihNode.position.copy(originalPosition);
        rihNode.scale.lerp(targetScale.multiplyScalar(baseScale), lerpFactor);
        rihNode.material.color.lerp(targetColor, lerpFactor);
        if (rihNode.material.emissive) {
            rihNode.material.emissive.lerp(targetEmissive, lerpFactor);
        }
        rihNode.material.opacity = lerp(rihNode.material.opacity ?? 1.0, targetOpacity, lerpFactor);
        rihNode.material.transparent = rihNode.material.opacity < 1.0;
        if (!isSelected) {
            const rotSpeed = deltaTime * (0.1 + rihScore * 0.3 + integrationParam * 0.2);
            rihNode.rotation.y += rotSpeed;
            rihNode.rotation.x += rotSpeed * 0.6 * Math.cos(time * 0.5);
        }
    }
    // --- Render Scene ---
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
}
/** Helper function to create an edge between two nodes */
function createEdge(nodeA, nodeB, metric, param, highlightColor) {
    if (!baseEdgeMaterial || !edgesGroup)
        return; // Guard against nulls
    const isSelectedA = selectedDimension === nodeA;
    const isSelectedB = selectedDimension === nodeB;
    const isHoveredA = hoveredDimension === nodeA;
    const isHoveredB = hoveredDimension === nodeB;
    const isEdgeSelected = isSelectedA || isSelectedB;
    const isEdgeHovered = !isEdgeSelected && (isHoveredA || isHoveredB);
    const edgeMaterial = baseEdgeMaterial.clone();
    let targetEdgeColor = edgeMaterial.color.clone();
    let targetEdgeOpacity = clamp(Math.abs(metric) * 0.4 + param * 0.2, 0.1, 0.6);
    if (isEdgeSelected || isEdgeHovered) {
        targetEdgeColor.copy(highlightColor);
        targetEdgeOpacity = clamp(targetEdgeOpacity * 1.5 + (isEdgeSelected ? 0.2 : 0.1), 0.5, 0.9);
    }
    else if (nodeA.material instanceof THREE.MeshPhongMaterial && nodeB.material instanceof THREE.MeshPhongMaterial) {
        const startColor = nodeA.material.color;
        const endColor = nodeB.material.color;
        const blendFactor = clamp(0.5 + metric * 0.5, 0, 1);
        targetEdgeColor.lerpColors(startColor, endColor, blendFactor);
    }
    edgeMaterial.color = targetEdgeColor;
    edgeMaterial.opacity = targetEdgeOpacity;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
        nodeA.position.x, nodeA.position.y, nodeA.position.z,
        nodeB.position.x, nodeB.position.y, nodeB.position.z
    ]);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const edgeLine = new THREE.Line(geometry, edgeMaterial);
    edgesGroup.add(edgeLine);
}
/** Handles window resize events. */
function onWindowResize() {
    if (!threeInitialized || !camera || !renderer || !labelRenderer || !syntrometryContainer)
        return;
    const width = syntrometryContainer.clientWidth;
    const height = syntrometryContainer.clientHeight;
    if (width <= 0 || height <= 0)
        return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
}
/** Cleans up Three.js resources. */
export function cleanupThreeJS() {
    if (!scene)
        return; // Skip if already cleaned
    window.removeEventListener('resize', onWindowResize);
    if (syntrometryContainer) {
        syntrometryContainer.removeEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
        syntrometryContainer.removeEventListener('click', handleSyntrometryClickWrapper, false);
    }
    scene?.traverse((object) => {
        // Use type assertions for Object3D properties
        const obj = object;
        if (obj.geometry) {
            obj.geometry.dispose();
        }
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach((material) => material.dispose());
            }
            else {
                obj.material.dispose();
            }
        }
        // Handle CSS2DObject in userData
        if (object.userData && object.userData.label instanceof CSS2DObject && object.userData.label.element.parentNode) {
            object.userData.label.element.parentNode.removeChild(object.userData.label.element);
        }
    });
    renderer?.dispose();
    renderer?.forceContextLoss?.(); // Check if method exists
    if (renderer?.domElement && syntrometryContainer?.contains(renderer.domElement)) {
        syntrometryContainer.removeChild(renderer.domElement);
    }
    if (labelRenderer?.domElement?.parentNode) {
        labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
    }
    baseEdgeMaterial?.dispose();
    nodes = [];
    edgesGroup = null;
    rihNode = null;
    scene = null;
    camera = null;
    renderer = null;
    labelRenderer = null;
    syntrometryContainer = null;
    syntrometryInfoPanel = null;
    hoveredDimension = null;
    selectedDimension = null;
    latestStateVector = null;
    baseEdgeMaterial = null;
    threeInitialized = false;
}
// Wrapper functions for event listeners
function handleSyntrometryMouseMoveWrapper(event) {
    const interactableObjects = [...nodes, rihNode].filter((o) => o !== null); // Use type guard
    onSyntrometryMouseMove(event, interactableObjects);
}
function handleSyntrometryClickWrapper(event) {
    const interactableObjects = [...nodes, rihNode].filter((o) => o !== null); // Use type guard
    onSyntrometryClick(event, interactableObjects);
}
/** Calculates numerical features from the Syntrometry graph visualization state. */
export function calculateGraphFeatures() {
    if (!threeInitialized || nodes.length !== Config.DIMENSIONS || !rihNode?.position) {
        return [0.0, 0.0];
    }
    try {
        const dimensionNodePositions = nodes.map(node => node.position);
        const rihPosition = rihNode.position;
        const zPositions = dimensionNodePositions.map(pos => pos.z);
        let meanZ = 0, varianceZ = 0;
        if (zPositions.length > 0) {
            meanZ = zPositions.reduce((sum, z) => sum + z, 0) / zPositions.length;
            varianceZ = zPositions.reduce((sum, z) => sum + (z - meanZ) ** 2, 0) / zPositions.length;
        }
        let avgDistToRih = 0;
        if (dimensionNodePositions.length > 0) {
            const distances = dimensionNodePositions.map(pos => pos.distanceTo(rihPosition));
            avgDistToRih = distances.reduce((sum, d) => sum + d, 0) / distances.length;
        }
        const clampedVarZ = clamp(varianceZ, 0, 5.0);
        const clampedAvgDist = clamp(avgDistToRih, 0, 5.0);
        return [clampedVarZ, clampedAvgDist];
    }
    catch (e) {
        console.error("Error calculating graph features in viz-syntrometry:", e);
        return [0.0, 0.0];
    }
}
//# sourceMappingURL=viz-syntrometry.js.map