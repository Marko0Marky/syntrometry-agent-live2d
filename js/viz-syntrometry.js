// js/viz-syntrometry.js

import { Config } from './config.js';
import { clamp, displayError, zeros, lerp, debounce } from './utils.js';

// Assumes THREE, OrbitControls (optional here), CSS2DRenderer are available globally via CDN

export let scene = null;
export let camera = null;
export let renderer = null;
export let labelRenderer = null;
let nodes = []; // Internal array holding dimension node meshes
let edgesData = []; // Array to hold persistent edge data: { line: THREE.Line, nodeA_idx, nodeB_idx, type: 'dim-dim'/'dim-rih' }
let edgesGroup = null; // Group to hold edge lines
export let rihNode = null; // The central RIH node mesh
export let threeInitialized = false;

let syntrometryContainer = null;
let syntrometryInfoPanel = null; // Reference to the info panel (might be dashboard now)
let hoveredDimension = null; // Reference to the currently hovered THREE.Object3D
let selectedDimension = null; // Reference to the currently selected THREE.Object3D

// Cached state for info panel and feature calculation
let latestStateVector = null;
let latestRihScore = 0;
let latestAffinities = []; // Not directly visualized here, but available
let latestCascadeHistory = []; // Used for RIH node links potentially
let latestContext = "Initializing...";
let latestIntegrationParam = 0.5;
let latestReflexivityParam = 0.5;

const nodeBaseScale = 0.08; // Base size for dimension nodes
let baseEdgeMaterial = null; // Reusable material for edges

// Create debounced version of onWindowResize
const debouncedOnWindowResize = debounce(onWindowResize, 250);

/**
 * Initializes the Three.js visualization for the Syntrometry panel.
 * Creates dimension nodes, the RIH node, and sets up the scene.
 * @returns {boolean} True if initialization was successful, false otherwise.
 */
export function initThreeJS() {
    if (typeof THREE === 'undefined' || typeof THREE.CSS2DRenderer === 'undefined') {
        displayError("Three.js or CSS2DRenderer not loaded for Syntrometry panel.", false, 'error-message');
        threeInitialized = false;
        return false;
    }

    try {
        cleanupThreeJS(); // Ensure clean state before initializing

        syntrometryContainer = document.getElementById('syntrometry-panel');
        syntrometryInfoPanel = document.getElementById('dashboard-panel'); // Info updates are part of dashboard
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
             // displayError("Syntrometry panel has zero dimensions. Visualization cannot be rendered.", false, 'syntrometry-error-message'); // Can be noisy on init
             return true; // Allow init, rendering might start on resize
         }

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        scene.fog = new THREE.Fog(0x1a1a1a, 4, 10);

        camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 3.5;

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        syntrometryContainer.appendChild(renderer.domElement);

        labelRenderer = new THREE.CSS2DRenderer();
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
        const nodeGeometry = new THREE.SphereGeometry(nodeBaseScale, 16, 12);
        const angleStep = (2 * Math.PI) / Config.DIMENSIONS;
        const radius = 1.5;

        for (let i = 0; i < Config.DIMENSIONS; i++) {
            const material = new THREE.MeshPhongMaterial({ color: 0x888888, emissive: 0x111111, specular: 0x555555, shininess: 30 });
            const node = new THREE.Mesh(nodeGeometry, material);
            const x = Math.cos(i * angleStep) * radius;
            const y = Math.sin(i * angleStep) * radius;
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
            const label = new THREE.CSS2DObject(labelDiv);
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
        edgesData = []; // Clear previous edge data

        baseEdgeMaterial = new THREE.LineBasicMaterial({
            vertexColors: false,
            transparent: true,
            opacity: 0.5,
            color: 0x888888
         });

        // --- Create Persistent Edges ---
        // Create ONE BufferGeometry that will be shared by all lines.
        // Its attributes.position will be updated in the animation loop for each line.
        // This is less flexible if individual lines need drastically different numbers of points,
        // but for simple start-end lines, it's efficient.
        const edgePositionsArray = new Float32Array(2 * 3); // 2 vertices (start, end), 3 coordinates (x,y,z)
        const sharedEdgeGeometry = new THREE.BufferGeometry();
        sharedEdgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgePositionsArray, 3));
        // Set initial draw range to 0 so nothing is drawn until positions are updated.
        // Or, set initial positions to (0,0,0)-(0,0,0) if preferred over drawRange.
        // For simplicity, we'll just update positions.

        // Dimension -> Dimension edges
        for (let i = 0; i < Config.DIMENSIONS; i++) {
            for (let j = i + 1; j < Config.DIMENSIONS; j++) {
                // Each line needs its own material instance for individual color/opacity.
                const material = baseEdgeMaterial.clone();
                // Each line needs its own geometry instance if we want to update positions individually
                // without affecting other lines that share the same geometry object.
                // However, for performance, it's better to update parts of a large shared geometry if possible.
                // For simple lines, cloning the geometry is acceptable and easier to manage.
                const lineGeometry = sharedEdgeGeometry.clone(); // Clone the geometry structure
                const line = new THREE.Line(lineGeometry, material);
                edgesGroup.add(line);
                edgesData.push({ line: line, nodeA_idx: i, nodeB_idx: j, type: 'dim-dim' });
            }
        }
        // Dimension -> RIH edges
        for (let i = 0; i < Config.DIMENSIONS; i++) {
            const material = baseEdgeMaterial.clone();
            const lineGeometry = sharedEdgeGeometry.clone();
            const line = new THREE.Line(lineGeometry, material);
            edgesGroup.add(line);
            edgesData.push({ line: line, nodeA_idx: i, nodeB_idx: -1, type: 'dim-rih' }); // -1 for RIH node
        }


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


/** Sets up raycasting and event listeners for interaction within the Syntrometry panel. */
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

/** Handles mouse movement over the Syntrometry canvas for hover effects. */
function onSyntrometryMouseMove(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects || interactableObjects.length === 0) return;

    let raycaster = new THREE.Raycaster(); // Keep as local, instance per call is fine for mousemove
    let mouse = new THREE.Vector2();

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
         if (hoveredDimension && hoveredDimension !== selectedDimension) { // Clear hover if not on selected
             hoveredDimension = null;
             updateSyntrometryInfoPanel();
         } else if (newHoveredObject === selectedDimension && hoveredDimension !== selectedDimension) { // Hovering the selected
             hoveredDimension = newHoveredObject; // Allow hover effect on selected if re-hovered
             updateSyntrometryInfoPanel();
         }
    }
    syntrometryContainer.style.cursor = (selectedDimension || hoveredDimension) ? 'pointer' : 'default';
}

/** Handles mouse clicks on the Syntrometry canvas for selection. */
function onSyntrometryClick(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects || interactableObjects.length === 0) return;

    let raycaster = new THREE.Raycaster();
    let mouse = new THREE.Vector2();
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
            hoveredDimension = clickedObject; // Re-enable hover
        } else {
            selectedDimension = clickedObject;
            hoveredDimension = null; // Clear hover when selecting something new
        }
    } else { // Clicked background
        selectedDimension = null;
        // Hover will be updated by mousemove
    }

    syntrometryContainer.style.cursor = (selectedDimension || hoveredDimension) ? 'pointer' : 'default';
    updateSyntrometryInfoPanel();
}


/** Updates the Syntrometry info panel (now likely part of the main dashboard). */
export function updateSyntrometryInfoPanel() {
    let displayObject = selectedDimension || hoveredDimension;
    let infoText = "Syntrometry: No focus."; // Default text

    if (displayObject?.userData) {
        const data = displayObject.userData;
        if (data.type === 'rih_node') {
            infoText = `Syntrometry Focus: RIH Node (Score: ${latestRihScore.toFixed(3)})`;
        } else if (data.type === 'dimension' && data.dimensionIndex !== undefined) {
            const dimIndex = data.dimensionIndex;
            const value = (latestStateVector && latestStateVector.length > dimIndex) ? latestStateVector[dimIndex] : NaN;
            infoText = `Syntrometry Focus: Dimension ${dimIndex} (Value: ${value.toFixed(3)})`;
        }
    }
    // Example: Update a specific element if it exists
    // const syntrometryFocusElement = document.getElementById('syntrometry-focus-display');
    // if (syntrometryFocusElement) syntrometryFocusElement.textContent = infoText;
    // else console.log(infoText); // Fallback to console if no dedicated UI
}


/**
 * Updates the Three.js visualization based on the latest simulation state.
 * Animates nodes and updates persistent edges.
 */
export function updateThreeJS(deltaTime, stateVector, rihScore, affinities, integrationParam, reflexivityParam, cascadeHistory, context) {
    if (!threeInitialized || !scene || !camera || !renderer || !labelRenderer || !nodes || nodes.length === 0 || !rihNode || !edgesGroup || !baseEdgeMaterial) return;

    latestStateVector = stateVector;
    latestRihScore = rihScore;
    latestAffinities = affinities;
    latestCascadeHistory = cascadeHistory;
    latestContext = context;
    latestIntegrationParam = integrationParam;
    latestReflexivityParam = reflexivityParam;

    const avgAffinity = (affinities && affinities.length > 0 ? affinities.reduce((a,b)=>a+b,0)/affinities.length : 0);
    const time = performance.now() * 0.001;

    const nodeHighlightColor = new THREE.Color(0xffffff);
    const nodeHighlightEmissive = new THREE.Color(0xffffff).multiplyScalar(0.5);
    const linkedColor = new THREE.Color(0xaaaaee);
    const linkedEmissive = new THREE.Color(0xaaaaee).multiplyScalar(0.3);
    const edgeHighlightColor = new THREE.Color(0x00aaff);
    const lerpFactor = clamp(deltaTime * 8, 0.01, 0.2);

    // --- Node Animation ---
    for (let i = 0; i < Config.DIMENSIONS; i++) {
        const node = nodes[i];
        if (!node?.material?.color || !node.userData?.originalPosition) continue;

        const data = node.userData;
        const originalPosition = data.originalPosition;
        const originalColor = new THREE.Color(data.originalColor);
        const originalEmissive = new THREE.Color(data.originalEmissive);

        const isSelected = selectedDimension === node;
        const isHovered = !isSelected && hoveredDimension === node;
        const isLinkedToRihSelected = !isSelected && selectedDimension === rihNode; // If RIH is selected, all dims are "linked"
        const isLinkedToRihHovered = !isSelected && !isLinkedToRihSelected && hoveredDimension === rihNode; // If RIH is hovered

        let targetPosition = originalPosition.clone();
        let targetScale = new THREE.Vector3(1.0, 1.0, 1.0);
        let targetColor = originalColor.clone();
        let targetEmissive = originalEmissive.clone();
        let targetOpacity = 1.0;

        const value = (latestStateVector && latestStateVector.length > i && typeof latestStateVector[i] === 'number') ? latestStateVector[i] : 0;
        const absValue = Math.abs(value);
        const hue = value > 0 ? lerp(0.5, 0.33, absValue) : (value < 0 ? lerp(0.5, 0.66, absValue) : 0.5);
        const saturation = 0.6 + absValue * 0.3;
        const lightness = 0.4 + absValue * 0.2;
        targetColor.setHSL(hue, saturation, lightness);
        targetEmissive.copy(targetColor).multiplyScalar(0.3 + absValue * 0.4);

        targetPosition.z = originalPosition.z + value * (0.3 + integrationParam * 0.5);
        const valueScale = absValue * 0.3;
        const scaleFactor = 1.0 + valueScale + reflexivityParam * 0.2;
        targetScale.set(scaleFactor, scaleFactor, scaleFactor);

        if (isSelected) {
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            targetScale.multiplyScalar(1.3);
            targetPosition.z += 0.1;
            targetOpacity = 1.0;
        } else if (isHovered) {
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            targetScale.multiplyScalar(1.15);
            targetPosition.z += 0.05;
            targetOpacity = 1.0;
        } else if (isLinkedToRihSelected || isLinkedToRihHovered) {
             targetColor.lerp(linkedColor, 0.5);
             targetEmissive.lerp(linkedEmissive, 0.5);
             targetScale.multiplyScalar(1.05);
             targetOpacity = 0.9;
        }

        node.position.lerp(targetPosition, lerpFactor);
        node.scale.lerp(targetScale, lerpFactor);
        node.material.color.lerp(targetColor, lerpFactor);
        if (node.material.emissive) { node.material.emissive.lerp(targetEmissive, lerpFactor); }
        node.material.opacity = lerp(node.material.opacity ?? 1.0, targetOpacity, lerpFactor);
        node.material.transparent = node.material.opacity < 1.0;

        if (!isSelected) { // Rotation only if not selected
             const rotSpeed = deltaTime * (0.05 + reflexivityParam * 0.1 + absValue * 0.2);
             node.rotation.y += rotSpeed;
             node.rotation.x += rotSpeed * 0.5 * Math.sin(time * 0.8 + i);
        }

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
         const originalEmissive = new THREE.Color(rihNode.userData.originalEmissive);
         const baseScaleVal = nodeBaseScale * 1.5; // Renamed to avoid conflict with node.scale
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
         } else if (isHovered) {
             targetColor.copy(nodeHighlightColor);
             targetEmissive.copy(nodeHighlightEmissive);
             targetScale.set(1.2, 1.2, 1.2);
             targetOpacity = 1.0;
         }

         rihNode.position.copy(originalPosition);
         rihNode.scale.lerp(targetScale.multiplyScalar(baseScaleVal), lerpFactor); // Apply base scale multiplier
         rihNode.material.color.lerp(targetColor, lerpFactor);
         if (rihNode.material.emissive) { rihNode.material.emissive.lerp(targetEmissive, lerpFactor); }
         rihNode.material.opacity = lerp(rihNode.material.opacity ?? 1.0, targetOpacity, lerpFactor);
         rihNode.material.transparent = rihNode.material.opacity < 1.0;


         if (!isSelected) { // Rotation only if not selected
            const rotSpeed = deltaTime * (0.1 + rihScore * 0.3 + integrationParam * 0.2);
            rihNode.rotation.y += rotSpeed;
            rihNode.rotation.x += rotSpeed * 0.6 * Math.cos(time * 0.5);
         }
    }

    // --- Update Persistent Edges ---
    edgesData.forEach(edgeItem => {
        const { line, nodeA_idx, nodeB_idx, type } = edgeItem;
        const nodeA = nodes[nodeA_idx]; // Always a dimension node
        const nodeB = (type === 'dim-rih') ? rihNode : nodes[nodeB_idx];

        if (!nodeA || !nodeB || !line.material || !line.geometry || !line.geometry.attributes.position) return;

        // Update edge geometry positions
        const positions = line.geometry.attributes.position.array;
        positions[0] = nodeA.position.x; positions[1] = nodeA.position.y; positions[2] = nodeA.position.z;
        positions[3] = nodeB.position.x; positions[4] = nodeB.position.y; positions[5] = nodeB.position.z;
        line.geometry.attributes.position.needsUpdate = true;
        line.geometry.computeBoundingSphere(); // Important for frustum culling if lines are long

        // Determine metric and param based on edge type
        const metric = (type === 'dim-rih') ? rihScore : avgAffinity;
        const param = (type === 'dim-rih') ? reflexivityParam : integrationParam;

        // Update edge material (color, opacity)
        const isSelectedA = selectedDimension === nodeA;
        const isSelectedB = selectedDimension === nodeB; // nodeB can be rihNode or another dimNode
        const isHoveredA = hoveredDimension === nodeA;
        const isHoveredB = hoveredDimension === nodeB;

        const isEdgeSelected = isSelectedA || isSelectedB;
        const isEdgeHovered = !isEdgeSelected && (isHoveredA || isHoveredB);

        let targetEdgeColor = new THREE.Color().copy(baseEdgeMaterial.color); // Start with base color
        let targetEdgeOpacity = clamp(Math.abs(metric) * 0.4 + param * 0.2, 0.1, 0.6);

        if (isEdgeSelected || isEdgeHovered) {
            targetEdgeColor.copy(edgeHighlightColor);
            targetEdgeOpacity = clamp(targetEdgeOpacity * 1.5 + (isEdgeSelected ? 0.2 : 0.1), 0.5, 0.9);
        } else {
            // Blend edge color between connected nodes' current colors
            const startColor = nodeA.material.color;
            const endColor = nodeB.material.color;
            const blendFactor = clamp(0.5 + metric * 0.5, 0, 1); // Blend based on metric (-1 to 1)
            targetEdgeColor.lerpColors(startColor, endColor, blendFactor);
        }

        line.material.color.lerp(targetEdgeColor, lerpFactor);
        line.material.opacity = lerp(line.material.opacity, targetEdgeOpacity, lerpFactor);
        line.material.transparent = line.material.opacity < 1.0;
    });


   renderer.render(scene, camera);
   labelRenderer.render(scene, camera);
}


/** Handles window resize events for the Syntrometry panel. */
function onWindowResize() {
    if (!threeInitialized || !camera || !renderer || !labelRenderer || !syntrometryContainer) return;
    const width = syntrometryContainer.clientWidth;
    const height = syntrometryContainer.clientHeight;
    if (width <= 0 || height <= 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
}

/** Cleans up Three.js resources used by the Syntrometry visualization. */
export function cleanupThreeJS() {
    if (!threeInitialized && !scene) return; // Skip if already cleaned or never initialized

    window.removeEventListener('resize', debouncedOnWindowResize);
    if (syntrometryContainer) {
         syntrometryContainer.removeEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
         syntrometryContainer.removeEventListener('click', handleSyntrometryClickWrapper, false);
    }

    // Dispose persistent edges
    edgesData.forEach(edgeItem => {
        if (edgeItem.line) {
            if (edgeItem.line.geometry) edgeItem.line.geometry.dispose(); // Dispose cloned geometries
            if (edgeItem.line.material) edgeItem.line.material.dispose(); // Dispose cloned materials
            edgesGroup?.remove(edgeItem.line);
        }
    });
    edgesData = [];

    // Traverse scene for other meshes and labels
    scene?.traverse(object => {
        if (object.isMesh) { // Only dispose node meshes here, lines handled above
            if (object.geometry) object.geometry.dispose(); // Node geometry (shared)
            if (object.material) {
                 if (Array.isArray(object.material)) {
                     object.material.forEach(material => material.dispose());
                 } else {
                     object.material.dispose(); // Node materials (unique)
                 }
            }
        }
         if (object.isCSS2DObject && object.element.parentNode) {
              object.element.parentNode.removeChild(object.element);
         }
    });
    // Shared node geometry is disposed once if nodes array is cleared and no other refs
    if (nodes.length > 0 && nodes[0].geometry) {
        nodes[0].geometry.dispose(); // Assuming all nodes share the same geometry instance initially
    }


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
     if (baseEdgeMaterial) { // Base material for edges
          baseEdgeMaterial.dispose();
          baseEdgeMaterial = null;
     }


    nodes = [];
    edgesGroup = null;
    rihNode = null;
    scene = null;
    camera = null;
    // Keep syntrometryContainer reference for potential re-init, or nullify if app fully closing
    // syntrometryContainer = null;
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
        // console.warn("[Graph Features] Visualization not ready. Returning default [0, 0].");
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
