// js/viz-concepts.js

import { Config, emotionNames } from './config.js'; // Import emotionNames
import { clamp, displayError, zeros, lerp } from './utils.js';
// Import live2dInitialized flag to check Live2D status for the info panel
import { live2dInitialized } from './viz-live2d.js';


// Assumes THREE, OrbitControls, CSS2DRenderer are available globally via CDN

// Export these variables so app.js can access them for rendering and controls update
export let conceptScene = null;
export let conceptCamera = null;
export let conceptRenderer = null;
export let conceptLabelRenderer = null;
export let conceptControls = null;

let conceptRaycaster = null;
let conceptMouse = null;
let conceptNodes = {}; // { id: { object: THREE.Mesh, label: CSS2DObject, data: conceptData[...] } }
let conceptEdges = []; // Stores TubeGeometry meshes
let conceptContainer = null;
let conceptInfoPanel = null;
let conceptClock = null; // Will be initialized in app.js and passed or accessed
export let conceptInitialized = false; // Flag for initialization status - Exported for app.js

let agentStateMesh = null;
let emergenceCoreMesh = null;
let agentStateLabel = null;
let emergenceCoreLabel = null;
let live2dPlaneConcept = null; // Invisible placeholder for Live2D ref


// Variables to hold the latest simulation data for concept graph info panel updates
// These are updated by updateAgentSimulationVisuals and accessed by updateInfoPanel
let latestAgentEmotions = null;
let latestRIHScore = 0;
let latestAvgAffinity = 0;
let latestHmLabel = "idle";


// Concept data (Structure from V1/V2 - kept V1 structure without dimension nodes)
const conceptData = {
    'reflexive_abstraction': { id: 'reflexive_abstraction', name: 'Reflexive Abstraction', chapter: 1, position: new THREE.Vector3(0, 20, -30), type: 'method', links: ['syntrometry'], description: "Method to overcome subjective limits by analyzing reflection itself." },
    'subjective_aspect': { id: 'subjective_aspect', name: 'Subjective Aspect (S)', chapter: 1, position: new THREE.Vector3(-15, 15, -25), type: 'structure', links: ['pradikatrix', 'dialektik', 'koordination', 'aspektivsystem'], description: "Contextual framework for statements; a viewpoint." },
    'pradikatrix': { id: 'pradikatrix', name: 'Prädikatrix (Pm)', chapter: 1, position: new THREE.Vector3(-25, 20, -20), type: 'component', links: [], description: "Schema of potential statements/predicates." },
    'dialektik': { id: 'dialektik', name: 'Dialektik (Dn)', chapter: 1, position: new THREE.Vector3(-20, 20, -20), type: 'component', links: [], description: "Schema of subjective qualifiers/biases." },
    'koordination': { id: 'koordination', name: 'Koordination (Kn)', chapter: 1, position: new THREE.Vector3(-15, 20, -20), type: 'component', links: [], description: "Mechanism linking Prädikatrix and Dialektik." },
    'aspektivsystem': { id: 'aspektivsystem', name: 'Aspektivsystem (P)', chapter: 1, position: new THREE.Vector3(15, 15, -25), type: 'structure', links: ['metropie', 'idee'], description: "Collection of related subjective aspects." },
    'metropie': { id: 'metropie', name: 'Metropie (g)', chapter: 1, position: new THREE.Vector3(25, 20, -20), type: 'property', links: [], description: "Metric defining 'distance' between aspects." },
    'idee': { id: 'idee', name: 'Idee (Apodiktic Core)', chapter: 1, position: new THREE.Vector3(20, 10, -20), type: 'core', links: [], description: "Invariant elements within an Aspektivsystem." },
    'syntrometry': { id: 'syntrometry', name: 'Syntrometrie', chapter: 1, position: new THREE.Vector3(0, 10, -25), type: 'framework', links: ['syntrix'], description: "Heim's universal logic derived from Reflexive Abstraction." },
    'syntrix': { id: 'syntrix', name: 'Syntrix (ã|=)', chapter: 2, position: new THREE.Vector3(0, 5, -15), type: 'structure', links: ['metrophor', 'synkolator', 'synkolation_stage', 'korporator'], description: "Formal, recursive structure embodying a Category." },
    'metrophor': { id: 'metrophor', name: 'Metrophor (ã)', chapter: 2, position: new THREE.Vector3(-10, 8, -12), type: 'core', links: ['idee'], description: "Invariant core (Idee) of a Syntrix; base elements." },
    'synkolator': { id: 'synkolator', name: 'Synkolator ({)', chapter: 2, position: new THREE.Vector3(0, 8, -12), type: 'operator', links: [], description: "Recursive correlation law generating complexity." },
    'synkolation_stage': { id: 'synkolation_stage', name: 'Synkolation Stage (m)', chapter: 2, position: new THREE.Vector3(10, 8, -12), type: 'parameter', links: [], description: "Arity/depth of the Synkolator." },
    'korporator': { id: 'korporator', name: 'Korporator ({})', chapter: 3, position: new THREE.Vector3(0, -5, -8), type: 'operator', links: ['syntrix'], description: "Operator combining multiple Syntrices." }
};


// Helper to get approx boundary radius for edge connection points
function getApproxBoundaryRadius(geometry, scale) {
    if (!geometry || (!geometry.isGeometry && !geometry.isBufferGeometry)) {
        return 1.0;
    }
    // Ensure bounding sphere is computed
    if (!geometry.boundingSphere) {
        geometry.computeBoundingSphere();
    }
    const radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 1.0;
    // Scale the radius by the object's scale
    const effectiveScale = scale || 1.0;
    return radius * effectiveScale;
}


/**
 * Initializes the Three.js visualization for the Concept Graph panel.
 * @param {THREE.Clock} appClock The main clock instance from app.js.
 * @returns {boolean} True if initialization was successful, false otherwise.
 */
export function initConceptVisualization(appClock) {
    // Check if required libraries are loaded and no critical errors
    if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined' || typeof THREE.CSS2DRenderer === 'undefined') {
        displayError("Three.js, OrbitControls, or CSS2DRenderer not loaded for Concept Graph.", false, 'concept-error-message');
        conceptInitialized = false; // Ensure flag is false on failure
        return false;
    }
    try {
        // Get containers
        conceptContainer = document.getElementById('concept-panel');
        conceptInfoPanel = document.getElementById('info-panel');
        if (!conceptContainer || !conceptInfoPanel) {
            displayError("Concept panel or info panel not found.", false, 'concept-error-message');
            conceptInitialized = false;
            return false;
        }

        // Get container dimensions
        const width = conceptContainer.clientWidth;
        const height = conceptContainer.clientHeight;
        if (width <= 0 || height <= 0) {
            displayError("Concept panel has zero dimensions.", false, 'concept-error-message');
            conceptInitialized = false;
            return false;
        }

        // Use the clock instance passed from app.js
        conceptClock = appClock;

        // Create scene, camera, and renderers
        conceptScene = new THREE.Scene();
        conceptScene.background = new THREE.Color(0x111122); // Dark background
        conceptScene.fog = new THREE.Fog(0x111122, 60, 160); // Add fog for depth

        conceptCamera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
        conceptCamera.position.set(0, 15, 55); // Initial camera position

        conceptRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // Allow transparency
        conceptRenderer.setSize(width, height);
        conceptRenderer.setPixelRatio(window.devicePixelRatio);
        conceptContainer.appendChild(conceptRenderer.domElement); // Add WebGL renderer

        // CSS2D Renderer for labels
        conceptLabelRenderer = new THREE.CSS2DRenderer();
        conceptLabelRenderer.setSize(width, height);
        conceptLabelRenderer.domElement.style.position = 'absolute';
        conceptLabelRenderer.domElement.style.top = '0px';
        conceptLabelRenderer.domElement.style.left = '0px';
        conceptLabelRenderer.domElement.style.pointerEvents = 'none'; // Allow clicks to pass through labels
        conceptContainer.appendChild(conceptLabelRenderer.domElement); // Add label renderer

        // Orbit Controls for camera interaction
        conceptControls = new THREE.OrbitControls(conceptCamera, conceptRenderer.domElement);
        conceptControls.enableDamping = true; // Smooth movement
        conceptControls.dampingFactor = 0.05;
        conceptControls.minDistance = 10; // Limit zoom in
        conceptControls.maxDistance = 150; // Limit zoom out
        conceptControls.target.set(0, 5, -10); // Point camera towards the center of the graph area
        conceptControls.update(); // Apply initial target

        // Add lights
        const ambientLight = new THREE.AmbientLight(0x8080a0); // Soft ambient light
        conceptScene.add(ambientLight);
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0); // Main directional light
        dirLight1.position.set(5, 10, 7).normalize();
        conceptScene.add(dirLight1);
        const dirLight2 = new THREE.DirectionalLight(0xaaaaff, 0.5); // Secondary light
        dirLight2.position.set(-5, -5, -5).normalize();
        conceptScene.add(dirLight2);

        // Create placeholder plane for Live2D position reference (not visible, for info panel hover)
         const planeGeo = new THREE.PlaneGeometry(10, 10);
         const planeMat = new THREE.MeshBasicMaterial({ color: 0x555566, transparent: true, opacity: 0.0, side: THREE.DoubleSide });
         live2dPlaneConcept = new THREE.Mesh(planeGeo, planeMat);
         live2dPlaneConcept.position.set(0, -10, 0); // Position it somewhere relevant to the scene bounds
         // Add placeholder to interactable objects for info panel hover
         live2dPlaneConcept.userData = {
            type: 'live2d_avatar_ref',
            name: `Live2D Avatar`, // Name will be updated dynamically
             description: `Reference point for the Live2D avatar reflecting agent's emotional state.<br><i>Actual avatar is rendered separately in the other panel.</i>`
         };
         conceptScene.add(live2dPlaneConcept);


        // Create concept nodes and edges
        createConceptNodes();
        createConceptEdges();

        // Create placeholder objects for Agent State and Emergence Core
        createAgentSimulationPlaceholders();

        // Populate interactable objects list after creating all objects
        // This list needs to be updated whenever objects are added/removed.
        let conceptInteractableObjects = Object.values(conceptNodes).map(n => n.object);
        if (agentStateMesh) conceptInteractableObjects.push(agentStateMesh);
        if (live2dPlaneConcept) conceptInteractableObjects.push(live2dPlaneConcept);
        if (emergenceCoreMesh) conceptInteractableObjects.push(emergenceCoreMesh);


        // Setup interaction handlers (mousemove, click) using the populated list
        setupConceptInteraction(conceptInteractableObjects);

        // Add window resize listener for the concept panel
        window.addEventListener('resize', onConceptWindowResize, false);

        console.log('Concept visualization initialized successfully.');
        conceptInitialized = true;
        return true;
    } catch (e) {
        displayError(`Error initializing concept visualization: ${e.message}`, false, 'concept-error-message');
        console.error("Concept Viz Init Error:", e);
        conceptInitialized = false; // Ensure flag is false on failure
        return false;
    }
}

// Creates the 3D meshes and labels for the concept nodes
function createConceptNodes() {
    const baseSize = 1.5; // Base size for nodes
    conceptNodes = {}; // Clear existing nodes

    // Dispose any previous geometries/materials before creating new ones
    for (const nodeData of Object.values(conceptNodes)) {
        if (nodeData.object) {
            if (nodeData.object.geometry) nodeData.object.geometry.dispose();
            if (nodeData.object.material) nodeData.object.material.dispose();
             // Labels are CSS objects, cleanup handled during element removal or app cleanup
             if (nodeData.object.parent) {
                 nodeData.object.parent.remove(nodeData.object);
             } else {
                 conceptScene.remove(nodeData.object);
             }
        }
    }
    conceptNodes = {}; // Reset the object

    for (const id in conceptData) {
        const data = conceptData[id];

        // Determine geometry and material based on node type
        let geometry;
        let material;
        let currentScale = 1.0; // Initial scale

        switch (data.type) {
            case 'framework':
                geometry = new THREE.BoxGeometry(baseSize * 2.5, baseSize * 2.5, baseSize * 2.5);
                material = new THREE.MeshPhongMaterial({ color: 0x66ccff, shininess: 60, transparent: true, opacity: 0.9 });
                break;
            case 'structure':
                geometry = new THREE.SphereGeometry(baseSize * 1.2, 32, 16);
                material = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 });
                break;
            case 'core':
                geometry = new THREE.SphereGeometry(baseSize * 0.9, 24, 12);
                material = new THREE.MeshPhongMaterial({ color: 0xffff66, shininess: 100 });
                break;
            case 'component':
                geometry = new THREE.SphereGeometry(baseSize, 16, 12);
                material = new THREE.MeshPhongMaterial({ color: 0x66ffaa, shininess: 50 });
                break;
            case 'property':
                geometry = new THREE.SphereGeometry(baseSize * 0.8, 12, 8);
                material = new THREE.MeshPhongMaterial({ color: 0xffaaff, shininess: 40 });
                break;
            case 'parameter':
                geometry = new THREE.SphereGeometry(baseSize * 0.7, 12, 8);
                material = new THREE.MeshPhongMaterial({ color: 0xaaffff, shininess: 30 });
                break;
            case 'operator':
                geometry = new THREE.OctahedronGeometry(baseSize * 1.1, 0);
                material = new THREE.MeshPhongMaterial({ color: 0xffaa66, shininess: 70 });
                break;
            case 'method':
                geometry = new THREE.CylinderGeometry(baseSize * 0.6, baseSize * 0.6, baseSize * 2.0, 16);
                material = new THREE.MeshPhongMaterial({ color: 0xff66ff, shininess: 60 });
                break;
             // Exclude 'dimension' type nodes as requested
            default:
                 console.warn(`Unknown concept node type: ${data.type} for ${id}. Skipping.`);
                 continue; // Skip creating node for unknown or excluded type
        }

        // Create the mesh object
        const node = new THREE.Mesh(geometry, material);
        node.position.copy(data.position); // Set position
        node.scale.set(currentScale, currentScale, currentScale); // Apply initial scale
        // Store data in userData for interaction
        node.userData = { id: data.id, name: data.name, type: data.type, description: data.description, chapter: data.chapter, links: data.links };
        conceptScene.add(node); // Add node to scene

        // Create CSS2D label
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label'; // Use defined CSS class
        labelDiv.textContent = data.name;
        const label = new THREE.CSS2DObject(labelDiv);

        // Position label above the node, adjusting based on node type/size
         const baseOffset = {
             'framework': 1.8,
             'structure': 1.5,
             'core': 1.3,
             'component': 1.5,
             'property': 1.2,
             'parameter': 1.1,
             'operator': 1.6,
             'method': 1.8
         }[data.type] || 1.5; // Default offset

        label.position.set(0, baseOffset * currentScale, 0);
        node.add(label); // Add label as a child of the node

        conceptNodes[id] = { object: node, label: label, data: data }; // Store node object and data
    }
    console.log(`Created ${Object.keys(conceptNodes).length} concept nodes.`);
}

// Creates the curved tube edges between concept nodes
function createConceptEdges() {
    // Dispose any previous edge meshes before creating new ones
    conceptEdges.forEach(edge => {
         if (edge.geometry) edge.geometry.dispose();
         if (edge.material) edge.material.dispose();
         if (edge.parent) {
            edge.parent.remove(edge);
         } else {
             conceptScene.remove(edge);
         }
    });
    conceptEdges = []; // Reset the array


    // Material for edges
    const material = new THREE.MeshPhongMaterial({
        color: 0x888888, // Greyish color
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide // Render on both sides
    });

    const visitedEdges = new Set(); // Set to prevent duplicate edges (e.g., if A links to B and B links to A)

    const tubularSegments = 20; // Number of segments along the tube
    const tubeRadius = 0.1; // Radius of the tube
    const tubeDetail = 8; // Number of segments around the tube

    const nodeRadiusFactor = 1.2; // Factor to extend edge endpoint slightly beyond node sphere

    for (const id of Object.keys(conceptNodes)) {
        const sourceNode = conceptNodes[id];
        if (!sourceNode || !sourceNode.object) {
            console.warn(`Invalid sourceNode for id ${id}, cannot create edges.`);
            continue;
        }
        const sourceScale = sourceNode.object.scale.x;
         // Calculate the adjusted start point of the edge (slightly outside the node)
        const sourceBoundary = getApproxBoundaryRadius(sourceNode.object.geometry, sourceScale) * nodeRadiusFactor;
        const sourcePos = sourceNode.object.position;

        const links = sourceNode.data.links || []; // Get links from source node data

        for (const targetId of links) {
            const targetNode = conceptNodes[targetId];

            // Skip if target node doesn't exist (e.g., linking to a filtered-out node like dimensions)
            if (!targetNode || !targetNode.object) {
                 // console.warn(`Target node ${targetId} not found for link from ${id}. Skipping edge creation.`);
                continue;
            }

            // Create a unique key for the edge regardless of direction (e.g., 'idA-idB')
            const edgeKey = [id, targetId].sort().join('-');
            if (visitedEdges.has(edgeKey)) {
                continue; // Skip if edge already created
            }
            visitedEdges.add(edgeKey); // Mark edge as visited

            const targetScale = targetNode.object.scale.x;
             // Calculate the adjusted end point of the edge (slightly outside the node)
            const targetBoundary = getApproxBoundaryRadius(targetNode.object.geometry, targetScale) * nodeRadiusFactor;
            const targetPos = targetNode.object.position;

            const direction = new THREE.Vector3().subVectors(targetPos, sourcePos);
            const distance = direction.length();

            if (distance < 1e-6) {
                continue; // Skip if nodes are at the same position
            }

             // Calculate actual start and end points adjusted for node size
            const sourceAdjust = direction.clone().normalize().multiplyScalar(sourceBoundary);
            const targetAdjust = direction.clone().normalize().multiplyScalar(-targetBoundary);

            const startPoint = new THREE.Vector3().addVectors(sourcePos, sourceAdjust);
            const endPoint = new THREE.Vector3().addVectors(targetPos, targetAdjust);

            // Create a curved path using CubicBezierCurve3
            const midPoint = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.5);
            // Add some randomness to control points for varied curves
            const controlPoint1 = new THREE.Vector3(
                midPoint.x + (Math.random() - 0.5) * 5,
                midPoint.y + (Math.random() - 0.5) * 5,
                midPoint.z + (Math.random() - 0.5) * 5
            );
            const controlPoint2 = new THREE.Vector3(
                midPoint.x + (Math.random() - 0.5) * 5,
                midPoint.y + (Math.random() - 0.5) * 5,
                midPoint.z + (Math.random() - 0.5) * 5
            );

            const points = [startPoint, controlPoint1, controlPoint2, endPoint];
            const curve = new THREE.CubicBezierCurve3(...points);

            // Create a tube geometry along the curve
            const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, tubeDetail, false);
            const edgeMesh = new THREE.Mesh(tubeGeo, material); // Create the mesh

            // Store source/target IDs in userData for potential interaction
            edgeMesh.userData = { source: id, target: targetId, type: 'edge' };

            conceptScene.add(edgeMesh); // Add edge to scene
            conceptEdges.push(edgeMesh); // Store edge reference
        }
    }
    console.log(`Created ${conceptEdges.length} concept edges.`);
}


// Creates placeholder objects for agent state and emergence core in the concept graph
function createAgentSimulationPlaceholders() {
     // Dispose previous meshes if they exist
     if (agentStateMesh) {
         if (agentStateMesh.geometry) agentStateMesh.geometry.dispose();
         if (agentStateMesh.material) agentStateMesh.material.dispose();
         if (agentStateLabel) agentStateLabel.element.remove(); // Remove CSS label element
         conceptScene.remove(agentStateMesh);
     }
     if (emergenceCoreMesh) {
         if (emergenceCoreMesh.geometry) emergenceCoreMesh.geometry.dispose();
         if (emergenceCoreMesh.material) emergenceCoreMesh.material.dispose();
         if (emergenceCoreLabel) emergenceCoreLabel.element.remove(); // Remove CSS label element
         conceptScene.remove(emergenceCoreMesh);
     }

    // Agent State Placeholder (Sphere)
    const agentGeo = new THREE.SphereGeometry(1.5, 32, 16);
    const agentMat = new THREE.MeshPhongMaterial({
        color: 0x66ff66, // Greenish
        shininess: 80,
        transparent: true,
        opacity: 0.7
    });
    agentStateMesh = new THREE.Mesh(agentGeo, agentMat);
    agentStateMesh.position.set(15, -5, 0); // Position relative to other concepts
    agentStateMesh.userData = { // Store data for info panel
        type: 'simulation_state',
        name: 'Agent Emotional State',
        description: 'Represents the agent\'s emotional state (Joy, Fear, etc.). Updates dynamically.'
    };
    conceptScene.add(agentStateMesh); // Add to scene

    // Label for Agent State
    const agentLabelDiv = document.createElement('div');
    agentLabelDiv.className = 'label';
    agentLabelDiv.textContent = 'Agent State';
    agentStateLabel = new THREE.CSS2DObject(agentLabelDiv);
    agentStateLabel.position.set(0, 2.0, 0); // Position above the sphere
    agentStateMesh.add(agentStateLabel); // Add label as child

    // Emergence Core Placeholder (Tetrahedron)
    const coreGeo = new THREE.TetrahedronGeometry(2.0, 2); // Tetrahedron geometry
    const coreMat = new THREE.MeshPhongMaterial({
        color: 0xff66ff, // Purplish
        shininess: 100,
        transparent: true,
        opacity: 0.8
    });
    emergenceCoreMesh = new THREE.Mesh(coreGeo, coreMat);
    emergenceCoreMesh.position.set(-15, -5, 0); // Position relative to other concepts
    emergenceCoreMesh.userData = { // Store data for info panel
        type: 'simulation_state',
        name: 'Emergence Core',
        description: 'Represents Reflexive Integration (RIH) and Affinities from agent processing.'
    };
    conceptScene.add(emergenceCoreMesh); // Add to scene

    // Label for Emergence Core
    const coreLabelDiv = document.createElement('div');
    coreLabelDiv.className = 'label';
    coreLabelDiv.textContent = 'Emergence Core';
    emergenceCoreLabel = new THREE.CSS2DObject(coreLabelDiv);
    emergenceCoreLabel.position.set(0, 2.5, 0); // Position above the tetrahedron
    emergenceCoreMesh.add(emergenceCoreLabel); // Add label as child

     // Link these placeholders to relevant concepts if desired (optional)
     // E.g., agentStateMesh.userData.links = ['syntrometry', 'subjective_aspect'];
     // emergenceCoreMesh.userData.links = ['reflexive_integration', 'affinitaetssyndrom'];


    console.log("Agent simulation placeholders created.");
}

/**
 * Updates the visuals of the agent state and emergence core placeholders.
 * This function also updates the internal `latest...` variables used by `updateInfoPanel`.
 * @param {tf.Tensor|null} emotionsTensor Tensor of current emotion intensities.
 * @param {number} rihScore The current RIH score (0-1).
 * @param {number} avgAffinity The current average affinity score.
 * @param {string} hmLabel The current head movement label.
 */
export function updateAgentSimulationVisuals(emotionsTensor, rihScore, avgAffinity, hmLabel) {
    // Only update if initialized and meshes exist
    if (!conceptInitialized || !agentStateMesh || !emergenceCoreMesh || !live2dPlaneConcept) return;

    // Store latest data for the info panel access
    latestAgentEmotions = emotionsTensor && typeof emotionsTensor.arraySync === 'function' ? emotionsTensor.arraySync()[0] : zeros([Config.Agent.EMOTION_DIM]);
    latestRIHScore = rihScore;
    latestAvgAffinity = avgAffinity;
    latestHmLabel = hmLabel;


    // --- Update Agent State Mesh (Sphere) ---
    const emotions = latestAgentEmotions; // Use stored latest emotions

    // Get individual emotion values safely (handle potential undefined)
    const joyVal = emotions && emotions.length > 0 ? emotions[0] || 0 : 0;
    const fearVal = emotions && emotions.length > 1 ? emotions[1] || 0 : 0;
    const curiosityVal = emotions && emotions.length > 2 ? emotions[2] || 0 : 0;
    const frustrationVal = emotions && emotions.length > 3 ? emotions[3] || 0 : 0;
    const calmVal = emotions && emotions.length > 4 ? emotions[4] || 0 : 0;
    const surpriseVal = emotions && emotions.length > 5 ? emotions[5] || 0 : 0;


    // Find dominant emotion and map to a color
    const dominantEmotionIdx = emotions && emotions.length === Config.Agent.EMOTION_DIM ? emotions.indexOf(Math.max(...emotions)) : -1;
    const dominantEmotion = dominantEmotionIdx !== -1 ? emotionNames[dominantEmotionIdx] : 'Unknown';

    const emotionColor = { // Use imported emotionNames here
        'Joy': 0x66ff66,       // Green
        'Fear': 0xff6666,      // Red
        'Curiosity': 0x66ccff, // Light Blue
        'Frustration': 0xff9966, // Orange
        'Calm': 0x99ffcc,      // Teal
        'Surprise': 0xffff66,  // Yellow
        'Unknown': 0xcccccc    // Grey
    }[dominantEmotion]; // Get color for the dominant emotion

    // Lerp (smoothly transition) the sphere's color towards the dominant emotion color
    if (agentStateMesh.material.color) {
        const targetColor = new THREE.Color(emotionColor);
        agentStateMesh.material.color.lerp(targetColor, 0.1); // Smooth transition factor (0.1)
    }

    // Scale the sphere based on overall emotional intensity
    const emotionIntensity = emotions && emotions.length === Config.Agent.EMOTION_DIM ? emotions.reduce((sum, val) => sum + val, 0) / Config.Agent.EMOTION_DIM : 0; // Average intensity
    const agentScale = 1.0 + emotionIntensity * 0.5; // Scale based on intensity
    agentStateMesh.scale.set(agentScale, agentScale, agentScale); // Apply scale


    // Update the description in userData for the info panel
    agentStateMesh.userData.description = `Represents the agent's emotional state.<br>` +
        `<span class="simulated-data">Dominant Feeling: ${dominantEmotion}<br>` +
        `Joy: ${(joyVal * 100).toFixed(1)}%, Fear: ${(fearVal * 100).toFixed(1)}%<br>` +
        `Curiosity: ${(curiosityVal * 100).toFixed(1)}%, Frustration: ${(frustrationVal * 100).toFixed(1)}%<br>` +
        `Calm: ${(calmVal * 100).toFixed(1)}%, Surprise: ${(surpriseVal* 100).toFixed(1)}%</span>`;


    // --- Update Emergence Core Mesh (Tetrahedron) ---

    // Lerp color based on RIH score (e.g., towards white for higher RIH)
    if (emergenceCoreMesh.material.color) {
         const targetColor = new THREE.Color(0xff66ff).lerp(new THREE.Color(0xffffff), clamp(rihScore, 0, 1) * 0.5); // Lerp towards white
        emergenceCoreMesh.material.color.lerp(targetColor, 0.1); // Smooth transition
    }

    // Scale based on RIH score and average affinity
    const coreScale = 1.0 + clamp(rihScore, 0, 1) * 0.8 + clamp(avgAffinity, -1, 1) * 0.3; // Scale factors
    emergenceCoreMesh.scale.set(coreScale, coreScale, coreScale); // Apply scale

    // Update opacity based on RIH score
    emergenceCoreMesh.material.opacity = clamp(0.6 + clamp(rihScore, 0, 1) * 0.3, 0.6, 0.9);

    // Update description in userData for the info panel
    emergenceCoreMesh.userData.description = `Represents Reflexive Integration and Affinities.<br>` +
        `<span class="simulated-data">RIH Score: ${(rihScore * 100).toFixed(1)}%<br>` +
        `Average Affinity: ${(avgAffinity * 100).toFixed(1)}%</span>`;


    // --- Update Live2D Placeholder Info ---
     // This placeholder doesn't have visuals in this scene, just updates its userData for the info panel
     if (live2dPlaneConcept) {
         // Check if live2dInitialized is available globally (or passed)
         const live2dStatus = live2dInitialized ? 'Active' : 'Inactive'; // Use the imported flag
         live2dPlaneConcept.userData.description = `Live2D avatar reflecting agent's emotional state.<br>` +
            `<span class="simulated-data">Dominant Feeling: ${dominantEmotion}<br>` +
            `Current Action: ${hmLabel}<br>` +
            `Agent RIH: ${(rihScore * 100).toFixed(1)}%</span>`;
         // Update its name to reflect activity status - requires live2dInitialized status
         live2dPlaneConcept.userData.name = `Live2D Avatar (Status: ${live2dStatus})`;

     }


    // --- Update Edge Opacity in Concept Graph ---
    // Make edges slightly more visible when RIH or Avg Affinity is high
    conceptEdges.forEach(edge => {
        if (edge.material) {
             // Opacity increases with RIH and Avg Affinity
            edge.material.opacity = clamp(0.3 + clamp(rihScore, 0, 1) * 0.3 + clamp(avgAffinity, -1, 1) * 0.2, 0.3, 0.7);
        }
    });
}


// Sets up raycasting and event listeners for interacting with concept nodes
function setupConceptInteraction(interactableObjects) {
    if (!conceptContainer || !conceptInfoPanel) return; // Check if elements are available

    conceptRaycaster = new THREE.Raycaster(); // Raycaster for picking objects
    conceptMouse = new THREE.Vector2(); // 2D vector for mouse coordinates

    // Add event listeners for mouse movements and clicks
    conceptContainer.addEventListener('mousemove', (event) => onConceptMouseMove(event, interactableObjects), false);
    conceptContainer.addEventListener('click', (event) => onConceptClick(event, interactableObjects), false);

     // Initialize info panel content
     updateInfoPanel(null); // Call updateInfoPanel to set initial text
}

// Handles mouse movement over the concept graph container
function onConceptMouseMove(event, interactableObjects) {
    if (!conceptInitialized || !conceptCamera || !conceptRaycaster || !conceptMouse || !conceptContainer || !interactableObjects) return;

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = conceptContainer.getBoundingClientRect();
    conceptMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    conceptMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Update the picking ray with the camera and mouse position
    conceptRaycaster.setFromCamera(conceptMouse, conceptCamera);

    // Find objects intersecting the ray. Intersect objects in the provided list.
    const intersects = conceptRaycaster.intersectObjects(interactableObjects, false);

    let hoveredObject = null;
    if (intersects.length > 0) {
         // Get the first intersected object (closest to camera)
        hoveredObject = intersects[0].object;

        // Change cursor to pointer
        conceptContainer.style.cursor = 'pointer';
    } else {
        // Restore default cursor if no object is hovered
        conceptContainer.style.cursor = 'default';
    }

    // Update the info panel based on the hovered object
    updateInfoPanel(hoveredObject);
}

// Handles mouse clicks on the concept graph container
function onConceptClick(event, interactableObjects) {
    if (!conceptInitialized || !conceptCamera || !conceptRaycaster || !conceptMouse || !conceptContainer || !conceptControls || !interactableObjects) return;

     // Recalculate mouse position and ray (in case mousemove was skipped)
     const rect = conceptContainer.getBoundingClientRect();
     conceptMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
     conceptMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
     conceptRaycaster.setFromCamera(conceptMouse, conceptCamera);


    // Find objects intersected by the click ray
    const intersects = conceptRaycaster.intersectObjects(interactableObjects, false);

    if (intersects.length > 0) {
         // Get the first intersected object
        const clickedObject = intersects[0].object;

        // console.log(`Clicked: ${clickedObject.userData.name || clickedObject.userData.id || 'Unknown Object'}`);

        // If the clicked object is a concept node or placeholder with position data
        if (clickedObject.userData && clickedObject.position) {
             // Move the camera target to the clicked object's position
            conceptControls.target.copy(clickedObject.position);
             // Optional: smoothly move the camera position slightly towards a view of the target
             // conceptCamera.position.lerp(clickedObject.position.clone().add(new THREE.Vector3(0, 5, 20)), 0.1); // Example smooth move
            conceptControls.update(); // Update controls to apply the new target
        }
    }
}

/**
 * Updates the content of the info panel based on the hovered object.
 * Accesses the latest simulation data stored in the module's scope.
 * @param {THREE.Object3D|null} hoveredObject The Three.js object currently hovered.
 */
export function updateInfoPanel(hoveredObject) {
    if (!conceptInfoPanel) return; // Ensure the info panel element exists
    // Assumes emotionNames is available in this module scope (imported)

    // Clear the panel if nothing is hovered or object has no data
    if (!hoveredObject || !hoveredObject.userData) {
        conceptInfoPanel.innerHTML = `
            <h3>Concept Information</h3>
            <p>Hover over a node or object to see details.</p>
            <p>Click to focus the camera on a concept.</p>
             <p><i>Simulated data updates based on agent processing.</i></p>
             <p><span class="simulated-data">Latest RIH: ${(latestRIHScore * 100).toFixed(1)}%</span></p>
             <p><span class="simulated-data">Latest Avg Affinity: ${(latestAvgAffinity * 100).toFixed(1)}%</span></p>
        `;
        return; // Stop here
    }

    const data = hoveredObject.userData; // Get the stored user data

    // If the hovered object is the Live2D placeholder, update its name here
    if (data.type === 'live2d_avatar_ref') {
         // Check if live2dInitialized is available globally (or passed)
         const live2dStatus = live2dInitialized ? 'Active' : 'Inactive'; // Use the imported flag
         data.name = `Live2D Avatar (Status: ${live2dStatus})`;
    }


    // Build HTML for linked concepts with tooltips
    let linksHtml = '';
    if (data.links && data.links.length > 0) {
        linksHtml = '<p><b>Connected Concepts:</b></p><ul class="links-list">';
        data.links.forEach(linkId => {
            const linkData = conceptData[linkId]; // Look up linked concept data
            if (linkData) {
                 // Add linked concept name with its description as a title for tooltip
                linksHtml += `<li><span title="${linkData.description || ''}">${linkData.name}</span></li>`;
            } else {
                 // Fallback if linked concept data is missing
                 linksHtml += `<li>Unknown Concept (${linkId})</li>`;
            }
        });
        linksHtml += '</ul>';
    }

    // Build the info panel content
    conceptInfoPanel.innerHTML = `
        <h3>${data.name || 'Unknown'}</h3>
         <p><b>Type:</b> ${data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1) : 'N/A'}</p>
        ${data.chapter ? `<p><b>Chapter:</b> ${data.chapter}</p>` : ''}
        <p>${data.description || 'No description available.'}</p>
        ${linksHtml}
    `;
}


/**
 * Animates concept nodes (rotation, oscillation).
 * @param {number} deltaTime The time elapsed since the last frame.
 */
export function animateConceptNodes(deltaTime) {
     // Only animate if concept visualization is initialized and clock exists
    if (!conceptInitialized || !conceptClock || !conceptNodes) return;

    const time = conceptClock.getElapsedTime(); // Get elapsed time from the clock

    // Animate concept nodes
    Object.values(conceptNodes).forEach(node => {
        const data = node.data; // Get node data
        const object = node.object; // Get the THREE.Mesh

        if (!object || !object.rotation) return; // Safety check

        // Basic rotation for visual interest
        object.rotation.y += deltaTime * 0.2;

        // Specific animations per type (example: operator rotation)
        if (data.type === 'operator') {
            object.rotation.x += deltaTime * 0.3;
            object.rotation.z += deltaTime * 0.4;
        }

         // Optional: Add oscillation effect to position/scale
         // const baseScale = 1.0; // Assumed base scale from creation
         // const scaleOscillation = Math.sin(time * 2 + object.position.x) * 0.05;
         // const newScale = baseScale * (1 + scaleOscillation); // Apply oscillation factor to base scale
         // object.scale.set(newScale, newScale, newScale); // Apply scale oscillation


         // const offsetY = Math.sin(time * 0.5 + object.position.z) * 0.5;
         // object.position.y = data.position.y + offsetY; // Oscillate position along Y relative to original data position
    });

    // Animate Agent State and Emergence Core meshes (rotation)
    if (agentStateMesh && agentStateMesh.rotation) {
        agentStateMesh.rotation.y += deltaTime * 0.3;
    }
    if (emergenceCoreMesh && emergenceCoreMesh.rotation) {
        emergenceCoreMesh.rotation.y += deltaTime * 0.4;
        emergenceCoreMesh.rotation.x += deltaTime * 0.2;
    }
}


/**
 * Handle window resize for the Concept Graph Panel.
 */
function onConceptWindowResize() {
    if (!conceptInitialized || !conceptCamera || !conceptRenderer || !conceptLabelRenderer || !conceptContainer) return;

    const width = conceptContainer.clientWidth;
    const height = conceptContainer.clientHeight;

    if (width <= 0 || height <= 0) {
        // Cannot resize with zero dimensions
        return;
    }

    // Update camera aspect ratio and projection matrix
    conceptCamera.aspect = width / height;
    conceptCamera.updateProjectionMatrix();

    // Update renderer sizes
    conceptRenderer.setSize(width, height);
    conceptLabelRenderer.setSize(width, height);
}

// Add resize listener if init is successful (handled in initConceptVisualization)


/**
 * Cleans up Three.js resources for the Concept Graph panel.
 */
export function cleanupConceptVisualization() {
     if (!conceptInitialized) return;
     console.log("Cleaning up Concept Graph Three.js...");

     // Remove resize listener
    window.removeEventListener('resize', onConceptWindowResize);

     // Remove interaction listeners
     if (conceptContainer) {
         conceptContainer.removeEventListener('mousemove', (event) => onConceptMouseMove(event, []), false); // Pass empty array or null
         conceptContainer.removeEventListener('click', (event) => onConceptClick(event, []), false); // Pass empty array or null
     }


     // Dispose renderer and remove canvases/elements
    if (conceptRenderer) {
        conceptRenderer.dispose();
        if (conceptContainer && conceptContainer.contains(conceptRenderer.domElement)) {
             conceptContainer.removeChild(conceptRenderer.domElement);
        }
        conceptRenderer = null;
    }
    if (conceptLabelRenderer && conceptLabelRenderer.domElement) {
        conceptLabelRenderer.domElement.remove();
        conceptLabelRenderer = null;
    }

    // Dispose concept node geometries and materials
    Object.values(conceptNodes).forEach(cn => {
        const node = cn.object;
        if (node) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) node.material.dispose();
            // Remove from scene
            if (node.parent) {
                 node.parent.remove(node);
             } else {
                 conceptScene.remove(node);
             }
        }
         // CSS labels' elements removed by labelRenderer cleanup or manually
         if (cn.label && cn.label.element && cn.label.element.parentNode) {
             cn.label.element.parentNode.removeChild(cn.label.element);
         }
    });
    conceptNodes = {}; // Clear the object

    // Dispose concept edge geometries and materials
    conceptEdges.forEach(edge => {
        if (edge.geometry) edge.geometry.dispose();
        if (edge.material) edge.material.dispose();
        // Remove from scene
         if (edge.parent) {
             edge.parent.remove(edge);
         } else {
             conceptScene.remove(edge);
         }
    });
    conceptEdges = []; // Clear the array

    // Dispose Agent/Emergence meshes
    if(agentStateMesh) {
        if (agentStateMesh.geometry) agentStateMesh.geometry.dispose();
        if (agentStateMesh.material) agentStateMesh.material.dispose();
        if (agentStateLabel && agentStateLabel.element && agentStateLabel.element.parentNode) agentStateLabel.element.parentNode.removeChild(agentStateLabel.element);
        conceptScene.remove(agentStateMesh);
        agentStateMesh = null;
        agentStateLabel = null;
    }
    if(emergenceCoreMesh) {
        if (emergenceCoreMesh.geometry) emergenceCoreMesh.geometry.dispose();
        if (emergenceCoreMesh.material) emergenceCoreMesh.material.dispose();
        if (emergenceCoreLabel && emergenceCoreLabel.element && emergenceCoreLabel.element.parentNode) emergenceCoreLabel.element.parentNode.removeChild(emergenceCoreLabel.element);
        conceptScene.remove(emergenceCoreMesh);
        emergenceCoreMesh = null;
        emergenceCoreLabel = null;
    }
    if(live2dPlaneConcept) {
        if (live2dPlaneConcept.geometry) live2dPlaneConcept.geometry.dispose();
        if (live2dPlaneConcept.material) live2dPlaneConcept.material.dispose();
        conceptScene.remove(live2dPlaneConcept);
        live2dPlaneConcept = null;
    }

    // Dispose controls target
    if (conceptControls && conceptControls.target && typeof conceptControls.target.dispose === 'function') {
         // THREE.Vector3 doesn't have a dispose method, this is a placeholder if a disposable target was used.
    }
    conceptControls = null; // Nullify controls

    // Dispose scene (optional, often not necessary unless using complex materials/textures)
    // conceptScene.dispose(); // Use with caution
    conceptScene = null; // Nullify scene

    conceptInitialized = false;
     console.log("Concept Graph Three.js cleanup complete.");
}