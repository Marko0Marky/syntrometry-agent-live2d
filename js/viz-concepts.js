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

// --- Module-scoped base material for edges (initialized once) ---
let baseConceptEdgeMaterial = null;


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
     'agent_emotional_state': { id: 'agent_emotional_state', name: 'Agent Emotional State', chapter: 'Simulation', position: new THREE.Vector3(15, -5, 0), type: 'simulation_state', links: ['subjective_aspect', 'aonische_area', 'reflexive_integration'], description: 'Represents the agent\'s emotional state (Joy, Fear, etc.). Updates dynamically.' },
     'emergence_core': { id: 'emergence_core', name: 'Emergence Core (RIH/Affinity)', chapter: 'Simulation', position: new THREE.Vector3(-15, -5, 0), type: 'simulation_state', links: ['reflexive_integration', 'affinitaetssyndrom', 'syntropodenarchitektonik'], description: 'Represents Reflexive Integration (RIH) and Affinities from agent processing.' },
     'live2d_avatar_ref': { id: 'live2d_avatar_ref', name: 'Live2D Avatar', chapter: 'Visualization', position: new THREE.Vector3(0, -10, 0), type: 'live2d_avatar_ref', links: ['agent_emotional_state'], description: `Reference point for the Live2D avatar reflecting agent's emotional state.<br><i>Actual avatar is rendered separately in the other panel.</i>` }
};


// Helper to get approx boundary radius for edge connection points
function getApproxBoundaryRadius(geometry, scale) {
    if (!geometry || (!geometry.isGeometry && !geometry.isBufferGeometry)) {
        return 1.0;
    }
    if (!geometry.boundingSphere) {
        geometry.computeBoundingSphere();
    }
    const radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 1.0;
    const effectiveScale = scale || 1.0;
    return radius * effectiveScale;
}


/**
 * Initializes the Three.js visualization for the Concept Graph panel.
 * @param {THREE.Clock} appClock The main clock instance from app.js.
 * @returns {boolean} True if initialization was successful, false otherwise.
 */
export function initConceptVisualization(appClock) {
    if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined' || typeof THREE.CSS2DRenderer === 'undefined') {
        displayError("Three.js, OrbitControls, or CSS2DRenderer not loaded for Concept Graph.", false, 'concept-error-message');
        conceptInitialized = false;
        return false;
    }
    try {
        conceptContainer = document.getElementById('concept-panel');
        conceptInfoPanel = document.getElementById('info-panel');
        if (!conceptContainer || !conceptInfoPanel) {
            displayError("Concept panel or info panel not found.", false, 'concept-error-message');
            conceptInitialized = false;
            return false;
        }

        const width = conceptContainer.clientWidth;
        const height = conceptContainer.clientHeight;
        if (width <= 0 || height <= 0) {
            displayError("Concept panel has zero dimensions.", false, 'concept-error-message');
            conceptInitialized = false;
            return false;
        }

        conceptClock = appClock;
        conceptScene = new THREE.Scene();
        conceptScene.background = new THREE.Color(0x111122);
        conceptScene.fog = new THREE.Fog(0x111122, 60, 160);

        conceptCamera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
        conceptCamera.position.set(0, 15, 55);

        conceptRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        conceptRenderer.setSize(width, height);
        conceptRenderer.setPixelRatio(window.devicePixelRatio);
        conceptContainer.appendChild(conceptRenderer.domElement);

        conceptLabelRenderer = new THREE.CSS2DRenderer();
        conceptLabelRenderer.setSize(width, height);
        conceptLabelRenderer.domElement.style.position = 'absolute';
        conceptLabelRenderer.domElement.style.top = '0px';
        conceptLabelRenderer.domElement.style.left = '0px';
        conceptLabelRenderer.domElement.style.pointerEvents = 'none';
        conceptContainer.appendChild(conceptLabelRenderer.domElement);

        conceptControls = new THREE.OrbitControls(conceptCamera, conceptRenderer.domElement);
        conceptControls.enableDamping = true;
        conceptControls.dampingFactor = 0.05;
        conceptControls.minDistance = 10;
        conceptControls.maxDistance = 150;
        conceptControls.target.set(0, 5, -10);
        conceptControls.update();

        const ambientLight = new THREE.AmbientLight(0x8080a0);
        conceptScene.add(ambientLight);
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight1.position.set(5, 10, 7).normalize();
        conceptScene.add(dirLight1);
        const dirLight2 = new THREE.DirectionalLight(0xaaaaff, 0.5);
        dirLight2.position.set(-5, -5, -5).normalize();
        conceptScene.add(dirLight2);

         baseConceptEdgeMaterial = new THREE.MeshPhongMaterial({
             color: 0x888888,
             emissive: 0x222222,
             transparent: true,
             opacity: 0.5,
             side: THREE.DoubleSide
         });

        createConceptNodes();
        createAgentSimulationPlaceholders();
        createConceptEdges();

        let conceptInteractableObjects = [
            ...Object.values(conceptNodes).map(n => n.object),
            agentStateMesh,
            emergenceCoreMesh,
            live2dPlaneConcept,
        ].filter(Boolean);

        setupConceptInteraction(conceptInteractableObjects);
        window.addEventListener('resize', onConceptWindowResize, false);

        console.log('Concept visualization initialized successfully.');
        conceptInitialized = true;
        return true;
    } catch (e) {
        displayError(`Error initializing concept visualization: ${e.message}`, false, 'concept-error-message');
        console.error("Concept Viz Init Error:", e);
        conceptInitialized = false;
        return false;
    }
}

// Creates the 3D meshes and labels for the concept nodes
function createConceptNodes() {
    const baseSize = 1.5;
    // Dispose previous nodes
    Object.values(conceptNodes).forEach(cn => {
        if (cn.object) {
            if (cn.object.geometry) cn.object.geometry.dispose();
            if (cn.object.material) cn.object.material.dispose();
             if (cn.object.parent) cn.object.parent.remove(cn.object);
             else conceptScene?.remove(cn.object);
        }
        if (cn.label?.element?.parentNode) cn.label.element.parentNode.removeChild(cn.label.element);
    });
    conceptNodes = {};

    for (const id in conceptData) {
        const data = conceptData[id];
        if (data.type === 'simulation_state' || data.type === 'live2d_avatar_ref') continue;

        let geometry;
        let material;
        let currentScale = 1.0;

        switch (data.type) {
            case 'framework':
                geometry = new THREE.BoxGeometry(baseSize * 2.5, baseSize * 2.5, baseSize * 2.5);
                material = new THREE.MeshPhongMaterial({ color: 0x66ccff, emissive: 0x3366ff, specular: 0x555555, shininess: 60, transparent: true, opacity: 0.9 });
                break;
            case 'structure':
                geometry = new THREE.SphereGeometry(baseSize * 1.2, 32, 16);
                material = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x555555, specular: 0x888888, shininess: 80 });
                break;
            case 'core':
                geometry = new THREE.SphereGeometry(baseSize * 0.9, 24, 12);
                material = new THREE.MeshPhongMaterial({ color: 0xffff66, emissive: 0x888833, specular: 0xbbbb55, shininess: 100 });
                break;
            case 'component':
                geometry = new THREE.SphereGeometry(baseSize, 16, 12);
                material = new THREE.MeshPhongMaterial({ color: 0x66ffaa, emissive: 0x338855, specular: 0x55aa77, shininess: 50 });
                break;
            case 'property':
                geometry = new THREE.SphereGeometry(baseSize * 0.8, 12, 8);
                material = new THREE.MeshPhongMaterial({ color: 0xffaaff, emissive: 0x885588, specular: 0xaa77aa, shininess: 40 });
                break;
            case 'parameter':
                geometry = new THREE.SphereGeometry(baseSize * 0.7, 12, 8);
                material = new THREE.MeshPhongMaterial({ color: 0xaaffff, emissive: 0x558888, specular: 0x77aaaa, shininess: 30 });
                break;
            case 'operator':
                geometry = new THREE.OctahedronGeometry(baseSize * 1.1, 0);
                material = new THREE.MeshPhongMaterial({ color: 0xffaa66, emissive: 0x885533, specular: 0xaa7755, shininess: 70 });
                break;
            case 'method':
                geometry = new THREE.CylinderGeometry(baseSize * 0.6, baseSize * 0.6, baseSize * 2.0, 16);
                material = new THREE.MeshPhongMaterial({ color: 0xff66ff, emissive: 0x883388, specular: 0xaa55aa, shininess: 60 });
                break;
            case 'concept':
                geometry = new THREE.SphereGeometry(baseSize * 0.9, 16, 12);
                material = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, emissive: 0x555555, specular: 0x888888, shininess: 40 });
                break;
             case 'architecture':
                geometry = new THREE.BoxGeometry(baseSize * 1.8, baseSize * 1.8, baseSize * 1.8);
                material = new THREE.MeshPhongMaterial({ color: 0xccaa66, emissive: 0x665533, specular: 0x887744, shininess: 55 });
                break;
             case 'field':
                geometry = new THREE.SphereGeometry(baseSize * 1.5, 32, 16);
                material = new THREE.MeshPhongMaterial({ color: 0x88ccff, emissive: 0x446688, specular: 0x66aaff, shininess: 70 });
                break;
            case 'dynamics':
                geometry = new THREE.IcosahedronGeometry(baseSize * 1.1, 0);
                material = new THREE.MeshPhongMaterial({ color: 0x66ffcc, emissive: 0x338866, specular: 0x55aa88, shininess: 60 });
                break;
            case 'purpose':
                geometry = new THREE.SphereGeometry(baseSize * 1.3, 24, 12);
                material = new THREE.MeshPhongMaterial({ color: 0xaa66ff, emissive: 0x553388, specular: 0x7755aa, shininess: 75 });
                break;
            case 'principle':
                geometry = new THREE.BoxGeometry(baseSize * 1.5, baseSize * 1.5, baseSize * 1.5);
                material = new THREE.MeshPhongMaterial({ color: 0xffaa66, emissive: 0x885533, specular: 0xaa7755, shininess: 50 });
                break;
            case 'geometry_metric':
                geometry = new THREE.SphereGeometry(baseSize * 1.3, 20, 10);
                material = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x888888, specular: 0xcccccc, shininess: 85 });
                break;
             case 'relation':
                geometry = new THREE.CylinderGeometry(baseSize * 0.5, baseSize * 0.5, baseSize * 1.0, 12);
                material = new THREE.MeshPhongMaterial({ color: 0xeecc88, emissive: 0x776644, specular: 0xaa9966, shininess: 45 });
                break;
             case 'level':
                geometry = new THREE.TorusGeometry(baseSize * 0.6, baseSize * 0.2, 8, 16);
                material = new THREE.MeshPhongMaterial({ color: 0xccccff, emissive: 0x666688, specular: 0x9999cc, shininess: 50 });
                break;
            case 'transformation':
                 geometry = new THREE.BoxGeometry(baseSize * 1.5, baseSize * 1.0, baseSize * 1.5);
                 material = new THREE.MeshPhongMaterial({ color: 0xcc5555, emissive: 0x662222, specular: 0x884444, shininess: 50 });
                 break;
            default:
                 console.warn(`Unknown concept node type: ${data.type} for ${id}. Skipping.`);
                 continue;
        }

        const node = new THREE.Mesh(geometry, material);
        node.position.copy(data.position);
        node.scale.set(currentScale, currentScale, currentScale);
        node.userData = { ...data }; // Store all data

        node.userData.originalColor = node.material?.color?.getHex() ?? 0x888888;
        node.userData.originalEmissive = node.material?.emissive?.getHex() ?? 0x222222;
        node.userData.originalPosition = data.position.clone();
        node.userData.baseScale = 1.0;
        node.userData.baseOpacity = material.opacity !== undefined ? material.opacity : 1.0;

        conceptScene.add(node);

        const labelDiv = document.createElement('div');
        labelDiv.className = 'label';
        labelDiv.textContent = data.name;
        const label = new THREE.CSS2DObject(labelDiv);

        const baseOffset = {
             'framework': 1.8, 'structure': 1.5, 'core': 1.3, 'component': 1.5,
             'property': 1.2, 'parameter': 1.1, 'operator': 1.6, 'method': 1.8,
             'concept': 1.4, 'architecture': 1.9, 'field': 1.7, 'dynamics': 1.6,
             'purpose': 1.6, 'principle': 1.6, 'geometry_metric': 1.6, 'relation': 1.3,
             'level': 1.4, 'transformation': 1.4
         }[data.type] || 1.5;

        label.position.set(0, baseOffset * currentScale, 0);
        node.add(label);
        node.userData.label = label;

        conceptNodes[id] = { object: node, label: label, data: data };
    }
    console.log(`Created ${Object.keys(conceptNodes).length} concept nodes.`);
}

// Creates the curved tube edges between concept nodes
function createConceptEdges() {
    // Dispose previous edges
    conceptEdges.forEach(edge => {
         if (edge.geometry) edge.geometry.dispose();
         if (edge.material) edge.material.dispose();
         if (edge.parent) edge.parent.remove(edge);
         else conceptScene?.remove(edge);
    });
    conceptEdges = [];

    if (!baseConceptEdgeMaterial) {
        console.error("Base edge material not initialized before creating edges!");
        return;
    }

    const visitedEdges = new Set();
    const tubularSegments = 20;
    const tubeRadius = 0.1;
    const tubeDetail = 8;
    const nodeRadiusFactor = 1.2;

    const allNodes = { ...conceptNodes };
    if (agentStateMesh?.userData?.id) allNodes[agentStateMesh.userData.id] = { object: agentStateMesh, data: agentStateMesh.userData };
    if (emergenceCoreMesh?.userData?.id) allNodes[emergenceCoreMesh.userData.id] = { object: emergenceCoreMesh, data: emergenceCoreMesh.userData };
    if (live2dPlaneConcept?.userData?.id) allNodes[live2dPlaneConcept.userData.id] = { object: live2dPlaneConcept, data: live2dPlaneConcept.userData };

    for (const id of Object.keys(allNodes)) {
        const sourceNode = allNodes[id];
        if (!sourceNode?.object?.position || !sourceNode.data?.links) continue;

        const sourceScale = sourceNode.object.scale.x;
        const sourceBoundary = sourceNode.object.geometry ? getApproxBoundaryRadius(sourceNode.object.geometry, sourceScale) * nodeRadiusFactor : 0;
        const sourcePos = sourceNode.object.position;

        for (const targetId of sourceNode.data.links) {
            const targetNode = allNodes[targetId];
            if (!targetNode?.object?.position) continue;

            const sortedIds = [id, targetId].sort();
            const edgeKey = sortedIds.join('-');
            if (visitedEdges.has(edgeKey)) continue;
            visitedEdges.add(edgeKey);

            const targetScale = targetNode.object.scale.x;
            const targetBoundary = targetNode.object.geometry ? getApproxBoundaryRadius(targetNode.object.geometry, targetScale) * nodeRadiusFactor : 0;
            const targetPos = targetNode.object.position;

            const direction = new THREE.Vector3().subVectors(targetPos, sourcePos);
            const distance = direction.length();
            if (distance < 1e-6) continue;

            const sourceAdjust = direction.clone().normalize().multiplyScalar(sourceBoundary);
            const targetAdjust = direction.clone().normalize().multiplyScalar(-targetBoundary);
            const startPoint = new THREE.Vector3().addVectors(sourcePos, sourceAdjust);
            const endPoint = new THREE.Vector3().addVectors(targetPos, targetAdjust);

            const midPoint = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.5);
            const curveHeight = Math.sqrt(distance) * (Math.random() * 0.5 + 0.2);
            const normal = conceptCamera ? new THREE.Vector3().subVectors(conceptCamera.position, midPoint).normalize() : new THREE.Vector3(0, 1, 0);
            const curveOffset = normal.clone().multiplyScalar(curveHeight);
            const controlPoint1 = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.3).add(curveOffset);
            const controlPoint2 = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.7).add(curveOffset);

            const curve = new THREE.CubicBezierCurve3(startPoint, controlPoint1, controlPoint2, endPoint);
            const tubeGeo = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, tubeDetail, false);
            const edgeMaterial = baseConceptEdgeMaterial.clone();
            const edgeMesh = new THREE.Mesh(tubeGeo, edgeMaterial);

            edgeMesh.userData = {
                 sourceId: id,
                 targetId: targetId,
                 type: 'edge',
                 baseOpacity: edgeMaterial.opacity,
                 originalColor: edgeMaterial.color.getHex(),
                 originalEmissive: edgeMaterial.emissive.getHex()
             };

            conceptScene.add(edgeMesh);
            conceptEdges.push(edgeMesh);
        }
    }
    console.log(`Created ${conceptEdges.length} concept edges.`);
}

// Creates placeholder objects for agent state and emergence core
function createAgentSimulationPlaceholders() {
     // Dispose previous meshes
     if (agentStateMesh) {
         if (agentStateMesh.geometry) agentStateMesh.geometry.dispose();
         if (agentStateMesh.material) agentStateMesh.material.dispose();
         if (agentStateLabel?.element?.parentNode) agentStateLabel.element.parentNode.removeChild(agentStateLabel.element);
         conceptScene?.remove(agentStateMesh);
         agentStateMesh = null; agentStateLabel = null;
     }
     if (emergenceCoreMesh) {
        if (emergenceCoreMesh.geometry) emergenceCoreMesh.geometry.dispose();
        if (emergenceCoreMesh.material) emergenceCoreMesh.material.dispose();
        if (emergenceCoreLabel?.element?.parentNode) emergenceCoreLabel.element.parentNode.removeChild(emergenceCoreLabel.element);
        conceptScene?.remove(emergenceCoreMesh);
        emergenceCoreMesh = null; emergenceCoreLabel = null;
     }
      if (live2dPlaneConcept) {
        if (live2dPlaneConcept.geometry) live2dPlaneConcept.geometry.dispose();
        if (live2dPlaneConcept.material) live2dPlaneConcept.material.dispose();
        conceptScene?.remove(live2dPlaneConcept);
        live2dPlaneConcept = null;
      }

    // Agent State Placeholder
    const agentData = conceptData['agent_emotional_state'];
    if (agentData) {
        const agentGeo = new THREE.SphereGeometry(1.5, 32, 16);
        const agentMat = new THREE.MeshPhongMaterial({ color: 0x66ff66, emissive: 0x338833, shininess: 80, transparent: true, opacity: 0.7 });
        agentStateMesh = new THREE.Mesh(agentGeo, agentMat);
        agentStateMesh.position.copy(agentData.position);
        agentStateMesh.userData = { ...agentData, originalPosition: agentData.position.clone() };
        agentStateMesh.userData.originalColor = agentMat.color.getHex();
        agentStateMesh.userData.originalEmissive = agentMat.emissive.getHex();
        agentStateMesh.userData.baseOpacity = agentMat.opacity;
        agentStateMesh.userData.baseScale = 1.0;
        conceptScene.add(agentStateMesh);

        const agentLabelDiv = document.createElement('div');
        agentLabelDiv.className = 'label';
        agentLabelDiv.textContent = agentData.name;
        agentStateLabel = new THREE.CSS2DObject(agentLabelDiv);
        agentStateLabel.position.set(0, 2.0, 0);
        agentStateMesh.add(agentStateLabel);
        agentStateMesh.userData.label = agentStateLabel;
    } else { console.warn("Agent Emotional State concept data not found."); }

    // Emergence Core Placeholder
    const coreData = conceptData['emergence_core'];
     if (coreData) {
        const coreGeo = new THREE.TetrahedronGeometry(2.0, 2);
        const coreMat = new THREE.MeshPhongMaterial({ color: 0xff66ff, emissive: 0x883388, shininess: 100, transparent: true, opacity: 0.8 });
        emergenceCoreMesh = new THREE.Mesh(coreGeo, coreMat);
        emergenceCoreMesh.position.copy(coreData.position);
        emergenceCoreMesh.userData = { ...coreData, originalPosition: coreData.position.clone() };
        emergenceCoreMesh.userData.originalColor = coreMat.color.getHex();
        emergenceCoreMesh.userData.originalEmissive = coreMat.emissive.getHex();
        emergenceCoreMesh.userData.baseOpacity = coreMat.opacity;
        emergenceCoreMesh.userData.baseScale = 1.0;
        conceptScene.add(emergenceCoreMesh);

        const coreLabelDiv = document.createElement('div');
        coreLabelDiv.className = 'label';
        coreLabelDiv.textContent = coreData.name;
        emergenceCoreLabel = new THREE.CSS2DObject(coreLabelDiv);
        emergenceCoreLabel.position.set(0, 2.5, 0);
        emergenceCoreMesh.add(emergenceCoreLabel);
        emergenceCoreMesh.userData.label = emergenceCoreLabel;
     } else { console.warn("Emergence Core concept data not found."); }

     // Live2D Avatar Placeholder
     const live2dData = conceptData['live2d_avatar_ref'];
     if (live2dData) {
         const planeGeo = new THREE.PlaneGeometry(10, 10);
         const planeMat = new THREE.MeshBasicMaterial({ color: 0x555566, transparent: true, opacity: 0.0, side: THREE.DoubleSide });
         live2dPlaneConcept = new THREE.Mesh(planeGeo, planeMat);
         live2dPlaneConcept.position.copy(live2dData.position);
          live2dPlaneConcept.userData = { ...live2dData };
         live2dPlaneConcept.userData.originalColor = planeMat.color.getHex();
         live2dPlaneConcept.userData.originalEmissive = 0x000000;
         live2dPlaneConcept.userData.baseOpacity = planeMat.opacity;
         live2dPlaneConcept.userData.baseScale = 1.0;
         live2dPlaneConcept.userData.label = null;
         conceptScene.add(live2dPlaneConcept);
     } else { console.warn("Live2D Avatar Ref concept data not found."); }

    console.log("Agent simulation placeholders created.");
}

/**
 * Updates the base visuals (color, scale, opacity) of placeholder nodes.
 */
export function updateAgentSimulationVisuals(emotionsTensor, rihScore, avgAffinity, hmLabel) {
    if (!conceptInitialized || !agentStateMesh || !emergenceCoreMesh || !live2dPlaneConcept) return;

    // Store latest data
    latestAgentEmotions = emotionsTensor && typeof emotionsTensor.arraySync === 'function' && !emotionsTensor.isDisposed
        ? emotionsTensor.arraySync()[0]
        : zeros([Config.Agent.EMOTION_DIM]);
    latestRIHScore = rihScore;
    latestAvgAffinity = avgAffinity;
    latestHmLabel = hmLabel;

    // Update Agent State Mesh
    if (agentStateMesh?.material && agentStateMesh.userData) {
        const emotions = latestAgentEmotions;
        const dominantEmotionIdx = emotions.length === Config.Agent.EMOTION_DIM ? emotions.indexOf(Math.max(...emotions)) : -1;
        const dominantEmotion = dominantEmotionIdx !== -1 ? emotionNames[dominantEmotionIdx] : 'Unknown';
        const emotionIntensity = emotions.reduce((sum, val) => sum + val, 0) / Config.Agent.EMOTION_DIM;

        const targetColor = new THREE.Color();
        const emotionColor = { 'Joy': 0x66ff66, 'Fear': 0xff6666, 'Curiosity': 0x66ccff, 'Frustration': 0xff9966, 'Calm': 0x99ffcc, 'Surprise': 0xffff66, 'Unknown': 0xcccccc }[dominantEmotion] || 0xcccccc;
        targetColor.setHex(emotionColor);
        const targetEmissiveIntensity = clamp(emotionIntensity * 0.5 + 0.2, 0.2, 0.8);

        agentStateMesh.material.color.lerp(targetColor, 0.1);
        agentStateMesh.userData.baseColor = agentStateMesh.material.color.getHex();
        if (agentStateMesh.material.emissive) {
            const targetEmissiveColor = agentStateMesh.material.color.clone().multiplyScalar(targetEmissiveIntensity);
            agentStateMesh.material.emissive.lerp(targetEmissiveColor, 0.1);
            agentStateMesh.userData.baseEmissive = agentStateMesh.material.emissive.getHex();
        }
        agentStateMesh.userData.baseScale = 1.0 + emotionIntensity * 0.5;
        agentStateMesh.userData.baseOpacity = agentStateMesh.material.opacity;
    }

    // Update Emergence Core Mesh
    if (emergenceCoreMesh?.material && emergenceCoreMesh.userData) {
        const targetColor = new THREE.Color(0xff66ff).lerp(new THREE.Color(0xffffff), clamp(rihScore, 0, 1) * 0.5);
        const emissiveIntensity = clamp(rihScore * 0.8 + Math.abs(avgAffinity) * 0.3, 0.3, 0.9);

        emergenceCoreMesh.material.color.lerp(targetColor, 0.1);
        emergenceCoreMesh.userData.baseColor = emergenceCoreMesh.material.color.getHex();
        if (emergenceCoreMesh.material.emissive) {
            const targetEmissiveColor = emergenceCoreMesh.material.color.clone().multiplyScalar(emissiveIntensity);
            emergenceCoreMesh.material.emissive.lerp(targetEmissiveColor, 0.1);
            emergenceCoreMesh.userData.baseEmissive = emergenceCoreMesh.material.emissive.getHex();
        }
        emergenceCoreMesh.userData.baseScale = 1.0 + clamp(rihScore, 0, 1) * 0.8 + clamp(Math.abs(avgAffinity), 0, 1) * 0.3;
        emergenceCoreMesh.material.opacity = clamp(0.6 + clamp(rihScore, 0, 1) * 0.3, 0.6, 0.9);
        emergenceCoreMesh.userData.baseOpacity = emergenceCoreMesh.material.opacity;
    }

    // Update Live2D Placeholder Info
     if (live2dPlaneConcept?.userData) {
         const live2dStatus = live2dInitialized ? 'Active' : 'Inactive';
         live2dPlaneConcept.userData.name = `Live2D Avatar (Status: ${live2dStatus})`;
         live2dPlaneConcept.userData.baseOpacity = live2dPlaneConcept.material?.opacity ?? 0.0;
         live2dPlaneConcept.userData.baseScale = 1.0;
     }

    // Update Edge Base Opacity
    conceptEdges.forEach(edge => {
        if (edge?.material && edge.userData) {
             const baseOpacity = clamp(0.3 + clamp(rihScore, 0, 1) * 0.3 + clamp(Math.abs(avgAffinity), 0, 1) * 0.2, 0.3, 0.7);
             edge.userData.baseOpacity = baseOpacity;
        }
    });
}

// Sets up raycasting and event listeners
function setupConceptInteraction(interactableObjects) {
    if (!conceptContainer || !conceptInfoPanel) return;
    conceptRaycaster = new THREE.Raycaster();
    conceptMouse = new THREE.Vector2();
    conceptContainer.addEventListener('mousemove', handleConceptMouseMoveWrapper, false);
    conceptContainer.addEventListener('click', handleConceptClickWrapper, false);
    updateInfoPanel(); // Initial call
}

// Handles mouse movement
function onConceptMouseMove(event, interactableObjects) {
    if (!conceptInitialized || !conceptCamera || !conceptRaycaster || !conceptMouse || !conceptContainer || !interactableObjects) return;
    const rect = conceptContainer.getBoundingClientRect();
    conceptMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    conceptMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    conceptRaycaster.setFromCamera(conceptMouse, conceptCamera);
    const intersects = conceptRaycaster.intersectObjects(interactableObjects, false);
    let newHoveredObject = null;
    if (intersects.length > 0) {
        for(let i = 0; i < intersects.length; i++) {
            if(intersects[i].object?.userData) { newHoveredObject = intersects[i].object; break; }
        }
    }
    if (!selectedObject && newHoveredObject !== hoveredObject) { hoveredObject = newHoveredObject; }
    else if (!selectedObject && !newHoveredObject && hoveredObject !== null) { hoveredObject = null; }
    conceptContainer.style.cursor = (selectedObject || hoveredObject) ? 'pointer' : 'default';
}

// Handles mouse clicks
function onConceptClick(event, interactableObjects) {
    if (!conceptInitialized || !conceptCamera || !conceptRaycaster || !conceptMouse || !conceptContainer || !conceptControls || !interactableObjects) return;
     const rect = conceptContainer.getBoundingClientRect();
     conceptMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
     conceptMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
     conceptRaycaster.setFromCamera(conceptMouse, conceptCamera);
    const intersects = conceptRaycaster.intersectObjects(interactableObjects, false);
    let clickedObject = null;
    if (intersects.length > 0) {
        for(let i = 0; i < intersects.length; i++) {
            if(intersects[i].object?.userData) { clickedObject = intersects[i].object; break; }
        }
    }
    if (clickedObject) {
        if (selectedObject === clickedObject) { selectedObject = null; }
        else {
            selectedObject = clickedObject;
            if (clickedObject.position) {
                conceptControls.target.copy(clickedObject.position);
                conceptControls.update();
            }
        }
    } else { selectedObject = null; }
    conceptContainer.style.cursor = (selectedObject || hoveredObject) ? 'pointer' : 'default';
}

// Updates the info panel content
export function updateInfoPanel() {
    if (!conceptInfoPanel) return;

    let displayObject = null;
    if (selectedObject?.userData) { displayObject = selectedObject; }
    else if (hoveredObject?.userData) { displayObject = hoveredObject; }

    conceptInfoPanel.classList.toggle('visible', !!displayObject);

    if (displayObject && displayObject.userData) {
        const data = displayObject.userData;
        let displayName = data.name || 'Unknown';
        const baseDescription = data.description || 'No description available.';
        let descriptionToDisplay = baseDescription.split('<br><i>Dynamic details')[0];
        let dynamicInfoHtml = '';

        if (data.type === 'simulation_state' || data.type === 'live2d_avatar_ref') {
            const emotions = latestAgentEmotions || zeros([Config.Agent.EMOTION_DIM]);
            const dominantEmotionIdx = emotions.length === Config.Agent.EMOTION_DIM ? emotions.indexOf(Math.max(...emotions)) : -1;
            const dominantEmotion = dominantEmotionIdx !== -1 ? emotionNames[dominantEmotionIdx] : 'Unknown';

            if (data.id === 'agent_emotional_state') {
                dynamicInfoHtml = `<br><span class="simulated-data">Dominant Feeling: ${dominantEmotion}<br>` +
                    `Joy: ${(emotions[0] * 100).toFixed(1)}%, Fear: ${(emotions[1] * 100).toFixed(1)}%<br>` +
                    `Curiosity: ${(emotions[2] * 100).toFixed(1)}%, Frustration: ${(emotions[3] * 100).toFixed(1)}%<br>` +
                    `Calm: ${(emotions[4] * 100).toFixed(1)}%, Surprise: ${(emotions[5] * 100).toFixed(1)}%</span>`;
            } else if (data.id === 'emergence_core') {
                dynamicInfoHtml = `<br><span class="simulated-data">RIH Score: ${(latestRIHScore * 100).toFixed(1)}%<br>` +
                    `Average Affinity: ${(latestAvgAffinity * 100).toFixed(1)}%</span>`;
            } else if (data.id === 'live2d_avatar_ref') {
                const live2dStatus = live2dInitialized ? 'Active' : 'Inactive';
                displayName = `Live2D Avatar (Status: ${live2dStatus})`;
                dynamicInfoHtml = `<br><span class="simulated-data">Dominant Feeling: ${dominantEmotion}<br>` +
                    `Current Action: ${latestHmLabel}<br>` +
                    `Agent RIH: ${(latestRIHScore * 100).toFixed(1)}%</span>`;
            }
            if (dynamicInfoHtml) {
                descriptionToDisplay += '<br><i>Dynamic details below reflect current simulation state.</i>' + dynamicInfoHtml;
            }
        }

        let linksHtml = '';
        if (data.links && data.links.length > 0) {
            linksHtml = '<p><b>Connected Concepts:</b></p><ul class="links-list">';
            data.links.forEach(linkId => {
                const linkData = conceptData[linkId];
                linksHtml += `<li><span title="${linkData?.description || ''}">${linkData?.name || `Unknown (${linkId})`}</span></li>`;
            });
            linksHtml += '</ul>';
        }

        conceptInfoPanel.innerHTML = `
            <h3>${displayName}</h3>
             <p><b>Type:</b> ${data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1).replace(/_/g, ' ') : 'N/A'}</p>
            ${data.chapter ? `<p><b>Chapter:</b> ${data.chapter}</p>` : ''}
            <p>${descriptionToDisplay}</p>
            ${linksHtml}
        `;
    } else {
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
 * Includes temporary feedback for user inputs (sliders, chat).
 * @param {number} deltaTime The time elapsed since the last frame.
 * @param {number} integrationParam Value from the integration slider (0-1).
 * @param {number} reflexivityParam Value from the reflexivity slider (0-1).
 * @param {number} lastIntegrationTime Timestamp of last integration slider input (-1 if old).
 * @param {number} lastReflexivityTime Timestamp of last reflexivity slider input (-1 if old).
 * @param {number} lastChatTime Timestamp of last chat input impact (-1 if old).
 */
export function animateConceptNodes(deltaTime, integrationParam, reflexivityParam, lastIntegrationTime, lastReflexivityTime, lastChatTime) { // Added timestamp params
    if (!conceptInitialized || !conceptClock || !conceptNodes || latestAgentEmotions === null) return;

    const elapsedTime = conceptClock.getElapsedTime(); // Get current time for comparison
    const inputFeedbackDuration = 0.5; // How long feedback effect lasts (seconds) - sync with app.js

    // Get emotions array safely
    const emotions = latestAgentEmotions || zeros([Config.Agent.EMOTION_DIM]);
    const joyVal = emotions[0] || 0;
    const fearVal = emotions[1] || 0;
    const curiosityVal = emotions[2] || 0;
    const frustrationVal = emotions[3] || 0;
    const calmVal = emotions[4] || 0;
    const surpriseVal = emotions[5] || 0;
    const emotionAvg = emotions.reduce((a, b) => a + b, 0) / Config.Agent.EMOTION_DIM;

    // Define highlight/feedback colors
    const nodeHighlightColor = new THREE.Color(0xffffff);
    const nodeHighlightEmissive = new THREE.Color(0xffffff).multiplyScalar(0.5);
    const linkedColor = new THREE.Color(0xaaaaee);
    const linkedEmissive = new THREE.Color(0xaaaaee).multiplyScalar(0.3);
    const edgeHighlightColor = new THREE.Color(0x00aaff);
    const edgeHighlightEmissive = new THREE.Color(0x00aaff).multiplyScalar(0.8);
    // --- Feedback Effect Colors ---
    const integrationFeedbackColor = new THREE.Color(0x66ffaa); // Light green pulse
    const reflexivityFeedbackColor = new THREE.Color(0xffddaa); // Orangish pulse
    const chatFeedbackColor = new THREE.Color(0xaaaaff); // Bluish pulse


    const allNodesToAnimate = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh,
        emergenceCoreMesh,
        live2dPlaneConcept,
    ].filter(Boolean);

    allNodesToAnimate.forEach(object => {
        if (!object?.material || !object.userData?.originalPosition) return; // Basic safety checks

        const data = object.userData;
        const originalPosition = data.originalPosition;
        const originalColor = new THREE.Color(data.originalColor ?? 0x888888);
        const originalEmissive = new THREE.Color(data.originalEmissive ?? 0x222222);
        const baseScale = data.baseScale ?? 1.0;
        const baseOpacity = data.baseOpacity ?? (object.material.opacity !== undefined ? object.material.opacity : 1.0);

        const isSelected = selectedObject === object;
        const isHovered = !isSelected && hoveredObject === object;
        const isLinkedToSelected = selectedObject?.userData && ((data.links || []).includes(selectedObject.userData.id) || (selectedObject.userData.links || []).includes(data.id));
        const isLinkedToHovered = !isSelected && !isLinkedToSelected && hoveredObject?.userData && ((data.links || []).includes(hoveredObject.userData.id) || (hoveredObject.userData.links || []).includes(data.id));

        // --- Determine Target State ---
        let targetPosition = originalPosition.clone();
        let targetScale = new THREE.Vector3(baseScale, baseScale, baseScale);
        let targetColor = (data.type === 'simulation_state' || data.type === 'live2d_avatar_ref')
            ? new THREE.Color(data.baseColor ?? originalColor) // Use base color for placeholders
            : originalColor.clone(); // Use original color for concepts
        let targetEmissive = (data.type === 'simulation_state' || data.type === 'live2d_avatar_ref')
            ? new THREE.Color(data.baseEmissive ?? originalEmissive) // Use base emissive for placeholders
            : originalEmissive.clone(); // Use original emissive for concepts
        let targetOpacity = baseOpacity;

        // Apply base type animation first (for non-highlighted nodes)
        if (!isSelected && !isHovered && !isLinkedToSelected && !isLinkedToHovered && data.type !== 'simulation_state' && data.type !== 'live2d_avatar_ref') {
            let baseOscillationY = 0, baseOscillationZ = 0, baseOscillationX = 0, basePulseFactor = 0.03;
            switch (data.type) {
                case 'framework': basePulseFactor = 0.04; break;
                case 'structure': baseOscillationY = 0.2; break;
                case 'core': basePulseFactor = 0.05; break;
                case 'field': baseOscillationZ = 0.4; basePulseFactor = 0.02; break;
                case 'dynamics': baseOscillationY = 0.5; break;
                case 'method': baseOscillationX = 0.15; break;
                case 'architecture': baseOscillationY = 0.1; break;
                case 'purpose': basePulseFactor = 0.05; break;
                case 'principle': baseOscillationZ = 0.1; break;
                case 'geometry_metric': basePulseFactor = 0; break; // Handled specifically below
                case 'relation': basePulseFactor = 0.08; break;
                case 'level': baseOscillationY = 0.1; break;
                case 'transformation': basePulseFactor = 0.07; break;
            }
            targetPosition.x += Math.sin(elapsedTime * 1.1 + originalPosition.z * 0.06) * baseOscillationX;
            targetPosition.y += Math.sin(elapsedTime * 1.3 + originalPosition.x * 0.08) * baseOscillationY;
            targetPosition.z += Math.sin(elapsedTime * 1.5 + originalPosition.y * 0.10) * baseOscillationZ;
            const basePulse = Math.sin(elapsedTime * 1.8 + originalPosition.x * 0.05) * basePulseFactor;
            // Apply base scale first before metric scale modifier
            targetScale.set(baseScale * (1.0 + basePulse), baseScale * (1.0 + basePulse), baseScale * (1.0 + basePulse));
        } else if (data.type === 'simulation_state' || data.type === 'live2d_avatar_ref') {
            // Ensure placeholders start at their base scale/position if not otherwise animated
            targetScale.set(baseScale, baseScale, baseScale);
            targetPosition.copy(originalPosition);
        }

        // --- Metric/Slider/Feedback Influences (Layered ONLY if not selected/hovered) ---
        let inputFeedbackIntensity = 0;
        let feedbackEmissiveColor = null;

        if (!isSelected && !isHovered) {
            // Check for recent inputs and apply feedback effect
            let timeSinceInput = -1;
            let targetNodeIdForFeedback = null;

            if (lastIntegrationTime > 0 && (data.id === 'synkolator' || data.id === 'korporator')) {
                timeSinceInput = elapsedTime - lastIntegrationTime;
                targetNodeIdForFeedback = data.id;
                feedbackEmissiveColor = integrationFeedbackColor;
            } else if (lastReflexivityTime > 0 && (data.id === 'reflexive_abstraction' || data.id === 'reflexive_integration')) {
                timeSinceInput = elapsedTime - lastReflexivityTime;
                targetNodeIdForFeedback = data.id;
                feedbackEmissiveColor = reflexivityFeedbackColor;
            } else if (lastChatTime > 0 && (data.id === 'agent_emotional_state' || data.id === 'subjective_aspect')) {
                timeSinceInput = elapsedTime - lastChatTime;
                targetNodeIdForFeedback = data.id;
                feedbackEmissiveColor = chatFeedbackColor;
            }

            // Calculate feedback intensity (fades out)
            if (targetNodeIdForFeedback && timeSinceInput >= 0 && timeSinceInput < inputFeedbackDuration) {
                inputFeedbackIntensity = 1.0 - (timeSinceInput / inputFeedbackDuration);
                inputFeedbackIntensity = inputFeedbackIntensity * inputFeedbackIntensity; // Make fade faster (quadratic)
            }

            // --- Apply Regular Metric/Slider Influences (If NO feedback active) ---
            if (inputFeedbackIntensity <= 0 && !isLinkedToSelected && !isLinkedToHovered) {
                let metricScaleModifier = 1.0;
                let metricPulseSpeedFactor = 1.0;
                let metricPulseAmountFactor = 1.0;
                let metricOscillationFactor = 1.0;
                let metricColorShift = new THREE.Color(0x000000);

                // RIH Influence
                if (['reflexive_integration', 'holoformen', 'selection_principles'].includes(data.id)) {
                    metricScaleModifier += latestRIHScore * 0.15;
                    metricPulseAmountFactor += latestRIHScore * 0.5;
                    targetEmissive.lerp(new THREE.Color(0xffffff), latestRIHScore * 0.4);
                }
                // Affinity Influence
                if (['affinitaetssyndrom', 'korporator', 'syntropodenarchitektonik'].includes(data.id)) {
                    const absAffinity = Math.abs(latestAvgAffinity);
                    metricScaleModifier += absAffinity * 0.1;
                    metricPulseAmountFactor += absAffinity * 0.4;
                    if (latestAvgAffinity > 0.2) metricColorShift.g += 0.2 * latestAvgAffinity;
                    if (latestAvgAffinity < -0.2) metricColorShift.b += 0.2 * Math.abs(latestAvgAffinity);
                    targetEmissive.lerp(new THREE.Color(0xaaaaff), absAffinity * 0.3);
                }
                // Emotion Influence
                 if (data.id === 'subjective_aspect') metricOscillationFactor += emotionAvg * 0.5;
                 if (data.id === 'dialektik') {
                     const negEmotion = (fearVal + frustrationVal) / 2;
                     metricPulseAmountFactor += negEmotion * 0.6;
                     if (negEmotion > 0.1) metricColorShift.r += 0.3 * negEmotion;
                 }
                 if (data.id === 'telezentrik' || data.id === 'telewarianz') {
                     const posEmotion = (joyVal + calmVal) / 2;
                     metricScaleModifier += posEmotion * 0.1;
                     if (posEmotion > 0.1) metricColorShift.g += 0.3 * posEmotion;
                     targetEmissive.lerp(new THREE.Color(0xaaffaa), posEmotion * 0.3);
                 }
                 if (data.id === 'dyswarianz') {
                    const disEmotion = (fearVal + surpriseVal + frustrationVal) / 3;
                    metricOscillationFactor += disEmotion * 0.7;
                    metricPulseSpeedFactor += disEmotion * 0.5;
                    if (disEmotion > 0.1) metricColorShift.r += 0.15 * disEmotion; metricColorShift.b += 0.15 * disEmotion;
                 }
                // Slider Influence
                if (data.id === 'synkolator') {
                    metricPulseSpeedFactor += integrationParam * 0.8;
                    metricPulseAmountFactor += integrationParam * 0.3;
                }
                if (data.id === 'reflexive_abstraction') {
                    metricOscillationFactor += reflexivityParam * 0.6;
                    metricScaleModifier += reflexivityParam * 0.1;
                    targetEmissive.lerp(new THREE.Color(0xffddaa), reflexivityParam * 0.3);
                }

                // Apply Metric/Slider Influences
                targetScale.multiplyScalar(metricScaleModifier);
                 // Use a default base amount for the metric pulse
                const metricPulseBaseAmount = 0.03; // Define a base amount for metric pulse
                const metricPulse = Math.sin(elapsedTime * (1.8 * metricPulseSpeedFactor) + originalPosition.x * 0.05) * (metricPulseBaseAmount * metricPulseAmountFactor);
                targetScale.multiplyScalar(1.0 + metricPulse); // Layer pulse
                targetPosition.x = originalPosition.x + (targetPosition.x - originalPosition.x) * metricOscillationFactor;
                targetPosition.y = originalPosition.y + (targetPosition.y - originalPosition.y) * metricOscillationFactor;
                targetPosition.z = originalPosition.z + (targetPosition.z - originalPosition.z) * metricOscillationFactor;
                targetColor.add(metricColorShift);
            }

            // --- Apply Input Feedback Effect (Overrides metric/base anim temporarily) ---
            if (inputFeedbackIntensity > 0 && feedbackEmissiveColor) {
                 const feedbackScalePulse = baseScale * (1.0 + 0.2 * inputFeedbackIntensity); // Pulse slightly larger
                 targetScale.set(feedbackScalePulse, feedbackScalePulse, feedbackScalePulse);
                 // Blend emissive towards feedback color based on intensity
                 const feedbackEmissive = feedbackEmissiveColor.clone().multiplyScalar(0.8 * inputFeedbackIntensity); // Intensity affects brightness
                 targetEmissive.lerp(feedbackEmissive, inputFeedbackIntensity); // Blend current target emissive with feedback
                 targetPosition = originalPosition.clone(); // Freeze position during feedback pulse
            }

             // Apply linked state AFTER potential feedback effect (linked overrides feedback appearance)
             if (isLinkedToSelected || isLinkedToHovered) {
                targetColor.lerp(linkedColor, 0.5);
                targetEmissive.lerp(linkedEmissive, 0.5);
                 // Keep scale/position from feedback pulse if it was active, otherwise from metric/base
                 if(inputFeedbackIntensity <= 0) {
                     // targetScale/targetPosition remain from metric/base animation
                 } else {
                     // Node keeps feedback scale/position but gets linked color/emissive blended in
                 }
                targetOpacity = clamp(baseOpacity * 1.1, 0.6, 0.9);
             }

        } // End of (!isSelected && !isHovered) block


        // --- Apply Highlight State (Overrides all other non-selected states) ---
        if (isSelected || isHovered) {
            targetColor.copy(nodeHighlightColor);
            targetEmissive.copy(nodeHighlightEmissive);
            const highlightScaleFactor = baseScale * (isSelected ? 1.15 : 1.08);
            targetScale.set(highlightScaleFactor, highlightScaleFactor, highlightScaleFactor);
            targetOpacity = clamp(baseOpacity * 1.2, 0.8, 1.0);
            targetPosition = originalPosition.clone(); // Freeze position when highlighted
        }


        // --- Final Interpolation ---
        const lerpFactor = 0.1;
        object.position.lerp(targetPosition, lerpFactor);
        object.scale.lerp(targetScale, lerpFactor);
        object.material.color.lerp(targetColor, lerpFactor);
        if (object.material.emissive) {
            object.material.emissive.lerp(targetEmissive, lerpFactor);
        }
        object.material.opacity = lerp(object.material.opacity, targetOpacity, lerpFactor);


        // --- Rotation (Only if not selected) ---
         if (!isSelected) {
             const activityLevel = clamp(latestRIHScore + emotionAvg + Math.abs(latestAvgAffinity), 0.1, 1.5);
             const baseRotSpeed = deltaTime * 0.05 * activityLevel;
             object.rotation.y += baseRotSpeed;

             const specificRotSpeed = deltaTime * 0.1 * activityLevel;
              switch(data.type) {
                  case 'core': object.rotation.x += specificRotSpeed * (0.8 + reflexivityParam * 0.5); object.rotation.z += specificRotSpeed * (1.2 + reflexivityParam * 0.5); break;
                  case 'operator': object.rotation.x += specificRotSpeed * (1.0 + integrationParam * 0.6); object.rotation.z += specificRotSpeed * (1.1 + integrationParam * 0.6); break;
                  case 'simulation_state':
                    if (object === agentStateMesh) { object.rotation.y += deltaTime * 0.3; object.rotation.x += deltaTime * 0.15;}
                    if (object === emergenceCoreMesh) { object.rotation.y += deltaTime * 0.4; object.rotation.x += deltaTime * 0.2; object.rotation.z += deltaTime * 0.1;}
                    break;
              }
         }


        // --- Label Update ---
        if (object.userData.label) {
            const label = object.userData.label;
            const labelBaseOffset = {
                 'framework': 1.8, 'structure': 1.5, 'core': 1.3, 'component': 1.5,
                 'property': 1.2, 'parameter': 1.1, 'operator': 1.6, 'method': 1.8,
                 'concept': 1.4, 'architecture': 1.9, 'field': 1.7, 'dynamics': 1.6,
                 'purpose': 1.6, 'principle': 1.6, 'geometry_metric': 1.6, 'relation': 1.3,
                 'level': 1.4, 'transformation': 1.4,
                 'simulation_state': 2.0 * (data.id === 'agent_emotional_state' ? 1.0 : 1.25),
                 'live2d_avatar_ref': 0
            }[data.type] || 1.5;
            label.position.y = labelBaseOffset * object.scale.y;
            label.element.style.opacity = object.material.opacity;
            label.element.style.display = object.material.opacity < 0.1 ? 'none' : 'block';
        }
    });

    // --- Edge Animation ---
    conceptEdges.forEach(edge => {
        if (!edge?.material || !edge.userData) return;

        const originalColor = new THREE.Color(edge.userData.originalColor);
        const originalEmissive = new THREE.Color(edge.userData.originalEmissive);
        const baseOpacity = edge.userData.baseOpacity ?? 0.5;

        const sourceObject = allNodesToAnimate.find(obj => obj.userData?.id === edge.userData.sourceId);
        const targetObject = allNodesToAnimate.find(obj => obj.userData?.id === edge.userData.targetId);

        const isConnectedToSelected = selectedObject && (sourceObject === selectedObject || targetObject === selectedObject);
        const isConnectedToHovered = !isConnectedToSelected && hoveredObject && (sourceObject === hoveredObject || targetObject === hoveredObject);

        let targetColor = originalColor.clone();
        let targetEmissive = originalEmissive.clone();
        let targetOpacity = baseOpacity;

        // Base edge color/opacity influenced by Affinity/RIH
        const affinityInfluence = clamp(Math.abs(latestAvgAffinity), 0, 1);
        const rihInfluence = clamp(latestRIHScore, 0, 1);
        targetOpacity = clamp(baseOpacity * (0.8 + rihInfluence * 0.4 + affinityInfluence * 0.3), 0.2, 0.8);
        const affinityColorShift = new THREE.Color(0, 0, 0);
        if (latestAvgAffinity > 0.1) affinityColorShift.g += 0.3 * latestAvgAffinity;
        if (latestAvgAffinity < -0.1) affinityColorShift.b += 0.3 * Math.abs(latestAvgAffinity);
        targetColor.add(affinityColorShift);

        if (isConnectedToSelected || isConnectedToHovered) {
            targetColor.copy(edgeHighlightColor);
            targetEmissive.copy(edgeHighlightEmissive);
            targetOpacity = clamp(targetOpacity * 1.5, 0.7, 1.0);
        } else {
             targetEmissive.multiplyScalar(0.5 + rihInfluence * 0.5);
        }

        const edgeLerpFactor = isConnectedToSelected || isConnectedToHovered ? 0.2 : 0.05;
        edge.material.color.lerp(targetColor, edgeLerpFactor);
        edge.material.emissive.lerp(targetEmissive, edgeLerpFactor);
        edge.material.opacity = lerp(edge.material.opacity, targetOpacity, edgeLerpFactor);
     });
}


/**
 * Handles window resize event for the Concept Graph panel.
 */
function onConceptWindowResize() {
    if (!conceptInitialized || !conceptCamera || !conceptRenderer || !conceptLabelRenderer || !conceptContainer) return;

    const width = conceptContainer.clientWidth;
    const height = conceptContainer.clientHeight;

    if (width <= 0 || height <= 0) return;

    conceptCamera.aspect = width / height;
    conceptCamera.updateProjectionMatrix();

    conceptRenderer.setSize(width, height);
    conceptLabelRenderer.setSize(width, height);
}

/**
 * Cleans up Three.js resources for the Concept Graph panel.
 */
export function cleanupConceptVisualization() {
    if (!conceptInitialized) return;
    console.log("Cleaning up Concept Graph Three.js...");

    // Remove listeners
    window.removeEventListener('resize', onConceptWindowResize);
    if (conceptContainer) {
        conceptContainer.removeEventListener('mousemove', handleConceptMouseMoveWrapper, false);
        conceptContainer.removeEventListener('click', handleConceptClickWrapper, false);
    }

    // Dispose renderers
    if (conceptRenderer) {
        conceptRenderer.dispose();
        if (conceptContainer?.contains(conceptRenderer.domElement)) {
            conceptContainer.removeChild(conceptRenderer.domElement);
        }
        conceptRenderer = null;
    }
    if (conceptLabelRenderer?.domElement) {
        conceptLabelRenderer.domElement.remove();
        conceptLabelRenderer = null;
    }

    // Dispose nodes
    Object.values(conceptNodes).forEach(cn => {
        const node = cn.object;
        if (node) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) node.material.dispose();
            if (cn.label?.element?.parentNode) {
                cn.label.element.parentNode.removeChild(cn.label.element);
            }
            conceptScene?.remove(node);
        }
    });
    conceptNodes = {};

    // Dispose base edge material
    if (baseConceptEdgeMaterial) {
        baseConceptEdgeMaterial.dispose();
        baseConceptEdgeMaterial = null;
    }

    // Dispose edges
    conceptEdges.forEach(edge => {
        if (edge.geometry) edge.geometry.dispose();
        if (edge.material) edge.material.dispose();
        conceptScene?.remove(edge);
    });
    conceptEdges = [];

    // Dispose placeholder meshes
    [agentStateMesh, emergenceCoreMesh, live2dPlaneConcept].forEach(mesh => {
        if (mesh) {
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
            if (mesh.userData?.label?.element?.parentNode) {
                 mesh.userData.label.element.parentNode.removeChild(mesh.userData.label.element);
            }
            conceptScene?.remove(mesh);
        }
    });
    agentStateMesh = null;
    emergenceCoreMesh = null;
    live2dPlaneConcept = null;
    agentStateLabel = null;
    emergenceCoreLabel = null;


    // Nullify references
    conceptControls = null;
    conceptScene = null;
    conceptCamera = null;
    conceptContainer = null;
    conceptInfoPanel = null;
    conceptClock = null;
    hoveredObject = null;
    selectedObject = null;
    latestAgentEmotions = null;


    conceptInitialized = false;
    console.log("Concept Graph Three.js cleanup complete.");
}

// --- Wrapper functions for event listeners to allow removal ---
function handleConceptMouseMoveWrapper(event) {
    const interactableObjects = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh,
        emergenceCoreMesh,
        live2dPlaneConcept,
    ].filter(Boolean); // Filter out null/undefined placeholders

    onConceptMouseMove(event, interactableObjects);
    if (!selectedObject) {
        updateInfoPanel();
    }
}

function handleConceptClickWrapper(event) {
     const interactableObjects = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh,
        emergenceCoreMesh,
        live2dPlaneConcept,
    ].filter(Boolean);

    onConceptClick(event, interactableObjects);
    updateInfoPanel(); // Always update after click
}
