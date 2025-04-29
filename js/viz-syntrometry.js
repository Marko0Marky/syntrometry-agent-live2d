// js/viz-syntrometry.js

import { Config } from './config.js';
import { clamp, displayError, zeros, lerp } from './utils.js'; // Import lerp

// Assumes THREE, OrbitControls, CSS2DRenderer are available globally via CDN

export let scene = null;
export let camera = null;
export let renderer = null;
export let labelRenderer = null;
let nodes = []; // <-- Internal module variable
let edgesGroup = null;
export let rihNode = null; // <-- Exported
export let threeInitialized = false;

let syntrometryContainer = null;
let syntrometryInfoPanel = null;
let hoveredDimension = null;
let selectedDimension = null;
let latestStateVector = null;
let latestRihScore = 0;
let latestAffinities = [];
let latestCascadeHistory = [];
let latestContext = "Initializing...";
let baseEdgeMaterial = null;
const nodeBaseScale = 0.08;

/**
 * Initializes the Three.js visualization for the Syntrometry panel.
 * @returns {boolean} True if initialization was successful, false otherwise.
 */
export function initThreeJS() {
    if (typeof THREE === 'undefined' || typeof THREE.CSS2DRenderer === 'undefined') {
        displayError("Three.js or CSS2DRenderer not loaded for Syntrometry panel.", false, 'error-message');
        threeInitialized = false;
        return false;
    }
    try {
        syntrometryContainer = document.getElementById('syntrometry-panel');
        syntrometryInfoPanel = document.getElementById('dashboard-panel'); // Use the new dashboard panel ID
        syntrometryInfoPanel = document.getElementById('dashboard-panel'); // Re-get element just in case
        if (!syntrometryContainer || !syntrometryInfoPanel) {
            console.warn("Syntrometry container or dashboard panel not found for interaction setup.");
            return;
        }

        const width = syntrometryContainer.clientWidth;
        const height = syntrometryContainer.clientHeight;
         if (width <= 0 || height <= 0) {
             displayError("Syntrometry panel has zero dimensions.", false, 'error-message');
             threeInitialized = false;
             return false;
         }

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 3.5;

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        syntrometryContainer.appendChild(renderer.domElement);

        labelRenderer = new THREE.CSS2DRenderer();
        labelRenderer.setSize(width, height);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        labelRenderer.domElement.style.left = '0px';
        labelRenderer.domElement.style.pointerEvents = 'none';
        syntrometryContainer.appendChild(labelRenderer.domElement);

        // Dispose previous nodes
        nodes.forEach(node => {
            if (node.geometry) node.geometry.dispose();
            if (node.material) node.material.dispose();
            if (node.userData?.label?.element?.parentNode) node.userData.label.element.parentNode.removeChild(node.userData.label.element);
            scene?.remove(node);
        });
        nodes = []; // Reset array

        const nodeGeometry = new THREE.SphereGeometry(nodeBaseScale, 16, 12);
        const angleStep = (2 * Math.PI) / Config.DIMENSIONS;
        const radius = 1.5;

        for (let i = 0; i < Config.DIMENSIONS; i++) {
            const material = new THREE.MeshPhongMaterial({ color: 0x00ff00, emissive: 0x113311, specular: 0x555555, shininess: 30 });
            const node = new THREE.Mesh(nodeGeometry, material);
            const x = Math.cos(i * angleStep) * radius;
            const y = Math.sin(i * angleStep) * radius;
            node.position.set(x, y, 0);
            node.userData = {
                originalColor: material.color.getHex(),
                originalEmissive: material.emissive ? material.emissive.getHex() : 0x000000,
                originalPosition: new THREE.Vector3(x, y, 0),
                dimensionIndex: i,
                type: 'dimension'
            };
            scene.add(node);
            nodes.push(node);

            const labelDiv = document.createElement('div');
            labelDiv.className = 'label';
            labelDiv.textContent = `Dim ${i + 1}`;
            const label = new THREE.CSS2DObject(labelDiv);
            label.position.set(0, nodeBaseScale * 1.5, 0);
            node.add(label);
            node.userData.label = label;
        }

        // Dispose previous RIH node
         if (rihNode) {
            if (rihNode.geometry) rihNode.geometry.dispose();
            if (rihNode.material) rihNode.material.dispose();
            scene?.remove(rihNode);
            rihNode = null;
        }
        const rihGeometry = new THREE.SphereGeometry(nodeBaseScale * 1.5, 20, 16);
        const rihMaterial = new THREE.MeshPhongMaterial({ color: 0xff4444, emissive: 0x331111, specular: 0x888888, shininess: 50 });
        rihNode = new THREE.Mesh(rihGeometry, rihMaterial);
        rihNode.position.set(0, 0, 0);
        rihNode.userData = {
            originalColor: rihMaterial.color.getHex(),
            originalEmissive: rihMaterial.emissive ? rihMaterial.emissive.getHex() : 0x000000,
            originalPosition: new THREE.Vector3(0, 0, 0),
            type: 'rih_node',
            label: null
        };
        scene.add(rihNode);

        // Dispose previous edge group
        if (edgesGroup) {
            while(edgesGroup.children.length > 0){
                const edge = edgesGroup.children[0];
                if (edge.geometry) edge.geometry.dispose();
                if (edge.material) edge.material.dispose();
                edgesGroup.remove(edge);
            }
            scene?.remove(edgesGroup);
        }
        edgesGroup = new THREE.Group();
        scene.add(edgesGroup);

        if (baseEdgeMaterial) baseEdgeMaterial.dispose();
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
    } catch (e) {
        displayError(`Error initializing Syntrometry Three.js: ${e.message}`, false, 'error-message');
        console.error("Syntrometry Three.js Init Error:", e);
        threeInitialized = false;
        return false;
    }
}


// Sets up raycasting and event listeners
function setupSyntrometryInteraction() {
    if (!syntrometryContainer || !syntrometryInfoPanel) return;
    const interactableObjects = [...nodes, rihNode].filter(Boolean);
    syntrometryContainer.addEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
    syntrometryContainer.addEventListener('click', handleSyntrometryClickWrapper, false);
    updateSyntrometryInfoPanel();
    console.log("Syntrometry interaction setup complete.");
}

// Handles mouse movement
function onSyntrometryMouseMove(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects) return;
    let raycaster = new THREE.Raycaster(); let mouse = new THREE.Vector2();
    const rect = syntrometryContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, false);
    let newHoveredObject = null;
    if (intersects.length > 0) {
        for(let i = 0; i < intersects.length; i++) { if(intersects[i].object?.userData) { newHoveredObject = intersects[i].object; break; } }
    }
    if (!selectedDimension && newHoveredObject !== hoveredDimension) { hoveredDimension = newHoveredObject; }
    else if (!selectedDimension && !newHoveredObject && hoveredDimension !== null) { hoveredDimension = null; }
    syntrometryContainer.style.cursor = (selectedDimension || hoveredDimension) ? 'pointer' : 'default';
}

// Handles mouse clicks
function onSyntrometryClick(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects) return;
    let raycaster = new THREE.Raycaster(); let mouse = new THREE.Vector2();
    const rect = syntrometryContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, false);
    let clickedObject = null;
    if (intersects.length > 0) {
        for(let i = 0; i < intersects.length; i++) { if(intersects[i].object?.userData) { clickedObject = intersects[i].object; break; } }
    }
    if (clickedObject) {
        if (selectedDimension === clickedObject) { selectedDimension = null; }
        else { selectedDimension = clickedObject; }
    } else { selectedDimension = null; }
    syntrometryContainer.style.cursor = (selectedDimension || hoveredDimension) ? 'pointer' : 'default';
}


// Updates the Syntrometry info panel
// In viz-syntrometry.js

export function updateSyntrometryInfoPanel() {
    // This function no longer updates the DOM directly,
    // as the dashboard handles primary metric display.
    // We can log hover/select events for debugging if needed.

    let displayObject = null;
    if (selectedDimension?.userData) { displayObject = selectedDimension; }
    else if (hoveredDimension?.userData) { displayObject = hoveredDimension; }

    if (displayObject?.userData) {
        const data = displayObject.userData;
        if (data.type === 'rih_node') {
            // console.log(`Info: Hover/Select RIH Node (Score: ${latestRihScore.toFixed(2)})`);
        } else if (data.type === 'dimension' && data.dimensionIndex !== undefined) {
            const dimIndex = data.dimensionIndex;
            const value = (latestStateVector && latestStateVector.length > dimIndex) ? latestStateVector[dimIndex] : 0;
            // console.log(`Info: Hover/Select Dimension ${dimIndex + 1} (Value: ${value.toFixed(3)})`);
        }
    }
}


// Updates the Three.js visualization
export function updateThreeJS(deltaTime, stateVector, rihScore, affinities, integrationParam, reflexivityParam, cascadeHistory, context) {
    if (!threeInitialized || !nodes || nodes.length === 0 || !rihNode || !edgesGroup || !renderer || !camera || !scene || !labelRenderer || !baseEdgeMaterial) return;

    latestStateVector = stateVector;
    latestRihScore = rihScore;
    latestAffinities = affinities;
    latestCascadeHistory = cascadeHistory;
    latestContext = context;
    const avgAffinity = (affinities && affinities.length > 0 ? affinities.reduce((a,b)=>a+b,0)/affinities.length : 0);

    // Clear old edges
    while(edgesGroup.children.length > 0){
        const edge = edgesGroup.children[0];
        if (edge.geometry) edge.geometry.dispose();
        if (edge.material) edge.material.dispose();
        edgesGroup.remove(edge);
    }

    // --- Node Animation & Highlight Effects ---
    const time = performance.now() * 0.001;
    const nodeHighlightColor = new THREE.Color(0xffffff);
    const nodeHighlightEmissive = new THREE.Color(0xffffff).multiplyScalar(0.5);
    const linkedColor = new THREE.Color(0xaaaaee);
    const linkedEmissive = new THREE.Color(0xaaaaee).multiplyScalar(0.3);
    const edgeHighlightColor = new THREE.Color(0x00aaff);

    // Loop through dimension nodes
    for (let i = 0; i < Config.DIMENSIONS; i++) {
        const node = nodes[i];
        if (!node?.material?.color || !node.userData?.originalPosition) continue;

        const data = node.userData;
        const originalPosition = data.originalPosition;
        const originalColor = new THREE.Color(data.originalColor ?? 0x00ff00);
        const originalEmissive = new THREE.Color(data.originalEmissive ?? 0x000000);

        const isSelected = selectedDimension === node;
        const isHovered = !isSelected && hoveredDimension === node;
        const lastCascadeLevel = latestCascadeHistory && latestCascadeHistory.length > 0 ? latestCascadeHistory[latestCascadeHistory.length - 1] : [];
        const isLinkedToRih = Array.isArray(lastCascadeLevel) && lastCascadeLevel.length > i;
        const isLinkedToRihSelected = selectedDimension === rihNode && isLinkedToRih;
        const isLinkedToRihHovered = !isSelected && !isLinkedToRihSelected && hoveredDimension === rihNode && isLinkedToRih;

        let targetPosition = originalPosition.clone();
        let targetScale = new THREE.Vector3(1.0, 1.0, 1.0);
        let targetColor = originalColor.clone();
        let targetEmissive = originalEmissive.clone();
        const lerpFactor = 0.1;

        // Base state based on value
        const value = (latestStateVector && latestStateVector.length > i) ? latestStateVector[i] : 0;
        const hue = value > 0 ? 0.33 : (value < 0 ? 0.66 : 0.5);
        const saturation = 0.8;
        const lightness = 0.4 + Math.abs(value) * 0.3;
        targetColor.setHSL(hue, saturation, lightness);
        targetEmissive.copy(targetColor).multiplyScalar(0.3 + Math.abs(value) * 0.3);

        // Apply highlight/linked/normal state
        if (isSelected || isHovered) {
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            const highlightScaleFactor = 1.0 + (isSelected ? 0.3 : 0.15);
            targetScale.set(highlightScaleFactor, highlightScaleFactor, highlightScaleFactor);
            targetPosition.z = originalPosition.z + value * 0.5 + (isSelected ? 0.1 : 0.05);
        } else if (isLinkedToRihSelected || isLinkedToRihHovered) {
             targetColor.lerp(linkedColor, 0.5);
             targetEmissive.lerp(linkedEmissive, 0.5);
             targetScale.set(1.05, 1.05, 1.05);
             targetPosition.z = originalPosition.z + value * 0.5;
        } else {
            // Apply metric influences
            targetPosition.z = originalPosition.z + value * (0.5 + reflexivityParam * 0.3);
            const valueScale = Math.abs(value) * 0.4;
            const scaleFactor = 1.0 + integrationParam * 0.3 + valueScale;
            targetScale.set(scaleFactor, scaleFactor, scaleFactor);
        }

        // Interpolate towards target state
        node.position.lerp(targetPosition, lerpFactor);
        node.scale.lerp(targetScale, lerpFactor);
        node.material.color.lerp(targetColor, lerpFactor);
        if (node.material.emissive) { node.material.emissive.lerp(targetEmissive, lerpFactor); }

        // Apply rotation if not selected
        if (!isSelected) {
             const rotSpeed = deltaTime * (0.05 + reflexivityParam * 0.1 + Math.abs(value) * 0.1);
             node.rotation.y += rotSpeed;
             node.rotation.x += rotSpeed * 0.5 * Math.sin(time + i);
        }

        // --- Create Edges ---
        // Dimension -> Dimension Edges
        for (let j = i + 1; j < Config.DIMENSIONS; j++) {
            const nodeJ = nodes[j];
            if (!nodeJ?.position || !nodeJ.userData) continue;
            const distSq = node.position.distanceToSquared(nodeJ.position);
            if (distSq < 4.0) {
                 const baseOpacity = clamp(0.15 + Math.abs(avgAffinity) * 0.4 + integrationParam * 0.2, 0.05, 0.7);
                 const isEdgeSelected = isSelected || selectedDimension === nodeJ || (selectedDimension === rihNode && (isLinkedToRih || (Array.isArray(lastCascadeLevel) && lastCascadeLevel.length > j)));
                 const isEdgeHovered = !isEdgeSelected && (isHovered || hoveredDimension === nodeJ || (hoveredDimension === rihNode && (isLinkedToRih || (Array.isArray(lastCascadeLevel) && lastCascadeLevel.length > j))));
                 const edgeMaterial = baseEdgeMaterial.clone();
                 let targetEdgeColor = edgeMaterial.color.clone();
                 let targetEdgeOpacity = baseOpacity;
                 if (isEdgeSelected || isEdgeHovered) {
                      targetEdgeColor.copy(edgeHighlightColor);
                      targetEdgeOpacity = clamp(baseOpacity * 1.5 + (isEdgeSelected ? 0.2 : 0), 0.6, 1.0);
                 } else {
                     const startColor = node.material.color; const endColor = nodeJ.material.color;
                     const blendFactor = clamp(0.5 + avgAffinity * 0.5, 0, 1);
                     targetEdgeColor.lerpColors(startColor, endColor, blendFactor);
                     targetEdgeOpacity = baseOpacity;
                 }
                edgeMaterial.color = targetEdgeColor;
                edgeMaterial.opacity = targetEdgeOpacity;
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array(6);
                node.position.toArray(positions, 0); nodeJ.position.toArray(positions, 3);
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                edgesGroup.add(new THREE.Line(geometry, edgeMaterial));
            }
        }
        // Dimension -> RIH Edge
        if (rihNode?.position && rihNode.userData && rihNode.material) {
            const rihEdgeMaterial = baseEdgeMaterial.clone();
            const baseOpacity = clamp(Math.abs(value) * 0.3 + rihScore * 0.4 + reflexivityParam * 0.2, 0.05, 0.8);
            const isEdgeSelected = isSelected || selectedDimension === rihNode;
            const isEdgeHovered = !isEdgeSelected && (isHovered || hoveredDimension === rihNode);
            let targetEdgeColor = rihEdgeMaterial.color.clone();
            let targetEdgeOpacity = baseOpacity;
            if (isEdgeSelected || isEdgeHovered) {
                 targetEdgeColor.copy(edgeHighlightColor);
                 targetEdgeOpacity = clamp(baseOpacity * 1.4 + (isEdgeSelected ? 0.2 : 0), 0.6, 1.0);
            } else {
                 const startColor = node.material.color; const endColor = rihNode.material.color;
                 targetEdgeColor.lerpColors(startColor, endColor, clamp(0.3 + rihScore * 0.7, 0.1, 0.9));
                 targetEdgeOpacity = baseOpacity;
            }
            rihEdgeMaterial.color = targetEdgeColor;
            rihEdgeMaterial.opacity = targetEdgeOpacity;
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(6);
            node.position.toArray(positions, 0); rihNode.position.toArray(positions, 3);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            edgesGroup.add(new THREE.Line(geometry, rihEdgeMaterial));
        }

        // Update Label
        if (node.userData.label) {
             const label = node.userData.label;
             label.position.y = (nodeBaseScale * 1.5) * node.scale.y;
             label.element.style.opacity = clamp(node.material.opacity ?? 1.0, 0.2, 1.0);
             label.element.style.display = label.element.style.opacity < 0.25 ? 'none' : 'block';
        }
   } // End of dimension node loop

    // --- Animate RIH Node ---
    if (rihNode?.material?.color && rihNode.userData?.originalPosition) {
         const originalPosition = rihNode.userData.originalPosition;
         const originalColor = new THREE.Color(rihNode.userData.originalColor);
         const originalEmissive = new THREE.Color(rihNode.userData.originalEmissive ?? 0x000000);
         const baseScale = nodeBaseScale * 1.5;
         const lerpFactor = 0.1;
         const isSelected = selectedDimension === rihNode;
         const isHovered = !isSelected && hoveredDimension === rihNode;

         let targetColor = originalColor.clone();
         let targetEmissive = originalEmissive.clone();
         let targetScale = new THREE.Vector3(baseScale, baseScale, baseScale);

         // Base state
         targetColor.lerp(new THREE.Color(1, 1, 1), clamp(rihScore, 0, 1) * 0.6);
         targetEmissive.copy(targetColor).multiplyScalar(clamp(rihScore * 0.7 + Math.abs(avgAffinity) * 0.3, 0.3, 0.9));
         const rihScaleFactor = baseScale * (1.0 + clamp(rihScore, 0, 1) * 0.5 + reflexivityParam * 0.2);
         const pulse = (Math.sin(time * (2.0 + rihScore * 3.0)) * 0.5 + 0.5) * clamp(rihScore, 0.2, 1.0) * 0.2;
         targetScale.set(rihScaleFactor + pulse, rihScaleFactor + pulse, rihScaleFactor + pulse);

         // Highlight state
         if (isSelected || isHovered) {
             targetColor.copy(nodeHighlightColor);
             targetEmissive.copy(nodeHighlightEmissive);
             const highlightScaleFactor = baseScale * (1.4 + (isSelected ? 0.2 : 0));
             targetScale.set(highlightScaleFactor, highlightScaleFactor, highlightScaleFactor);
         }

         // Apply Interpolation
         rihNode.position.copy(originalPosition);
         rihNode.scale.lerp(targetScale, lerpFactor);
         rihNode.material.color.lerp(targetColor, lerpFactor);
         if (rihNode.material.emissive) { rihNode.material.emissive.lerp(targetEmissive, lerpFactor); }

         // Rotation
         if (!isSelected) {
            const rotSpeed = deltaTime * (0.1 + rihScore * 0.2 + integrationParam * 0.1);
            rihNode.rotation.y += rotSpeed;
            rihNode.rotation.x += rotSpeed * 0.6 * Math.cos(time * 0.5);
         }
    }

   // Render
   renderer.render(scene, camera);
   labelRenderer.render(scene, camera);
}

// Handles window resize
function onWindowResize() {
    if (!threeInitialized || !camera || !renderer || !labelRenderer || !syntrometryContainer) return;
    const width = syntrometryContainer.clientWidth; const height = syntrometryContainer.clientHeight;
    if (width <= 0 || height <= 0) return;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height); labelRenderer.setSize(width, height);
}

// Cleans up Three.js resources
export function cleanupThreeJS() {
    if (!threeInitialized) return;
    console.log("Cleaning up Syntrometry Three.js...");
    window.removeEventListener('resize', onWindowResize);
    if (syntrometryContainer) {
         syntrometryContainer.removeEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
         syntrometryContainer.removeEventListener('click', handleSyntrometryClickWrapper, false);
    }
    if (renderer) {
        renderer.dispose();
        if (syntrometryContainer?.contains(renderer.domElement)) { syntrometryContainer.removeChild(renderer.domElement); }
        renderer = null;
    }
     if (labelRenderer?.domElement) { labelRenderer.domElement.remove(); labelRenderer = null; }
    if (nodes) {
        nodes.forEach(node => {
             if (!node) return;
             if (node.geometry) node.geometry.dispose();
             if (node.material) node.material.dispose();
             if (node.userData?.label?.element?.parentNode) { node.userData.label.element.parentNode.removeChild(node.userData.label.element); }
             scene?.remove(node);
        });
        nodes = [];
    }
    if (rihNode) {
        if (rihNode.geometry) rihNode.geometry.dispose();
        if (rihNode.material) rihNode.material.dispose();
        scene?.remove(rihNode);
        rihNode = null;
    }
     if (edgesGroup) {
        while(edgesGroup.children.length > 0){
            const edge = edgesGroup.children[0];
            if (edge.geometry) edge.geometry.dispose();
            if (edge.material) edge.material.dispose();
            edgesGroup.remove(edge);
        }
        scene?.remove(edgesGroup);
        edgesGroup = null;
     }
     if (baseEdgeMaterial) { baseEdgeMaterial.dispose(); baseEdgeMaterial = null; }
     syntrometryContainer = null; syntrometryInfoPanel = null; hoveredDimension = null; selectedDimension = null;
     latestStateVector = null; latestRihScore = 0; latestAffinities = []; latestCascadeHistory = []; latestContext = "Initializing...";
    scene = null; camera = null;
    threeInitialized = false;
    console.log("Syntrometry Three.js cleanup complete.");
}

// --- Wrapper functions for event listeners ---
function handleSyntrometryMouseMoveWrapper(event) {
     const interactableObjects = [...nodes, rihNode].filter(Boolean);
     onSyntrometryMouseMove(event, interactableObjects);
     if (!selectedDimension) { updateSyntrometryInfoPanel(); }
}

function handleSyntrometryClickWrapper(event) {
     const interactableObjects = [...nodes, rihNode].filter(Boolean);
     onSyntrometryClick(event, interactableObjects);
     updateSyntrometryInfoPanel();
}


// --- Exported calculateGraphFeatures Function ---
/**
 * Calculates numerical features from the Syntrometry graph visualization state.
 * Uses internal module variables `nodes` and `rihNode`.
 * @returns {number[]} An array containing graph features: [varianceZ, avgDistToRih], or [0, 0] if unavailable.
 */
export function calculateGraphFeatures() {
    // Check if visualization is initialized and internal nodes array is ready
    if (!threeInitialized || !nodes || nodes.length !== Config.DIMENSIONS || !rihNode?.position) {
        return [0.0, 0.0]; // Return default values if viz not ready
    }

    try {
        // Access module-scoped variables directly
        const dimensionNodePositions = nodes.map(node => node.position);
        const rihPosition = rihNode.position;

        // 1. Variance of Z-positions
        const zPositions = dimensionNodePositions.map(pos => pos.z);
        const meanZ = zPositions.length > 0 ? zPositions.reduce((sum, z) => sum + z, 0) / zPositions.length : 0;
        const varianceZ = zPositions.length > 0 ? zPositions.reduce((sum, z) => sum + (z - meanZ) ** 2, 0) / zPositions.length : 0;


        // 2. Average Distance to RIH Node
        const distances = dimensionNodePositions.map(pos => pos.distanceTo(rihPosition));
        const avgDistToRih = distances.length > 0 ? distances.reduce((sum, d) => sum + d, 0) / distances.length : 0;

        // Clamp features to reasonable ranges
        const clampedVarZ = clamp(varianceZ, 0, 5.0);
        const clampedAvgDist = clamp(avgDistToRih, 0, 5.0);

        return [clampedVarZ, clampedAvgDist];

    } catch (e) {
        // Log error within the module where it occurs
        console.error("Error calculating graph features in viz-syntrometry:", e);
        return [0.0, 0.0]; // Return default on error
    }
}
