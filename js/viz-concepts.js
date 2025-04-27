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


// --- State variables for interaction ---
let hoveredObject = null; // Track the currently hovered object
let selectedObject = null; // Track the currently clicked/selected object


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
    'korporator': { id: 'korporator', name: 'Korporator ({})', chapter: 3, position: new THREE.Vector3(0, -2, -5), type: 'operator', links: ['syntrix', 'konzenter', 'exzenter', 'nullsyntrix', 'syntropodenarchitektonik', 'affinitaetssyndrom'], description: "Operator combining multiple Syntrices." },
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
    'affinitaetssyndrom': { id: 'affinitaetssyndrom', name: 'Affinitätssyndrom', chapter: 4, position: new THREE.Vector3(10, -21, 10), type: 'concept', links: ['syntrixfeld', 'reflexive_integration', 'korporator'], description: "Formal measure for coupling strength or interaction potential between systems." },

    // Chapter 5: Metroplextheorie – Infinite Hierarchies and Emerging Structures
    'metroplex': { id: 'metroplex', name: 'Metroplex (n M)', chapter: 5, position: new THREE.Vector3(0, -22, 15), type: 'structure', links: ['hypersyntrix', 'syntrokline_metroplexbruecken', 'metroplexkombinat', 'syntrixtotalitaet'], description: "Higher-order syntrometric structure; recursively defined hierarchy of Syntrices." },
    'hypersyntrix': { id: 'hypersyntrix', name: 'Hypersyntrix (1 M)', chapter: 5, position: new THREE.Vector3(-10, -25, 15), type: 'structure', links: ['metroplex', 'syntrixtotalitaet'], description: "Metroplex of the first grade; ensemble of Syntrices treated as a unit." },
    'syntrokline_metroplexbruecken': { id: 'syntrokline_metroplexbruecken', name: 'Syntrokline Metroplexbrücken', chapter: 5, position: new THREE.Vector3(10, -25, 15), type: 'operator', links: ['metroplex', 'metroplexkombinat'], description: "Operators connecting structures across different Metroplex grades." },
    'metroplexkombinat': { id: 'metroplexkombinat', name: 'Metroplexkombinat', chapter: 5, position: new THREE.Vector3(0, -28, 18), type: 'architecture', links: ['metroplex', 'syntrokline_metroplexbruecken'], description: "Complete integrated architecture of nested Metroplexes and Bridges." },
    'kontraktion': { id: 'kontraktion', name: 'Kontraktion', chapter: 5, position: new THREE.Vector3(5, -25, 18), type: 'transformation', links: ['metroplex'], description: "Structure-reducing transformation for managing complexity." },

    // Chapter 6: Die televariante äonische Area - Dynamics, Purpose, and Transcendence
    'aonische_area': { id: 'aonische_area', name: 'Äonische Area', chapter: 6, position: new THREE.Vector3(0, -32, 20), type: 'field', links: ['telezentrum', 'polydromie', 'transzendenzstufen', 'telezentrik', 'telewarianz', 'dyswarianz'], description: "Evolutionary landscape/state space structured by Telezentren." },
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

     // Placeholders linking to Simulation Metrics (Keep these IDs consistent)
     // These are NOT added by createConceptNodes; they are created manually in createAgentSimulationPlaceholders
     'agent_emotional_state': { id: 'agent_emotional_state', name: 'Agent Emotional State', chapter: 'Simulation', position: new THREE.Vector3(15, -5, 0), type: 'simulation_state', links: ['subjective_aspect', 'aonische_area', 'reflexive_integration'], description: 'Represents the agent\'s emotional state (Joy, Fear, etc.). Updates dynamically.' },
     'emergence_core': { id: 'emergence_core', name: 'Emergence Core (RIH/Affinity)', chapter: 'Simulation', position: new THREE.Vector3(-15, -5, 0), type: 'simulation_state', links: ['reflexive_integration', 'affinitaetssyndrom', 'syntropodenarchitektonik'], description: 'Represents Reflexive Integration (RIH) and Affinities from agent processing.' },
     'live2d_avatar_ref': { id: 'live2d_avatar_ref', name: 'Live2D Avatar', chapter: 'Visualization', position: new THREE.Vector3(0, -10, 0), type: 'live2d_avatar_ref', links: ['agent_emotional_state'], description: `Reference point for the Live2D avatar reflecting agent's emotional state.<br><i>Actual avatar is rendered separately in the other panel.</i>` }


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


        // Create concept nodes and edges
        createConceptNodes();
        // Create placeholder objects for Agent State and Emergence Core, and Live2D Ref BEFORE creating edges
        createAgentSimulationPlaceholders();
        createConceptEdges();


        // Populate interactable objects list after creating all objects
        // We need to get these *after* createConceptNodes and createAgentSimulationPlaceholders have run
        let conceptInteractableObjects = Object.values(conceptNodes).map(n => n.object);
        if (agentStateMesh) conceptInteractableObjects.push(agentStateMesh);
        if (live2dPlaneConcept) conceptInteractableObjects.push(live2dPlaneConcept); // Make the placeholder interactable
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

         // Skip placeholder nodes, they are created separately in createAgentSimulationPlaceholders
         if (data.type === 'simulation_state' || data.type === 'live2d_avatar_ref') {
             continue;
         }


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

        // Store original material properties for highlighting
        node.userData.originalColor = node.material.color.getHex();
        node.userData.originalEmissive = node.material.emissive.getHex();
         // Store original position for animation base
        node.userData.originalPosition = data.position.clone();


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


    // Base Material for edges - Cloned for each edge to handle opacity/color changes if needed per edge
    // For simpler highlighting, we might just use one material and toggle visibility or opacity if edges are grouped.
    // Let's keep cloning for now as per previous structure, but add original properties.
     const baseEdgeMaterial = new THREE.MeshPhongMaterial({
        color: 0x888888, // Greyish color
        emissive: 0x222222, // Subtle glow
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide // Render on both sides
    });


    const visitedEdges = new Set(); // Set to prevent duplicate edges (e.g., if A links to B and B links to A)

    const tubularSegments = 20; // Number of segments along the tube
    const tubeRadius = 0.1; // Radius of the tube
    const tubeDetail = 8; // Number of segments around the tube

    const nodeRadiusFactor = 1.2; // Factor to extend edge endpoint slightly beyond node sphere

    // Iterate through all nodes AND placeholder nodes when creating edges
    const allNodes = { ...conceptNodes }; // Start with concept nodes
    if (agentStateMesh) allNodes['agent_emotional_state'] = { object: agentStateMesh, data: conceptData['agent_emotional_state'] };
    if (emergenceCoreMesh) allNodes['emergence_core'] = { object: emergenceCoreMesh, data: conceptData['emergence_core'] };
    if (live2dPlaneConcept) allNodes['live2d_avatar_ref'] = { object: live2dPlaneConcept, data: conceptData['live2d_avatar_ref'] };


    for (const id of Object.keys(allNodes)) {
        const sourceNode = allNodes[id];
        if (!sourceNode || !sourceNode.object || !sourceNode.data) {
            console.warn(`Invalid sourceNode data for id ${id}, cannot create edges.`);
            continue;
        }
        const sourceScale = sourceNode.object.scale.x; // Use current scale for radius approximation
         // Calculate the adjusted start point of the edge (slightly outside the node)
        const sourceBoundary = getApproxBoundaryRadius(sourceNode.object.geometry, sourceScale) * nodeRadiusFactor;
        const sourcePos = sourceNode.object.position;

        const links = sourceNode.data.links || []; // Get links from source node data

        for (const targetId of links) {
            const targetNode = allNodes[targetId]; // Look up target node in the combined list

            // Skip if target node doesn't exist
            if (!targetNode || !targetNode.object || !targetNode.data) {
                 // console.warn(`Target node ${targetId} not found for link from ${id}. Skipping edge creation.`);
                continue;
            }

            // Create a unique key for the edge regardless of direction (e.g., 'idA-idB')
            // Ensure consistent ordering for the key
            const sortedIds = [id, targetId].sort();
            const edgeKey = sortedIds.join('-');

            if (visitedEdges.has(edgeKey)) {
                continue; // Skip if edge already created
            }
            visitedEdges.add(edgeKey); // Mark edge as visited

            const targetScale = targetNode.object.scale.x; // Use current scale for radius approximation
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
            // Add some randomness to control points for varied curves
            const midPoint = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.5);
            const curveHeight = Math.sqrt(distance) * (Math.random() * 0.5 + 0.2); // Curve strength based on distance
            // Use the *main camera* position for the normal direction to ensure curves consistently bend towards the viewer
            const normal = new THREE.Vector3().subVectors(conceptCamera.position, midPoint).normalize(); // Use main camera normal
            const curveOffset = normal.clone().multiplyScalar(curveHeight);

             const controlPoint1 = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.3).add(curveOffset);
             const controlPoint2 = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.7).add(curveOffset);


            const points = [startPoint, controlPoint1, controlPoint2, endPoint];
            const curve = new THREE.CubicBezierCurve3(...points);

            // Create a tube geometry along the curve
            const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, tubeDetail, false);

             // Clone the base material for this edge
            const edgeMaterial = baseEdgeMaterial.clone();

            const edgeMesh = new THREE.Mesh(tubeGeo, edgeMaterial); // Create the mesh

            // Store source/target IDs in userData for potential interaction and highlighting
            edgeMesh.userData = {
                 sourceId: id,
                 targetId: targetId,
                 type: 'edge',
                 originalOpacity: edgeMaterial.opacity, // Store original opacity
                 originalColor: edgeMaterial.color.getHex(), // Store original color
                 originalEmissive: edgeMaterial.emissive.getHex() // Store original emissive
             };

            conceptScene.add(edgeMesh); // Add edge to scene
            conceptEdges.push(edgeMesh); // Store edge reference
        }
    }
    console.log(`Created ${conceptEdges.length} concept edges.`);
}


// Creates placeholder objects for agent state and emergence core in the concept graph
// These are now looked up in conceptData for consistency
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
      if (live2dPlaneConcept) { // Dispose the Live2D placeholder if it exists
         if (live2dPlaneConcept.geometry) live2dPlaneConcept.geometry.dispose();
         if (live2dPlaneConcept.material) live2dPlaneConcept.material.dispose();
         conceptScene.remove(live2dPlaneConcept);
      }


    // Agent State Placeholder (Sphere) - Use data from conceptData
    const agentData = conceptData['agent_emotional_state'];
    if (agentData) {
        const agentGeo = new THREE.SphereGeometry(1.5, 32, 16);
        const agentMat = new THREE.MeshPhongMaterial({
            color: 0x66ff66, // Greenish
            emissive: 0x338833,
            shininess: 80,
            transparent: true,
            opacity: 0.7
        });
        agentStateMesh = new THREE.Mesh(agentGeo, agentMat);
        agentStateMesh.position.copy(agentData.position); // Use position from data
        // Store data in userData for interaction, including original position
        agentStateMesh.userData = { ...agentData, originalPosition: agentData.position.clone() };

         // Store original material properties for highlighting (These will be updated by updateAgentSimulationVisuals to be "base")
         agentStateMesh.userData.originalColor = agentStateMesh.material.color.getHex();
         agentStateMesh.userData.originalEmissive = agentStateMesh.material.emissive.getHex();
         agentStateMesh.userData.baseOpacity = agentStateMesh.material.opacity; // Store original opacity


        conceptScene.add(agentStateMesh); // Add to scene

        // Create CSS2D label
        const agentLabelDiv = document.createElement('div');
        agentLabelDiv.className = 'label';
        agentLabelDiv.textContent = agentData.name; // Use name from data
        agentStateLabel = new THREE.CSS2DObject(agentLabelDiv);
        // Position label above the sphere, adjusted for size
         const agentBaseOffset = 2.0;
        agentStateLabel.position.set(0, agentBaseOffset * agentStateMesh.scale.x, 0); // Position relative to node scale
        agentStateMesh.add(agentStateLabel); // Add label as child
    } else {
         console.warn("Agent Emotional State concept data not found in conceptData.");
    }


    // Emergence Core Placeholder (Tetrahedron) - Use data from conceptData
    const coreData = conceptData['emergence_core'];
     if (coreData) {
        const coreGeo = new THREE.TetrahedronGeometry(2.0, 2); // Tetrahedron geometry
        const coreMat = new THREE.MeshPhongMaterial({
            color: 0xff66ff, // Purplish
            emissive: 0x883388,
            shininess: 100,
            transparent: true,
            opacity: 0.8
        });
        emergenceCoreMesh = new THREE.Mesh(coreGeo, coreMat);
        emergenceCoreMesh.position.copy(coreData.position); // Use position from data
        // Store data in userData for interaction, including original position
        emergenceCoreMesh.userData = { ...coreData, originalPosition: coreData.position.clone() };

         // Store original material properties for highlighting (These will be updated by updateAgentSimulationVisuals to be "base")
         emergenceCoreMesh.userData.originalColor = emergenceCoreMesh.material.color.getHex();
         emergenceCoreMesh.userData.originalEmissive = emergenceCoreMesh.material.emissive.getHex();
         emergenceCoreMesh.userData.baseOpacity = emergenceCoreMesh.material.opacity; // Store original opacity


        conceptScene.add(emergenceCoreMesh); // Add to scene

        // Label for Emergence Core
        const coreLabelDiv = document.createElement('div');
        coreLabelDiv.className = 'label';
        coreLabelDiv.textContent = coreData.name; // Use name from data
        emergenceCoreLabel = new THREE.CSS2DObject(coreLabelDiv);
         // Position label above the tetrahedron, adjusted for size
         const coreBaseOffset = 2.5;
        emergenceCoreLabel.position.set(0, coreBaseOffset * emergenceCoreMesh.scale.x, 0); // Position relative to node scale
        emergenceCoreMesh.add(emergenceCoreLabel); // Add label as child
     } else {
         console.warn("Emergence Core concept data not found in conceptData.");
     }

     // Live2D Avatar Placeholder (Invisible Plane) - Use data from conceptData
     const live2dData = conceptData['live2d_avatar_ref'];
     if (live2dData) {
         const planeGeo = new THREE.PlaneGeometry(10, 10); // Size doesn't matter much visually
         const planeMat = new THREE.MeshBasicMaterial({ color: 0x555566, transparent: true, opacity: 0.0, side: THREE.DoubleSide }); // Invisible material
         live2dPlaneConcept = new THREE.Mesh(planeGeo, planeMat);
         live2dPlaneConcept.position.copy(live2dData.position); // Use position from data
          // Store data in userData for interaction
          live2dPlaneConcept.userData = { ...live2dData };
          // No material properties we animate/highlight in the same way
          live2dPlaneConcept.userData.baseOpacity = planeMat.opacity; // Store base opacity


         conceptScene.add(live2dPlaneConcept);
     } else {
         console.warn("Live2D Avatar Ref concept data not found in conceptData.");
     }


    console.log("Agent simulation placeholders created.");
}

/**
 * Updates the visuals of the agent state and emergence core placeholders.
 * This function also updates the internal `latest...` variables used by `updateInfoPanel`.
 * This function's role is to update the *simulation-driven* properties of the placeholder nodes
 * (like color/emissive based on emotions/RIH/affinity).
 * It *does not* handle hover/select highlighting or general time-based animation.
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


    // --- Update Agent State Mesh (Sphere) based on simulation state ---
    if (agentStateMesh && agentStateMesh.material && agentStateMesh.userData) {
        const emotions = latestAgentEmotions || zeros([Config.Agent.EMOTION_DIM]);
         const dominantEmotionIdx = emotions.length === Config.Agent.EMOTION_DIM ? emotions.indexOf(Math.max(...emotions)) : -1;
         const dominantEmotion = dominantEmotionIdx !== -1 ? emotionNames[dominantEmotionIdx] : 'Unknown';

         const emotionIntensity = emotions.reduce((sum, val) => sum + val, 0) / Config.Agent.EMOTION_DIM; // Average intensity

         // Determine target color and emissive intensity based on simulation state
         const targetColor = new THREE.Color();
         const emotionColor = { // Use imported emotionNames here
            'Joy': 0x66ff66,       // Green
            'Fear': 0xff6666,      // Red
            'Curiosity': 0x66ccff, // Light Blue
            'Frustration': 0xff9966, // Orange
            'Calm': 0x99ffcc,      // Teal
            'Surprise': 0xffff66,  // Yellow
            'Unknown': 0xcccccc    // Grey
         }[dominantEmotion]; // Get color for the dominant emotion
         targetColor.setHex(emotionColor);

         const targetEmissiveIntensity = clamp(emotionIntensity * 0.5 + 0.2, 0.2, 0.8); // Emissive based on intensity

         // Lerp towards the target color and emissive intensity, storing them as BASE
         agentStateMesh.material.color.lerp(targetColor, 0.1);
         agentStateMesh.userData.baseColor = agentStateMesh.material.color.getHex();

         const currentEmissiveColor = agentStateMesh.material.emissive;
         const targetEmissiveColor = agentStateMesh.material.color.clone().multiplyScalar(targetEmissiveIntensity);
         currentEmissiveColor.lerp(targetEmissiveColor, 0.1);
         agentStateMesh.userData.baseEmissive = currentEmissiveColor.getHex();

         // Scale based on overall emotional intensity, storing as BASE
         const agentScale = 1.0 + emotionIntensity * 0.5; // Scale based on intensity
         agentStateMesh.userData.baseScale = agentScale; // Store base scale

         // Opacity is fixed for now, but could also be based on state
         agentStateMesh.userData.baseOpacity = agentStateMesh.material.opacity;
    }


    // --- Update Emergence Core Mesh (Tetrahedron) based on simulation state ---
    if (emergenceCoreMesh && emergenceCoreMesh.material && emergenceCoreMesh.userData) {
         // Lerp color/emissive based on RIH score and average affinity, storing as BASE
         const targetColor = new THREE.Color(0xff66ff).lerp(new THREE.Color(0xffffff), clamp(rihScore, 0, 1) * 0.5); // Lerp towards white
         const emissiveIntensity = clamp(rihScore * 0.8 + Math.abs(avgAffinity) * 0.3, 0.3, 0.9); // Emissive based on RIH and Affinity

         emergenceCoreMesh.material.color.lerp(targetColor, 0.1);
         emergenceCoreMesh.userData.baseColor = emergenceCoreMesh.material.color.getHex();

         const currentEmissiveColor = emergenceCoreMesh.material.emissive;
         const targetEmissiveColor = emergenceCoreMesh.material.color.clone().multiplyScalar(emissiveIntensity);
         currentEmissiveColor.lerp(targetEmissiveColor, 0.1);
         emergenceCoreMesh.userData.baseEmissive = currentEmissiveColor.getHex();


         // Scale based on RIH score and average affinity, storing as BASE
         const coreScale = 1.0 + clamp(rihScore, 0, 1) * 0.8 + clamp(avgAffinity, -1, 1) * 0.3; // Scale factors
         emergenceCoreMesh.userData.baseScale = coreScale; // Store base scale

         // Update opacity based on RIH score, storing as BASE
         emergenceCoreMesh.material.opacity = clamp(0.6 + clamp(rihScore, 0, 1) * 0.3, 0.6, 0.9);
         emergenceCoreMesh.userData.baseOpacity = emergenceCoreMesh.material.opacity; // Store base opacity
    }

    // --- Update Live2D Placeholder Info (only the base name) ---
     if (live2dPlaneConcept && live2dPlaneConcept.userData) {
         const live2dStatus = live2dInitialized ? 'Active' : 'Inactive'; // Use the imported flag
         live2dPlaneConcept.userData.name = `Live2D Avatar (Status: ${live2dStatus})`; // Update the base name
         // No material properties we animate/highlight in the same way for this invisible mesh
         live2dPlaneConcept.userData.baseOpacity = live2dPlaneConcept.material.opacity; // Store base opacity
     }


    // --- Update Edge Base Opacity based on simulation state ---
    // This sets the *base* opacity that edges return to when not highlighted by hover/select.
    conceptEdges.forEach(edge => {
        if (edge.material && edge.userData) {
             // Opacity increases with RIH and Avg Affinity
             const baseOpacity = clamp(0.3 + clamp(rihScore, 0, 1) * 0.3 + clamp(avgAffinity, -1, 1) * 0.2, 0.3, 0.7);
             edge.userData.baseOpacity = baseOpacity; // Store this base opacity
             // The actual material opacity is set in animateConceptNodes based on this base and highlight state
        }
    });
}


// Sets up raycasting and event listeners for interacting with concept nodes
function setupConceptInteraction(interactableObjects) {
    if (!conceptContainer || !conceptInfoPanel) return; // Check if elements are available

    conceptRaycaster = new THREE.Raycaster(); // Raycaster for picking objects
    conceptMouse = new THREE.Vector2(); // 2D vector for mouse coordinates

    // Add event listeners for mouse movements and clicks
    // Use wrapper functions to pass interactableObjects list correctly and allow removal
    conceptContainer.addEventListener('mousemove', handleConceptMouseMoveWrapper, false);
    conceptContainer.addEventListener('click', handleConceptClickWrapper, false);

     // Initial call to updateInfoPanel to show default simulation data
     // The animation loop will call this every frame afterwards.
     // Calling it once here ensures the panel isn't blank before the first frame.
     updateInfoPanel();
}

// Handles mouse movement over the concept graph container
// This function now only updates the *hoveredObject* state variable
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

    let newHoveredObject = null;
    if (intersects.length > 0) {
         // Get the first intersected object (closest to camera)
        newHoveredObject = intersects[0].object;
    }

    // Update hoveredObject state *only if it's different* and nothing is selected
    // We only update `hoveredObject` here. The animation loop will call `updateInfoPanel`
    // which will then react to this change in state.
    if (!selectedObject && newHoveredObject !== hoveredObject) {
        hoveredObject = newHoveredObject;
        // The animation loop calls updateInfoPanel every frame, reacting to state changes.
    } else if (!selectedObject && !newHoveredObject && hoveredObject !== null) {
         // Case where mouse moves off all objects and nothing is selected
         hoveredObject = null;
         // The animation loop calls updateInfoPanel every frame, reacting to state changes.
    }

    // Update cursor based on whether *any* interactive object is currently hovered or selected
    if (selectedObject || hoveredObject) {
        conceptContainer.style.cursor = 'pointer';
    } else {
        conceptContainer.style.cursor = 'default';
    }
}

// Handles mouse clicks on the concept graph container
// This function now updates the *selectedObject* state variable
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

        // If the clicked object has userData (i.e., is one of our graph nodes/placeholders)
        if (clickedObject.userData) { // Check for userData directly

             // If we clicked the object that is already selected, deselect it
             if (selectedObject === clickedObject) {
                 selectedObject = null;
                 // Revert cursor to default if nothing is hovered either
                 if (!hoveredObject) {
                      conceptContainer.style.cursor = 'default';
                 }
             } else {
                  // Select the new object
                  selectedObject = clickedObject;
                  // Move camera target to the clicked object's position IF it has a position
                 if (clickedObject.position) {
                     conceptControls.target.copy(clickedObject.position);
                     conceptControls.update(); // Apply new target
                 }
                  conceptContainer.style.cursor = 'pointer'; // Keep pointer cursor while something is selected
             }

             // The animation loop calls updateInfoPanel and animateConceptNodes every frame,
             // which will now react to the updated `selectedObject` state variable.


        } else {
             // Clicked on a non-interactive Three.js object within the scene?
             // Treat as a click on empty space: clear selection.
             selectedObject = null;
             // Revert cursor to default if nothing is hovered
             if (!hoveredObject) {
                 conceptContainer.style.cursor = 'default';
             }
             // The animation loop calls updateInfoPanel and animateConceptNodes every frame,
             // which will now react to the updated `selectedObject` state variable.
        }

    } else {
         // Clicked on empty space - clear selection
         selectedObject = null;
         // Revert cursor to default if nothing is hovered
         if (!hoveredObject) {
             conceptContainer.style.cursor = 'default';
         }
         // The animation loop calls updateInfoPanel and animateConceptNodes every frame,
         // which will now react to the updated `selectedObject` state variable.
    }
}

/**
 * Updates the content of the info panel based on the currently selected, hovered,
 * or latest simulation data. Reads state variables (selectedObject, hoveredObject,
 * latest...) directly from module scope.
 * This function is called every frame by the main animation loop in app.js.
 */
export function updateInfoPanel() { // No arguments needed anymore
    if (!conceptInfoPanel) return; // Ensure the info panel element exists
    // Assumes emotionNames is available in this module scope (imported)

    let displayObject = null; // The object whose data we will display

    // Prioritize selected object over hovered object
    if (selectedObject && selectedObject.userData) {
         displayObject = selectedObject;
    } else if (hoveredObject && hoveredObject.userData) {
         displayObject = hoveredObject;
    }

    // If we have an object to display information for
    if (displayObject && displayObject.userData) {
        const data = displayObject.userData;

         // Get base description and name from the object's userData
        let displayName = data.name || 'Unknown'; // Use let for dynamic name update
        const baseDescription = data.description || 'No description available.';
        let descriptionToDisplay = baseDescription.split('<br><i>Dynamic details')[0]; // Start with static part

         // Special handling for simulation state objects to append dynamic data
        let dynamicInfoHtml = '';

        // Check if the object is one of the dynamic info placeholders using their IDs
        if (data.id === 'agent_emotional_state' || data.id === 'emergence_core' || data.id === 'live2d_avatar_ref') {
             const emotions = latestAgentEmotions || zeros([Config.Agent.EMOTION_DIM]);
             const dominantEmotionIdx = emotions.length === Config.Agent.EMOTION_DIM ? emotions.indexOf(Math.max(...emotions)) : -1;
             const dominantEmotion = dominantEmotionIdx !== -1 ? emotionNames[dominantEmotionIdx] : 'Unknown';

             if (data.id === 'agent_emotional_state') {
                  const joyVal = emotions[0] || 0;
                  const fearVal = emotions[1] || 0;
                  const curiosityVal = emotions[2] || 0;
                  const frustrationVal = emotions[3] || 0;
                  const calmVal = emotions[4] || 0;
                  const surpriseVal = emotions[5] || 0;

                  dynamicInfoHtml = `<br><span class="simulated-data">Dominant Feeling: ${dominantEmotion}<br>` +
                                 `Joy: ${(joyVal * 100).toFixed(1)}%, Fear: ${(fearVal * 100).toFixed(1)}%<br>` +
                                 `Curiosity: ${(curiosityVal * 100).toFixed(1)}%, Frustration: ${(frustrationVal * 100).toFixed(1)}%<br>` +
                                 `Calm: ${(calmVal * 100).toFixed(1)}%, Surprise: ${(surpriseVal* 100).toFixed(1)}%</span>`;

             } else if (data.id === 'emergence_core') {
                  dynamicInfoHtml = `<br><span class="simulated-data">RIH Score: ${(latestRIHScore * 100).toFixed(1)}%<br>` +
                                 `Average Affinity: ${(latestAvgAffinity * 100).toFixed(1)}%</span>`;
             } else if (data.id === 'live2d_avatar_ref') {
                 const live2dStatus = live2dInitialized ? 'Active' : 'Inactive';
                 // Update name dynamically for display
                 const live2dDisplayName = `Live2D Avatar (Status: ${live2dStatus})`;
                 dynamicInfoHtml = `<br><span class="simulated-data">Dominant Feeling: ${dominantEmotion}<br>` +
                                `Current Action: ${latestHmLabel}<br>` +
                                `Agent RIH: ${(latestRIHScore * 100).toFixed(1)}%</span>`;
                 // We'll update the display name here temporarily, not modifying userData
                 displayName = live2dDisplayName;
             }

              // Append the hint about dynamic details and the dynamic info html if it exists
             if (dynamicInfoHtml) {
                 descriptionToDisplay += '<br><i>Dynamic details below reflect current simulation state.</i>' + dynamicInfoHtml;
             }
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
            <h3>${displayName}</h3>
             <p><b>Type:</b> ${data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1).replace(/_/g, ' ') : 'N/A'}</p> <!-- Added space for types -->
            ${data.chapter ? `<p><b>Chapter:</b> ${data.chapter}</p>` : ''}
            <p>${descriptionToDisplay}</p>
            ${linksHtml}
        `;

    } else {
        // If no object is selected or hovered, display default simulation state info
        conceptInfoPanel.innerHTML = `
            <h3>Concept Information</h3>
            <p>Hover over a node or object to see details.</p>
            <p>Click to focus the camera on a concept.</p>
             <p><i>Simulated data updates based on agent processing.</i></p>
             <p><span class="simulated-data">Latest RIH: ${(latestRIHScore * 100).toFixed(1)}%</span></p>
             <p><span class="simulated-data">Latest Avg Affinity: ${(latestAvgAffinity * 100).toFixed(1)}%</span></p>
        `;
    }
}


/**
 * Animates concept nodes (rotation, oscillation) and applies highlight effects.
 * Also updates the position/scale/color based on simulation state for dynamic nodes.
 * @param {number} deltaTime The time elapsed since the last frame.
 * @param {number} integrationParam Value from the integration slider (0-1).
 * @param {number} reflexivityParam Value from the reflexivity slider (0-1).
 */
export function animateConceptNodes(deltaTime, integrationParam, reflexivityParam) { // Added parameters
     // Only animate if concept visualization is initialized and clock exists
    if (!conceptInitialized || !conceptClock || !conceptNodes || latestAgentEmotions === null) return; // Wait for initial sim data

    const time = conceptClock.getElapsedTime(); // Get elapsed time from the clock

     // Get emotions array safely for animation influence
    const emotions = latestAgentEmotions || zeros([Config.Agent.EMOTION_DIM]);
    const joyVal = emotions[0] || 0;
    const fearVal = emotions[1] || 0;
    const curiosityVal = emotions[2] || 0;
    const frustrationVal = emotions[3] || 0;
    const calmVal = emotions[4] || 0;
    const surpriseVal = emotions[5] || 0;

     // Define highlight colors/emissive values for nodes and edges
     const nodeHighlightColor = new THREE.Color(0xffffff); // White highlight
     const nodeHighlightEmissive = new THREE.Color(0xffffff).multiplyScalar(0.5); // White emissive glow
     const linkedColor = new THREE.Color(0xaaaaee); // Light blueish tint for linked nodes
     const linkedEmissive = new THREE.Color(0xaaaaee).multiplyScalar(0.3);
     const edgeHighlightColor = new THREE.Color(0x00aaff); // Accent blue for edges
     const edgeHighlightEmissive = new THREE.Color(0x00aaff).multiplyScalar(0.8);


     // --- Apply Node Animation & Highlight Effects ---
     Object.values(conceptNodes).forEach(nodeEntry => {
         const data = nodeEntry.data; // Get node data
         const object = nodeEntry.object; // Get the THREE.Mesh

         // Ensure necessary properties exist
         if (!object || !object.rotation || !object.position || !object.scale || !object.material || !object.userData || object.userData.originalPosition === undefined || object.userData.originalColor === undefined || object.userData.originalEmissive === undefined) {
             console.warn(`Missing required userData for node: ${data ? data.id : 'Unknown'}. Skipping animation/highlight.`);
             return; // Skip this node if data is incomplete
         }


         // Use the stored original position and material properties for base
         const originalPosition = object.userData.originalPosition;
         const originalColor = new THREE.Color(object.userData.originalColor);
         const originalEmissive = new THREE.Color(object.userData.originalEmissive);
         const baseScale = data.type === 'agent_emotional_state' || data.type === 'emergence_core'
                             ? (object.userData.baseScale !== undefined ? object.userData.baseScale : 1.0) // Use sim-driven base scale for placeholders
                             : 1.0; // Default base scale for other nodes

         const isSelected = selectedObject === object;
         const isHovered = !isSelected && hoveredObject === object; // Only hover highlight if not selected
         // Check if node is linked to the selected/hovered object
         const isLinkedToSelected = selectedObject && (data.links.includes(selectedObject.userData?.id) || (selectedObject.userData?.links || []).includes(data.id));
         const isLinkedToHovered = !isSelected && !isLinkedToSelected && hoveredObject && (data.links.includes(hoveredObject.userData?.id) || (hoveredObject.userData?.links || []).includes(data.id));


         // --- Determine Target State (Position, Scale, Color, Emissive) ---
         let targetPosition = originalPosition.clone();
         let targetScale = new THREE.Vector3(baseScale, baseScale, baseScale);
         let targetColor = originalColor.clone();
         let targetEmissive = originalEmissive.clone();


         if (isSelected || isHovered) {
             // Target State for Highlighted Objects
             targetColor.copy(nodeHighlightColor);
             targetEmissive.copy(nodeHighlightEmissive);
             const highlightScaleFactor = baseScale * (isSelected ? 1.15 : 1.08); // Scale up slightly
             targetScale.set(highlightScaleFactor, highlightScaleFactor, highlightScaleFactor);

         } else if (isLinkedToSelected || isLinkedToHovered) {
              // Target State for Linked Objects
              targetColor.copy(linkedColor);
              targetEmissive.copy(linkedEmissive);
              targetScale.set(baseScale, baseScale, baseScale); // No scale change for linked
         }
         else {
             // Target State for Non-highlighted Objects (apply type animations)
             // Apply animations to the target position and scale
             switch(data.type) {
                 case 'framework':
                     const frameworkPulse = baseScale * (1.0 + Math.sin(time * 0.8 + originalPosition.x * 0.05) * 0.03 * (1 + latestRIHScore * 0.5));
                      targetScale.set(frameworkPulse, frameworkPulse, frameworkPulse);
                     break;
                 case 'structure':
                      const structureOscillationY = Math.sin(time * 1.5 + originalPosition.z * 0.08) * (0.2 + integrationParam * 0.3);
                      targetPosition.y = originalPosition.y + structureOscillationY;
                      targetScale.set(baseScale, baseScale, baseScale);
                      break;
                 case 'core':
                      const corePulse = baseScale * (1.0 + Math.sin(time * 2.5 + originalPosition.y * 0.1) * (0.04 + reflexivityParam * 0.06));
                      targetScale.set(corePulse, corePulse, corePulse);
                       // Rotation handled below
                       targetPosition.copy(originalPosition); // Ensure position is base
                      break;
                 case 'component': // Rotation handled below
                       targetScale.set(baseScale, baseScale, baseScale); targetPosition.copy(originalPosition);
                      break;
                 case 'property':
                     let propertyEmotionInfluence = 0; if (data.id === 'metropie') propertyEmotionInfluence = curiosityVal * 0.2;
                     const propertyScale = baseScale * (1.0 + Math.sin(time * 1.8 + originalPosition.x * 0.07) * (0.05 + propertyEmotionInfluence));
                      targetScale.set(propertyScale, propertyScale, propertyScale);
                      targetPosition.copy(originalPosition); // Ensure position is base
                      break;
                 case 'parameter': // Rotation handled below
                      targetScale.set(baseScale, baseScale, baseScale); targetPosition.copy(originalPosition);
                      break;
                 case 'operator': // Rotation handled below
                      targetScale.set(baseScale, baseScale, baseScale); targetPosition.copy(originalPosition);
                      break;
                 case 'method': // Rotation handled below
                      targetScale.set(baseScale, baseScale, baseScale); targetPosition.copy(originalPosition);
                      break;
                 case 'concept':
                     const totalEmotion = joyVal + fearVal + curiosityVal + frustrationVal + calmVal + surpriseVal;
                     const emotionAvg = totalEmotion / Config.Agent.EMOTION_DIM;
                     const conceptPulse = baseScale * (1.0 + Math.sin(time * 1.2 + originalPosition.y * 0.05) * 0.03 * emotionAvg);
                      targetScale.set(conceptPulse, conceptPulse, conceptPulse);
                      targetPosition.copy(originalPosition); // Ensure position is base
                      break;
                  case 'architecture': // Rotation handled below
                       targetScale.set(baseScale, baseScale, baseScale); targetPosition.copy(originalPosition);
                      break;
                  case 'field':
                      const fieldOscillationZ = Math.sin(time * 1.8 + originalPosition.y * 0.1) * (0.4 + Math.abs(latestAvgAffinity) * 0.3);
                      targetPosition.z = originalPosition.z + fieldOscillationZ;
                      targetScale.set(baseScale, baseScale, baseScale); // Ensure scale is base
                      targetPosition.y = originalPosition.y; // Ensure Y is base if only animating Z
                      break;
                 case 'dynamics':
                      let dynamicsEmotionInfluence = 0;
                      if (data.id === 'polydromie') dynamicsEmotionInfluence = (curiosityVal + surpriseVal) * 0.3;
                      const oscillationY_dyn = Math.sin(time * 2.0 + originalPosition.x * 0.1) * (0.5 + dynamicsEmotionInfluence);
                      targetPosition.y = originalPosition.y + oscillationY_dyn;
                      targetScale.set(baseScale, baseScale, baseScale); // Ensure scale is base
                      targetPosition.z = originalPosition.z; // Ensure Z is base if only animating Y
                      break;
                 case 'purpose':
                     let purposeInfluence = (calmVal + joyVal) * 0.2 + latestRIHScore * 0.3;
                     const purposePulse = baseScale * (1.0 + Math.sin(time * 1.5 + originalPosition.x * 0.08) * (0.05 + purposeInfluence * 0.05));
                     targetScale.set(purposePulse, purposePulse, purposePulse);
                      targetPosition.copy(originalPosition); // Ensure position is base
                      break;
                 case 'principle': // Rotation handled below
                      targetScale.set(baseScale, baseScale, baseScale); targetPosition.copy(originalPosition);
                     break;
                 case 'geometry_metric': // Color/emissive pulse handled above. Rotation handled below.
                      targetScale.set(baseScale, baseScale, baseScale); targetPosition.copy(originalPosition);
                      break;
                 case 'relation':
                     const relationScale = baseScale * (1.0 + Math.sin(time * 2.5 + originalPosition.z * 0.1) * (0.08 + Math.abs(latestAvgAffinity) * 0.05));
                     targetScale.set(relationScale, relationScale, relationScale);
                      targetPosition.copy(originalPosition); // Ensure position is base
                      break;
                 case 'level': // Rotation handled below
                      targetScale.set(baseScale, baseScale, baseScale); targetPosition.copy(originalPosition);
                     break;
                 case 'transformation':
                     const transformScale = baseScale * (1.0 + Math.sin(time * 2.2 + originalPosition.y * 0.15) * 0.07);
                     targetScale.set(transformScale, transformScale, transformScale);
                      targetPosition.copy(originalPosition); // Ensure position is base
                      break;
                  case 'simulation_state': // Placeholders - Scale/Color updated by updateAgentSimulationVisuals
                       // Their scaling/coloring based on sim state is handled in updateAgentSimulationVisuals
                       // Use the base scale set there, not the default 1.0
                       targetScale.set(baseScale, baseScale, baseScale);
                       targetPosition.copy(originalPosition); // Ensure position is base
                       // Color/Emissive targets are handled in updateAgentSimulationVisuals
                       targetColor.setHex(object.material.color.getHex()); // Keep the color/emissive set by updateAgentSimulationVisuals
                       targetEmissive.setHex(object.material.emissive.getHex());
                      break;
                   case 'live2d_avatar_ref': // Live2D Placeholder - No visuals, but keep it in the loop for consistency
                       targetScale.set(baseScale, baseScale, baseScale); targetPosition.copy(originalPosition);
                       // No visual material updates for this invisible mesh
                       if (object.material.color) object.material.color.copy(originalColor);
                       if (object.material.emissive) object.material.emissive.copy(originalEmissive);
                      break;

                 default:
                      targetScale.set(baseScale, baseScale, baseScale); targetPosition.copy(originalPosition);
                     break;
             }
         }

         // --- Apply Interpolated State ---
         // Lerp current properties towards the determined target properties
         object.position.lerp(targetPosition, 0.1);
         object.scale.lerp(targetScale, 0.1);
         object.material.color.lerp(targetColor, 0.1);
         object.material.emissive.lerp(targetEmissive, 0.1);
         // Opacity is handled separately below


         // --- Apply Type-Specific Rotation (Always Applies unless Selected) ---
         if (!isSelected) { // Only apply specific rotation if NOT selected
              switch(data.type) {
                  case 'core':
                      object.rotation.x += deltaTime * 0.2;
                      object.rotation.z += deltaTime * 0.3;
                      break;
                  case 'component':
                       object.rotation.x += deltaTime * (0.15 + Math.abs(latestAvgAffinity) * 0.1); // Affinity influence
                       object.rotation.z += deltaTime * (0.15 + Math.abs(latestAvgAffinity) * 0.1);
                       break;
                  case 'property':
                       object.rotation.x += deltaTime * 0.1;
                       break;
                  case 'parameter':
                       object.rotation.x += deltaTime * (0.3 + integrationParam * 0.1);
                       object.rotation.z += deltaTime * (0.4 + reflexivityParam * 0.1);
                       break;
                  case 'operator':
                       object.rotation.x += deltaTime * (0.3 + integrationParam * 0.2);
                       object.rotation.z += deltaTime * (0.4 + integrationParam * 0.2);
                       break;
                  case 'method':
                       object.rotation.x += deltaTime * (0.15 + reflexivityParam * 0.1);
                       break;
                  case 'principle':
                       object.rotation.x += deltaTime * (0.25 + latestRIHScore * 0.1); // RIH influence
                       object.rotation.z += deltaTime * (0.35 + latestRIHScore * 0.1);
                      break;
                   case 'level':
                        object.rotation.x += deltaTime * (0.25 + integrationParam * 0.1); // Integration influence
                        object.rotation.z += deltaTime * (0.35 + integrationParam * 0.1);
                       break;
                   // Default Y rotation handled before the switch
              }
         }


         // Ensure labels stay correctly positioned relative to the node scale
         if (nodeEntry.label) {
             const baseOffset = { // Keep offsets consistent with creation
                 'framework': 1.8, 'structure': 1.5, 'core': 1.3, 'component': 1.5,
                 'property': 1.2, 'parameter': 1.1, 'operator': 1.6, 'method': 1.8,
                 'concept': 1.4, 'architecture': 1.9, 'field': 1.7, 'dynamics': 1.6,
                 'purpose': 1.6, 'principle': 1.6, 'geometry_metric': 1.6, 'relation': 1.3,
                 'level': 1.4, 'transformation': 1.4, 'simulation_state': 2.0, 'live2d_avatar_ref': 0
             }[data.type] || 1.5;
             nodeEntry.label.position.y = baseOffset * object.scale.y; // Adjust label Y position based on current Y scale
             // Also ensure label faces the camera (CSS2DRenderer handles this automatically usually)
         }
    });


    // --- Update Edge Highlight Effects ---
    // This applies highlighting on top of the base opacity set by updateAgentSimulationVisuals
    conceptEdges.forEach(edge => {
        if (!edge.material || !edge.userData) return;

         const originalColor = new THREE.Color(edge.userData.originalColor); // Base color
         const originalEmissive = new THREE.Color(edge.userData.originalEmissive); // Base emissive
         const baseOpacity = edge.userData.baseOpacity !== undefined ? edge.userData.baseOpacity : 0.5; // Base opacity from sim update


         // Check if the edge is connected to the selected or hovered object
         const isConnectedToSelected = selectedObject && (edge.userData.sourceId === selectedObject.userData?.id || edge.userData.targetId === selectedObject.userData?.id);
         const isConnectedToHovered = !isConnectedToSelected && hoveredObject && (edge.userData.sourceId === hoveredObject.userData?.id || edge.userData.targetId === hoveredObject.userData?.id);

         // Define edge highlight color/emissive (e.g., white or accent color)
         const edgeHighlightColor = new THREE.Color(0x00aaff); // Accent blue
         const edgeHighlightEmissive = new THREE.Color(0x00aaff).multiplyScalar(0.8);

         if (isConnectedToSelected || isConnectedToHovered) {
             // Apply highlight to edge (quick lerp)
             edge.material.color.lerp(edgeHighlightColor, 0.2);
             edge.material.emissive.lerp(edgeHighlightEmissive, 0.2);
             edge.material.opacity = clamp(baseOpacity * 1.5, 0.6, 1.0); // Increase opacity
         } else {
             // Lerp back to base color/emissive/opacity (slower lerp)
             edge.material.color.lerp(originalColor, 0.05);
             edge.material.emissive.lerp(originalEmissive, 0.05);
             edge.material.opacity = baseOpacity; // Return to base opacity
         }
    });


    // Update the info panel based on the current state (selected, then hovered, then default)
    // This is called every frame by app.js's animate loop.
    // We simply call it here.
    // updateInfoPanel(); // This call is handled by the wrappers now.


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

     // Remove interaction listeners using the wrapper functions
     if (conceptContainer) {
         conceptContainer.removeEventListener('mousemove', handleConceptMouseMoveWrapper, false);
         conceptContainer.removeEventListener('click', handleConceptClickWrapper, false);
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
            if (node.material) node.material.dispose(); // Dispose node material
             // Dispose children (reflexivity loops) geometries/materials
             while(node.children.length > 0) {
                 const child = node.children[0];
                 if (child.geometry) child.geometry.dispose();
                 if (child.material) child.material.dispose(); // Dispose child material
                 node.remove(child); // Remove from node
             }
            scene.remove(node); // Remove node from scene
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
        if (edge.material) edge.material.dispose(); // Dispose edge material
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
        if (agentStateMesh.material) agentStateMesh.material.dispose(); // Dispose material
        if (agentStateLabel && agentStateLabel.element && agentStateLabel.element.parentNode) agentStateLabel.element.parentNode.removeChild(agentStateLabel.element);
        conceptScene.remove(agentStateMesh);
        agentStateMesh = null;
        agentStateLabel = null;
    }
    if(emergenceCoreMesh) {
        if (emergenceCoreMesh.geometry) emergenceCoreMesh.geometry.dispose();
        if (emergenceCoreMesh.material) emergenceCoreMesh.material.dispose(); // Dispose material
        if (emergenceCoreLabel && emergenceCoreLabel.element && emergenceCoreLabel.element.parentNode) emergenceCoreLabel.element.parentNode.removeChild(emergenceCoreLabel.element);
        conceptScene.remove(emergenceCoreMesh);
        emergenceCoreMesh = null;
        emergenceCoreLabel = null;
    }
    if(live2dPlaneConcept) {
        if (live2dPlaneConcept.geometry) live2dPlaneConcept.geometry.dispose();
        if (live2dPlaneConcept.material) live2dPlaneConcept.material.dispose(); // Dispose material
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

// --- Wrapper functions for event listeners to allow removal ---
// These wrappers ensure the correct, up-to-date interactableObjects list is passed.
// We also need to use named functions so removeEventListener works in cleanup.
function handleConceptMouseMoveWrapper(event) {
    // Create the current list of interactable objects dynamically
    const interactableObjects = [];
    Object.values(conceptNodes).forEach(n => interactableObjects.push(n.object));
    if (agentStateMesh) interactableObjects.push(agentStateMesh);
    if (live2dPlaneConcept) interactableObjects.push(live2dPlaneConcept);
    if (emergenceCoreMesh) interactableObjects.push(emergenceCoreMesh);

    onConceptMouseMove(event, interactableObjects);

    // After handling mousemove, update info panel IF nothing is selected.
    // This ensures the hover state is reflected in the panel when no click selection exists.
    if (!selectedObject) {
        updateInfoPanel();
    }
}

function handleConceptClickWrapper(event) {
     // Create the current list of interactable objects dynamically
    const interactableObjects = [];
    Object.values(conceptNodes).forEach(n => interactableObjects.push(n.object));
    if (agentStateMesh) interactableObjects.push(agentStateMesh);
    if (live2dPlaneConcept) interactableObjects.push(live2dPlaneConcept);
    if (emergenceCoreMesh) interactableObjects.push(emergenceCoreMesh);

    onConceptClick(event, interactableObjects);

    // After handling the click, update the info panel based on the new state (selected or cleared)
     updateInfoPanel();
}
