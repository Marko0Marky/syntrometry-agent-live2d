// @ts-nocheck
// js/viz-concepts.ts
// Import THREE and related components with proper types
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
// Import local modules (assuming they are typed)
import { Config, emotionNames } from './config.js';
import { clamp, displayError, zeros, lerp } from './utils.js';
import { live2dInitialized } from './viz-live2d.js'; // Type boolean
// --- Exports for app.js ---
export let conceptScene = null;
export let conceptCamera = null;
export let conceptRenderer = null;
export let conceptLabelRenderer = null;
export let conceptControls = null;
export let conceptInitialized = false;
// --- Internal Module Variables ---
let conceptRaycaster = null;
let conceptMouse = null;
let conceptNodes = {}; // Use Record for typed map
let conceptEdges = []; // Edges are Meshes (TubeGeometry)
let conceptContainer = null;
let conceptInfoPanel = null;
let conceptClock = null;
let agentStateMesh = null;
let emergenceCoreMesh = null;
let agentStateLabel = null;
let emergenceCoreLabel = null;
let live2dPlaneConcept = null;
let baseConceptEdgeMaterial = null;
let hoveredObject = null; // Can be Mesh or other Object3D
let selectedObject = null;
// Cached simulation state
let latestAgentEmotions = null; // Store as array
let latestRIHScore = 0;
let latestAvgAffinity = 0;
let latestTrustScore = 1.0;
let latestHmLabel = "idle"; // Use HeadMovementLabel type from config if strict
// Type the main conceptData object
const conceptData = {
    // ... (Keep your existing conceptData object here) ...
    'reflexive_abstraction': { id: 'reflexive_abstraction', name: 'Reflexive Abstraction', chapter: 1, position: new THREE.Vector3(0, 25, -35), type: 'method', links: ['syntrometry'], description: "Method to overcome subjective limits by analyzing reflection itself." },
    'subjective_aspect': { id: 'subjective_aspect', name: 'Subjective Aspect (S)', chapter: 1, position: new THREE.Vector3(-20, 20, -30), type: 'structure', links: ['pradikatrix', 'dialektik', 'koordination', 'aspektivsystem'], description: "Contextual framework for statements; a viewpoint." },
    'pradikatrix': { id: 'pradikatrix', name: 'Prädikatrix (Pm)', chapter: 1, position: new THREE.Vector3(-30, 25, -25), type: 'component', links: ['subjective_aspect'], description: "Schema of potential statements/predicates." },
    // ... rest of your concept data
    'agent_emotional_state': { id: 'agent_emotional_state', name: 'Agent Emotional State', chapter: 'Simulation', position: new THREE.Vector3(25, -5, 0), type: 'simulation_state', links: ['subjective_aspect', 'aonische_area', 'reflexive_integration', 'live2d_avatar_ref'], description: 'Represents the agent\'s emotional state (Joy, Fear, etc.). Updates dynamically based on simulation.' },
    'emergence_core': { id: 'emergence_core', name: 'Emergence Core (RIH/Affinity)', chapter: 'Simulation', position: new THREE.Vector3(-25, -5, 0), type: 'simulation_state', links: ['reflexive_integration', 'affinitaetssyndrom', 'syntropodenarchitektonik', 'agent_emotional_state'], description: 'Represents key emergent properties like Reflexive Integration (RIH), Affinities, and Trust from agent processing.' },
    'live2d_avatar_ref': { id: 'live2d_avatar_ref', name: 'Live2D Avatar Ref', chapter: 'Visualization', position: new THREE.Vector3(0, -10, 0), type: 'live2d_avatar_ref', links: ['agent_emotional_state'], description: `Logical link point for the Live2D avatar. Its appearance in the other panel reflects the Agent Emotional State.<br><i>(This node is visually represented by an invisible plane).</i>` }
};
// --- Helper to get approximate boundary radius ---
function getApproxBoundaryRadius(geometry, scale = 1.0) {
    if (!geometry)
        return 1.0 * scale;
    // Ensure bounding sphere exists
    try {
        // Cast to any to access boundingSphere and computeBoundingSphere
        const geo = geometry;
        if (!geo.boundingSphere) {
            if (typeof geo.computeBoundingSphere === 'function') {
                geo.computeBoundingSphere();
            }
            else {
                console.warn("Geometry type doesn't support computeBoundingSphere:", geometry);
                return 1.0 * scale;
            }
        }
        // Check again after computation attempt
        if (!geo.boundingSphere)
            return 1.0 * scale;
        return geo.boundingSphere.radius * scale;
    }
    catch (e) {
        console.warn("Could not compute bounding sphere for geometry:", geometry, e);
        return 1.0 * scale;
    }
}
/** Initializes the Concept Graph visualization. */
export function initConceptVisualization(appClock) {
    // Dependency check
    if (typeof THREE === 'undefined' || typeof OrbitControls === 'undefined' || typeof CSS2DRenderer === 'undefined' || typeof CSS2DObject === 'undefined') {
        displayError("Three.js or its examples (OrbitControls/CSS2DRenderer/CSS2DObject) not fully loaded for Concept Graph.", false, 'concept-error-message');
        conceptInitialized = false;
        return false;
    }
    try {
        cleanupConceptVisualization(); // Ensure clean state
        conceptContainer = document.getElementById('concept-panel');
        conceptInfoPanel = document.getElementById('info-panel');
        const infoToggleButton = document.getElementById('toggle-info-panel'); // Type assertion
        if (!conceptContainer || !conceptInfoPanel || !infoToggleButton) {
            displayError("Concept panel, info panel, or toggle button not found.", false, 'concept-error-message');
            conceptInitialized = false;
            return false;
        }
        const width = conceptContainer.clientWidth;
        const height = conceptContainer.clientHeight;
        conceptClock = appClock;
        conceptScene = new THREE.Scene();
        conceptScene.background = new THREE.Color(0x111122);
        conceptScene.fog = new THREE.Fog(0x111122, 60, 160);
        conceptCamera = new THREE.PerspectiveCamera(65, width / Math.max(height, 1), 0.1, 1000);
        conceptCamera.position.set(0, 15, 55);
        conceptRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        conceptRenderer.setSize(width, height);
        conceptRenderer.setPixelRatio(window.devicePixelRatio);
        conceptContainer.appendChild(conceptRenderer.domElement);
        conceptLabelRenderer = new CSS2DRenderer(); // Use class
        conceptLabelRenderer.setSize(width, height);
        conceptLabelRenderer.domElement.style.position = 'absolute';
        conceptLabelRenderer.domElement.style.top = '0px';
        conceptLabelRenderer.domElement.style.left = '0px';
        conceptLabelRenderer.domElement.style.pointerEvents = 'none';
        conceptContainer.appendChild(conceptLabelRenderer.domElement);
        conceptControls = new OrbitControls(conceptCamera, conceptRenderer.domElement); // Use class
        conceptControls.enableDamping = true;
        conceptControls.dampingFactor = 0.05;
        conceptControls.minDistance = 10;
        conceptControls.maxDistance = 150;
        conceptControls.target.set(0, 5, -10);
        conceptControls.update();
        const ambientLight = new THREE.AmbientLight(0x8080a0, 0.6);
        conceptScene.add(ambientLight);
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(5, 10, 7).normalize();
        conceptScene.add(dirLight1);
        const dirLight2 = new THREE.DirectionalLight(0xaaaaff, 0.4);
        dirLight2.position.set(-5, -5, -5).normalize();
        conceptScene.add(dirLight2);
        baseConceptEdgeMaterial = new THREE.MeshPhongMaterial({
            color: Config.Visualization.Edge.BaseColor,
            emissive: Config.Visualization.Edge.BaseEmissive,
            transparent: true,
            opacity: Config.Visualization.Edge.BaseOpacity,
            side: THREE.DoubleSide
        });
        createConceptNodes();
        createAgentSimulationPlaceholders();
        createConceptEdges();
        const interactableObjects = [
            ...Object.values(conceptNodes).map(n => n.object),
            agentStateMesh,
            emergenceCoreMesh,
        ].filter((o) => o !== null); // Use type guard and filter nulls
        setupConceptInteraction(interactableObjects);
        infoToggleButton.onclick = () => {
            conceptInfoPanel?.classList.toggle('visible'); // Optional chaining
            infoToggleButton.setAttribute('aria-expanded', String(conceptInfoPanel?.classList.contains('visible'))); // Convert boolean to string
        };
        // Initial visibility based on screen size
        const isSmallScreen = window.innerWidth <= 850;
        conceptInfoPanel.classList.toggle('visible', !isSmallScreen);
        infoToggleButton.setAttribute('aria-expanded', String(!isSmallScreen));
        window.addEventListener('resize', onConceptWindowResize, false);
        console.log('Concept visualization initialized successfully.');
        conceptInitialized = true;
        return true;
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        displayError(`Error initializing concept visualization: ${message}`, false, 'concept-error-message');
        console.error("Concept Viz Init Error:", e);
        cleanupConceptVisualization();
        conceptInitialized = false;
        return false;
    }
}
// Creates the 3D meshes and labels for the concept nodes
function createConceptNodes() {
    // Dispose previous nodes
    Object.values(conceptNodes).forEach(cn => {
        if (cn.object) {
            if (cn.label && cn.object.children.includes(cn.label)) {
                cn.object.remove(cn.label);
            }
            if (cn.label?.element?.parentNode) { // Optional chaining
                cn.label.element.parentNode.removeChild(cn.label.element);
            }
            cn.object.geometry?.dispose(); // Optional chaining
            if (Array.isArray(cn.object.material)) {
                cn.object.material.forEach(m => m.dispose());
            }
            else {
                cn.object.material?.dispose(); // Optional chaining
            }
            conceptScene?.remove(cn.object); // Optional chaining
        }
    });
    conceptNodes = {};
    const VisConfig = Config.Visualization.Node;
    for (const id in conceptData) {
        const data = conceptData[id];
        if (data.type === 'simulation_state' || data.type === 'live2d_avatar_ref')
            continue;
        const typeSettings = VisConfig.TypeSettings[data.type] || VisConfig.TypeSettings['concept'];
        const baseSize = VisConfig.BaseSize || 1.0;
        const nodeSize = (typeSettings.size || 1.0) * baseSize * 0.6;
        let geometry; // Use base type
        // --- Create geometry based on type ---
        // (Keep your existing geometry creation logic)
        // Example:
        if (['structure', 'core', 'component', 'property', 'parameter', 'concept', 'field', 'purpose', 'geometry_metric'].includes(data.type)) {
            geometry = new THREE.SphereGeometry(nodeSize, 16, 12);
        }
        else if (data.type === 'framework') {
            geometry = new THREE.BoxGeometry(nodeSize * 1.5, nodeSize * 1.5, nodeSize * 1.5);
        } // ... add all other types
        else {
            geometry = new THREE.SphereGeometry(nodeSize * 0.8, 12, 8); // Fallback
        }
        const material = new THREE.MeshPhongMaterial({
            color: typeSettings.color,
            emissive: typeSettings.emissive,
            shininess: typeSettings.shininess,
            specular: new THREE.Color(typeSettings.color).multiplyScalar(0.5),
            transparent: true,
            opacity: typeSettings.opacity
        });
        const node = new THREE.Mesh(geometry, material);
        node.position.copy(data.position);
        // Explicitly type userData using the interface
        node.userData = {
            id: data.id,
            name: data.name,
            chapter: data.chapter,
            position: data.position,
            type: data.type,
            links: data.links,
            description: data.description,
            originalPosition: data.position.clone(),
            originalColor: material.color.getHex(),
            originalEmissive: material.emissive.getHex(),
            baseScale: 1.0,
            baseOpacity: material.opacity,
            label: null // Initialize label as null
        }; // Type assertion
        conceptScene?.add(node); // Optional chaining
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label';
        labelDiv.textContent = data.name;
        const label = new CSS2DObject(labelDiv);
        const labelOffset = (typeSettings.labelOffset || 1.5) * nodeSize / baseSize * 1.3;
        label.position.set(0, labelOffset, 0);
        node.add(label);
        node.userData.label = label; // Assign to typed userData
        conceptNodes[id] = { object: node, label: label, data: node.userData };
    }
    console.log(`Created ${Object.keys(conceptNodes).length} concept nodes.`);
}
// Creates the curved tube edges between concept nodes
function createConceptEdges() {
    // Dispose previous edges
    conceptEdges.forEach(edge => {
        edge.geometry?.dispose();
        if (Array.isArray(edge.material)) {
            edge.material.forEach(m => m.dispose());
        }
        else {
            edge.material?.dispose();
        }
        conceptScene?.remove(edge);
    });
    conceptEdges = [];
    if (!baseConceptEdgeMaterial) {
        console.error("Base edge material not initialized before creating edges!");
        return;
    }
    const visitedEdges = new Set();
    const EdgeConfig = Config.Visualization.Edge;
    // Combine concept nodes and placeholders into a temporary map for linking
    const allNodes = { ...conceptNodes }; // Use Partial as placeholders might be incomplete
    if (agentStateMesh?.userData?.id)
        allNodes[agentStateMesh.userData.id] = { object: agentStateMesh, data: agentStateMesh.userData, label: agentStateMesh.userData.label };
    if (emergenceCoreMesh?.userData?.id)
        allNodes[emergenceCoreMesh.userData.id] = { object: emergenceCoreMesh, data: emergenceCoreMesh.userData, label: emergenceCoreMesh.userData.label };
    if (live2dPlaneConcept?.userData?.id)
        allNodes[live2dPlaneConcept.userData.id] = { object: live2dPlaneConcept, data: live2dPlaneConcept.userData, label: null };
    for (const id of Object.keys(allNodes)) {
        const sourceNodeEntry = allNodes[id];
        if (!sourceNodeEntry?.object?.position || !sourceNodeEntry.data?.links)
            continue;
        const sourceObject = sourceNodeEntry.object; // Assume Mesh
        const sourceScale = sourceObject.scale.x;
        const sourceBoundary = getApproxBoundaryRadius(sourceObject.geometry, sourceScale);
        const sourcePos = sourceObject.position;
        for (const targetId of sourceNodeEntry.data.links) {
            const targetNodeEntry = allNodes[targetId];
            if (!targetNodeEntry?.object?.position)
                continue;
            const targetObject = targetNodeEntry.object; // Assume Mesh
            const sortedIds = [id, targetId].sort();
            const edgeKey = sortedIds.join('--');
            if (visitedEdges.has(edgeKey))
                continue;
            visitedEdges.add(edgeKey);
            const targetScale = targetObject.scale.x;
            const targetBoundary = getApproxBoundaryRadius(targetObject.geometry, targetScale);
            const targetPos = targetObject.position;
            const direction = new THREE.Vector3().subVectors(targetPos, sourcePos);
            const distance = direction.length();
            if (distance < 1e-6)
                continue;
            const sourceAdjust = direction.clone().normalize().multiplyScalar(sourceBoundary);
            const targetAdjust = direction.clone().normalize().multiplyScalar(-targetBoundary);
            const startPoint = new THREE.Vector3().addVectors(sourcePos, sourceAdjust);
            const endPoint = new THREE.Vector3().addVectors(targetPos, targetAdjust);
            const midPoint = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.5);
            const curveHeight = Math.sqrt(distance) * (Math.random() * 0.4 + 0.3);
            let curveNormal = new THREE.Vector3().crossVectors(direction, conceptCamera.position.clone().sub(midPoint)).normalize(); // Use non-null assertion
            if (curveNormal.length() * curveNormal.length() < 0.1)
                curveNormal = new THREE.Vector3(0, 1, 0);
            const curveOffset = curveNormal.multiplyScalar(curveHeight);
            const controlPoint1 = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.25).add(curveOffset);
            const controlPoint2 = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.75).add(curveOffset);
            const curve = new THREE.CubicBezierCurve3(startPoint, controlPoint1, controlPoint2, endPoint);
            const tubeGeo = new THREE.TubeGeometry(curve, EdgeConfig.TubularSegments, EdgeConfig.TubeRadius, EdgeConfig.TubeDetail, false);
            const edgeMaterial = baseConceptEdgeMaterial.clone();
            const edgeMesh = new THREE.Mesh(tubeGeo, edgeMaterial);
            // Type userData for edge
            edgeMesh.userData = {
                sourceId: id,
                targetId: targetId,
                type: 'edge',
                baseOpacity: edgeMaterial.opacity,
                originalColor: edgeMaterial.color.getHex(),
                originalEmissive: edgeMaterial.emissive?.getHex() ?? 0x000000
            }; // Type assertion
            conceptScene?.add(edgeMesh); // Optional chaining
            conceptEdges.push(edgeMesh);
        }
    }
}
// Creates placeholder objects
function createAgentSimulationPlaceholders() {
    // Dispose previous meshes (similar logic as before, ensure labels are handled)
    if (agentStateMesh) {
        if (agentStateLabel && agentStateMesh.children.includes(agentStateLabel))
            agentStateMesh.remove(agentStateLabel);
        if (agentStateLabel?.element?.parentNode)
            agentStateLabel.element.parentNode.removeChild(agentStateLabel.element);
        conceptScene?.remove(agentStateMesh);
        if ('material' in agentStateMesh) {
            const mat = agentStateMesh.material;
            if (Array.isArray(mat)) {
                mat.forEach(m => m.dispose());
            }
            else {
                mat.dispose();
            }
        }
        agentStateMesh.geometry?.dispose();
        agentStateMesh = null;
        agentStateLabel = null;
    }
    if (emergenceCoreMesh) {
        if (emergenceCoreLabel && emergenceCoreMesh.children.includes(emergenceCoreLabel))
            emergenceCoreMesh.remove(emergenceCoreLabel);
        if (emergenceCoreLabel?.element?.parentNode)
            emergenceCoreLabel.element.parentNode.removeChild(emergenceCoreLabel.element);
        conceptScene?.remove(emergenceCoreMesh);
        if ('material' in emergenceCoreMesh) {
            const mat = emergenceCoreMesh.material;
            if (Array.isArray(mat)) {
                mat.forEach(m => m.dispose());
            }
            else {
                mat.dispose();
            }
        }
        emergenceCoreMesh.geometry?.dispose();
        emergenceCoreMesh = null;
        emergenceCoreLabel = null;
    }
    if (live2dPlaneConcept) {
        conceptScene?.remove(live2dPlaneConcept);
        if ('material' in live2dPlaneConcept) {
            const mat = live2dPlaneConcept.material;
            if (Array.isArray(mat)) {
                mat.forEach(m => m.dispose());
            }
            else {
                mat.dispose();
            }
        }
        live2dPlaneConcept.geometry?.dispose();
        live2dPlaneConcept = null;
    }
    const VisConfig = Config.Visualization.Node;
    // Agent State Placeholder
    const agentData = conceptData['agent_emotional_state'];
    if (agentData && conceptScene) { // Check scene existence
        const typeSettings = VisConfig.TypeSettings[agentData.type];
        const baseSize = VisConfig.BaseSize || 1.0;
        const nodeSize = (typeSettings.size || 1.0) * baseSize * 0.6;
        const geo = new THREE.SphereGeometry(nodeSize, 32, 16);
        const mat = new THREE.MeshPhongMaterial({
            color: typeSettings.color, emissive: typeSettings.emissive, shininess: typeSettings.shininess,
            specular: new THREE.Color(typeSettings.color).multiplyScalar(0.5),
            transparent: true, opacity: typeSettings.opacity
        });
        agentStateMesh = new THREE.Mesh(geo, mat);
        agentStateMesh.position.copy(agentData.position);
        agentStateMesh.userData = { /* ... Fill userData as ConceptNodeUserData ... */}; // Fill and assert
        // (Copy full userData structure from createConceptNodes logic)
        agentStateMesh.userData.originalPosition = agentData.position.clone();
        agentStateMesh.userData.originalColor = mat.color.getHex();
        //... etc
        conceptScene.add(agentStateMesh);
        const agentLabelDiv = document.createElement('div');
        agentLabelDiv.className = 'label';
        agentLabelDiv.textContent = agentData.name;
        agentStateLabel = new CSS2DObject(agentLabelDiv);
        const labelOffset = (typeSettings.labelOffset || 1.5) * nodeSize / baseSize * 1.3;
        agentStateLabel.position.set(0, labelOffset, 0);
        agentStateMesh.add(agentStateLabel);
        agentStateMesh.userData.label = agentStateLabel;
    }
    else {
        console.warn("Agent Emotional State concept data not found or scene missing.");
    }
    // Emergence Core Placeholder
    const coreData = conceptData['emergence_core'];
    if (coreData && conceptScene) {
        // ... (Similar logic as Agent State Placeholder, using TetrahedronGeometry) ...
        const typeSettings = VisConfig.TypeSettings[coreData.type];
        const baseSize = VisConfig.BaseSize || 1.0;
        const nodeSize = (typeSettings.size || 1.0) * baseSize * 0.6;
        const geo = new THREE.TetrahedronGeometry(nodeSize * 1.2, 1);
        const mat = new THREE.MeshPhongMaterial({ /* ... */});
        emergenceCoreMesh = new THREE.Mesh(geo, mat);
        emergenceCoreMesh.position.copy(coreData.position);
        emergenceCoreMesh.userData = { /* ... Fill userData as ConceptNodeUserData ... */};
        // (Copy full userData structure)
        emergenceCoreMesh.userData.originalPosition = coreData.position.clone();
        //... etc
        conceptScene.add(emergenceCoreMesh);
        const coreLabelDiv = document.createElement('div');
        coreLabelDiv.className = 'label';
        coreLabelDiv.textContent = coreData.name;
        emergenceCoreLabel = new CSS2DObject(coreLabelDiv);
        const labelOffset = (typeSettings.labelOffset || 1.5) * nodeSize / baseSize * 1.3;
        emergenceCoreLabel.position.set(0, labelOffset * 1.1, 0);
        emergenceCoreMesh.add(emergenceCoreLabel);
        emergenceCoreMesh.userData.label = emergenceCoreLabel;
    }
    else {
        console.warn("Emergence Core concept data not found or scene missing.");
    }
    // Live2D Avatar Placeholder (Invisible Plane)
    const live2dData = conceptData['live2d_avatar_ref'];
    if (live2dData && conceptScene) {
        const typeSettings = VisConfig.TypeSettings[live2dData.type];
        const planeGeo = new THREE.PlaneGeometry(typeSettings.size, typeSettings.size);
        const planeMat = new THREE.MeshBasicMaterial({ color: typeSettings.color, transparent: true, opacity: typeSettings.opacity, side: THREE.DoubleSide });
        live2dPlaneConcept = new THREE.Mesh(planeGeo, planeMat);
        live2dPlaneConcept.position.copy(live2dData.position);
        live2dPlaneConcept.userData = { /* ... Fill userData as ConceptNodeUserData ... */};
        // (Copy full userData structure)
        live2dPlaneConcept.userData.originalPosition = live2dData.position.clone();
        //... etc
        conceptScene.add(live2dPlaneConcept);
    }
    else {
        console.warn("Live2D Avatar Ref concept data not found or scene missing.");
    }
}
/** Updates visuals of placeholder nodes based on simulation metrics. */
export function updateAgentSimulationVisuals(emotionsTensor, // Accept null
rihScore, avgAffinity, hmLabel, // Consider HeadMovementLabel type
trustScore) {
    if (!conceptInitialized || !agentStateMesh || !emergenceCoreMesh || !live2dPlaneConcept)
        return;
    // Store latest values for animation
    latestAgentEmotions = emotionsTensor ? emotionsTensor.arraySync() : null;
    latestRIHScore = rihScore;
    latestAvgAffinity = avgAffinity;
    latestHmLabel = hmLabel;
    latestTrustScore = trustScore;
    // Update agent state visualization
    if (agentStateMesh && latestAgentEmotions) {
        const userData = agentStateMesh.userData; // Assert type
        const emotions = latestAgentEmotions;
        let dominantIndex = -1, maxIntensity = -1;
        emotions.forEach((intensity, i) => { if (intensity > maxIntensity) {
            maxIntensity = intensity;
            dominantIndex = i;
        } });
        const emotionAvg = emotions.reduce((sum, val) => sum + val, 0) / Config.Agent.EMOTION_DIM;
        const emotionColorMap = { 0: 0x66ff66, 1: 0xff6666, 2: 0x66ccff, 3: 0xff9966, 4: 0x99ffcc, 5: 0xffff66 };
        const targetColor = new THREE.Color(emotionColorMap[dominantIndex] ?? 0xcccccc);
        const targetEmissiveIntensity = clamp(maxIntensity * 0.6 + 0.1, 0.1, 0.7);
        userData.baseColor = targetColor.getHex();
        userData.baseEmissive = targetColor.clone().multiplyScalar(targetEmissiveIntensity).getHex();
        userData.baseScale = 1.0 + emotionAvg * 0.4;
        userData.baseOpacity = Config.Visualization.Node.TypeSettings.simulation_state.opacity;
    }
    // --- Update Emergence Core Mesh ---
    if (emergenceCoreMesh?.material instanceof THREE.MeshPhongMaterial && emergenceCoreMesh.userData) {
        const userData = emergenceCoreMesh.userData;
        const coherenceFactor = (latestRIHScore * 0.5 + latestTrustScore * 0.5);
        const baseColor = new THREE.Color(Config.Visualization.Node.TypeSettings.simulation_state.color);
        const rihTargetColor = new THREE.Color(0xffffff);
        const trustTargetColor = new THREE.Color(0xaaaaff);
        let targetColor = baseColor.clone();
        targetColor.lerp(rihTargetColor, clamp(latestRIHScore, 0, 1) * 0.4);
        targetColor.lerp(trustTargetColor, clamp(latestTrustScore, 0, 1) * 0.3);
        const emissiveIntensity = clamp((latestRIHScore * 0.4 + latestTrustScore * 0.3 + Math.abs(latestAvgAffinity) * 0.2), 0.15, 0.8);
        userData.baseColor = targetColor.getHex();
        userData.baseEmissive = targetColor.clone().multiplyScalar(emissiveIntensity).getHex();
        userData.baseScale = 1.0 + clamp(latestRIHScore * 0.5 + latestTrustScore * 0.3 + Math.abs(latestAvgAffinity) * 0.2, 0, 0.8);
        userData.baseOpacity = clamp(0.6 + latestRIHScore * 0.2 + (latestTrustScore - 0.5) * 0.3, 0.5, 0.95);
    }
    // --- Update Live2D Placeholder ---
    if (live2dPlaneConcept?.userData) {
        const userData = live2dPlaneConcept.userData;
        const live2dStatus = live2dInitialized ? 'Active' : 'Inactive';
        userData.name = `Live2D Avatar Ref (Status: ${live2dStatus})`;
        userData.baseOpacity = Config.Visualization.Node.TypeSettings.live2d_avatar_ref.opacity;
        userData.baseScale = 1.0;
        // Update description if info panel shows it
        userData.description = `Logical link point for the Live2D avatar. Its appearance reflects the Agent Emotional State (${live2dStatus}).`;
    }
    // --- Update Edge Base Opacity ---
    conceptEdges.forEach(edge => {
        if (edge?.material instanceof THREE.MeshPhongMaterial && edge.userData) {
            const edgeUserData = edge.userData; // Assert type
            const baseOpacity = clamp(0.3 + clamp(latestRIHScore, 0, 1) * 0.2 + clamp(Math.abs(latestAvgAffinity), 0, 1) * 0.15, 0.2, 0.7);
            edgeUserData.baseOpacity = baseOpacity;
        }
    });
}
// Sets up interaction listeners
function setupConceptInteraction(interactableObjects) {
    if (!conceptContainer || !conceptInfoPanel || !conceptCamera)
        return;
    conceptRaycaster = new THREE.Raycaster();
    conceptMouse = new THREE.Vector2();
    conceptContainer.removeEventListener('mousemove', handleConceptMouseMoveWrapper, false);
    conceptContainer.removeEventListener('click', handleConceptClickWrapper, false);
    conceptContainer.removeEventListener('keydown', handleConceptKeyDownWrapper, false);
    conceptContainer.addEventListener('mousemove', handleConceptMouseMoveWrapper, false);
    conceptContainer.addEventListener('click', handleConceptClickWrapper, false);
    conceptContainer.addEventListener('keydown', handleConceptKeyDownWrapper, false);
    updateInfoPanel();
}
// Handles mouse movement
function onConceptMouseMove(event, interactableObjects) {
    if (!conceptInitialized || !conceptCamera || !conceptRaycaster || !conceptMouse || !conceptContainer || !interactableObjects)
        return;
    const rect = conceptContainer.getBoundingClientRect();
    conceptMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    conceptMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    conceptRaycaster.setFromCamera(conceptMouse, conceptCamera);
    const intersects = conceptRaycaster.intersectObjects(interactableObjects, false);
    let newHoveredObject = null;
    if (intersects.length > 0 && intersects[0].object?.userData?.id) {
        newHoveredObject = intersects[0].object;
    }
    if (!selectedObject) {
        if (newHoveredObject !== hoveredObject) {
            hoveredObject = newHoveredObject;
            updateInfoPanel();
        }
    }
    else {
        if (newHoveredObject !== hoveredObject) {
            hoveredObject = newHoveredObject;
            // Optionally update info panel even if selected, maybe with hover hint?
        }
    }
    conceptContainer.style.cursor = (hoveredObject || selectedObject) ? 'pointer' : 'default';
}
// Handles mouse clicks
function onConceptClick(event, interactableObjects) {
    if (!conceptInitialized || !conceptCamera || !conceptRaycaster || !conceptMouse || !conceptContainer || !conceptControls || !interactableObjects)
        return;
    const rect = conceptContainer.getBoundingClientRect();
    conceptMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    conceptMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    conceptRaycaster.setFromCamera(conceptMouse, conceptCamera);
    const intersects = conceptRaycaster.intersectObjects(interactableObjects, false);
    let clickedObject = null;
    if (intersects.length > 0 && intersects[0].object?.userData?.id) {
        clickedObject = intersects[0].object;
    }
    if (clickedObject) {
        if (selectedObject === clickedObject) {
            selectedObject = null;
            hoveredObject = clickedObject;
            // conceptControls.target.set(0, 5, -10); // Optionally reset target
        }
        else {
            selectedObject = clickedObject;
            hoveredObject = null;
            conceptControls.target.copy(clickedObject.position);
        }
    }
    else {
        selectedObject = null;
    }
    conceptContainer.style.cursor = (hoveredObject || selectedObject) ? 'pointer' : 'default';
    updateInfoPanel();
}
// Handles keyboard interaction
function handleConceptKeyDownWrapper(event) {
    if (!conceptInitialized || !conceptNodes || Object.keys(conceptNodes).length === 0 || !conceptControls)
        return;
    const allNodeIds = Object.keys(conceptNodes);
    const placeHolderIds = [agentStateMesh?.userData?.id, emergenceCoreMesh?.userData?.id].filter((id) => !!id); // Filter and type guard
    const navigableIds = [...allNodeIds, ...placeHolderIds];
    let currentIndex = -1;
    if (selectedObject?.userData?.id) {
        currentIndex = navigableIds.indexOf(selectedObject.userData.id);
    }
    else if (hoveredObject?.userData?.id) {
        currentIndex = navigableIds.indexOf(hoveredObject.userData.id);
    }
    let targetIndex = currentIndex;
    switch (event.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
            targetIndex = (currentIndex <= 0) ? navigableIds.length - 1 : currentIndex - 1;
            event.preventDefault();
            break;
        case 'ArrowDown':
        case 'ArrowRight':
            targetIndex = (currentIndex < 0 || currentIndex >= navigableIds.length - 1) ? 0 : currentIndex + 1;
            event.preventDefault();
            break;
        case 'Enter':
            if (hoveredObject) {
                selectedObject = hoveredObject;
                hoveredObject = null;
                if (selectedObject.position)
                    conceptControls.target.copy(selectedObject.position);
                updateInfoPanel();
            }
            event.preventDefault();
            return;
        default: return;
    }
    if (targetIndex !== currentIndex && targetIndex >= 0 && targetIndex < navigableIds.length) {
        const targetId = navigableIds[targetIndex];
        // Find the corresponding object more robustly
        const targetNodeEntry = conceptNodes[targetId] ?? // Check concepts
            (agentStateMesh?.userData?.id === targetId ? { object: agentStateMesh } : null) ?? // Check agent
            (emergenceCoreMesh?.userData?.id === targetId ? { object: emergenceCoreMesh } : null); // Check core
        if (targetNodeEntry?.object) {
            hoveredObject = targetNodeEntry.object;
            selectedObject = null;
            updateInfoPanel();
            // conceptControls.target.lerp(hoveredObject.position, 0.1); // Optional pan
        }
    }
}
// Updates the info panel content
export function updateInfoPanel() {
    if (!conceptInfoPanel)
        return;
    let displayObject = selectedObject || hoveredObject;
    const shouldBeVisible = !!displayObject;
    conceptInfoPanel.classList.toggle('visible', shouldBeVisible);
    const infoToggleButton = document.getElementById('toggle-info-panel');
    if (infoToggleButton)
        infoToggleButton.setAttribute('aria-expanded', String(shouldBeVisible));
    if (displayObject && displayObject.userData?.id) {
        const data = displayObject.userData; // Assert type
        let displayName = data.name || 'Unknown Concept';
        const baseDescription = data.description || 'No description available.';
        let descriptionToDisplay = baseDescription.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        let dynamicInfoHtml = '';
        // --- Add dynamic data for simulation placeholders ---
        const emotions = latestAgentEmotions || zeros([Config.Agent.EMOTION_DIM]);
        let dominantIndex = -1, maxIntensity = -1;
        emotions.forEach((intensity, i) => { if (intensity > maxIntensity) {
            maxIntensity = intensity;
            dominantIndex = i;
        } });
        const dominantEmotion = dominantIndex !== -1 ? emotionNames[dominantIndex] : 'Unknown';
        if (data.type === 'simulation_state') {
            if (data.id === 'agent_emotional_state') {
                dynamicInfoHtml = `<br><span class="simulated-data">Dominant: ${dominantEmotion} (${(maxIntensity * 100).toFixed(0)}%)<br>` +
                    `Joy: ${(emotions[0] * 100).toFixed(0)}% | Fear: ${(emotions[1] * 100).toFixed(0)}% | Cur: ${(emotions[2] * 100).toFixed(0)}%<br>` +
                    `Frust: ${(emotions[3] * 100).toFixed(0)}% | Calm: ${(emotions[4] * 100).toFixed(0)}% | Surp: ${(emotions[5] * 100).toFixed(0)}%</span>`;
            }
            else if (data.id === 'emergence_core') {
                dynamicInfoHtml = `<br><span class="simulated-data">RIH: ${(latestRIHScore * 100).toFixed(1)}% | ` +
                    `Affinity: ${latestAvgAffinity.toFixed(2)} | ` +
                    `Trust: ${(latestTrustScore * 100).toFixed(1)}%</span>`;
            }
            descriptionToDisplay += '<br><i>Dynamic details:</i>' + dynamicInfoHtml;
        }
        else if (data.type === 'live2d_avatar_ref') {
            const live2dStatus = live2dInitialized ? 'Active' : 'Inactive';
            displayName = `Live2D Avatar Ref (${live2dStatus})`;
            dynamicInfoHtml = `<br><span class="simulated-data">Reflects: ${dominantEmotion}<br>` +
                `Action: ${latestHmLabel}</span>`;
            descriptionToDisplay += '<br><i>Dynamic details:</i>' + dynamicInfoHtml;
        }
        // --- Generate links list ---
        let linksHtml = '';
        if (data.links && data.links.length > 0) {
            linksHtml = '<p class="links-title"><b>Connected Concepts:</b></p><ul class="links-list">';
            data.links.forEach(linkId => {
                // Find link data (combine placeholders and concepts)
                const allNodesForLinkLookup = { ...conceptNodes };
                if (agentStateMesh?.userData?.id)
                    allNodesForLinkLookup[agentStateMesh.userData.id] = { data: agentStateMesh.userData };
                if (emergenceCoreMesh?.userData?.id)
                    allNodesForLinkLookup[emergenceCoreMesh.userData.id] = { data: emergenceCoreMesh.userData };
                if (live2dPlaneConcept?.userData?.id)
                    allNodesForLinkLookup[live2dPlaneConcept.userData.id] = { data: live2dPlaneConcept.userData };
                const linkData = allNodesForLinkLookup[linkId]?.data;
                const linkName = linkData?.name ? linkData.name.replace(/</g, "&lt;").replace(/>/g, "&gt;") : `Unknown (${linkId})`;
                const linkDesc = linkData?.description ? linkData.description.replace(/"/g, '&quot;').replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
                linksHtml += `<li><span title="${linkDesc}">${linkName}</span></li>`;
            });
            linksHtml += '</ul>';
        }
        // --- Update panel content ---
        // Use textContent for name, innerHTML for potentially formatted description/links
        const header = conceptInfoPanel.querySelector('h3') || document.createElement('h3');
        header.textContent = displayName;
        const typeText = data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1).replace(/_/g, ' ') : 'N/A';
        const chapterText = data.chapter ? `<p><b>Chapter:</b> ${data.chapter}</p>` : '';
        conceptInfoPanel.innerHTML = `
            <h3></h3> <!-- Placeholder for name -->
            <p><b>Type:</b> ${typeText}</p>
            ${chapterText}
            <p class="description">${descriptionToDisplay}</p>
            ${linksHtml}
        `;
        conceptInfoPanel.insertBefore(header, conceptInfoPanel.firstChild);
    }
    else {
        // Default content
        conceptInfoPanel.innerHTML = `
            <h3>Concept Information</h3>
            <p>Hover over or click a node to see details.</p>
            <p>Use Arrow keys to navigate nodes, Enter to select.</p>
            <hr>
            <p><b>Simulation Snapshot:</b></p>
            <p><span class="simulated-data">RIH: ${(latestRIHScore * 100).toFixed(1)}% | Affinity: ${latestAvgAffinity.toFixed(2)} | Trust: ${(latestTrustScore * 100).toFixed(1)}%</span></p>
        `;
    }
}
/** Animates concept nodes and applies highlight effects. */
export function animateConceptNodes(deltaTime, integrationParam, reflexivityParam, lastIntegrationTime, lastReflexivityTime, lastChatTime) {
    if (!conceptInitialized || !conceptClock || !conceptNodes || latestAgentEmotions === null)
        return;
    const elapsedTime = conceptClock.getElapsedTime();
    const inputFeedbackDuration = 0.5;
    const emotions = latestAgentEmotions; // Already array or zeros
    const emotionAvg = emotions.reduce((a, b) => a + b, 0) / Config.Agent.EMOTION_DIM;
    const nodeHighlightColor = new THREE.Color(0xffffff);
    const nodeHighlightEmissive = new THREE.Color(0xffffff).multiplyScalar(0.5);
    const linkedColor = new THREE.Color(0xaaaaee);
    const linkedEmissive = new THREE.Color(0xaaaaee).multiplyScalar(0.3);
    const edgeHighlightColor = new THREE.Color(0x00aaff);
    const edgeHighlightEmissive = new THREE.Color(0x00aaff).multiplyScalar(0.6);
    const integrationFeedbackColor = new THREE.Color(0x66ffaa);
    const reflexivityFeedbackColor = new THREE.Color(0xffddaa);
    const chatFeedbackColor = new THREE.Color(0xaaaaff);
    const lerpFactor = clamp(deltaTime * 10, 0.01, 0.15);
    const allNodesToAnimate = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh,
        emergenceCoreMesh,
        live2dPlaneConcept,
    ].filter((o) => o instanceof THREE.Mesh); // Filter and assert Mesh
    // --- Animate Each Node ---
    allNodesToAnimate.forEach(object => {
        // Ensure material is MeshPhongMaterial for color/emissive access
        if (!object || !(object instanceof THREE.Mesh) || !object.userData?.originalPosition)
            return;
        const data = object.userData; // Assert type
        const originalPosition = data.originalPosition;
        const baseColorHex = data.baseColor ?? data.originalColor;
        const baseEmissiveHex = data.baseEmissive ?? data.originalEmissive;
        const baseScale = data.baseScale ?? 1.0;
        const baseOpacity = data.baseOpacity ??
            (object instanceof THREE.Mesh && object.material instanceof THREE.Material ?
                object.material.opacity : 1.0);
        const currentColor = new THREE.Color(baseColorHex);
        const currentEmissive = new THREE.Color(baseEmissiveHex);
        const isSelected = selectedObject === object;
        const isHovered = !isSelected && hoveredObject === object;
        // Check links safely
        const isLinkedToSelected = selectedObject?.userData?.id &&
            (data.links?.includes(selectedObject.userData?.id) ||
                selectedObject.userData?.links?.includes(data.id));
        const isLinkedToHovered = !isSelected && !isLinkedToSelected &&
            hoveredObject?.userData?.id &&
            (data.links?.includes(hoveredObject.userData?.id) ||
                hoveredObject.userData?.links?.includes(data.id));
        let targetPosition = originalPosition.clone();
        let targetScale = new THREE.Vector3(baseScale, baseScale, baseScale);
        let targetColor = currentColor.clone();
        let targetEmissive = currentEmissive.clone();
        let targetOpacity = baseOpacity;
        // --- Base Animation ---
        if (!isSelected && !isHovered && data.type !== 'simulation_state' && data.type !== 'live2d_avatar_ref') {
            const oscSpeed = 1.0 + ((typeof data.chapter === 'number' ? data.chapter : 0) % 5) * 0.1;
            const oscAmount = 0.05 + (data.type.length % 5) * 0.02;
            targetPosition.y += Math.sin(elapsedTime * oscSpeed + originalPosition.x * 0.1) * oscAmount;
            const pulseFactor = 0.02 + (data.links?.length ?? 0 % 5) * 0.005;
            const basePulse = Math.sin(elapsedTime * (oscSpeed + 0.5) + originalPosition.y * 0.1) * pulseFactor;
            targetScale.multiplyScalar(1.0 + basePulse);
        }
        // --- Input Feedback ---
        let inputFeedbackIntensity = 0;
        let feedbackEmissiveColor = null;
        let timeSinceInput = -1;
        let shouldPulseForInput = false;
        if (lastIntegrationTime > 0 && ['synkolator', 'korporator', 'integrationParam_node', 'konzenter', 'exzenter'].includes(data.id)) {
            timeSinceInput = elapsedTime - lastIntegrationTime;
            feedbackEmissiveColor = integrationFeedbackColor;
            shouldPulseForInput = true;
        }
        else if (lastReflexivityTime > 0 && ['reflexive_abstraction', 'reflexive_integration', 'holoformen', 'metrophorischer_zirkel'].includes(data.id)) {
            timeSinceInput = elapsedTime - lastReflexivityTime;
            feedbackEmissiveColor = reflexivityFeedbackColor;
            shouldPulseForInput = true;
        }
        else if (lastChatTime > 0 && ['agent_emotional_state', 'subjective_aspect', 'dialektik'].includes(data.id)) {
            timeSinceInput = elapsedTime - lastChatTime;
            feedbackEmissiveColor = chatFeedbackColor;
            shouldPulseForInput = true;
        }
        if (shouldPulseForInput && timeSinceInput >= 0 && timeSinceInput < inputFeedbackDuration) {
            inputFeedbackIntensity = 1.0 - (timeSinceInput / inputFeedbackDuration);
            inputFeedbackIntensity = inputFeedbackIntensity * inputFeedbackIntensity; // Ease out
        }
        // --- Apply Metric/Feedback Influences ---
        if (!isSelected && !isHovered && !isLinkedToSelected && !isLinkedToHovered) {
            if (inputFeedbackIntensity > 0 && feedbackEmissiveColor) {
                targetEmissive.lerp(feedbackEmissiveColor, inputFeedbackIntensity * 0.8);
                const feedbackPulse = Math.sin(elapsedTime * 8.0) * 0.08 * inputFeedbackIntensity;
                targetScale.multiplyScalar(1.0 + feedbackPulse + inputFeedbackIntensity * 0.1);
                targetOpacity = lerp(baseOpacity, Math.min(baseOpacity + 0.4, 1.0), inputFeedbackIntensity);
            }
            else {
                // Apply other metric influences (as before)
                let metricScaleModifier = 1.0, metricPulseSpeedFactor = 1.0, metricPulseAmountFactor = 1.0;
                let metricColorShift = new THREE.Color(0x000000);
                // ... (metric influence logic based on latestRIHScore, latestAvgAffinity, etc.) ...
                if (['reflexive_integration', 'holoformen', 'emergence_core', 'strukturkondensation_realized'].includes(data.id)) {
                    metricScaleModifier += latestRIHScore * 0.1;
                    metricPulseAmountFactor += latestRIHScore * 0.4;
                    targetEmissive.lerp(new THREE.Color(0xffffff), latestRIHScore * 0.3);
                }
                //... etc.
                const metricPulse = Math.sin(elapsedTime * metricPulseSpeedFactor + originalPosition.x * 0.05) * 0.02 * metricPulseAmountFactor;
                targetScale.multiplyScalar(metricScaleModifier * (1.0 + metricPulse));
                targetColor.add(metricColorShift);
            }
        }
        // --- Apply Highlight Effects ---
        if (isSelected) {
            targetColor.lerp(nodeHighlightColor, 0.6);
            targetEmissive.lerp(nodeHighlightEmissive, 0.7);
            targetScale.multiplyScalar(1.2);
            targetOpacity = Math.min(baseOpacity + 0.3, 1.0);
        }
        else if (isHovered) {
            targetColor.lerp(nodeHighlightColor, 0.4);
            targetEmissive.lerp(nodeHighlightEmissive, 0.5);
            targetScale.multiplyScalar(1.1);
            targetOpacity = Math.min(baseOpacity + 0.2, 1.0);
        }
        else if (isLinkedToSelected) {
            targetColor.lerp(linkedColor, 0.5);
            targetEmissive.lerp(linkedEmissive, 0.6);
            targetScale.multiplyScalar(1.05);
            targetOpacity = Math.min(baseOpacity + 0.15, 1.0);
        }
        else if (isLinkedToHovered) {
            targetColor.lerp(linkedColor, 0.3);
            targetEmissive.lerp(linkedEmissive, 0.4);
            targetScale.multiplyScalar(1.025);
            targetOpacity = Math.min(baseOpacity + 0.1, 1.0);
        }
        // --- Interpolate ---
        if (data.type !== 'live2d_avatar_ref') {
            object.position.lerp(targetPosition, lerpFactor);
        }
        object.scale.lerp(targetScale, lerpFactor);
        // Handle material properties with proper type checking
        if (object instanceof THREE.Mesh) {
            const material = object.material;
            // Handle single material
            if (material instanceof THREE.Material) {
                if ('color' in material && material.color) {
                    // Ensure color is a THREE.Color before calling lerp
                    if (material.color instanceof THREE.Color) {
                        material.color.lerp(targetColor, lerpFactor);
                    }
                }
                if ('emissive' in material && material.emissive) {
                    // Ensure emissive is a THREE.Color before calling lerp
                    if (material.emissive instanceof THREE.Color) {
                        material.emissive.lerp(targetEmissive, lerpFactor);
                    }
                }
                if ('opacity' in material) {
                    material.opacity = lerp(material.opacity, targetOpacity, lerpFactor);
                    material.transparent = material.opacity < 1.0;
                }
            }
            // Handle material array
            else if (Array.isArray(material) && material.length > 0) {
                material.forEach(mat => {
                    if (mat && 'color' in mat && mat.color) {
                        // Ensure color is a THREE.Color before calling lerp
                        if (mat.color instanceof THREE.Color) {
                            mat.color.lerp(targetColor, lerpFactor);
                        }
                    }
                    if (mat && 'emissive' in mat && mat.emissive) {
                        // Ensure emissive is a THREE.Color before calling lerp
                        if (mat.emissive instanceof THREE.Color) {
                            mat.emissive.lerp(targetEmissive, lerpFactor);
                        }
                    }
                    if (mat && 'opacity' in mat) {
                        mat.opacity = lerp(mat.opacity, targetOpacity, lerpFactor);
                        mat.transparent = mat.opacity < 1.0;
                    }
                });
            }
        }
        // --- Rotation ---
        if (!isSelected && !isHovered && ['core', 'dynamics', 'operator', 'geometry_metric', 'transformation'].includes(data.type)) {
            object.rotation.x += deltaTime * 0.15;
            object.rotation.y += deltaTime * 0.2;
        }
        // --- Update Label ---
        if (data.label && data.label instanceof CSS2DObject) { // Type check label
            const typeSettings = Config.Visualization.Node.TypeSettings[data.type] || Config.Visualization.Node.TypeSettings['concept'];
            const baseSize = Config.Visualization.Node.BaseSize || 1.0;
            const nodeSize = (typeSettings.size || 1.0) * baseSize * 0.6;
            const labelOffset = (typeSettings.labelOffset || 1.5) * nodeSize / baseSize * 1.3;
            data.label.position.y = labelOffset * object.scale.y;
            // Get material opacity safely
            const material = getMeshMaterial(object);
            const materialOpacity = material ? material.opacity : 1.0;
            data.label.element.style.opacity = String(clamp(materialOpacity, 0.1, 1.0));
        }
    });
    // --- Animate Edges ---
    conceptEdges.forEach(edge => {
        if (!edge?.material || !(edge.material instanceof THREE.MeshPhongMaterial) || !edge.userData)
            return;
        const edgeUserData = edge.userData; // Assert type
        const sourceId = edgeUserData.sourceId;
        const targetId = edgeUserData.targetId;
        const baseOpacity = edgeUserData.baseOpacity;
        const originalColor = new THREE.Color(edgeUserData.originalColor);
        const originalEmissive = new THREE.Color(edgeUserData.originalEmissive);
        let targetEdgeColor = originalColor.clone();
        let targetEdgeEmissive = originalEmissive.clone();
        let targetEdgeOpacity = baseOpacity;
        const isSelectedEdge = selectedObject?.userData?.id && (sourceId === selectedObject.userData.id || targetId === selectedObject.userData.id);
        const isHoveredEdge = !isSelectedEdge && hoveredObject?.userData?.id && (sourceId === hoveredObject.userData.id || targetId === hoveredObject.userData.id);
        if (isSelectedEdge) {
            targetEdgeColor.lerp(edgeHighlightColor, 0.7);
            targetEdgeEmissive.lerp(edgeHighlightEmissive, 0.8);
            targetEdgeOpacity = Math.min(baseOpacity + 0.4, 0.95);
        }
        else if (isHoveredEdge) {
            targetEdgeColor.lerp(edgeHighlightColor, 0.5);
            targetEdgeEmissive.lerp(edgeHighlightEmissive, 0.6);
            targetEdgeOpacity = Math.min(baseOpacity + 0.3, 0.85);
        }
        else {
            const edgePulse = Math.sin(elapsedTime * 1.2 + (sourceId?.charCodeAt(0) ?? 0)) * 0.1 * (0.5 + latestRIHScore * 0.5); // Safe access sourceId
            targetEdgeOpacity = clamp(baseOpacity * (1.0 + edgePulse), 0.1, 0.8);
        }
        if (edge?.material && edge.material instanceof THREE.MeshPhongMaterial) {
            edge.material.color.lerp(targetEdgeColor, lerpFactor);
            edge.material.emissive.lerp(targetEdgeEmissive, lerpFactor);
            edge.material.opacity = lerp(edge.material.opacity, targetEdgeOpacity, lerpFactor);
            edge.material.transparent = edge.material.opacity < 1.0;
        }
    });
}
// Cleans up resources
export function cleanupConceptVisualization() {
    if (!conceptScene)
        return; // Already cleaned
    const CSS2DObjectExists = typeof THREE !== 'undefined' && typeof CSS2DObject !== 'undefined';
    try {
        if (conceptContainer) {
            conceptContainer.removeEventListener('mousemove', handleConceptMouseMoveWrapper, false);
            conceptContainer.removeEventListener('click', handleConceptClickWrapper, false);
            conceptContainer.removeEventListener('keydown', handleConceptKeyDownWrapper, false);
        }
        window.removeEventListener('resize', onConceptWindowResize, false);
        const infoToggleButton = document.getElementById('toggle-info-panel');
        if (infoToggleButton)
            infoToggleButton.onclick = null;
        conceptScene?.traverse(object => {
            if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
                object.geometry?.dispose();
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => material.dispose());
                }
                else if (object.material instanceof THREE.Material) { // Check type
                    object.material.dispose();
                }
            }
            if (CSS2DObjectExists && object instanceof CSS2DObject && object.element?.parentNode) { // Check existence
                object.element.parentNode.removeChild(object.element);
            }
        });
        conceptControls?.dispose();
        conceptRenderer?.dispose();
        conceptRenderer?.forceContextLoss?.();
        if (conceptRenderer?.domElement?.parentNode) {
            conceptRenderer.domElement.parentNode.removeChild(conceptRenderer.domElement);
        }
        if (conceptLabelRenderer?.domElement?.parentNode) {
            conceptLabelRenderer.domElement.parentNode.removeChild(conceptLabelRenderer.domElement);
        }
        baseConceptEdgeMaterial?.dispose();
    }
    catch (e) {
        console.error("Error during concept visualization cleanup:", e);
    }
    finally {
        // Reset state regardless of errors during cleanup
        conceptScene = null;
        conceptCamera = null;
        conceptRenderer = null;
        conceptLabelRenderer = null;
        conceptControls = null;
        conceptRaycaster = null;
        conceptMouse = null;
        conceptNodes = {};
        conceptEdges = [];
        conceptContainer = null;
        conceptInfoPanel = null;
        conceptClock = null;
        agentStateMesh = null;
        emergenceCoreMesh = null;
        agentStateLabel = null;
        emergenceCoreLabel = null;
        live2dPlaneConcept = null;
        baseConceptEdgeMaterial = null;
        hoveredObject = null;
        selectedObject = null;
        latestAgentEmotions = null;
        conceptInitialized = false;
    }
}
// Handles window resize events
function onConceptWindowResize() {
    if (!conceptInitialized || !conceptContainer || !conceptCamera || !conceptRenderer || !conceptLabelRenderer)
        return;
    const width = conceptContainer.clientWidth;
    const height = conceptContainer.clientHeight;
    if (width <= 0 || height <= 0)
        return;
    conceptCamera.aspect = width / height;
    conceptCamera.updateProjectionMatrix();
    conceptRenderer.setSize(width, height);
    conceptLabelRenderer.setSize(width, height);
}
// Wrapper functions for event listeners
let handleConceptMouseMoveWrapper = (event) => {
    let conceptInteractableObjects = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh,
        emergenceCoreMesh,
    ].filter((o) => o !== null); // Filter nulls and assert Mesh
    onConceptMouseMove(event, conceptInteractableObjects);
};
let handleConceptClickWrapper = (event) => {
    let conceptInteractableObjects = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh,
        emergenceCoreMesh,
    ].filter((o) => o !== null); // Filter nulls and assert Mesh
    onConceptClick(event, conceptInteractableObjects);
};
// handleConceptKeyDownWrapper is already defined and typed above
/**
 * Helper function to safely access material on an Object3D
 * @param object The 3D object to get material from
 * @returns The material or null if not available
 */
function getMaterial(object) {
    if (!('material' in object))
        return null;
    const mesh = object;
    if (!mesh.material)
        return null;
    return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}
/** Helper to safely get material properties from an object */
function getMeshMaterial(obj) {
    if (!obj)
        return null;
    if (obj instanceof THREE.Mesh) {
        if (obj.material instanceof THREE.Material) {
            return obj.material;
        }
        // If it's an array, return the first material
        if (Array.isArray(obj.material) && obj.material.length > 0) {
            return obj.material[0];
        }
    }
    return null;
}
//# sourceMappingURL=viz-concepts.js.map