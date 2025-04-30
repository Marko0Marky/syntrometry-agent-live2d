// js/viz-syntrometry.js

import { Config } from './config.js';
import { clamp, displayError, zeros, lerp } from './utils.js'; // Import lerp

// Assumes THREE, OrbitControls (optional here), CSS2DRenderer are available globally via CDN

export let scene = null;
export let camera = null;
export let renderer = null;
export let labelRenderer = null;
let nodes = []; // Internal array holding dimension node meshes
let edgesGroup = null; // Group to hold edge lines/tubes
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
        // Info panel updates might be handled by the dashboard now, but keep reference if needed
        syntrometryInfoPanel = document.getElementById('dashboard-panel');
        if (!syntrometryContainer) {
            displayError("Syntrometry panel container not found.", true, 'syntrometry-error-message'); // Critical if container missing
            threeInitialized = false;
            return false;
        }
        if (!syntrometryInfoPanel) {
             console.warn("Dashboard panel (for info updates) not found."); // Non-critical warning
        }

        const width = syntrometryContainer.clientWidth;
        const height = syntrometryContainer.clientHeight;
         if (width <= 0 || height <= 0) {
             displayError("Syntrometry panel has zero dimensions. Visualization cannot be rendered.", false, 'syntrometry-error-message');
             // Don't set threeInitialized = false here, wait for potential resize
             return true; // Allow init, rendering might start on resize
         }

        // Scene setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a); // Match CSS --viz-bg
        scene.fog = new THREE.Fog(0x1a1a1a, 4, 10); // Add subtle fog

        // Camera setup
        camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 3.5;

        // Main WebGL Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio); // Adjust for high-DPI displays
        syntrometryContainer.appendChild(renderer.domElement);

        // CSS2D Renderer for Labels
        labelRenderer = new THREE.CSS2DRenderer();
        labelRenderer.setSize(width, height);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        labelRenderer.domElement.style.left = '0px';
        labelRenderer.domElement.style.pointerEvents = 'none'; // Don't interfere with WebGL interactions
        syntrometryContainer.appendChild(labelRenderer.domElement);

        // Lighting
        scene.add(new THREE.AmbientLight(0x606080));
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(1, 1, 1);
        scene.add(dirLight1);
        const dirLight2 = new THREE.DirectionalLight(0x88aaff, 0.4);
        dirLight2.position.set(-1, -0.5, -1);
        scene.add(dirLight2);


        // --- Create Nodes ---
        nodes = []; // Ensure nodes array is fresh
        const nodeGeometry = new THREE.SphereGeometry(nodeBaseScale, 16, 12); // Shared geometry
        const angleStep = (2 * Math.PI) / Config.DIMENSIONS;
        const radius = 1.5; // Radius of the circle layout

        for (let i = 0; i < Config.DIMENSIONS; i++) {
            // Unique material per node for individual color/emissive control
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
                type: 'dimension' // Identify node type
            };
            scene.add(node);
            nodes.push(node);

            // Create and add CSS2D Label
            const labelDiv = document.createElement('div');
            labelDiv.className = 'label'; // Use CSS class for styling
            labelDiv.textContent = `D${i}`; // Shorter label
            const label = new THREE.CSS2DObject(labelDiv);
            label.position.set(0, nodeBaseScale * 1.5, 0); // Position above the node
            node.add(label);
            node.userData.label = label; // Store reference for updates
        }

        // Create RIH Node
        const rihGeometry = new THREE.SphereGeometry(nodeBaseScale * 1.5, 20, 16); // Slightly larger
        const rihMaterial = new THREE.MeshPhongMaterial({ color: 0xff4444, emissive: 0x331111, specular: 0x888888, shininess: 50 });
        rihNode = new THREE.Mesh(rihGeometry, rihMaterial);
        rihNode.position.set(0, 0, 0); // Center position
        rihNode.userData = {
            originalColor: rihMaterial.color.getHex(),
            originalEmissive: rihMaterial.emissive.getHex(),
            originalPosition: new THREE.Vector3(0, 0, 0),
            type: 'rih_node',
            label: null // RIH node might not need a visible label
        };
        scene.add(rihNode);

        // --- Create Edge Group and Base Material ---
        edgesGroup = new THREE.Group();
        scene.add(edgesGroup);
        baseEdgeMaterial = new THREE.LineBasicMaterial({
            vertexColors: false, // Use single color per line
            transparent: true,
            opacity: 0.5,
            color: 0x888888 // Default edge color
         });

        // --- Setup Interactions and Resize Listener ---
        setupSyntrometryInteraction();
        window.addEventListener('resize', onWindowResize, false);

        console.log('Syntrometry Three.js initialized successfully.');
        threeInitialized = true;
        return true;
    } catch (e) {
        displayError(`Error initializing Syntrometry Three.js: ${e.message}`, false, 'syntrometry-error-message');
        console.error("Syntrometry Three.js Init Error:", e);
        cleanupThreeJS(); // Attempt cleanup on error
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
    // Ensure interactable objects are defined
    const getInteractableObjects = () => [...nodes, rihNode].filter(Boolean);

    // Clear previous listeners if any
    syntrometryContainer.removeEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
    syntrometryContainer.removeEventListener('click', handleSyntrometryClickWrapper, false);

    // Add new listeners
    syntrometryContainer.addEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
    syntrometryContainer.addEventListener('click', handleSyntrometryClickWrapper, false);

    // Initial update for info panel (might show default state)
    updateSyntrometryInfoPanel();
    // console.log("Syntrometry interaction setup complete."); // Reduce noise
}

/** Handles mouse movement over the Syntrometry canvas for hover effects. */
function onSyntrometryMouseMove(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects || interactableObjects.length === 0) return;

    // Use a single Raycaster instance if possible, created outside the handler
    let raycaster = new THREE.Raycaster();
    let mouse = new THREE.Vector2();

    const rect = syntrometryContainer.getBoundingClientRect();
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, false); // `false` for non-recursive check

    let newHoveredObject = null;
    if (intersects.length > 0 && intersects[0].object?.userData) {
        newHoveredObject = intersects[0].object; // Get the closest intersected object with userData
    }

    // Update hoveredDimension state, only if not currently selecting something else
    if (!selectedDimension) {
        if (newHoveredObject !== hoveredDimension) {
             hoveredDimension = newHoveredObject;
             updateSyntrometryInfoPanel(); // Update info panel on hover change
        }
    } else {
         // If selecting, clear hover unless hovering the selected object itself
         if (hoveredDimension && hoveredDimension !== selectedDimension) {
             hoveredDimension = null;
             updateSyntrometryInfoPanel();
         }
    }

    // Update cursor style
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

    // Toggle selection
    if (clickedObject) {
        if (selectedDimension === clickedObject) {
            selectedDimension = null; // Deselect if clicking the selected object again
            hoveredDimension = clickedObject; // Re-enable hover effect immediately
        } else {
            selectedDimension = clickedObject; // Select the new object
            hoveredDimension = null; // Clear hover when selecting
        }
    } else {
        selectedDimension = null; // Deselect if clicking the background
        // Hover might be updated by mousemove immediately after
    }

    // Update UI
    syntrometryContainer.style.cursor = (selectedDimension || hoveredDimension) ? 'pointer' : 'default';
    updateSyntrometryInfoPanel(); // Update info based on new selection state
}


/** Updates the Syntrometry info panel (now likely part of the main dashboard). */
export function updateSyntrometryInfoPanel() {
    // This function is less critical now as the main dashboard displays core metrics.
    // It primarily serves to show details *specific* to the hovered/selected dimension node
    // or the RIH node in the Syntrometry visualization, perhaps in a tooltip or a dedicated small panel if desired.
    // For now, we'll just log the interaction target for debugging.

    let displayObject = selectedDimension || hoveredDimension; // Prioritize selected

    if (displayObject?.userData) {
        const data = displayObject.userData;
        if (data.type === 'rih_node') {
            // Example: Could update a tooltip with `RIH: ${latestRihScore.toFixed(3)}`
            // console.log(`Info Panel Focus: RIH Node (Score: ${latestRihScore.toFixed(3)})`); // Reduce noise
        } else if (data.type === 'dimension' && data.dimensionIndex !== undefined) {
            const dimIndex = data.dimensionIndex;
            const value = (latestStateVector && latestStateVector.length > dimIndex) ? latestStateVector[dimIndex] : NaN;
            // Example: Could update a tooltip with `Dim ${dimIndex}: ${value.toFixed(3)}`
            // console.log(`Info Panel Focus: Dimension ${dimIndex} (Value: ${value.toFixed(3)})`); // Reduce noise
        }
    } else {
        // Example: Clear tooltip or dedicated info area
        // console.log("Info Panel Focus: None"); // Reduce noise
    }
}


/**
 * Updates the Three.js visualization based on the latest simulation state.
 * Animates nodes and edges.
 * @param {number} deltaTime Time since the last frame in seconds.
 * @param {number[]} stateVector The current core state vector (first Config.DIMENSIONS elements).
 * @param {number} rihScore The current RIH score.
 * @param {number[]} affinities Array of affinity scores between cascade levels.
 * @param {number} integrationParam Current agent integration parameter.
 * @param {number} reflexivityParam Current agent reflexivity parameter.
 * @param {Array<Array<number>>} cascadeHistory Nested array representing cascade levels.
 * @param {string} context Current simulation context message.
 */
export function updateThreeJS(deltaTime, stateVector, rihScore, affinities, integrationParam, reflexivityParam, cascadeHistory, context) {
    if (!threeInitialized || !scene || !camera || !renderer || !labelRenderer || !nodes || nodes.length === 0 || !rihNode || !edgesGroup || !baseEdgeMaterial) return;

    // Cache latest state for info panel and feature calculation
    latestStateVector = stateVector;
    latestRihScore = rihScore;
    latestAffinities = affinities;
    latestCascadeHistory = cascadeHistory;
    latestContext = context;
    latestIntegrationParam = integrationParam;
    latestReflexivityParam = reflexivityParam;

    const avgAffinity = (affinities && affinities.length > 0 ? affinities.reduce((a,b)=>a+b,0)/affinities.length : 0);
    const time = performance.now() * 0.001; // Use performance.now for smoother animation time

    // --- Edge Management ---
    // PERFORMANCE NOTE: Recreating edges every frame is expensive.
    // For better performance:
    // 1. Create Line segments once in initThreeJS.
    // 2. In updateThreeJS, update only `edge.material.color`, `edge.material.opacity`.
    // 3. If nodes move significantly, update `geometry.attributes.position`.
    // Using TubeGeometry makes step 3 harder; consider LineSegments for performance.
    // Current implementation prioritizes visual fidelity over absolute performance.

    // Clear old edges
    while(edgesGroup.children.length > 0){
        const edge = edgesGroup.children[0];
        if (edge.geometry) edge.geometry.dispose();
        // If materials are cloned, they need disposal too
        if (edge.material) edge.material.dispose();
        edgesGroup.remove(edge);
    }

    // --- Node Animation & Highlighting ---
    const nodeHighlightColor = new THREE.Color(0xffffff);
    const nodeHighlightEmissive = new THREE.Color(0xffffff).multiplyScalar(0.5);
    const linkedColor = new THREE.Color(0xaaaaee); // Color for nodes linked to selection/hover
    const linkedEmissive = new THREE.Color(0xaaaaee).multiplyScalar(0.3);
    const edgeHighlightColor = new THREE.Color(0x00aaff);
    const lerpFactor = clamp(deltaTime * 8, 0.01, 0.2); // Faster lerp based on deltaTime

    // Process Dimension Nodes
    for (let i = 0; i < Config.DIMENSIONS; i++) {
        const node = nodes[i];
        if (!node?.material?.color || !node.userData?.originalPosition) continue;

        const data = node.userData;
        const originalPosition = data.originalPosition;
        const originalColor = new THREE.Color(data.originalColor); // Use cached hex
        const originalEmissive = new THREE.Color(data.originalEmissive);

        const isSelected = selectedDimension === node;
        const isHovered = !isSelected && hoveredDimension === node;
        // Check if this node is linked to the selected/hovered RIH node (basic check)
        const isLinkedToRihSelected = !isSelected && selectedDimension === rihNode;
        const isLinkedToRihHovered = !isSelected && !isLinkedToRihSelected && hoveredDimension === rihNode;

        let targetPosition = originalPosition.clone();
        let targetScale = new THREE.Vector3(1.0, 1.0, 1.0);
        let targetColor = originalColor.clone();
        let targetEmissive = originalEmissive.clone();
        let targetOpacity = 1.0;

        // 1. Base state determined by dimension value
        const value = (latestStateVector && latestStateVector.length > i && typeof latestStateVector[i] === 'number') ? latestStateVector[i] : 0;
        const absValue = Math.abs(value);
        // Color based on value (positive->greenish, negative->blueish)
        const hue = value > 0 ? lerp(0.5, 0.33, absValue) : (value < 0 ? lerp(0.5, 0.66, absValue) : 0.5); // Grey towards Green or Blue
        const saturation = 0.6 + absValue * 0.3;
        const lightness = 0.4 + absValue * 0.2;
        targetColor.setHSL(hue, saturation, lightness);
        targetEmissive.copy(targetColor).multiplyScalar(0.3 + absValue * 0.4); // Emissive scales with value

        // 2. Apply metric influences (Integration/Reflexivity) to position/scale
        // More integration -> nodes move outwards more based on value
        // More reflexivity -> nodes move less based on value, maybe pulse more?
        targetPosition.z = originalPosition.z + value * (0.3 + integrationParam * 0.5);
        const valueScale = absValue * 0.3;
        const scaleFactor = 1.0 + valueScale + reflexivityParam * 0.2; // Reflexivity adds base size?
        targetScale.set(scaleFactor, scaleFactor, scaleFactor);

        // 3. Apply highlight/linked state (overrides base color/emissive/scale)
        if (isSelected) {
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            targetScale.multiplyScalar(1.3);
            targetPosition.z += 0.1; // Bring slightly forward
            targetOpacity = 1.0;
        } else if (isHovered) {
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            targetScale.multiplyScalar(1.15);
            targetPosition.z += 0.05;
            targetOpacity = 1.0;
        } else if (isLinkedToRihSelected || isLinkedToRihHovered) {
             targetColor.lerp(linkedColor, 0.5); // Blend towards linked color
             targetEmissive.lerp(linkedEmissive, 0.5);
             targetScale.multiplyScalar(1.05);
             targetOpacity = 0.9;
        }

        // --- Interpolate towards target state ---
        node.position.lerp(targetPosition, lerpFactor);
        node.scale.lerp(targetScale, lerpFactor);
        node.material.color.lerp(targetColor, lerpFactor);
        if (node.material.emissive) { node.material.emissive.lerp(targetEmissive, lerpFactor); }
        node.material.opacity = lerp(node.material.opacity ?? 1.0, targetOpacity, lerpFactor);
        node.material.transparent = node.material.opacity < 1.0;

        // Rotation based on value and reflexivity (if not selected)
        if (!isSelected) {
             const rotSpeed = deltaTime * (0.05 + reflexivityParam * 0.1 + absValue * 0.2);
             node.rotation.y += rotSpeed;
             node.rotation.x += rotSpeed * 0.5 * Math.sin(time * 0.8 + i);
        }

        // --- Create Edges (Dimension -> Dimension & Dimension -> RIH) ---
        // Recreated each frame for simplicity, see performance note above.
        for (let j = i + 1; j < Config.DIMENSIONS; j++) { // Dim -> Dim
            const nodeJ = nodes[j];
            if (!nodeJ?.position || !nodeJ.userData || !nodeJ.material) continue;
            createEdge(node, nodeJ, avgAffinity, integrationParam, edgeHighlightColor);
        }
        if (rihNode?.position && rihNode.userData && rihNode.material) { // Dim -> RIH
            createEdge(node, rihNode, rihScore, reflexivityParam, edgeHighlightColor);
        }

        // Update Label Position and Visibility
        if (node.userData.label) {
             const label = node.userData.label;
             // Position label relative to scaled node size
             label.position.y = (nodeBaseScale * 1.5) * node.scale.y;
             // Fade label based on node opacity (optional)
             label.element.style.opacity = clamp(node.material.opacity ?? 1.0, 0.2, 1.0);
             label.element.style.display = label.element.style.opacity < 0.25 ? 'none' : 'block';
        }
   } // End of dimension node loop

    // --- Animate RIH Node ---
    if (rihNode?.material?.color && rihNode.userData?.originalPosition) {
         const originalPosition = rihNode.userData.originalPosition;
         const originalColor = new THREE.Color(rihNode.userData.originalColor);
         const originalEmissive = new THREE.Color(rihNode.userData.originalEmissive);
         const baseScale = nodeBaseScale * 1.5; // Base size of RIH node
         const isSelected = selectedDimension === rihNode;
         const isHovered = !isSelected && hoveredDimension === rihNode;

         let targetColor = originalColor.clone();
         let targetEmissive = originalEmissive.clone();
         let targetScale = new THREE.Vector3(1.0, 1.0, 1.0); // Scale multiplier
         let targetOpacity = 1.0;

         // 1. Base state influenced by RIH score
         const rihFactor = clamp(rihScore, 0, 1);
         targetColor.lerp(new THREE.Color(1, 1, 1), rihFactor * 0.6); // Blend towards white based on RIH
         targetEmissive.copy(targetColor).multiplyScalar(clamp(rihFactor * 0.7 + Math.abs(avgAffinity) * 0.2, 0.2, 0.8));
         const rihScaleFactor = 1.0 + rihFactor * 0.5 + reflexivityParam * 0.1; // Scale increases with RIH
         // Pulse effect based on RIH
         const pulseSpeed = 2.0 + rihFactor * 4.0;
         const pulseAmount = 0.15 * rihFactor;
         const pulse = (Math.sin(time * pulseSpeed) * 0.5 + 0.5) * pulseAmount;
         targetScale.set(rihScaleFactor + pulse, rihScaleFactor + pulse, rihScaleFactor + pulse);
         targetOpacity = 0.8 + rihFactor * 0.2;

         // 2. Highlight state overrides base
         if (isSelected) {
             targetColor.copy(nodeHighlightColor);
             targetEmissive.copy(nodeHighlightEmissive);
             targetScale.set(1.4, 1.4, 1.4); // Fixed highlight scale
             targetOpacity = 1.0;
         } else if (isHovered) {
             targetColor.copy(nodeHighlightColor);
             targetEmissive.copy(nodeHighlightEmissive);
             targetScale.set(1.2, 1.2, 1.2);
             targetOpacity = 1.0;
         }

         // Apply Interpolation
         rihNode.position.copy(originalPosition); // RIH node doesn't move
         rihNode.scale.lerp(targetScale.multiplyScalar(baseScale), lerpFactor); // Apply base scale *after* multiplier
         rihNode.material.color.lerp(targetColor, lerpFactor);
         if (rihNode.material.emissive) { rihNode.material.emissive.lerp(targetEmissive, lerpFactor); }
         rihNode.material.opacity = lerp(rihNode.material.opacity ?? 1.0, targetOpacity, lerpFactor);
         rihNode.material.transparent = rihNode.material.opacity < 1.0;


         // Rotation based on RIH and integration (if not selected)
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
     const isSelectedA = selectedDimension === nodeA;
     const isSelectedB = selectedDimension === nodeB;
     const isHoveredA = hoveredDimension === nodeA;
     const isHoveredB = hoveredDimension === nodeB;
     const isEdgeSelected = isSelectedA || isSelectedB;
     const isEdgeHovered = !isEdgeSelected && (isHoveredA || isHoveredB);

     // Use cloned material for individual edge styling
     const edgeMaterial = baseEdgeMaterial.clone();
     let targetEdgeColor = edgeMaterial.color.clone(); // Start with base color
     let targetEdgeOpacity = clamp(Math.abs(metric) * 0.4 + param * 0.2, 0.1, 0.6); // Base opacity

     if (isEdgeSelected || isEdgeHovered) {
          targetEdgeColor.copy(highlightColor);
          targetEdgeOpacity = clamp(targetEdgeOpacity * 1.5 + (isEdgeSelected ? 0.2 : 0.1), 0.5, 0.9);
     } else {
         // Blend edge color between connected nodes' current colors
         const startColor = nodeA.material.color;
         const endColor = nodeB.material.color;
         const blendFactor = clamp(0.5 + metric * 0.5, 0, 1); // Blend based on metric (-1 to 1)
         targetEdgeColor.lerpColors(startColor, endColor, blendFactor);
     }

     edgeMaterial.color = targetEdgeColor;
     edgeMaterial.opacity = targetEdgeOpacity;

     // Create geometry (simple line)
     const geometry = new THREE.BufferGeometry();
     const positions = new Float32Array([
         nodeA.position.x, nodeA.position.y, nodeA.position.z,
         nodeB.position.x, nodeB.position.y, nodeB.position.z
     ]);
     geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

     const edgeLine = new THREE.Line(geometry, edgeMaterial);
     edgesGroup.add(edgeLine);
}


/** Handles window resize events for the Syntrometry panel. */
function onWindowResize() {
    if (!threeInitialized || !camera || !renderer || !labelRenderer || !syntrometryContainer) return;
    const width = syntrometryContainer.clientWidth;
    const height = syntrometryContainer.clientHeight;
    if (width <= 0 || height <= 0) return; // Ignore resize if container is hidden

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
    // No need to re-render immediately, animation loop will handle it
}

/** Cleans up Three.js resources used by the Syntrometry visualization. */
export function cleanupThreeJS() {
    if (!threeInitialized && !scene) return; // Skip if already cleaned or never initialized
    // console.log("Cleaning up Syntrometry Three.js..."); // Reduce noise

    window.removeEventListener('resize', onWindowResize);
    if (syntrometryContainer) {
         syntrometryContainer.removeEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
         syntrometryContainer.removeEventListener('click', handleSyntrometryClickWrapper, false);
    }

    // Dispose geometries, materials, textures, remove objects from scene
    scene?.traverse(object => {
        if (object.isMesh || object.isLine) {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                 // If material is an array, dispose each element
                 if (Array.isArray(object.material)) {
                     object.material.forEach(material => material.dispose());
                 } else {
                     object.material.dispose();
                 }
            }
        }
         // Dispose CSS2DObjects' elements
         if (object.isCSS2DObject && object.element.parentNode) {
              object.element.parentNode.removeChild(object.element);
         }
    });

    if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss(); // Release WebGL context
        if (renderer.domElement && syntrometryContainer?.contains(renderer.domElement)) {
             syntrometryContainer.removeChild(renderer.domElement);
        }
        renderer = null;
    }
     if (labelRenderer?.domElement?.parentNode) {
         labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
         labelRenderer = null;
     }
     if (baseEdgeMaterial) {
          baseEdgeMaterial.dispose();
          baseEdgeMaterial = null;
     }


    // Clear arrays and references
    nodes = [];
    edgesGroup = null; // Group children are already traversed and disposed
    rihNode = null;
    scene = null;
    camera = null;
    syntrometryContainer = null;
    syntrometryInfoPanel = null;
    hoveredDimension = null;
    selectedDimension = null;
    latestStateVector = null;

    threeInitialized = false;
    // console.log("Syntrometry Three.js cleanup complete."); // Reduce noise
}

// --- Wrapper functions for event listeners to pass interactable objects ---
function handleSyntrometryMouseMoveWrapper(event) {
     const interactableObjects = [...nodes, rihNode].filter(Boolean); // Ensure objects exist
     onSyntrometryMouseMove(event, interactableObjects);
     // updateSyntrometryInfoPanel(); // Update info panel on mouse move (if not selecting) - might be too frequent
}

function handleSyntrometryClickWrapper(event) {
     const interactableObjects = [...nodes, rihNode].filter(Boolean);
     onSyntrometryClick(event, interactableObjects);
     // updateSyntrometryInfoPanel(); // Update info panel after click changes selection
}


// --- Exported calculateGraphFeatures Function ---
/**
 * Calculates numerical features from the Syntrometry graph visualization state.
 * Uses internal module variables `nodes` and `rihNode`.
 * @returns {number[]} An array containing graph features: [varianceZ, avgDistToRih], or [0, 0] if unavailable.
 */
export function calculateGraphFeatures() {
    // Check if visualization is initialized and nodes are ready
    if (!threeInitialized || !Array.isArray(nodes) || nodes.length !== Config.DIMENSIONS || !rihNode?.position) {
        // console.warn("[Graph Features] Visualization not ready. Returning default [0, 0]."); // Reduce noise
        return [0.0, 0.0]; // Return default values if viz not ready
    }

    try {
        // Access module-scoped variables directly
        const dimensionNodePositions = nodes.map(node => node.position);
        const rihPosition = rihNode.position;

        // 1. Variance of Z-positions (measure of "spread" along the depth axis)
        const zPositions = dimensionNodePositions.map(pos => pos.z);
        let meanZ = 0, varianceZ = 0;
        if (zPositions.length > 0) {
            meanZ = zPositions.reduce((sum, z) => sum + z, 0) / zPositions.length;
            varianceZ = zPositions.reduce((sum, z) => sum + (z - meanZ) ** 2, 0) / zPositions.length;
        }

        // 2. Average Distance to RIH Node (measure of overall "focus" or "dispersion")
        let avgDistToRih = 0;
        if (dimensionNodePositions.length > 0) {
            const distances = dimensionNodePositions.map(pos => pos.distanceTo(rihPosition));
            avgDistToRih = distances.reduce((sum, d) => sum + d, 0) / distances.length;
        }

        // Clamp features to reasonable ranges to prevent extreme values affecting the agent
        const clampedVarZ = clamp(varianceZ, 0, 5.0);
        const clampedAvgDist = clamp(avgDistToRih, 0, 5.0); // Assuming max reasonable distance is ~5 units

        return [clampedVarZ, clampedAvgDist];

    } catch (e) {
        console.error("Error calculating graph features in viz-syntrometry:", e);
        return [0.0, 0.0]; // Return default on error
    }
}
