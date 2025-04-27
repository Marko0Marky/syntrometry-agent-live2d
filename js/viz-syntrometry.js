// js/viz-syntrometry.js

import { Config } from './config.js';
import { clamp, displayError, zeros } from './utils.js';

// Assumes THREE is available globally via CDN

let scene = null;
let camera = null;
let renderer = null;
let nodes = [];
let edgesGroup = null;
let rihNode = null;
let threeInitialized = false;

const nodeBaseScale = 0.08; // Base size of the nodes

/**
 * Initializes the Three.js visualization for the Syntrometry panel.
 * @returns {boolean} True if initialization was successful, false otherwise.
 */
export function initThreeJS() {
    // Check if Three.js is loaded and no critical errors (criticalError check is done in app.js)
    if (typeof THREE === 'undefined') {
        displayError("Three.js not loaded for Syntrometry panel.", false, 'error-message');
        return false;
    }
    try {
        // Get the container element
        const container = document.getElementById('syntrometry-panel');
        if (!container) {
            displayError("Syntrometry panel container not found.", false, 'error-message');
            return false;
        }
        const width = container.clientWidth;
        const height = container.clientHeight;
         if (width <= 0 || height <= 0) {
             displayError("Syntrometry panel has zero dimensions.", false, 'error-message');
             return false;
         }


        // Create scene, camera, and renderer
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a); // Dark background
        camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.position.z = 3.5; // Position camera

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement); // Add renderer to container

        // Create nodes (representing dimensions)
        const nodeGeometry = new THREE.SphereGeometry(nodeBaseScale, 16, 12); // Sphere geometry
        const angleStep = (2 * Math.PI) / Config.DIMENSIONS; // Angle between nodes on a circle
        const radius = 1.5; // Radius of the circle layout

        nodes = []; // Clear nodes array just in case
        for (let i = 0; i < Config.DIMENSIONS; i++) {
            // Material for nodes
            const material = new THREE.MeshPhongMaterial({ color: 0x00ff00, emissive: 0x113311, specular: 0x555555, shininess: 30 });
            const node = new THREE.Mesh(nodeGeometry, material);

            // Position nodes in a circle
            node.position.set(
                Math.cos(i * angleStep) * radius,
                Math.sin(i * angleStep) * radius,
                0 // Start at z=0
            );

            scene.add(node); // Add node to scene
            nodes.push(node); // Store node reference
        }

        // Create the RIH node (central node)
        const rihGeometry = new THREE.SphereGeometry(nodeBaseScale * 1.5, 20, 16);
        const rihMaterial = new THREE.MeshPhongMaterial({ color: 0xff4444, emissive: 0x331111, specular: 0x888888, shininess: 50 });
        rihNode = new THREE.Mesh(rihGeometry, rihMaterial);
        rihNode.position.set(0, 0, 0); // Center position
        scene.add(rihNode); // Add RIH node to scene

        // Group for edges to easily remove and re-add them
        edgesGroup = new THREE.Group();
        scene.add(edgesGroup);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0x404040); // Soft ambient light
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Directional light
        directionalLight.position.set(1, 1, 1).normalize();
        scene.add(directionalLight);

        // Add window resize listener
        window.addEventListener('resize', onWindowResize, false);

        console.log('Syntrometry Three.js initialized successfully.');
        threeInitialized = true;
        return true;
    } catch (e) {
        displayError(`Error initializing Syntrometry Three.js: ${e.message}`, false, 'error-message');
        console.error("Syntrometry Three.js Init Error:", e);
        return false;
    }
}

/**
 * Updates the Three.js visualization based on simulation state.
 * @param {number[]} stateVector The environment's numerical state vector (only first Config.DIMENSIONS used).
 * @param {number} rihScore The current RIH score (0-1).
 * @param {number[]} affinities Array of affinity scores between cascade levels.
 * @param {number} integrationParam Value from the integration slider (0-1).
 * @param {number} reflexivityParam Value from the reflexivity slider (0-1).
 */
export function updateThreeJS(stateVector, rihScore, affinities, integrationParam, reflexivityParam) {
    // Only update if initialized and necessary objects exist
    if (!threeInitialized || !nodes || nodes.length === 0 || !rihNode || !edgesGroup || !renderer || !camera || !scene) return;

     // Ensure stateVector has enough data for the dimensions we visualize
    if (!stateVector || stateVector.length < Config.DIMENSIONS) {
         console.warn("State vector too small for Syntrometry visualization. Using zeros for missing dimensions.");
         const paddedState = zeros([Config.DIMENSIONS]);
         if(stateVector) {
             for(let i=0; i < stateVector.length; i++) {
                 paddedState[i] = stateVector[i]; // Use available data
             }
         }
         stateVector = paddedState; // Use padded state
    }


    // Create a base material for edges - moved outside the loop for efficiency
    const edgeMaterialBase = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true });

     // Dispose and remove old edges group children BEFORE creating new ones
     // Use `dispose()` on geometry and material to free up GPU memory
    edgesGroup.children.forEach(child => {
         if (child.geometry) child.geometry.dispose();
         if (child.material) child.material.dispose();
    });
    edgesGroup.children.length = 0; // Remove all edge meshes from the array


    // Loop through each dimension (node)
    for (let i = 0; i < Config.DIMENSIONS; i++) {
        const node = nodes[i];
        if (!node || !node.material || !node.material.color) continue; // Basic safety check

        const value = stateVector[i] !== undefined && stateVector[i] !== null ? stateVector[i] : 0; // State value, default to 0


        // Animate node position along Z axis based on state value
        node.position.z = value * 0.5;

        // Change node color based on state value (e.g., green for positive, blue for negative)
        const hue = value > 0 ? 0.33 : (value < 0 ? 0.66 : 0.5); // Green, Blue, or Cyan/Mid
        const saturation = 0.8;
        const lightness = 0.4 + Math.abs(value) * 0.3; // Intensity based on absolute value
        node.material.color.setHSL(hue, saturation, lightness);
        node.material.emissive.setHSL(hue, saturation, lightness * 0.3); // Emissive matches color

        // Scale node based on integration parameter and affinity
        // Check if affinities[i] exists before using it
        const affinityValueForNode = (affinities && affinities[i] !== undefined && affinities[i] !== null) ? affinities[i] : 0;
        const affinityScale = Math.abs(affinityValueForNode) * 0.5; // Scale based on affinity magnitude
        const scale = 1.0 + integrationParam * 0.5 + affinityScale; // Scale factors: base, integration param, affinity
        node.scale.set(scale, scale, scale); // Apply scale

        // Remove old reflexivity loops (children of this node) and dispose resources
        while (node.children.length > 0) {
           const child = node.children[0];
           node.remove(child);
           if (child.geometry) child.geometry.dispose();
           if (child.material) child.material.dispose();
        }


        // --- Reflexivity Visualization (Loops around nodes) ---
         // Add a loop around the node if reflexivity is high
        if (reflexivityParam > 0.1) { // Only show loops if reflexivity parameter is above a threshold
           const loopRadius = nodeBaseScale * node.scale.x * (0.5 + reflexivityParam * 0.5); // Loop size scales with node size and reflexivity
           // Create an ellipse curve slightly offset in Z
           const curve = new THREE.EllipseCurve(
                0, 0, // Center of the ellipse relative to the node
               loopRadius, loopRadius * 0.8, // Radii (slightly flattened)
               0, 2 * Math.PI, // Start and end angles
               false, // Clockwise
               node.position.z > 0 ? Math.PI / 4 : -Math.PI/4 // Rotation based on Z position
           );

           const points = curve.getPoints(20); // Get points along the curve
           const geometry = new THREE.BufferGeometry().setFromPoints(points); // Create geometry from points

           const material = new THREE.LineBasicMaterial({
               color: node.material.color, // Loop color matches node color
               opacity: clamp(reflexivityParam * 0.6, 0.1, 0.5), // Opacity increases with reflexivity
               transparent: true
           });

           const loop = new THREE.LineLoop(geometry, material); // Create a LineLoop (closed loop)
           // The loop's position is relative to its parent (the node) if added as a child.
           loop.position.set(0,0,0); // Relative position

           node.add(loop); // Add the loop as a child of the node
       }


       // --- Create Edges from this node ---

       // Edges between this node (i) and subsequent nodes (j)
       for (let j = i + 1; j < Config.DIMENSIONS; j++) {
           const nodeJ = nodes[j]; // Get the target node
           if (!nodeJ) continue;

           const distSq = node.position.distanceToSquared(nodeJ.position);
           // Use a reasonable distance threshold for drawing edges
           if (distSq < 4.0) {
               // Calculate opacity based on correlation/affinity between nodes' state values or calculated affinities
                // Using calculated affinities from agent's process results
                const affinity_i = (affinities && affinities.length > i && affinities[i] !== undefined && affinities[i] !== null) ? affinities[i] : 0;
                const affinity_j = (affinities && affinities.length > j && affinities[j] !== undefined && affinities[j] !== null) ? affinities[j] : 0;
                const edgeAffinity = (affinity_i + affinity_j) / 2; // Average affinity
                const opacity = clamp(0.3 + Math.abs(edgeAffinity) * 0.5, 0.05, 0.7); // Opacity increases with affinity magnitude

               const edgeMaterial = edgeMaterialBase.clone(); // Clone to change opacity per edge
               edgeMaterial.opacity = opacity;

               const geometry = new THREE.BufferGeometry();
               const positions = new Float32Array(6); // 2 points * 3 coordinates (x, y, z)
               node.position.toArray(positions, 0); // Start point is node i position
               nodeJ.position.toArray(positions, 3); // End point is node j position
               geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

               const colors = new Float32Array(6); // 2 points * 3 color components (r, g, b)
               node.material.color.toArray(colors, 0); // Color starts as node i color
               nodeJ.material.color.toArray(colors, 3); // Color ends as node j color
               geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

               const edge = new THREE.Line(geometry, edgeMaterial); // Create the line segment
               edgesGroup.add(edge); // Add to the edges group
           }
       }

        // Edge between this node (i) and the RIH node
       const rihEdgeMaterial = edgeMaterialBase.clone();
        // Opacity based on node's state value magnitude and overall RIH score
       rihEdgeMaterial.opacity = clamp(Math.abs(value) * 0.5 + rihScore * 0.3, 0.05, 0.7);

       const geometry = new THREE.BufferGeometry();
       const positions = new Float32Array(6);
       node.position.toArray(positions, 0); // Start point is node i position
       rihNode.position.toArray(positions, 3); // End point is RIH node position
       geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

       const colors = new Float32Array(6);
       node.material.color.toArray(colors, 0); // Color starts as node i color
       rihNode.material.color.toArray(colors, 3); // Color ends as RIH node color
       geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

       const rihEdge = new THREE.Line(geometry, rihEdgeMaterial);
       edgesGroup.add(rihEdge);
   } // End of main for loop


    // Update RIH node color towards white with high reflexivity (outside the loop)
   if (rihNode && rihNode.material && rihNode.material.color) {
        rihNode.material.color.lerp(new THREE.Color(1,1,1), reflexivityParam * 0.3);
    }


   // Render the scene
   renderer.render(scene, camera);
}

/**
 * Handles window resize event for the Syntrometry Panel.
 */
function onWindowResize() {
    if (!threeInitialized || !camera || !renderer) return;
    const container = document.getElementById('syntrometry-panel');
     if(!container) return;
     const width = container.clientWidth;
     const height = container.clientHeight;
     if (width <= 0 || height <= 0) {
         // Cannot resize with zero dimensions
         return;
     }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
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

    // Dispose renderer and remove canvas
    if (renderer) {
        renderer.dispose();
        const container = document.getElementById('syntrometry-panel');
         if (container && container.contains(renderer.domElement)) {
             container.removeChild(renderer.domElement);
         }
        renderer = null;
    }

    // Dispose geometries and materials associated with nodes
    if (nodes) {
        nodes.forEach(node => {
            if (node.geometry) node.geometry.dispose();
            if (node.material) node.material.dispose();
             // Dispose children (reflexivity loops) if they exist
             while(node.children.length > 0) {
                 const child = node.children[0];
                 node.remove(child); // Remove from node
                 if (child.geometry) child.geometry.dispose();
                 if (child.material) child.material.dispose();
             }
            scene.remove(node); // Remove node from scene
        });
        nodes = []; // Clear the array
    }

    // Dispose RIH node
    if (rihNode) {
        if (rihNode.geometry) rihNode.geometry.dispose();
        if (rihNode.material) rihNode.material.dispose();
        scene.remove(rihNode);
        rihNode = null;
    }

    // Dispose edge geometries and materials in the edges group
     if (edgesGroup) {
        edgesGroup.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        edgesGroup.children.length = 0; // Clear the array
        scene.remove(edgesGroup); // Remove group from scene
        edgesGroup = null;
     }


    // Dispose scene (optional, often not necessary unless using complex materials/textures)
    // scene.dispose(); // Use with caution

    threeInitialized = false;
    console.log("Syntrometry Three.js cleanup complete.");
}