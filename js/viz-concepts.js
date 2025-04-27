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


// --- Expanded Concept Data (Chapters 1-7 + relevant later) ---
const conceptData = {
    // Chapter 1: Foundational Subjective Logic
    'reflexive_abstraction': { id: 'reflexive_abstraction', name: 'Reflexive Abstraction', chapter: 1, position: new THREE.Vector3(0, 25, -35), type: 'method', links: ['syntrometry'], description: "Method to overcome subjective limits by analyzing reflection itself." },
    'subjective_aspect': { id: 'subjective_aspect', name: 'Subjective Aspect (S)', chapter: 1, position: new THREE.Vector3(-20, 20, -30), type: 'structure', links: ['pradikatrix', 'dialektik', 'koordination', 'aspektivsystem'], description: "Contextual framework for statements; a viewpoint." },
    'pradikatrix': { id: 'pradikatrix', name: 'Prädikatrix (Pm)', chapter: 1, position: new THREE.Vector3(-30, 25, -25), type: 'component', links: ['subjective_aspect'], description: "Schema of potential statements/predicates." },
    'dialektik': { id: 'dialektik', name: 'Dialektik (Dn)', chapter: 1, position: new THREE.Vector3(-25, 25, -25), type: 'component', links: ['subjective_aspect', 'antagonismen'], description: "Schema of subjective qualifiers/biases." },
    'koordination': { id: 'koordination', name: 'Koordination (Kn)', chapter: 1, position: new THREE.Vector3(-20, 25, -25), type: 'component', links: ['subjective_aspect'], description: "Mechanism linking Prädikatrix and Dialektik." },
    'aspektivsystem': { id: 'aspektivsystem', name: 'Aspektivsystem (P)', chapter: 1, position: new THREE.Vector3(20, 20, -30), type: 'structure', links: ['subjective_aspect', 'metropie', 'idee'], description: "Collection of related subjective aspects." },
    'metropie': { id: 'metropie', name: 'Metropie (g)', chapter: 1, position: new THREE.Vector3(30, 25, -25), type: 'property', links: ['aspektivsystem'], description: "Metric defining 'distance' between aspects." },
    'idee': { id: 'idee', name: 'Idee (Apodiktic Core)', chapter: 1, position: new THREE.Vector3(25, 15, -25), type: 'core', links: ['aspektivsystem', 'metrophor'], description: "Invariant elements within an Aspektivsystem." },
    'syntrometry': { id: 'syntrometry', name: 'Syntrometrie', chapter: 1, position: new THREE.Vector3(0, 15, -30), type: 'framework', links: ['syntrix', 'reflexive_abstraction', 'subjective_aspect', 'aspektivsystem'], description: "Heim's universal logic derived from Reflexive Abstraction." },
    'antagonismen': { id: 'antagonismen', name: 'Antagonismen', chapter: 1, position: new THREE.Vector3(-10, 25, -30), type: 'concept', links: ['dialektik', 'reflexive_abstraction'], description: "Contradictions arising from anthropomorphic limits, driving abstraction." },

    // Chapter 2: Syntrometric Elements - Universal Truths and Logical Structures
    'syntrix': { id: 'syntrix', name: 'Syntrix (a|=)', chapter: 2, position: new THREE.Vector3(0, 10, -20), type: 'structure', links: ['metrophor', 'synkolator', 'synkolation_stage', 'korporator', 'aondyne_primigene', 'syntrometry'], description: "Formal, recursive structure embodying a Category." },
    'metrophor': { id: 'metrophor', name: 'Metrophor (a)', chapter: 2, position: new THREE.Vector3(-15, 13, -17), type: 'core', links: ['idee', 'syntrix'], description: "Invariant core (Idee) of a Syntrix; base elements." },
    'synkolator': { id: 'synkolator', name: 'Synkolator ({)', chapter: 2, position: new THREE.Vector3(0, 13, -17), type: 'operator', links: ['syntrix', 'combinatorics', 'komplexsynkolatoren'], description: "Recursive correlation law generating complexity." },
    'synkolation_stage': { id: 'synkolation_stage', name: 'Synkolation Stage (m)', chapter: 2, position: new THREE.Vector3(15, 13, -17), type: 'parameter', links: ['syntrix', 'combinatorics'], description: "Arity/depth of the Synkolator." },
    'combinatorics': { id: 'combinatorics', name: 'Syndrombesetzungen', chapter: 2, position: new THREE.Vector3(0, 13, -13), type: 'concept', links: ['synkolator', 'synkolation_stage'], description: "Combinatorial laws of structure generation." },
    'komplexsynkolatoren': { id: 'komplexsynkolatoren', name: 'Komplexsynkolatoren', chapter: 2, position: new THREE.Vector3(0, 8, -10), type: 'operator', links: ['syntrix', 'synkolator', 'syndromabschluss'], description: "Synkolators with level-dependent rules, enabling dynamic growth." },
    'syndromabschluss': { id: 'syndromabschluss', name: 'Syndromabschluß', chapter: 2, position: new THREE.Vector3(10, 8, -10), type: 'concept', links: ['komplexsynkolatoren', 'nullsyntrix'], description: "Syndrome termination conditions." },
    'aondyne_primigene': { id: 'aondyne_primigene', name: 'Primigene Äondyne', chapter: 2, position: new THREE.Vector3(0, 3, -5), type: 'structure', links: ['syntrix', 'tensorium', 'geometric_field'], description: "Continuous generalization of Syntrix; recursively generated field theory." },
    'tensorium': { id: 'tensorium', name: 'Tensorium', chapter: 2, position: new THREE.Vector3(-10, 3, -5), type: 'concept', links: ['aondyne_primigene'], description: "Multi-dimensional parameter space of the Äondyne." },
    'selektionsprinzip': { id: 'selektionsprinzip', name: 'Selektionsprinzip', chapter: 2, position: new THREE.Vector3(10, 3, -5), type: 'principle', links: ['metrophorischer_zirkel'], description: "Stability principle based on cyclical relationships." },
    'metrophorischer_zirkel': { id: 'metrophorischer_zirkel', name: 'Metrophorischer Zirkel', chapter: 2, position: new THREE.Vector3(15, 3, -5), type: 'concept', links: ['selektionsprinzip'], description: "Closed loop of aspect systems where Metrophor is invariant." },
    'nullsyntrix': { id: 'nullsyntrix', name: 'Nullsyntrix', chapter: 2, position: new THREE.Vector3(0, -5, -1), type: 'structure', links: ['korporator', 'syndromabschluss'], description: "Outcome where generated syndromes are empty; termination state." },


    // Chapter 3: Syntrixkorporationen – Weaving the Logical Web
    'korporator': { id: 'korporator', name: 'Korporator ({})', chapter: 3, position: new THREE.Vector3(0, -2, -5), type: 'operator', links: ['syntrix', 'konzenter', 'exzenter', 'nullsyntrix', 'syntropodenarchitektonik'], description: "Operator combining multiple Syntrices." },
    'konzenter': { id: 'konzenter', name: 'Konzenter', chapter: 3, position: new THREE.Vector3(-10, -5, -3), type: 'architecture', links: ['korporator', 'syntropodenarchitektonik'], description: "Korporation mode emphasizing composition (layered hierarchies)." },
    'exzenter': { id: 'exzenter', name: 'Exzenter', chapter: 3, position: new THREE.Vector3(10, -5, -3), type: 'architecture', links: ['korporator', 'konflexivsyntrix', 'syntropodenarchitektonik'], description: "Korporation mode emphasizing coupling (networked complexity)." },
    'konflexivsyntrix': { id: 'konflexivsyntrix', name: 'Konflexivsyntrix', chapter: 3, position: new THREE.Vector3(15, -5, -3), type: 'structure', links: ['exzenter', 'syntropoden'], description: "Resulting structure from excentric Korporation (network node)." },
    'syntropoden': { id: 'syntropoden', name: 'Syntropoden', chapter: 3, position: new THREE.Vector3(-15, -5, -1), type: 'component', links: ['konflexivsyntrix'], description: "Uncorporated base segments of a Syntrix within a Konflexivsyntrix." },
    'syntropodenarchitektonik': { id: 'syntropodenarchitektonik', name: 'Syntropodenarchitektonik', chapter: 3, position: new THREE.Vector3(0, -8, 0), type: 'architecture', links: ['konflexivsyntrix', 'syntropoden', 'konzenter', 'exzenter'], description: "Overall network architecture of multi-membered Konflexivsyntrizen." },

    // Chapter 4: Enyphansyntrizen - The Dynamics of Syntrometric Fields
    'enyphanie': { id: 'enyphanie', name: 'Enyphanie', chapter: 4, position: new THREE.Vector3(0, -12, 5), type: 'property', links: ['syntrixtotalitaet', 'enyphansyntrizen'], description: "Intrinsic dynamic potential of Syntrices." },
    'syntrixtotalitaet': { id: 'syntrixtotalitaet', name: 'Syntrixtotalität (To)', chapter: 4, position: new THREE.Vector3(-15, -15, 5), type: 'structure', links: ['enyphanie', 'syntrixfeld', 'protyposis', 'hypersyntrix'], description: "Complete ensemble of possible Syntrices from Protyposis." },
    'protyposis': { id: 'protyposis', name: 'Protyposis', chapter: 4, position: new THREE.Vector3(-20, -18, 5), type: 'core', links: ['syntrixtotalitaet'], description: "Primordial soup of elementary structures and rules." },
    'enyphansyntrizen': { id: 'enyphansyntrizen', name: 'Enyphansyntrizen', chapter: 4, position: new THREE.Vector3(0, -15, 10), type: 'dynamics', links: ['syntrixtotalitaet', 'syntrixfeld'], description: "Dynamic operations acting on/within the Syntrixtotalität." },
    'syntrixfeld': { id: 'syntrixfeld', name: 'Syntrixfeld', chapter: 4, position: new THREE.Vector3(15, -15, 5), type: 'field', links: ['syntrixtotalitaet', 'enyphansyntrizen', 'syntrixfunktoren', 'affinitaetssyndrom', 'geometric_field'], description: "Structured 4D field with geometry/dynamics; state space of emergent Gebilde/Holoformen." },
    'gebilde': { id: 'gebilde', name: 'Gebilde', chapter: 4, position: new THREE.Vector3(10, -18, 8), type: 'structure', links: ['syntrixfeld', 'holoformen'], description: "Stable, emergent structures formed by excentric Korporationen." },
    'holoformen': { id: 'holoformen', name: 'Holoformen', chapter: 4, position: new THREE.Vector3(15, -18, 8), type: 'structure', links: ['syntrixfeld', 'gebilde', 'reflexive_integration'], description: "Special Gebilde with non-reducible holistic properties (linked to RIH)." },
    'syntrixtensorien': { id: 'syntrixtensorien', name: 'Syntrixtensorien', chapter: 4, position: new THREE.Vector3(-5, -18, 10), type: 'concept', links: ['syntrixfeld', 'syntrixraum'], description: "Tensor-like representations of Syntropoden within a Gebilde." },
    'syntrixraum': { id: 'syntrixraum', name: 'Syntrixraum', chapter: 4, position: new THREE.Vector3(-10, -18, 10), type: 'concept', links: ['syntrixtensorien'], description: "Abstract n-dimensional state space associated with a Gebilde." },
    'syntrixfunktoren': { id: 'syntrixfunktoren', name: 'Syntrixfunktoren', chapter: 4, position: new THREE.Vector3(0, -18, 13), type: 'operator', links: ['syntrixfeld', 'zeitkoerner'], description: "Operators transforming Syntrixfelder (meta-level dynamics)." },
    'zeitkoerner': { id: 'zeitkoerner', name: 'Zeitkörner', chapter: 4, position: new THREE.Vector3(-5, -21, 13), type: 'concept', links: ['syntrixfunktoren'], description: "Time granules; minimal units of change via Syntrixfunktor application." },
    'affinitaetssyndrom': { id: 'affinitaetssyndrom', name: 'Affinitätssyndrom', chapter: 4, position: new THREE.Vector3(10, -21, 10), type: 'concept', links: ['syntrixfeld', 'reflexive_integration'], description: "Formal measure for coupling strength or interaction potential between systems." },

    // Chapter 5: Metroplextheorie – Infinite Hierarchies and Emerging Structures
    'metroplex': { id: 'metroplex', name: 'Metroplex (n M)', chapter: 5, position: new THREE.Vector3(0, -22, 15), type: 'structure', links: ['hypersyntrix', 'syntrokline_metroplexbruecken', 'metroplexkombinat', 'syntrixtotalitaet'], description: "Higher-order syntrometric structure; recursively defined hierarchy of Syntrices." },
    'hypersyntrix': { id: 'hypersyntrix', name: 'Hypersyntrix (1 M)', chapter: 5, position: new THREE.Vector3(-10, -25, 15), type: 'structure', links: ['metroplex', 'syntrixtotalitaet'], description: "Metroplex of the first grade; ensemble of Syntrices treated as a unit." },
    'syntrokline_metroplexbruecken': { id: 'syntrokline_metroplexbruecken', name: 'Syntrokline Metroplexbrücken', chapter: 5, position: new THREE.Vector3(10, -25, 15), type: 'operator', links: ['metroplex', 'metroplexkombinat'], description: "Operators connecting structures across different Metroplex grades." },
    'metroplexkombinat': { id: 'metroplexkombinat', name: 'Metroplexkombinat', chapter: 5, position: new THREE.Vector3(0, -28, 18), type: 'architecture', links: ['metroplex', 'syntrokline_metroplexbruecken'], description: "Complete integrated architecture of nested Metroplexes and Bridges." },
    'kontraktion': { id: 'kontraktion', name: 'Kontraktion', chapter: 5, position: new THREE.Vector3(5, -25, 18), type: 'transformation', links: ['metroplex'], description: "Structure-reducing transformation for managing complexity." },

    // Chapter 6: Die televariante äonische Area - Dynamics, Purpose, and Transcendence
    'aonische_area': { id: 'aonische_area', name: 'Äonische Area', chapter: 6, position: new THREE.Vector3(0, -32, 20), type: 'field', links: ['telezentrum', 'polydromie', 'transzendenzstufen', 'telezentrik'], description: "Evolutionary landscape/state space structured by Telezentren." },
    'telezentrum': { id: 'telezentrum', name: 'Telezentrum', chapter: 6, position: new THREE.Vector3(-10, -35, 20), type: 'concept', links: ['aonische_area', 'transzendenzstufen', 'telezentrik'], description: "Stable attractor states; points of maximal coherence/integration (purpose/goals)." },
    'polydromie': { id: 'polydromie', name: 'Polydromie', chapter: 6, position: new THREE.Vector3(10, -35, 20), type: 'dynamics', links: ['aonische_area'], description: "Multiple potential evolutionary paths simultaneously or probabilistically." },
    'transzendenzstufen': { id: 'transzendenzstufen', name: 'Transzendenzstufen', chapter: 6, position: new THREE.Vector3(0, -38, 23), type: 'concept', links: ['telezentrum', 'aonische_area', 'transzendentaltektonik'], description: "Qualitative leaps to higher organizational levels." },
    'transzendentaltektonik': { id: 'transzendentaltektonik', name: 'Transzendentaltektonik', chapter: 6, position: new THREE.Vector3(5, -38, 23), type: 'architecture', links: ['transzendenzstufen'], description: "Architecture governing transcendent levels and their interrelations." },
    'telezentrik': { id: 'telezentrik', name: 'Telezentrik', chapter: 6, position: new THREE.Vector3(-5, -35, 20), type: 'purpose', links: ['aonische_area', 'telezentrum'], description: "Principle of directedness towards stable states." },
     'telewarianz': { id: 'telewarianz', name: 'Telewarianz', chapter: 6, position: new THREE.Vector3(15, -35, 23), type: 'concept', links: ['telezentrik', 'aonische_area'], description: "Stable, purpose-aligned evolutionary paths towards Telezentren." },
    'dyswarianz': { id: 'dyswarianz', name: 'Dyswarianz', chapter: 6, position: new THREE.Vector3(20, -35, 23), type: 'concept', links: ['aonische_area'], description: "Disruptive or unstable evolutionary paths away from Telezentren." },


     // Chapter 7: Anthropomorphic Syntrometry - Logic Meets the Human Mind
    'quantitaetssyntrix': { id: 'quantitaetssyntrix', name: 'Quantitätssyntrix', chapter: 7, position: new THREE.Vector3(0, -42, 28), type: 'structure', links: ['subjective_aspect', 'metron', 'metronische_gitter'], description: "Specialized Syntrix for modeling quantifiable dimensions of perception." },
    'metron': { id: 'metron', name: 'Metron (tau)', chapter: 7, position: new THREE.Vector3(-10, -45, 28), type: 'parameter', links: ['quantitaetssyntrix', 'metronische_gitter'], description: "Smallest indivisible quantum or step size." },
    'metronische_gitter': { id: 'metronische_gitter', name: 'Metronische Gitter', chapter: 7, position: new THREE.Vector3(-15, -45, 28), type: 'structure', links: ['metron', 'metronische_elementaroperationen', 'quantitaetssyntrix'], description: "Fundamental discrete lattice underlying reality." },
    'metronische_elementaroperationen': { id: 'metronische_elementaroperationen', name: 'Metronische Elementaroperationen', chapter: 7, position: new THREE.Vector3(0, -45, 30), type: 'operator', links: ['metronische_gitter', 'metrondifferential', 'metronintegral'], description: "Discrete calculus (differential & integral) on the Metronic Gitter." },
    'metrondifferential': { id: 'metrondifferential', name: 'Metrondifferential (delta)', chapter: 7, position: new THREE.Vector3(-5, -48, 30), type: 'operator', links: ['metronische_elementaroperationen'], description: "Discrete analogue of the differential operator." },
    'metronintegral': { id: 'metronintegral', name: 'Metronintegral (S)', chapter: 7, position: new THREE.Vector3(5, -48, 30), type: 'operator', links: ['metronische_elementaroperationen'], description: "Discrete analogue of the integral operator." },

     // Concepts from later chapters potentially relevant to the graph
     'reflexive_integration': { id: 'reflexive_integration', name: 'Reflexive Integration (RIH)', chapter: 8, position: new THREE.Vector3(0, -52, 35), type: 'concept', links: ['holoformen', 'affinitaetssyndrom', 'selection_principles', 'strukturkondensation_realized'], description: "Measure of system coherence or self-awareness (linked to Holoformen/Affinities)." },
     'geometric_field': { id: 'geometric_field', name: 'Geometric Field (g_ik, Gamma, R)', chapter: 8, position: new THREE.Vector3(10, -52, 35), type: 'geometry_metric', links: ['syntrixfeld', 'reflexive_integration', 'selection_principles', 'metronization'], description: "Field with intrinsic geometry (metric, connection, curvature) emerging from Syntrixfeld." },
     'selection_principles': { id: 'selection_principles', name: 'Selection Principles', chapter: 8, position: new THREE.Vector3(0, -55, 38), type: 'principle', links: ['reflexive_integration', 'geometric_field'], description: "Principles for selecting stable geometric configurations (relevant for RIH)." },
     'metronization': { id: 'metronization', name: 'Metronization', chapter: 11, position: new THREE.Vector3(-10, -55, 38), type: 'method', links: ['geometric_field', 'metronische_gitter', 'hyperstruktur'], description: "Process of realizing geometric fields on the Metronic Gitter." },
     'hyperstruktur': { id: 'hyperstruktur', name: 'Hyperstruktur', chapter: 11, position: new THREE.Vector3(-5, -58, 40), type: 'structure', links: ['metronization', 'metronische_gitter', 'strukturkondensation_realized'], description: "Localized, quantized structure (candidate for particles) realized on the grid." },
     'strukturkondensation_realized': { id: 'strukturkondensation_realized', name: 'Strukturkondensation (Realized)', chapter: 11, position: new THREE.Vector3(5, -58, 40), type: 'concept', links: ['hyperstruktur', 'reflexive_integration'], description: "Quantified realized order from Hyperstrukturen (linked to RIH)." },


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
        // FIX: Corrected typo in DirectionalLight
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

        // --- Add cases for new node types ---
        switch (data.type) {
            case 'framework':
                geometry = new THREE.BoxGeometry(baseSize * 2.5, baseSize * 2.5, baseSize * 2.5);
                material = new THREE.MeshPhongMaterial({ color: 0x66ccff, emissive: 0x3366ff, shininess: 60, transparent: true, opacity: 0.9 });
                break;
            case 'structure':
                geometry = new THREE.SphereGeometry(baseSize * 1.2, 32, 16);
                material = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x555555, shininess: 80 });
                break;
            case 'core':
                geometry = new THREE.SphereGeometry(baseSize * 0.9, 24, 12);
                material = new THREE.MeshPhongMaterial({ color: 0xffff66, emissive: 0x888833, shininess: 100 });
                break;
            case 'component':
                geometry = new THREE.SphereGeometry(baseSize, 16, 12);
                material = new THREE.MeshPhongMaterial({ color: 0x66ffaa, emissive: 0x338855, shininess: 50 });
                break;
            case 'property':
                geometry = new THREE.SphereGeometry(baseSize * 0.8, 12, 8);
                material = new THREE.MeshPhongMaterial({ color: 0xffaaff, emissive: 0x885588, shininess: 40 });
                break;
            case 'parameter':
                geometry = new THREE.SphereGeometry(baseSize * 0.7, 12, 8);
                material = new THREE.MeshPhongMaterial({ color: 0xaaffff, emissive: 0x558888, shininess: 30 });
                break;
            case 'operator':
                geometry = new THREE.OctahedronGeometry(baseSize * 1.1, 0);
                material = new THREE.MeshPhongMaterial({ color: 0xffaa66, emissive: 0x885533, shininess: 70 });
                break;
            case 'method':
                geometry = new THREE.CylinderGeometry(baseSize * 0.6, baseSize * 0.6, baseSize * 2.0, 16);
                material = new THREE.MeshPhongMaterial({ color: 0xff66ff, emissive: 0x883388, shininess: 60 });
                break;
            case 'concept': // General concept nodes not fitting other types
                geometry = new THREE.SphereGeometry(baseSize * 0.9, 16, 12);
                material = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, emissive: 0x555555, shininess: 40 }); // Grey color
                break;
             case 'architecture': // Nodes representing architectural structures
                geometry = new THREE.BoxGeometry(baseSize * 1.8, baseSize * 1.8, baseSize * 1.8);
                material = new THREE.MeshPhongMaterial({ color: 0xccaa66, emissive: 0x665533, shininess: 55 }); // Brownish/Orange
                break;
             case 'field': // Nodes representing fields (e.g., Syntrixfeld, Aonische Area)
                geometry = new THREE.SphereGeometry(baseSize * 1.5, 32, 16); // Larger sphere
                material = new THREE.MeshPhongMaterial({ color: 0x88ccff, emissive: 0x446688, shininess: 70 }); // Light Blue
                break;
            case 'dynamics': // Nodes representing dynamic processes
                geometry = new THREE.IcosahedronGeometry(baseSize * 1.1, 0); // Icosahedron
                material = new THREE.MeshPhongMaterial({ color: 0x66ffcc, emissive: 0x338866, shininess: 60 }); // Cyan/Teal
                break;
            case 'purpose': // Nodes related to Telezentrik/Purpose
                geometry = new THREE.SphereGeometry(baseSize * 1.3, 24, 12); // Slightly larger sphere
                material = new THREE.MeshPhongMaterial({ color: 0xaa66ff, emissive: 0x553388, shininess: 75 }); // Purple
                break;
            case 'principle': // Nodes representing principles or rules
                geometry = new THREE.BoxGeometry(baseSize * 1.5, baseSize * 1.5, baseSize * 1.5); // Smaller box
                material = new THREE.MeshPhongMaterial({ color: 0xffaa66, emissive: 0x885533, shininess: 50 }); // Orange
                break;
            case 'geometry_metric': // Nodes representing geometric concepts (metric, connection, curvature)
                geometry = new THREE.SphereGeometry(baseSize * 1.3, 20, 10); // Medium sphere
                material = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x888888, shininess: 85 }); // White/Bright
                break;
             case 'relation': // Nodes representing relational concepts
                geometry = new THREE.CylinderGeometry(baseSize * 0.5, baseSize * 0.5, baseSize * 1.0, 12); // Small Cylinder
                material = new THREE.MeshPhongMaterial({ color: 0xeecc88, emissive: 0x776644, shininess: 45 }); // Light Brown/Yellow
                break;
             case 'level': // Nodes representing hierarchical levels or steps
                geometry = new THREE.TorusGeometry(baseSize * 0.6, baseSize * 0.2, 8, 16); // Torus (Donut)
                material = new THREE.MeshPhongMaterial({ color: 0xccccff, emissive: 0x666688, shininess: 50 }); // Light Purple/Blue
                break;
            case 'transformation': // Nodes representing transformations (e.g., Kontraktion)
                 geometry = new THREE.BoxGeometry(baseSize * 1.5, baseSize * 1.0, baseSize * 1.5); // Box, slightly flatter
                 material = new THREE.MeshPhongMaterial({ color: 0xcc5555, emissive: 0x662222, shininess: 50 }); // Dark Red/Brown
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
             'method': 1.8,
             'concept': 1.4, // Offset for new types
             'architecture': 1.9,
             'field': 1.7,
             'dynamics': 1.6,
             'purpose': 1.6,
             'principle': 1.6,
             'geometry_metric': 1.6,
             'relation': 1.3,
             'level': 1.4,
             'transformation': 1.4 // Offset for new type
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
        emissive: 0x338833,
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
        emissive: 0x883388,
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
        agentStateMesh.material.emissive.lerp(targetColor.clone().multiplyScalar(0.5), 0.1);
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

    // Lerp color based on RIH score (e.g., towards white with high RIH)
    if (emergenceCoreMesh.material.color) {
         const targetColor = new THREE.Color(0xff66ff).lerp(new THREE.Color(0xffffff), clamp(rihScore, 0, 1) * 0.5); // Lerp towards white
        emergenceCoreMesh.material.color.lerp(targetColor, 0.1); // Smooth transition
        emergenceCoreMesh.material.emissive.lerp(targetColor.clone().multiplyScalar(0.5), 0.1);
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
    conceptContainer.addEventListener('click', (event) => onConceptClick(event, interactableObjects), false); // Add click listener

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

    // Update the info panel based on the hovered object (only on hover)
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

             // FIX: Also update the info panel on click
             updateInfoPanel(clickedObject);
        }
         // If no object was clicked that updates the panel, we might want to clear it or revert to default info
         // This is handled implicitly by the updateInfoPanel(null) call in the mousemove handler when no object is hovered.
         // For click, we only update *if* an object is clicked.
    } else {
         // Optional: Clear info panel if the click was on empty space
         // updateInfoPanel(null); // Uncomment this line if you want clicking empty space to clear the panel
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

        // Basic rotation for visual interest (applies to all types)
        object.rotation.y += deltaTime * 0.2;

        // Optional: Specific animations per type (example: operator rotation, dynamics oscillation)
        // We can add more complex animations here based on node type as a future enhancement.
        switch(data.type) {
            case 'operator':
                 object.rotation.x += deltaTime * 0.3;
                 object.rotation.z += deltaTime * 0.4;
                 break;
             case 'dynamics':
                 // Use original Y position from data for oscillation base
                 const originalY_dyn = data.position.y;
                 const oscillationY = Math.sin(time * 2.0 + object.position.x * 0.1) * 0.5; // Use object position for variety
                 object.position.y = originalY_dyn + oscillationY;
                 break;
             case 'purpose':
                 const pulseScale = 1.0 + Math.sin(time * 1.5) * 0.05;
                 object.scale.set(pulseScale, pulseScale, pulseScale);
                 break;
             case 'field':
                 const fieldOscillationZ = Math.sin(time * 1.8 + object.position.y * 0.1) * 0.4;
                 const originalZ_field = data.position.z;
                 object.position.z = originalZ_field + fieldOscillationZ;
                 break;
              case 'geometry_metric':
                 // Subtle color pulse/change based on time
                 const hueShift = (Math.sin(time * 1.0) * 0.5 + 0.5) * 0.1 + 0.6; // Shift between blue/purple/white (adjust base hue if needed)
                 const lightnessPulse = (Math.sin(time * 0.8) * 0.5 + 0.5) * 0.2 + 0.7; // Pulse lightness
                 object.material.color.setHSL(hueShift, 0.8, lightnessPulse);
                 object.material.emissive.setHSL(hueShift, 0.8, lightnessPulse * 0.5);
                 break;
            case 'relation':
                // Subtle scale oscillation
                const relationScale = 1.0 + Math.sin(time * 2.5 + object.position.z * 0.1) * 0.08;
                object.scale.set(relationScale, relationScale, relationScale);
                break;
            case 'level':
                // Subtle rotation on X and Z
                 object.rotation.x += deltaTime * 0.25;
                 object.rotation.z += deltaTime * 0.35;
                break;
             case 'transformation':
                 // Subtle pulsation or change effect
                 const transformScale = 1.0 + Math.sin(time * 2.2 + object.position.y * 0.15) * 0.07;
                 object.scale.set(transformScale, transformScale, transformScale);
                 break;

             // Add cases for other types if specific animations are desired
        }
    });

    // Animate Agent State and Emergence Core meshes (rotation, slight pulse/color based on metrics - handled in updateAgentSimulationVisuals)
    if (agentStateMesh && agentStateMesh.rotation) {
        agentStateMesh.rotation.y += deltaTime * 0.3;
        // Color/Scale update is in updateAgentSimulationVisuals
    }
    if (emergenceCoreMesh && emergenceCoreMesh.rotation) {
        emergenceCoreMesh.rotation.y += deltaTime * 0.4;
        emergenceCoreMesh.rotation.x += deltaTime * 0.2;
        // Color/Scale update is in updateAgentSimulationVisuals
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
    // scene.dispose(); // Use with caution
    conceptScene = null; // Nullify scene

    conceptInitialized = false;
     console.log("Concept Graph Three.js cleanup complete.");
}
