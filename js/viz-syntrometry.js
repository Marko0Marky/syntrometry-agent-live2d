// js/viz-syntrometry.js

import { Config } from './config.js';
import { clamp, displayError, zeros, lerp } from './utils.js'; // Import lerp

// Assumes THREE, OrbitControls, CSS2DRenderer are available globally via CDN
// We need CSS2DRenderer for labels here too

export let scene = null;
export let camera = null;
export let renderer = null;
export let labelRenderer = null; // Add label renderer for Syntrometry panel
let nodes = []; // Dimension nodes
let edgesGroup = null;
export let rihNode = null; // Export rihNode for potential external use if needed (though not planned now)
export let threeInitialized = false; // Export initialization flag

let syntrometryContainer = null; // Store the container element
let syntrometryInfoPanel = null; // Store the metrics/info panel element

// --- State variables for interaction ---
let hoveredDimension = null; // Track the currently hovered dimension node
let selectedDimension = null; // Track the currently clicked/selected dimension node

// Variables to hold the latest simulation data for the info panel (updated by updateThreeJS)
let latestStateVector = null; // Full state vector array from environment
let latestRihScore = 0;
let latestAffinities = []; // Affinities between cascade layers
let latestCascadeHistory = []; // Cascade history from agent (used by info panel)
let latestContext = "Initializing..."; // Environment context string

// --- Module-scoped base material for edges (initialized once) ---
// Use LineBasicMaterial, which does NOT have 'emissive'
let baseEdgeMaterial = null;


const nodeBaseScale = 0.08; // Base size of the nodes


/**
 * Initializes the Three.js visualization for the Syntrometry panel.
 * @returns {boolean} True if initialization was successful, false otherwise.
 */
export function initThreeJS() {
    // Check if Three.js and CSS2DRenderer are loaded
    if (typeof THREE === 'undefined' || typeof THREE.CSS2DRenderer === 'undefined') {
        displayError("Three.js or CSS2DRenderer not loaded for Syntrometry panel.", false, 'error-message');
        threeInitialized = false; // Ensure flag is false on failure
        return false;
    }
    try {
        // Get the container and info panel elements
        syntrometryContainer = document.getElementById('syntrometry-panel');
        syntrometryInfoPanel = document.getElementById('metrics'); // Repurposing the metrics div


        if (!syntrometryContainer || !syntrometryInfoPanel) {
            displayError("Syntrometry panel container or info panel not found.", false, 'error-message');
            threeInitialized = false; // Ensure flag is false on failure
            return false;
        }

        const width = syntrometryContainer.clientWidth;
        const height = syntrometryContainer.clientHeight;
         if (width <= 0 || height <= 0) {
             displayError("Syntrometry panel has zero dimensions.", false, 'error-message');
             threeInitialized = false; // Ensure flag is false on failure
             return false;
         }


        // Create scene, camera, and renderers
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a); // Dark background
        camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 3.5; // Position camera

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        syntrometryContainer.appendChild(renderer.domElement); // Add WebGL renderer to container

        // CSS2D Renderer for labels
        labelRenderer = new THREE.CSS2DRenderer(); // Use separate renderer for this panel
        labelRenderer.setSize(width, height);
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        labelRenderer.domElement.style.left = '0px';
        labelRenderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through labels
        syntrometryContainer.appendChild(labelRenderer.domElement); // Add label renderer

        // Create nodes (representing dimensions)
        const nodeGeometry = new THREE.SphereGeometry(nodeBaseScale, 16, 12); // Sphere geometry
        const angleStep = (2 * Math.PI) / Config.DIMENSIONS; // Angle between nodes on a circle
        const radius = 1.5; // Radius of the circle layout

        nodes = []; // Clear nodes array just in case
        for (let i = 0; i < Config.DIMENSIONS; i++) {
            // Material for nodes (MeshPhongMaterial supports emissive)
            const material = new THREE.MeshPhongMaterial({ color: 0x00ff00, emissive: 0x113311, specular: 0x555555, shininess: 30 });
            const node = new THREE.Mesh(nodeGeometry, material);

            // Position nodes in a circle
            const x = Math.cos(i * angleStep) * radius;
            const y = Math.sin(i * angleStep) * radius;
            const z = 0; // Start at z=0
            node.position.set(x, y, z);


            // Store original material properties and position for animation/highlighting
            node.userData.originalColor = material.color.getHex();
            node.userData.originalEmissive = material.emissive ? material.emissive.getHex() : 0x000000; // Default black emissive
            node.userData.originalPosition = new THREE.Vector3(x, y, z); // Store original position
            node.userData.dimensionIndex = i; // Store the index for identification
            node.userData.type = 'dimension'; // Add type for consistency


            scene.add(node); // Add node to scene
            nodes.push(node); // Store node reference

            // Create and add CSS2D label
            const labelDiv = document.createElement('div');
            labelDiv.className = 'label'; // Use defined CSS class
            labelDiv.textContent = `Dim ${i + 1}`; // Initial label text
            const label = new THREE.CSS2DObject(labelDiv);
            const labelOffset = nodeBaseScale * 1.5; // Position label above node
            label.position.set(0, labelOffset, 0); // Position relative to node
            node.add(label); // Add label as child of the node
            node.userData.label = label; // Store label reference
        }

        // Create the RIH node (central node)
        const rihGeometry = new THREE.SphereGeometry(nodeBaseScale * 1.5, 20, 16);
        const rihMaterial = new THREE.MeshPhongMaterial({ color: 0xff4444, emissive: 0x331111, specular: 0x888888, shininess: 50 });
        rihNode = new THREE.Mesh(rihGeometry, rihMaterial);
        const rihPosition = new THREE.Vector3(0, 0, 0); // Center position
        rihNode.position.copy(rihPosition);

        // Store original material properties and position for highlighting
        rihNode.userData.originalColor = rihMaterial.color.getHex();
        rihNode.userData.originalEmissive = rihMaterial.emissive ? rihMaterial.emissive.getHex() : 0x000000; // Default black emissive
        rihNode.userData.originalPosition = rihPosition.clone(); // Store original position
        rihNode.userData.type = 'rih_node'; // Identify type for interaction
        rihNode.userData.label = null; // No label


        scene.add(rihNode); // Add RIH node to scene

        // Group for edges to easily remove and re-add them
        edgesGroup = new THREE.Group();
        scene.add(edgesGroup);

        // --- Initialize base edge material once ---
         // Use LineBasicMaterial, which does NOT have 'emissive' or 'specular'
         baseEdgeMaterial = new THREE.LineBasicMaterial({
            vertexColors: false, // Vertex colors handled manually if needed
            transparent: true,
            opacity: 0.5, // Base opacity
            color: 0x888888 // Base color (used when not highlighting)
         });


        // Setup interaction handlers (mousemove, click)
        setupSyntrometryInteraction();

        // Add window resize listener
        window.addEventListener('resize', onWindowResize, false);

        console.log('Syntrometry Three.js initialized successfully.');
        threeInitialized = true;
        return true;
    } catch (e) {
        displayError(`Error initializing Syntrometry Three.js: ${e.message}`, false, 'error-message');
        console.error("Syntrometry Three.js Init Error:", e);
        threeInitialized = false; // Ensure flag is false on failure
        return false;
    }
}


// Sets up raycasting and event listeners for interacting with Syntrometry nodes
function setupSyntrometryInteraction() {
    if (!syntrometryContainer || !syntrometryInfoPanel) return; // Check if elements are available

    // List of objects to check for intersection (nodes + RIH node)
    const interactableObjects = [...nodes, rihNode].filter(obj => obj !== null && obj !== undefined); // Ensure objects exist


    // Add event listeners for mouse movements and clicks
    // Using named functions for proper removal in cleanup
    syntrometryContainer.addEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
    syntrometryContainer.addEventListener('click', handleSyntrometryClickWrapper, false);

     // Initial call to update info panel (will show default state)
     updateSyntrometryInfoPanel();

     console.log("Syntrometry interaction setup complete.");
}

// Handles mouse movement over the Syntrometry graph container
function onSyntrometryMouseMove(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects) return; // Removed raycaster, mouse params - use local ones


    let raycaster = new THREE.Raycaster();
    let mouse = new THREE.Vector2();


    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = syntrometryContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update the picking ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);

    // Find objects intersecting the ray
    const intersects = raycaster.intersectObjects(interactableObjects, false);

    let newHoveredObject = null;
    if (intersects.length > 0) {
         // Get the first intersected object (closest to camera) that has userData
         for(let i = 0; i < intersects.length; i++) {
             if(intersects[i].object?.userData) { // Safety check
                 newHoveredObject = intersects[i].object;
                 break; // Found a valid interactive object
             }
         }
    }

    // Update hoveredDimension state *only if it's different* and nothing is selected
    // We only update `hoveredDimension` here. The animation loop will call `updateSyntrometryInfoPanel`
    // which will then react to this change in state.
    if (!selectedDimension && newHoveredObject !== hoveredDimension) {
        hoveredDimension = newHoveredObject;
        // Animation loop calls updateSyntrometryInfoPanel
    } else if (!selectedDimension && !newHoveredObject && hoveredDimension !== null) {
         // Case where mouse moves off all objects and nothing is selected
         hoveredDimension = null;
         // Animation loop calls updateSyntrometryInfoPanel
    }

    // Update cursor based on whether *any* interactive object is currently hovered or selected
    if (selectedDimension || hoveredDimension) {
        syntrometryContainer.style.cursor = 'pointer';
    } else {
        syntrometryContainer.style.cursor = 'default';
    }
}

// Handles mouse clicks on the Syntrometry graph container
function onSyntrometryClick(event, interactableObjects) {
    if (!threeInitialized || !camera || !syntrometryContainer || !interactableObjects) return; // Removed raycaster, mouse params

    let raycaster = new THREE.Raycaster();
    let mouse = new THREE.Vector2();


     // Recalculate mouse position and ray (in case mousemove was skipped)
     const rect = syntrometryContainer.getBoundingClientRect();
     mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
     mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
     raycaster.setFromCamera(mouse, camera);


    // Find objects intersected by the click ray
    const intersects = raycaster.intersectObjects(interactableObjects, false);

    if (intersects.length > 0) {
         // Get the first intersected object that has userData
        let clickedObject = null;
         for(let i = 0; i < intersects.length; i++) {
             if(intersects[i].object?.userData) { // Safety check
                 clickedObject = intersects[i].object;
                 break; // Found a valid interactive object
             }
         }


        // If we clicked an interactive object
        if (clickedObject) {

             // If we clicked the object that is already selected, deselect it
             if (selectedDimension === clickedObject) {
                 selectedDimension = null;
                 // Revert cursor to default if nothing is hovered either
                 if (!hoveredDimension) {
                      syntrometryContainer.style.cursor = 'default';
                 }
             } else {
                  // Select the new object
                  selectedDimension = clickedObject;
                  // Keep pointer cursor while something is selected
                  syntrometryContainer.style.cursor = 'pointer';
             }

             // Animation loop will react to the state change (selectedDimension, hoveredDimension)


        } else {
             // Clicked on a non-interactive Three.js object within the scene?
             // Treat as a click on empty space: clear selection.
             selectedDimension = null;
             // Revert cursor to default if nothing is hovered
             if (!hoveredDimension) {
                 syntrometryContainer.style.cursor = 'default';
             }
             // Animation loop will react
        }

    } else {
         // Clicked on empty space - clear selection
         selectedDimension = null;
         // Revert cursor to default if nothing is hovered
         if (!hoveredDimension) {
             syntrometryContainer.style.cursor = 'default';
         }
         // Animation loop will react
    }
    // The animation loop calls updateSyntrometryInfoPanel and updateThreeJS every frame,
    // which will now react to the updated `selectedDimension` state variable.
}


/**
 * Updates the content of the Syntrometry info panel based on the currently selected, hovered,
 * or latest simulation data. Reads state variables (selectedDimension, hoveredDimension,
 * latest...) and latest simulation data stored in module scope.
 * This function is called every frame by the main animation loop in app.js.
 */
export function updateSyntrometryInfoPanel() { // No arguments needed anymore
    if (!syntrometryInfoPanel) return; // Ensure the info panel element exists

    let displayObject = null; // The object whose data we will display

    // Prioritize selected object over hovered object
    if (selectedDimension?.userData) { // Safety check userData
         displayObject = selectedDimension;
    } else if (hoveredDimension?.userData) { // Safety check userData
         displayObject = hoveredDimension;
    }

    // If we have an object to display information for
    if (displayObject && displayObject.userData) {
        const data = displayObject.userData; // Data stored in the object's userData
        let infoHtml = '';

        if (data.type === 'rih_node') {
            // Display info for the RIH node
             infoHtml = `
                <h3>Reflexive Integration (RIH)</h3>
                <p>Central coherence/awareness metric.</p>
                <p>Based on correlations across cascade levels.</p>
                <p><i>Updates dynamically based on simulation.</i></p>
                <p><span class="simulated-data">Current RIH: ${(latestRihScore * 100).toFixed(1)}%</span></p>
                <p><span class="simulated-data">Average Affinity: ${(latestAffinities && latestAffinities.length > 0 ? latestAffinities.reduce((a,b)=>a+b,0)/latestAffinities.length : 0).toFixed(2)}</span></p>
             `;

        } else if (data.type === 'dimension' && data.dimensionIndex !== undefined) { // Check type and index
             // Display info for a dimension node
             const dimIndex = data.dimensionIndex;
             const initialValue = (latestStateVector && latestStateVector.length > dimIndex) ? latestStateVector[dimIndex] : 0;
             // Assuming affinities array matches dimension count and represents affinity from this dim to the *next* level's corresponding position
             // In the current sim, affinity is calculated BETWEEN levels, so affinities[i] is the affinity from level i to i+1.
             // Let's try to display the value of this dimension's state across the *last* cascade level it participated in.
             let finalCascadeValue = null;
             if (latestCascadeHistory && latestCascadeHistory.length > 0) {
                 // Find the latest level where this dimension's original index is valid
                 for(let levelIndex = latestCascadeHistory.length - 1; levelIndex >= 0; levelIndex--) {
                     const level = latestCascadeHistory[levelIndex];
                     // Ensure level is valid array and index is within bounds
                     if (level && Array.isArray(level) && level.length > dimIndex && level[dimIndex] !== undefined && level[dimIndex] !== null) {
                          finalCascadeValue = level[dimIndex];
                          break; // Found the latest valid value
                     }
                 }
             }
              const finalCascadeValueDisplay = finalCascadeValue !== null ? finalCascadeValue.toFixed(3) : 'N/A';


             infoHtml = `
                <h3>Dimension ${dimIndex + 1}</h3>
                <p>An abstract dimension in the state vector.</p>
                <p>Value influenced by environment emotions and internal dynamics.</p>
                <p><i>Updates dynamically based on simulation.</i></p>
                <p><span class="simulated-data">Initial Value: ${initialValue.toFixed(3)}</span></p>
                <p><span class="simulated-data">Final Cascade Value: ${finalCascadeValueDisplay}</span></p>
             `;
             // Optional: Add info about this dimension's value in all cascade levels
             if (latestCascadeHistory && latestCascadeHistory.length > 0) {
                  infoHtml += `<p><b>Cascade Values:</b></p><ul>`;
                  latestCascadeHistory.forEach((level, levelIndex) => {
                       // Ensure level is valid array and index is within bounds
                       if (level && Array.isArray(level) && level.length > dimIndex && level[dimIndex] !== undefined && level[dimIndex] !== null) {
                           infoHtml += `<li>Level ${levelIndex}: ${level[dimIndex].toFixed(3)}</li>`;
                       }
                  });
                 infoHtml += `</ul>`;
             }

        }
         // Update the panel only if we generated some info
         if (infoHtml) {
             syntrometryInfoPanel.innerHTML = infoHtml;
         } else {
             // Fallback if object is interactive but we don't have display logic for it
             syntrometryInfoPanel.innerHTML = `<h3>Object Selected</h3><p>Type: ${data.type || 'Unknown'}</p><p>ID: ${data.id || 'N/A'}</p>`;
         }


    } else {
        // If no object is selected or hovered, display default simulation state overview
        syntrometryInfoPanel.innerHTML = `
            <h3>Simulation Metrics</h3>
            <p>Hover or click dimensions/RIH node for details.</p>
            <p><i>Updates dynamically based on agent processing.</i></p>
            <p><span class="simulated-data">Current RIH: ${(latestRihScore * 100).toFixed(1)}%</span></p>
            <p><span class="simulated-data">Average Affinity: ${(latestAffinities && latestAffinities.length > 0 ? latestAffinities.reduce((a,b)=>a+b,0)/latestAffinities.length : 0).toFixed(2)}</span></p>
            <p>Environment Context: ${latestContext || 'Stable'}</p> <!-- Use latestContext -->
        `;
    }
}


/**
 * Updates the Three.js visualization based on simulation state and interaction.
 * This function is called every frame by the main animation loop.
 * @param {number} deltaTime The time elapsed since the last frame.
 * @param {number[]} stateVector The environment's numerical state vector (full array).
 * @param {number} rihScore The current RIH score (0-1).
 * @param {number[]} affinities Array of affinity scores between cascade levels.
 * @param {number} integrationParam Value from the integration slider (0-1).
 * @param {number} reflexivityParam Value from the reflexivity slider (0-1).
 * @param {number[][]} cascadeHistory History of elements at each cascade level (array of arrays).
 * @param {string} context Current environment context message.
 */
export function updateThreeJS(deltaTime, stateVector, rihScore, affinities, integrationParam, reflexivityParam, cascadeHistory, context) { // Added context
    // Only update if initialized and necessary objects exist
    if (!threeInitialized || !nodes || nodes.length === 0 || !rihNode || !edgesGroup || !renderer || !camera || !scene || !labelRenderer || !baseEdgeMaterial) return; // Check baseEdgeMaterial


    // Store latest simulation data for the info panel access
    latestStateVector = stateVector; // Store the full state vector array
    latestRihScore = rihScore;
    latestAffinities = affinities; // Store the affinities array
    latestCascadeHistory = cascadeHistory; // Store cascade history
    latestContext = context; // Store context

    const avgAffinity = (affinities && affinities.length > 0 ? affinities.reduce((a,b)=>a+b,0)/affinities.length : 0);


    // Clear old edges BEFORE creating new ones
    // Use `dispose()` on geometry and material to free up GPU memory
    while(edgesGroup.children.length > 0){
        const edge = edgesGroup.children[0];
        if (edge.geometry) edge.geometry.dispose();
        if (edge.material) edge.material.dispose();
        edgesGroup.remove(edge);
    }


    // --- Node Animation & Highlight Effects ---
    const time = performance.now() * 0.001; // Use performance.now() for time for animations

    // Define highlight colors/emissive values (PhongMaterial) and colors (BasicMaterial)
    const nodeHighlightColor = new THREE.Color(0xffffff); // White highlight
    const nodeHighlightEmissive = new THREE.Color(0xffffff).multiplyScalar(0.5); // White emissive glow
    const linkedColor = new THREE.Color(0xaaaaee); // Light blueish tint for linked nodes
    const linkedEmissive = new THREE.Color(0xaaaaee).multiplyScalar(0.3);
     const edgeHighlightColor = new THREE.Color(0x00aaff); // Accent blue for edges (BasicMaterial color)


    // Loop through each dimension (node)
    for (let i = 0; i < Config.DIMENSIONS; i++) {
        const node = nodes[i];
        // Ensure necessary userData exists
        if (!node || !node.material || !node.material.color || !node.userData || !node.userData.originalPosition || node.userData.originalColor === undefined) {
             // Removed originalEmissive check as it might be null
             console.warn(`Missing required userData for dimension node ${i}. Skipping animation/highlight.`); // Added index to warning
             continue;
         }

        const data = node.userData; // Use userData directly


        // Use stored original position for animation base
        const originalPosition = node.userData.originalPosition;
         // Use stored original material properties for highlighting base
         const originalColor = new THREE.Color(node.userData.originalColor);
         const originalEmissive = new THREE.Color(node.userData.originalEmissive ?? 0x000000); // Default black if null


        const isSelected = selectedDimension === node;
        const isHovered = !isSelected && hoveredDimension === node; // Only hover highlight if not selected
         // Check if node is linked to the selected/hovered RIH node
         // A dimension node is linked to RIH if RIH is selected/hovered AND this dimension exists in the *last* cascade level (where RIH is calculated from variance)
         const lastCascadeLevel = latestCascadeHistory && latestCascadeHistory.length > 0 ? latestCascadeHistory[latestCascadeHistory.length - 1] : [];
         const isLinkedToRih = Array.isArray(lastCascadeLevel) && lastCascadeLevel.length > i; // Is this dimension's value represented in the final cascade level?

         const isLinkedToRihSelected = selectedDimension === rihNode && isLinkedToRih;
         const isLinkedToRihHovered = !isSelected && !isLinkedToRihSelected && hoveredDimension === rihNode && isLinkedToRih;


        // --- Determine Target State (Position, Scale, Color, Emissive) ---
        let targetPosition = originalPosition.clone();
        let targetScale = new THREE.Vector3(1.0, 1.0, 1.0); // Default base scale is 1.0 for dimensions
        let targetColor = originalColor.clone();
        let targetEmissive = originalEmissive.clone();
        const lerpFactor = 0.1; // Smoothing factor


        // Apply base color/emissive based on state value (always applies unless highlighted)
         const value = (latestStateVector && latestStateVector.length > i) ? latestStateVector[i] : 0; // Get value safely
         const hue = value > 0 ? 0.33 : (value < 0 ? 0.66 : 0.5); // Green, Blue, or Cyan/Mid
         const saturation = 0.8;
         const lightness = 0.4 + Math.abs(value) * 0.3; // Intensity based on absolute value
         targetColor.setHSL(hue, saturation, lightness);
         targetEmissive.copy(targetColor).multiplyScalar(0.3 + Math.abs(value) * 0.3); // Emissive scales with value intensity


        if (isSelected || isHovered) {
            // Target State for Highlighted Objects
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            const highlightScaleFactor = 1.0 + (isSelected ? 0.3 : 0.15); // Bigger scale if selected
            targetScale.set(highlightScaleFactor, highlightScaleFactor, highlightScaleFactor);
            targetPosition.z = originalPosition.z + value * 0.5 + (isSelected ? 0.1 : 0.05); // Pull forward slightly

        } else if (isLinkedToRihSelected || isLinkedToRihHovered) {
             // Apply subtle highlight for linked nodes (those connected to RIH)
             targetColor.lerp(linkedColor, 0.5); // Blend towards linked color
             targetEmissive.lerp(linkedEmissive, 0.5); // Blend towards linked emissive
             targetScale.set(1.05, 1.05, 1.05); // Slightly larger if linked to RIH
             targetPosition.z = originalPosition.z + value * 0.5; // Normal Z position
        }
        else {
            // Target State for Non-highlighted Objects (apply base animation)
            // Animate position along Z axis based on state value, influenced by reflexivity
            targetPosition.z = originalPosition.z + value * (0.5 + reflexivityParam * 0.3);

             // Scale node based on integration parameter and this dimension's state value magnitude
             const valueScale = Math.abs(value) * 0.4; // Scale based on value magnitude
             const scaleFactor = 1.0 + integrationParam * 0.3 + valueScale; // Scale factors: base, integration param, value magnitude
             targetScale.set(scaleFactor, scaleFactor, scaleFactor); // Apply scale
        }

        // --- Apply Interpolated State ---
        // Lerp current properties towards the determined target properties
        node.position.lerp(targetPosition, lerpFactor);
        node.scale.lerp(targetScale, lerpFactor);
        node.material.color.lerp(targetColor, lerpFactor);
        // Check if material has emissive before lerping emissive (MeshPhongMaterial does)
         if (node.material.emissive) {
              node.material.emissive.lerp(targetEmissive, lerpFactor);
         }


        // --- Apply Base Rotation (Always Applies unless Selected) ---
         if (!isSelected) { // Only apply base rotation if NOT selected
              // Rotation speed influenced by reflexivity and value magnitude
             const rotSpeed = deltaTime * (0.05 + reflexivityParam * 0.1 + Math.abs(value) * 0.1);
             node.rotation.y += rotSpeed;
             node.rotation.x += rotSpeed * 0.5 * Math.sin(time + i); // Add some variation
         }


        // --- Create Edges from this node ---
        // Edges are created and added to the group *every frame*
        // Their materials are updated below based on state/highlight.

        // Edges between this node (i) and subsequent nodes (j)
        for (let j = i + 1; j < Config.DIMENSIONS; j++) {
            const nodeJ = nodes[j]; // Get the target node
            if (!nodeJ || !nodeJ.position || !nodeJ.userData) continue;

            const distSq = node.position.distanceToSquared(nodeJ.position);
            // Use a reasonable distance threshold for drawing edges
            if (distSq < 4.0) { // Distance threshold for connections
                // Calculate edge base opacity based on avgAffinity and integrationParam
                 const baseOpacity = clamp(0.15 + Math.abs(avgAffinity) * 0.4 + integrationParam * 0.2, 0.05, 0.7);


                // Check if this edge is connected to a selected/hovered node OR the selected/hovered RIH node
                 const isEdgeSelected = isSelected || selectedDimension === nodeJ || (selectedDimension === rihNode && (isLinkedToRih || (Array.isArray(lastCascadeLevel) && lastCascadeLevel.length > j)));
                 const isEdgeHovered = !isEdgeSelected && (isHovered || hoveredDimension === nodeJ || (hoveredDimension === rihNode && (isLinkedToRih || (Array.isArray(lastCascadeLevel) && lastCascadeLevel.length > j))));

                 const edgeMaterial = baseEdgeMaterial.clone(); // Clone material for each edge (LineBasicMaterial)
                 let targetEdgeColor = edgeMaterial.color.clone();
                 let targetEdgeOpacity = baseOpacity;

                 if (isEdgeSelected || isEdgeHovered) {
                      // Apply highlight color and increased opacity
                      targetEdgeColor.copy(edgeHighlightColor);
                      targetEdgeOpacity = clamp(baseOpacity * 1.5 + (isEdgeSelected ? 0.2 : 0), 0.6, 1.0); // More opaque if selected
                 } else {
                      // Blend edge color between connected node colors based on affinity
                     const startColor = node.material.color; // Use node's current color
                     const endColor = nodeJ.material.color; // Use nodeJ's current color
                     // Blend factor based on affinity (closer to 1 means stronger color blend)
                     const blendFactor = clamp(0.5 + avgAffinity * 0.5, 0, 1);
                     targetEdgeColor.lerpColors(startColor, endColor, blendFactor);
                     targetEdgeOpacity = baseOpacity;
                 }

                // Update edge material directly (since we recreate edges each frame)
                edgeMaterial.color = targetEdgeColor;
                edgeMaterial.opacity = targetEdgeOpacity;

                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array(6); // 2 points * 3 coordinates (x, y, z)
                node.position.toArray(positions, 0); // Start point is node i position
                nodeJ.position.toArray(positions, 3); // End point is node j position
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

                const edge = new THREE.Line(geometry, edgeMaterial); // Create the line segment
                edgesGroup.add(edge); // Add to the edges group
            }
        }

         // Edge between this node (i) and the RIH node
        if (rihNode?.position && rihNode.userData && rihNode.material) {
            const rihEdgeMaterial = baseEdgeMaterial.clone(); // Clone material (LineBasicMaterial)
            // Opacity based on node's value magnitude, RIH score, and reflexivity
           const baseOpacity = clamp(Math.abs(value) * 0.3 + rihScore * 0.4 + reflexivityParam * 0.2, 0.05, 0.8);
           // Check if this edge is connected to a selected/hovered node (node i or RIH node)
           const isEdgeSelected = isSelected || selectedDimension === rihNode;
           const isEdgeHovered = !isEdgeSelected && (isHovered || hoveredDimension === rihNode);

           let targetEdgeColor = rihEdgeMaterial.color.clone();
           let targetEdgeOpacity = baseOpacity;

            if (isEdgeSelected || isEdgeHovered) {
                 // Apply highlight color and increased opacity
                 targetEdgeColor.copy(edgeHighlightColor);
                 targetEdgeOpacity = clamp(baseOpacity * 1.4 + (isEdgeSelected ? 0.2 : 0), 0.6, 1.0);
            } else {
                 // Blend colors between the dimension node's current color and the RIH node's current color, weighted by RIH
                 const startColor = node.material.color;
                 const endColor = rihNode.material.color;
                 targetEdgeColor.lerpColors(startColor, endColor, clamp(0.3 + rihScore * 0.7, 0.1, 0.9));
                 targetEdgeOpacity = baseOpacity;
            }

            // Update edge material directly
            rihEdgeMaterial.color = targetEdgeColor;
            rihEdgeMaterial.opacity = targetEdgeOpacity;


           const geometry = new THREE.BufferGeometry();
           const positions = new Float32Array(6);
           node.position.toArray(positions, 0); // Start point is node i position
           rihNode.position.toArray(positions, 3); // End point is RIH node position
           geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

           const rihEdge = new THREE.Line(geometry, rihEdgeMaterial);
           edgesGroup.add(rihEdge);
        } else if (rihNode && (!rihNode.material || !rihNode.userData)) {
             // console.warn("RIH node material or userData missing for edge creation/update."); // Avoid console flood
        }


        // Ensure labels stay correctly positioned relative to the node scale and match opacity
        if (node.userData.label) {
             const label = node.userData.label;
             const baseOffset = nodeBaseScale * 1.5; // Keep consistent with creation
             label.position.y = baseOffset * node.scale.y; // Adjust label Y position based on current Y scale
             // Labels should also adjust visibility/opacity if the node is hidden or faded
             label.element.style.opacity = clamp(node.material.opacity ?? 1.0, 0.2, 1.0); // Use node opacity (if material has it), ensure minimum visibility
             label.element.style.display = label.element.style.opacity < 0.25 ? 'none' : 'block'; // Hide if too faint
        }

   } // End of dimension node loop

    // --- Animate and Highlight the RIH Node ---
    if (rihNode?.material?.color && rihNode.userData?.originalPosition) {
         const originalPosition = rihNode.userData.originalPosition;
         const originalColor = new THREE.Color(rihNode.userData.originalColor);
         const originalEmissive = new THREE.Color(rihNode.userData.originalEmissive ?? 0x000000);
         const baseScale = nodeBaseScale * 1.5; // Base scale from creation
         const lerpFactor = 0.1;

         const isSelected = selectedDimension === rihNode;
         const isHovered = !isSelected && hoveredDimension === rihNode;

         // Determine Target State (Position, Scale, Color, Emissive)
         let targetColor = originalColor.clone();
         let targetEmissive = originalEmissive.clone();
         let targetScale = new THREE.Vector3(baseScale, baseScale, baseScale);

         // Base color/emissive intensity based on RIH score and Avg Affinity
         targetColor.lerp(new THREE.Color(1, 1, 1), clamp(rihScore, 0, 1) * 0.6); // More white with higher RIH
         targetEmissive.copy(targetColor).multiplyScalar(clamp(rihScore * 0.7 + Math.abs(avgAffinity) * 0.3, 0.3, 0.9)); // Stronger emissive with RIH/Affinity

         // Base Scale pulse based on RIH score and reflexivityParam
         const rihScaleFactor = baseScale * (1.0 + clamp(rihScore, 0, 1) * 0.5 + reflexivityParam * 0.2);
         const pulse = (Math.sin(time * (2.0 + rihScore * 3.0)) * 0.5 + 0.5) * clamp(rihScore, 0.2, 1.0) * 0.2; // Pulse stronger/faster with higher RIH
         targetScale.set(rihScaleFactor + pulse, rihScaleFactor + pulse, rihScaleFactor + pulse);


         // Apply Highlight State - Overrides base color/emissive/scale if highlighted
         if (isSelected || isHovered) {
             targetColor.copy(nodeHighlightColor);
             targetEmissive.copy(nodeHighlightEmissive);
             const highlightScaleFactor = baseScale * (1.4 + (isSelected ? 0.2 : 0)); // Bigger scale if selected
             targetScale.set(highlightScaleFactor, highlightScaleFactor, highlightScaleFactor);
         }


         // --- Apply Interpolated State ---
         rihNode.position.copy(rihNode.userData.originalPosition); // RIH node doesn't oscillate position based on type
         rihNode.scale.lerp(targetScale, lerpFactor);
         rihNode.material.color.lerp(targetColor, lerpFactor);
         // Check if material has emissive before lerping emissive
         if (rihNode.material.emissive) {
              rihNode.material.emissive.lerp(targetEmissive, lerpFactor);
         }


        // RIH node rotation speed based on RIH and integrationParam
         if (!isSelected) {
             const rotSpeed = deltaTime * (0.1 + rihScore * 0.2 + integrationParam * 0.1);
            rihNode.rotation.y += rotSpeed;
            rihNode.rotation.x += rotSpeed * 0.6 * Math.cos(time * 0.5); // Wobble effect
         }


        // RIH node label (if exists) - It doesn't have one currently
         // ...
    } else if (rihNode) {
        // console.warn("RIH node material, userData, or originalPosition missing for animation/highlight."); // Avoid console flood
    }


   // Render the scene
   renderer.render(scene, camera);
   // Render the CSS2D labels
   labelRenderer.render(scene, camera);
}

/**
 * Handles window resize event for the Syntrometry Panel.
 */
function onWindowResize() {
    if (!threeInitialized || !camera || !renderer || !labelRenderer || !syntrometryContainer) return;

    const width = syntrometryContainer.clientWidth;
    const height = syntrometryContainer.clientHeight;

     if (width <= 0 || height <= 0) {
         // Cannot resize with zero dimensions
         return;
     }

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    labelRenderer.setSize(width, height); // Resize label renderer too
}

// Add listener for window resize, but only if init was successful
// This is handled in initThreeJS now.


/**
 * Cleans up Three.js resources for the Syntrometry panel.
 */
export function cleanupThreeJS() {
    if (!threeInitialized) return;
    console.log("Cleaning up Syntrometry Three.js...");

    // Remove resize listener
    window.removeEventListener('resize', onWindowResize);

    // Remove interaction listeners using the wrapper functions
    if (syntrometryContainer) {
         syntrometryContainer.removeEventListener('mousemove', handleSyntrometryMouseMoveWrapper, false);
         syntrometryContainer.removeEventListener('click', handleSyntrometryClickWrapper, false);
    }


    // Dispose renderer and remove canvas
    if (renderer) {
        renderer.dispose();
        if (syntrometryContainer?.contains(renderer.domElement)) { // Safety check
             syntrometryContainer.removeChild(renderer.domElement);
         }
        renderer = null;
    }
    // Dispose label renderer and remove its element
     if (labelRenderer?.domElement) { // Safety check
         labelRenderer.domElement.remove();
         labelRenderer = null;
     }


    // Dispose geometries and materials associated with nodes and remove labels
    if (nodes) {
        nodes.forEach(node => {
             if (!node) return; // Safety check
             if (node.geometry) node.geometry.dispose();
             if (node.material) node.material.dispose();
             // Remove and dispose label if it exists
             if (node.userData?.label) { // Safety check
                 const label = node.userData.label;
                 if (label.element?.parentNode) { // Safety check
                     label.element.parentNode.removeChild(label.element);
                 }
                 node.remove(label); // Remove from node hierarchy
                 node.userData.label = null;
             }
            scene?.remove(node); // Remove node from scene if scene exists
        });
        nodes = []; // Clear the array
    }

    // Dispose RIH node
    if (rihNode) {
        if (rihNode.geometry) rihNode.geometry.dispose();
        if (rihNode.material) rihNode.material.dispose();
        scene?.remove(rihNode); // Remove from scene if scene exists
        rihNode = null;
    }

    // Dispose edge geometries and materials in the edges group
     if (edgesGroup) {
        while(edgesGroup.children.length > 0){
            const edge = edgesGroup.children[0];
            if (edge.geometry) edge.geometry.dispose();
            if (edge.material) edge.material.dispose();
            edgesGroup.remove(edge);
        }
        scene?.remove(edgesGroup); // Remove group from scene if scene exists
        edgesGroup = null;
     }

     // Dispose base edge material
     if (baseEdgeMaterial) {
         baseEdgeMaterial.dispose();
         baseEdgeMaterial = null;
     }


     // Clear references to DOM elements and state variables
     syntrometryContainer = null;
     syntrometryInfoPanel = null;
     hoveredDimension = null;
     selectedDimension = null;
     latestStateVector = null;
     latestRihScore = 0;
     latestAffinities = [];
     latestCascadeHistory = [];
     latestContext = "Initializing...";


    // Dispose scene (optional, often not necessary unless using complex materials/textures)
    // scene?.dispose(); // Use with caution if scene exists
    scene = null; // Nullify scene

    threeInitialized = false;
    console.log("Syntrometry Three.js cleanup complete.");
}

// --- Wrapper functions for event listeners to allow removal ---
// These wrappers ensure the correct, up-to-date interactableObjects list is passed.
// We also need to use named functions so removeEventListener works in cleanup.
function handleSyntrometryMouseMoveWrapper(event) {
     // Create the current list of interactable objects dynamically
     const interactableObjects = [...nodes, rihNode].filter(obj => obj !== null && obj !== undefined);
     onSyntrometryMouseMove(event, interactableObjects);
     // After move, update info panel IF nothing is selected
     if (!selectedDimension) {
         updateSyntrometryInfoPanel();
     }
}

function handleSyntrometryClickWrapper(event) {
     // Create the current list of interactable objects dynamically
     const interactableObjects = [...nodes, rihNode].filter(obj => obj !== null && obj !== undefined);
     onSyntrometryClick(event, interactableObjects);
     // After click, always update info panel to reflect new state
     updateSyntrometryInfoPanel();
}
