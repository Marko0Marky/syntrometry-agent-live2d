// js/viz-concepts.js

// Imports for LOCAL modules are CORRECT and should REMAIN:
import { Config, emotionNames } from './config.js';
import { clamp, displayError, zeros, lerp } from './utils.js';
import { live2dInitialized } from './viz-live2d.js'; // Check status of Live2D avatar

// NOTE: THREE, OrbitControls, CSS2DRenderer, CSS2DObject are accessed globally
// because they are loaded via <script> tags in index.html.
// DO NOT import them here when using that loading method.

// ==============================================================
// == Exports for app.js ==
// ==============================================================

// Exported Variables (will be initialized in initConceptVisualization)
export let conceptScene = null;
export let conceptCamera = null;
export let conceptRenderer = null;
export let conceptLabelRenderer = null;
export let conceptControls = null;
export let conceptInitialized = false; // Export the initialization status flag

// Exported Functions (definitions follow below)
// - initConceptVisualization
// - updateAgentSimulationVisuals
// - animateConceptNodes
// - updateInfoPanel
// - cleanupConceptVisualization

// ==============================================================
// == Internal Module Variables ==
// ==============================================================

let conceptRaycaster = null;
let conceptMouse = null;
let conceptNodes = {}; // Map: { id: { object: Mesh, label: CSS2DObject, data: conceptData[id] } }
let conceptEdges = []; // Array of edge meshes
let conceptContainer = null;
let conceptInfoPanel = null;
let conceptClock = null; // Use clock passed from app.js

// Placeholders for simulation elements integrated into the graph
let agentStateMesh = null;
let emergenceCoreMesh = null;
let agentStateLabel = null;
let emergenceCoreLabel = null;
let live2dPlaneConcept = null; // Invisible plane representing avatar link

let baseConceptEdgeMaterial = null; // Reusable base material for edges

// Interaction state
let hoveredObject = null;
let selectedObject = null;

// Cached simulation state for visual updates
let latestAgentEmotions = null;
let latestRIHScore = 0;
let latestAvgAffinity = 0;
let latestTrustScore = 1.0;
let latestHmLabel = "idle";

// Concept Data (Keep as is)
const conceptData = {
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

    // Placeholders linking to Simulation Metrics
    'agent_emotional_state': { id: 'agent_emotional_state', name: 'Agent Emotional State', chapter: 'Simulation', position: new THREE.Vector3(25, -5, 0), type: 'simulation_state', links: ['subjective_aspect', 'aonische_area', 'reflexive_integration', 'live2d_avatar_ref'], description: 'Represents the agent\'s emotional state (Joy, Fear, etc.). Updates dynamically based on simulation.' },
    'emergence_core': { id: 'emergence_core', name: 'Emergence Core (RIH/Affinity)', chapter: 'Simulation', position: new THREE.Vector3(-25, -5, 0), type: 'simulation_state', links: ['reflexive_integration', 'affinitaetssyndrom', 'syntropodenarchitektonik', 'agent_emotional_state'], description: 'Represents key emergent properties like Reflexive Integration (RIH), Affinities, and Trust from agent processing.' },
    'live2d_avatar_ref': { id: 'live2d_avatar_ref', name: 'Live2D Avatar Ref', chapter: 'Visualization', position: new THREE.Vector3(0, -10, 0), type: 'live2d_avatar_ref', links: ['agent_emotional_state'], description: `Logical link point for the Live2D avatar. Its appearance in the other panel reflects the Agent Emotional State.<br><i>(This node is visually represented by an invisible plane).</i>` }
};

// ==============================================================
// == Function Definitions ==
// ==============================================================

// Helper to get approximate boundary radius for edge connection points
function getApproxBoundaryRadius(geometry, scale) {
    if (!geometry || (!geometry.isGeometry && !geometry.isBufferGeometry)) {
        return 1.0; // Default radius if geometry is invalid
    }
    // Ensure bounding sphere exists
    if (!geometry.boundingSphere) {
        try {
            geometry.computeBoundingSphere();
        } catch (e) {
            console.warn("Could not compute bounding sphere for geometry:", geometry, e);
            return 1.0; // Fallback radius on error
        }
    }
    // Use bounding sphere radius if available
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
    // --- FIXED: Added explicit check for dependencies ---
    // Check if THREE and necessary examples are loaded globally
    if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined' || typeof THREE.CSS2DRenderer === 'undefined' || typeof THREE.CSS2DObject === 'undefined') {
        displayError("Three.js or its examples (OrbitControls/CSS2DRenderer/CSS2DObject) not fully loaded for Concept Graph.", false, 'concept-error-message');
        console.error("Concept Viz Init Check Failed:", {
             THREE: typeof THREE,
             OrbitControls: typeof THREE?.OrbitControls, // Use optional chaining for safety
             CSS2DRenderer: typeof THREE?.CSS2DRenderer,
             CSS2DObject: typeof THREE?.CSS2DObject
        });
        conceptInitialized = false;
        return false; // Exit initialization if dependencies are missing
    }
    // --- END OF FIX ---

    try {
        // Cleanup previous instance if any
        cleanupConceptVisualization(); // Ensure clean state

        conceptContainer = document.getElementById('concept-panel');
        conceptInfoPanel = document.getElementById('info-panel');
        const infoToggleButton = document.getElementById('toggle-info-panel');

        if (!conceptContainer || !conceptInfoPanel || !infoToggleButton) {
            displayError("Concept panel, info panel, or toggle button not found.", false, 'concept-error-message');
            conceptInitialized = false;
            return false;
        }

        const width = conceptContainer.clientWidth;
        const height = conceptContainer.clientHeight;
        if (width <= 0 || height <= 0) {
            console.warn("Concept panel has zero dimensions initially.");
            // Don't fail, might resize later
        }

        conceptClock = appClock; // Use the clock from app.js
        conceptScene = new THREE.Scene();
        conceptScene.background = new THREE.Color(0x111122); // Dark blue background
        conceptScene.fog = new THREE.Fog(0x111122, 60, 160); // Fog for depth perception

        conceptCamera = new THREE.PerspectiveCamera(65, width / Math.max(height, 1), 0.1, 1000); // Avoid division by zero
        conceptCamera.position.set(0, 15, 55); // Start further back

        conceptRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        conceptRenderer.setSize(width, height);
        conceptRenderer.setPixelRatio(window.devicePixelRatio);
        conceptContainer.appendChild(conceptRenderer.domElement);

        // This line is now safe because of the check at the start
        conceptLabelRenderer = new THREE.CSS2DRenderer();
        conceptLabelRenderer.setSize(width, height);
        conceptLabelRenderer.domElement.style.position = 'absolute';
        conceptLabelRenderer.domElement.style.top = '0px';
        conceptLabelRenderer.domElement.style.left = '0px';
        conceptLabelRenderer.domElement.style.pointerEvents = 'none'; // Labels don't block interaction
        conceptContainer.appendChild(conceptLabelRenderer.domElement);

        // This line is also safe because of the check
        conceptControls = new THREE.OrbitControls(conceptCamera, conceptRenderer.domElement);
        conceptControls.enableDamping = true;
        conceptControls.dampingFactor = 0.05;
        conceptControls.minDistance = 10;
        conceptControls.maxDistance = 150;
        conceptControls.target.set(0, 5, -10); // Aim towards the center of the graph
        conceptControls.update();

        // Lighting setup
        const ambientLight = new THREE.AmbientLight(0x8080a0, 0.6); // Softer ambient
        conceptScene.add(ambientLight);
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(5, 10, 7).normalize();
        conceptScene.add(dirLight1);
        const dirLight2 = new THREE.DirectionalLight(0xaaaaff, 0.4);
        dirLight2.position.set(-5, -5, -5).normalize();
        conceptScene.add(dirLight2);

        // Base material for edges
        baseConceptEdgeMaterial = new THREE.MeshPhongMaterial({
            color: Config.Visualization.Edge.BaseColor,
            emissive: Config.Visualization.Edge.BaseEmissive,
            transparent: true,
            opacity: Config.Visualization.Edge.BaseOpacity,
            side: THREE.DoubleSide // Render both sides for tubes
        });

        // Create graph elements
        createConceptNodes();
        createAgentSimulationPlaceholders();
        createConceptEdges();

        // Setup interaction listeners
        const interactableObjects = [
            ...Object.values(conceptNodes).map(n => n.object),
            agentStateMesh,
            emergenceCoreMesh,
            // live2dPlaneConcept, // Not interactable
        ].filter(Boolean);
        setupConceptInteraction(interactableObjects);

        // Info panel toggle logic
        infoToggleButton.onclick = () => {
             conceptInfoPanel.classList.toggle('visible');
             infoToggleButton.setAttribute('aria-expanded', conceptInfoPanel.classList.contains('visible'));
        };
        if (window.innerWidth <= 850) { // Hide by default on smaller screens
            conceptInfoPanel.classList.remove('visible');
            infoToggleButton.setAttribute('aria-expanded', 'false');
        } else {
             conceptInfoPanel.classList.add('visible'); // Show by default on larger screens
             infoToggleButton.setAttribute('aria-expanded', 'true');
        }

        // Add window resize listener
        window.addEventListener('resize', onConceptWindowResize, false);

        console.log('Concept visualization initialized successfully.');
        conceptInitialized = true; // Set flag AFTER successful init
        return true;
    } catch (e) {
        displayError(`Error initializing concept visualization: ${e.message}`, false, 'concept-error-message');
        console.error("Concept Viz Init Error:", e);
        cleanupConceptVisualization(); // Attempt cleanup on error
        conceptInitialized = false; // Ensure flag is false on error
        return false;
    }
}


// Creates the 3D meshes and labels for the concept nodes
function createConceptNodes() {
    // Dispose previous nodes before creating new ones
    Object.values(conceptNodes).forEach(cn => {
        if (cn.object) {
            // Remove labels first if they exist
            if (cn.label && cn.object.children.includes(cn.label)) {
                cn.object.remove(cn.label); // Remove label from node
            }
            if (cn.label?.element?.parentNode) {
                 cn.label.element.parentNode.removeChild(cn.label.element); // Remove label DOM element
            }
            // Dispose geometry and material
            if (cn.object.geometry) cn.object.geometry.dispose();
            if (cn.object.material) {
                 if (Array.isArray(cn.object.material)) {
                     cn.object.material.forEach(m => m.dispose());
                 } else {
                     cn.object.material.dispose();
                 }
            }
            // Remove node from scene
            conceptScene?.remove(cn.object);
        }
    });
    conceptNodes = {}; // Reset the map

    const VisConfig = Config.Visualization.Node;

    for (const id in conceptData) {
        const data = conceptData[id];
        // Skip placeholders, they are handled separately
        if (data.type === 'simulation_state' || data.type === 'live2d_avatar_ref') continue;

        const typeSettings = VisConfig.TypeSettings[data.type] || VisConfig.TypeSettings['concept']; // Fallback to 'concept' type
        const baseSize = VisConfig.BaseSize || 1.0;
        const nodeSize = (typeSettings.size || 1.0) * baseSize * 0.6; // Adjusted size factor

        let geometry;
        // Create geometry based on type (you can reuse your previous switch/case or a map here)
        // Example for sphere, adapt for others:
        if (['structure', 'core', 'component', 'property', 'parameter', 'concept', 'field', 'purpose', 'geometry_metric'].includes(data.type)) {
             geometry = new THREE.SphereGeometry(nodeSize, 16, 12);
        } else if (data.type === 'framework') {
             geometry = new THREE.BoxGeometry(nodeSize * 1.5, nodeSize * 1.5, nodeSize * 1.5); // Adjust proportions if needed
        } else if (data.type === 'operator') {
             geometry = new THREE.OctahedronGeometry(nodeSize, 0);
        } else if (data.type === 'method') {
             geometry = new THREE.CylinderGeometry(nodeSize * 0.8, nodeSize * 0.8, nodeSize * 2.5, 16);
        } else if (data.type === 'architecture') {
             geometry = new THREE.BoxGeometry(nodeSize * 1.2, nodeSize * 1.2, nodeSize * 1.2);
        } else if (data.type === 'dynamics') {
             geometry = new THREE.IcosahedronGeometry(nodeSize, 0);
        } else if (data.type === 'principle') {
             geometry = new THREE.BoxGeometry(nodeSize, nodeSize, nodeSize);
        } else if (data.type === 'transformation') {
             geometry = new THREE.BoxGeometry(nodeSize * 1.2, nodeSize * 0.8, nodeSize * 1.2);
        } else { // Default fallback geometry
             geometry = new THREE.SphereGeometry(nodeSize * 0.8, 12, 8);
        }


        const material = new THREE.MeshPhongMaterial({
            color: typeSettings.color,
            emissive: typeSettings.emissive,
            shininess: typeSettings.shininess,
            specular: new THREE.Color(typeSettings.color).multiplyScalar(0.5), // Adjust specular based on color
            transparent: true, // Enable transparency for potential opacity changes
            opacity: typeSettings.opacity
        });

        const node = new THREE.Mesh(geometry, material);
        node.position.copy(data.position);
        // Store data needed for animation and interaction
        node.userData = {
            ...data, // Copy all original data
            originalPosition: data.position.clone(),
            originalColor: material.color.getHex(),
            originalEmissive: material.emissive.getHex(),
            baseScale: 1.0, // Base scale multiplier for animation
            baseOpacity: material.opacity, // Store initial opacity
            label: null // Will be assigned below
        };

        conceptScene.add(node);

        // Create CSS2D Label (Safe because CSS2DObject class existence was checked)
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label';
        labelDiv.textContent = data.name;
        const label = new THREE.CSS2DObject(labelDiv);
        const labelOffset = (typeSettings.labelOffset || 1.5) * nodeSize / baseSize * 1.3; // Scaled offset
        label.position.set(0, labelOffset, 0); // Position relative to node center
        node.add(label); // Attach label to the node
        node.userData.label = label; // Store reference

        conceptNodes[id] = { object: node, label: label, data: node.userData };
    }
    console.log(`Created ${Object.keys(conceptNodes).length} concept nodes.`);
}


// Creates the curved tube edges between concept nodes
function createConceptEdges() {
    // Dispose previous edges
    conceptEdges.forEach(edge => {
        if (edge.geometry) edge.geometry.dispose();
        // Only dispose material if it's a clone (has userData.isClone or similar flag if needed)
        // Since we clone baseConceptEdgeMaterial each time, we should dispose it.
        if (edge.material) edge.material.dispose();
        conceptScene?.remove(edge); // Remove from scene
    });
    conceptEdges = []; // Reset array

    if (!baseConceptEdgeMaterial) {
        console.error("Base edge material not initialized before creating edges!");
        return;
    }

    const visitedEdges = new Set(); // Prevent duplicate edges (A->B and B->A)
    const EdgeConfig = Config.Visualization.Edge;

    // Include simulation placeholders in the node map for linking
    const allNodes = { ...conceptNodes };
    if (agentStateMesh?.userData?.id) allNodes[agentStateMesh.userData.id] = { object: agentStateMesh, data: agentStateMesh.userData, label: agentStateMesh.userData.label };
    if (emergenceCoreMesh?.userData?.id) allNodes[emergenceCoreMesh.userData.id] = { object: emergenceCoreMesh, data: emergenceCoreMesh.userData, label: emergenceCoreMesh.userData.label };
    if (live2dPlaneConcept?.userData?.id) allNodes[live2dPlaneConcept.userData.id] = { object: live2dPlaneConcept, data: live2dPlaneConcept.userData, label: null };

    for (const id of Object.keys(allNodes)) {
        const sourceNodeEntry = allNodes[id];
        // Ensure node exists and has links defined
        if (!sourceNodeEntry?.object?.position || !sourceNodeEntry.data?.links) continue;

        const sourceObject = sourceNodeEntry.object;
        const sourceScale = sourceObject.scale.x; // Use current scale for boundary calc
        const sourceBoundary = getApproxBoundaryRadius(sourceObject.geometry, sourceScale);
        const sourcePos = sourceObject.position;

        for (const targetId of sourceNodeEntry.data.links) {
            const targetNodeEntry = allNodes[targetId];
            // Ensure target node exists
            if (!targetNodeEntry?.object?.position) {
                 // console.warn(`Target node ID "${targetId}" linked from "${id}" not found in allNodes map.`); // Reduce noise
                 continue;
            }

            const targetObject = targetNodeEntry.object;

            // Create unique key for edge pair to avoid duplicates
            const sortedIds = [id, targetId].sort();
            const edgeKey = sortedIds.join('--');
            if (visitedEdges.has(edgeKey)) continue; // Skip if already created
            visitedEdges.add(edgeKey);

            const targetScale = targetObject.scale.x;
            const targetBoundary = getApproxBoundaryRadius(targetObject.geometry, targetScale);
            const targetPos = targetObject.position;

            // Calculate start and end points slightly offset from node centers
            const direction = new THREE.Vector3().subVectors(targetPos, sourcePos);
            const distance = direction.length();
            if (distance < 1e-6) continue; // Avoid zero-length edges

            // Offset start/end points by node boundaries along the direction vector
            const sourceAdjust = direction.clone().normalize().multiplyScalar(sourceBoundary);
            const targetAdjust = direction.clone().normalize().multiplyScalar(-targetBoundary); // Negative direction for target offset
            const startPoint = new THREE.Vector3().addVectors(sourcePos, sourceAdjust);
            const endPoint = new THREE.Vector3().addVectors(targetPos, targetAdjust);

            // Calculate control points for the Bezier curve
            const midPoint = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.5);
            // Curve height based on distance, adds visual separation
            const curveHeight = Math.sqrt(distance) * (Math.random() * 0.4 + 0.3); // Adjusted curve height randomness
            // Use a direction roughly perpendicular to the edge and view direction
            let curveNormal = new THREE.Vector3().crossVectors(direction, conceptCamera.position.clone().sub(midPoint)).normalize();
            if (curveNormal.lengthSq() < 0.1) curveNormal = new THREE.Vector3(0, 1, 0); // Fallback normal if vectors are collinear
            const curveOffset = curveNormal.multiplyScalar(curveHeight);

            // Define control points slightly offset from the midpoint along the curve normal
            const controlPoint1 = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.25).add(curveOffset);
            const controlPoint2 = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.75).add(curveOffset);

            // Create the curve and tube geometry
            const curve = new THREE.CubicBezierCurve3(startPoint, controlPoint1, controlPoint2, endPoint);
            const tubeGeo = new THREE.TubeGeometry(
                curve,
                EdgeConfig.TubularSegments,
                EdgeConfig.TubeRadius,
                EdgeConfig.TubeDetail,
                false // Not closed
            );
            const edgeMaterial = baseConceptEdgeMaterial.clone(); // Clone base material for individual control
            const edgeMesh = new THREE.Mesh(tubeGeo, edgeMaterial);

            // Store edge metadata
            edgeMesh.userData = {
                sourceId: id,
                targetId: targetId,
                type: 'edge',
                baseOpacity: edgeMaterial.opacity, // Store initial opacity
                originalColor: edgeMaterial.color.getHex(),
                originalEmissive: edgeMaterial.emissive.getHex()
            };

            conceptScene.add(edgeMesh);
            conceptEdges.push(edgeMesh);
        }
    }
    // console.log(`Created ${conceptEdges.length} concept edges.`); // Reduce noise
}

// Creates placeholder objects for agent state and emergence core
function createAgentSimulationPlaceholders() {
    // Dispose previous meshes if they exist
    if (agentStateMesh) {
        if (agentStateMesh.children.includes(agentStateLabel)) agentStateMesh.remove(agentStateLabel);
        if (agentStateLabel?.element?.parentNode) agentStateLabel.element.parentNode.removeChild(agentStateLabel.element);
        conceptScene?.remove(agentStateMesh);
        if (agentStateMesh.geometry) agentStateMesh.geometry.dispose();
        if (agentStateMesh.material) agentStateMesh.material.dispose();
        agentStateMesh = null; agentStateLabel = null;
    }
    if (emergenceCoreMesh) {
        if (emergenceCoreMesh.children.includes(emergenceCoreLabel)) emergenceCoreMesh.remove(emergenceCoreLabel);
        if (emergenceCoreLabel?.element?.parentNode) emergenceCoreLabel.element.parentNode.removeChild(emergenceCoreLabel.element);
        conceptScene?.remove(emergenceCoreMesh);
        if (emergenceCoreMesh.geometry) emergenceCoreMesh.geometry.dispose();
        if (emergenceCoreMesh.material) emergenceCoreMesh.material.dispose();
        emergenceCoreMesh = null; emergenceCoreLabel = null;
    }
    if (live2dPlaneConcept) {
        conceptScene?.remove(live2dPlaneConcept);
        if (live2dPlaneConcept.geometry) live2dPlaneConcept.geometry.dispose();
        if (live2dPlaneConcept.material) live2dPlaneConcept.material.dispose();
        live2dPlaneConcept = null;
    }

    const VisConfig = Config.Visualization.Node;

    // Agent State Placeholder
    const agentData = conceptData['agent_emotional_state'];
    if (agentData) {
        const typeSettings = VisConfig.TypeSettings[agentData.type]; // simulation_state
        const baseSize = VisConfig.BaseSize || 1.0;
        const nodeSize = (typeSettings.size || 1.0) * baseSize * 0.6;
        const geo = new THREE.SphereGeometry(nodeSize, 32, 16);
        const mat = new THREE.MeshPhongMaterial({
             color: typeSettings.color, emissive: typeSettings.emissive, shininess: typeSettings.shininess,
             specular: new THREE.Color(typeSettings.color).multiplyScalar(0.5),
             transparent: true, opacity: typeSettings.opacity });
        agentStateMesh = new THREE.Mesh(geo, mat);
        agentStateMesh.position.copy(agentData.position);
        agentStateMesh.userData = {
            ...agentData,
            originalPosition: agentData.position.clone(),
            originalColor: mat.color.getHex(),
            originalEmissive: mat.emissive.getHex(),
            baseOpacity: mat.opacity,
            baseScale: 1.0,
            label: null // Will be assigned below
        };
        conceptScene.add(agentStateMesh);

        const agentLabelDiv = document.createElement('div');
        agentLabelDiv.className = 'label';
        agentLabelDiv.textContent = agentData.name;
        // Safe: CSS2DObject existence checked in init
        agentStateLabel = new THREE.CSS2DObject(agentLabelDiv);
        const labelOffset = (typeSettings.labelOffset || 1.5) * nodeSize / baseSize * 1.3;
        agentStateLabel.position.set(0, labelOffset, 0);
        agentStateMesh.add(agentStateLabel);
        agentStateMesh.userData.label = agentStateLabel;
    } else { console.warn("Agent Emotional State concept data not found."); }

    // Emergence Core Placeholder
    const coreData = conceptData['emergence_core'];
    if (coreData) {
        const typeSettings = VisConfig.TypeSettings[coreData.type]; // simulation_state
        const baseSize = VisConfig.BaseSize || 1.0;
        const nodeSize = (typeSettings.size || 1.0) * baseSize * 0.6;
        const geo = new THREE.TetrahedronGeometry(nodeSize * 1.2, 1); // Slightly larger tetrahedron
        const mat = new THREE.MeshPhongMaterial({
             color: typeSettings.color, emissive: typeSettings.emissive, shininess: 80,
             specular: new THREE.Color(typeSettings.color).multiplyScalar(0.5),
             transparent: true, opacity: typeSettings.opacity });
        emergenceCoreMesh = new THREE.Mesh(geo, mat);
        emergenceCoreMesh.position.copy(coreData.position);
        emergenceCoreMesh.userData = {
            ...coreData,
            originalPosition: coreData.position.clone(),
            originalColor: mat.color.getHex(),
            originalEmissive: mat.emissive.getHex(),
            baseOpacity: mat.opacity,
            baseScale: 1.0,
            label: null
        };
        conceptScene.add(emergenceCoreMesh);

        const coreLabelDiv = document.createElement('div');
        coreLabelDiv.className = 'label';
        coreLabelDiv.textContent = coreData.name;
        // Safe: CSS2DObject existence checked in init
        emergenceCoreLabel = new THREE.CSS2DObject(coreLabelDiv);
        const labelOffset = (typeSettings.labelOffset || 1.5) * nodeSize / baseSize * 1.3;
        emergenceCoreLabel.position.set(0, labelOffset * 1.1, 0); // Slightly higher for tetrahedron
        emergenceCoreMesh.add(emergenceCoreLabel);
        emergenceCoreMesh.userData.label = emergenceCoreLabel;
    } else { console.warn("Emergence Core concept data not found."); }

    // Live2D Avatar Placeholder (Invisible Plane)
    const live2dData = conceptData['live2d_avatar_ref'];
    if (live2dData) {
        const typeSettings = VisConfig.TypeSettings[live2dData.type];
        const planeGeo = new THREE.PlaneGeometry(typeSettings.size, typeSettings.size); // Use configured size
        const planeMat = new THREE.MeshBasicMaterial({ color: typeSettings.color, transparent: true, opacity: typeSettings.opacity, side: THREE.DoubleSide });
        live2dPlaneConcept = new THREE.Mesh(planeGeo, planeMat);
        live2dPlaneConcept.position.copy(live2dData.position);
        live2dPlaneConcept.userData = {
            ...live2dData,
            originalColor: planeMat.color.getHex(),
            originalEmissive: 0x000000,
            baseOpacity: planeMat.opacity,
            baseScale: 1.0,
            label: null // No visible label for the plane
        };
        conceptScene.add(live2dPlaneConcept);
    } else { console.warn("Live2D Avatar Ref concept data not found."); }

    // console.log("Agent simulation placeholders created."); // Reduce noise
}

/**
 * Updates the base visuals (color, scale, opacity) of placeholder nodes based on simulation metrics.
 * @param {tf.Tensor|null} emotionsTensor Tensor of current emotion intensities.
 * @param {number} rihScore The current RIH score (0-1).
 * @param {number} avgAffinity The current average affinity score (-1 to 1).
 * @param {string} hmLabel The current head movement label.
 * @param {number} trustScore The agent's current trust score (0-1).
 */
export function updateAgentSimulationVisuals(emotionsTensor, rihScore, avgAffinity, hmLabel, trustScore) {
    if (!conceptInitialized || !agentStateMesh || !emergenceCoreMesh || !live2dPlaneConcept) return;

    // --- Cache latest simulation data ---
    latestAgentEmotions = (emotionsTensor && typeof emotionsTensor.arraySync === 'function' && !emotionsTensor.isDisposed)
        ? emotionsTensor.arraySync()[0]
        : zeros([Config.Agent.EMOTION_DIM]);
    latestRIHScore = clamp(rihScore, 0, 1);
    latestAvgAffinity = clamp(avgAffinity, -1, 1);
    latestHmLabel = hmLabel;
    latestTrustScore = clamp(trustScore, 0, 1);

    // --- Update Agent State Mesh (Reflects Emotions) ---
    if (agentStateMesh?.material && agentStateMesh.userData) {
        const emotions = latestAgentEmotions;
        let dominantIndex = -1, maxIntensity = -1;
        for (let i = 0; i < emotions.length; i++) { if (emotions[i] > maxIntensity) { maxIntensity = emotions[i]; dominantIndex = i; } }
        const emotionAvg = emotions.reduce((sum, val) => sum + val, 0) / Config.Agent.EMOTION_DIM;

        // Determine color based on dominant emotion
        const emotionColorMap = { 0: 0x66ff66, 1: 0xff6666, 2: 0x66ccff, 3: 0xff9966, 4: 0x99ffcc, 5: 0xffff66 };
        const targetColor = new THREE.Color(emotionColorMap[dominantIndex] ?? 0xcccccc); // Default grey
        const targetEmissiveIntensity = clamp(maxIntensity * 0.6 + 0.1, 0.1, 0.7); // Emissive based on dominant intensity

        // Store base values for animation reference (lerping happens in animateConceptNodes)
        agentStateMesh.userData.baseColor = targetColor.getHex();
        agentStateMesh.userData.baseEmissive = targetColor.clone().multiplyScalar(targetEmissiveIntensity).getHex();
        agentStateMesh.userData.baseScale = 1.0 + emotionAvg * 0.4; // Scale slightly with overall intensity
        agentStateMesh.userData.baseOpacity = Config.Visualization.Node.TypeSettings.simulation_state.opacity;
    }

    // --- Update Emergence Core Mesh (Reflects RIH, Affinity, Trust) ---
    if (emergenceCoreMesh?.material && emergenceCoreMesh.userData) {
        const coherenceFactor = (latestRIHScore * 0.5 + latestTrustScore * 0.5); // Combined coherence metric
        const baseColor = new THREE.Color(Config.Visualization.Node.TypeSettings.simulation_state.color); // Base color from config
        const rihTargetColor = new THREE.Color(0xffffff); // White for high RIH
        const trustTargetColor = new THREE.Color(0xaaaaff); // Bluish for high trust

        let targetColor = baseColor.clone();
        targetColor.lerp(rihTargetColor, clamp(latestRIHScore, 0, 1) * 0.4); // Blend towards white with RIH
        targetColor.lerp(trustTargetColor, clamp(latestTrustScore, 0, 1) * 0.3); // Blend towards blue with trust

        const emissiveIntensity = clamp((latestRIHScore * 0.4 + latestTrustScore * 0.3 + Math.abs(latestAvgAffinity) * 0.2), 0.15, 0.8);

        // Store base values for animation reference
        emergenceCoreMesh.userData.baseColor = targetColor.getHex();
        emergenceCoreMesh.userData.baseEmissive = targetColor.clone().multiplyScalar(emissiveIntensity).getHex();
        // Scale increases with RIH, Trust, and magnitude of Affinity
        emergenceCoreMesh.userData.baseScale = 1.0 + clamp(latestRIHScore * 0.5 + latestTrustScore * 0.3 + Math.abs(latestAvgAffinity) * 0.2, 0, 0.8);
        emergenceCoreMesh.userData.baseOpacity = clamp(0.6 + latestRIHScore * 0.2 + (latestTrustScore - 0.5) * 0.3, 0.5, 0.95);
    }

    // --- Update Live2D Placeholder Info (Name change based on status) ---
    if (live2dPlaneConcept?.userData) {
        const live2dStatus = live2dInitialized ? 'Active' : 'Inactive';
        live2dPlaneConcept.userData.name = `Live2D Avatar Ref (Status: ${live2dStatus})`;
        // Base properties are static for the plane itself
        live2dPlaneConcept.userData.baseOpacity = Config.Visualization.Node.TypeSettings.live2d_avatar_ref.opacity;
        live2dPlaneConcept.userData.baseScale = 1.0;
    }

    // --- Update Edge Base Opacity Based on Global Metrics (RIH/Affinity) ---
    conceptEdges.forEach(edge => {
        if (edge?.material && edge.userData) {
            // Edges become slightly more opaque with higher coherence (RIH) and stronger coupling (Affinity magnitude)
            const baseOpacity = clamp(0.3 + clamp(latestRIHScore, 0, 1) * 0.2 + clamp(Math.abs(latestAvgAffinity), 0, 1) * 0.15, 0.2, 0.7);
            edge.userData.baseOpacity = baseOpacity;
        }
    });
}

// Sets up raycasting and event listeners for concept graph interaction
function setupConceptInteraction(interactableObjects) {
    if (!conceptContainer || !conceptInfoPanel || !conceptCamera) {
         console.warn("Cannot setup concept interaction: Missing container, info panel, or camera.");
         return;
    }
    conceptRaycaster = new THREE.Raycaster();
    conceptMouse = new THREE.Vector2();

    // Remove previous listeners if any
    conceptContainer.removeEventListener('mousemove', handleConceptMouseMoveWrapper, false);
    conceptContainer.removeEventListener('click', handleConceptClickWrapper, false);
    // Remove keyboard listener if it was added previously
    conceptContainer.removeEventListener('keydown', handleConceptKeyDownWrapper, false);

    // Add new listeners
    conceptContainer.addEventListener('mousemove', handleConceptMouseMoveWrapper, false);
    conceptContainer.addEventListener('click', handleConceptClickWrapper, false);
    // Add keyboard listener to the container (needs tabindex="0" in HTML)
    conceptContainer.addEventListener('keydown', handleConceptKeyDownWrapper, false);

    updateInfoPanel(); // Initial info panel update
    // console.log("Concept interaction setup complete."); // Reduce noise
}

// Handles mouse movement for hover effects
function onConceptMouseMove(event, interactableObjects) {
    if (!conceptInitialized || !conceptCamera || !conceptRaycaster || !conceptMouse || !conceptContainer || !interactableObjects) return;
    const rect = conceptContainer.getBoundingClientRect();
    conceptMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    conceptMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    conceptRaycaster.setFromCamera(conceptMouse, conceptCamera);
    const intersects = conceptRaycaster.intersectObjects(interactableObjects, false);

    let newHoveredObject = null;
    if (intersects.length > 0 && intersects[0].object?.userData?.id) { // Ensure intersected object has userData.id
        newHoveredObject = intersects[0].object;
    }

    if (!selectedObject) { // Only update hover if nothing is selected
        if (newHoveredObject !== hoveredObject) {
            hoveredObject = newHoveredObject;
            updateInfoPanel(); // Update panel on hover change
        }
    } else {
         // Allow hovering the selected object itself
         if (newHoveredObject !== hoveredObject) {
             hoveredObject = newHoveredObject;
             // Don't update info panel here if something is selected, keep selected info displayed
         }
    }
    conceptContainer.style.cursor = (hoveredObject || selectedObject) ? 'pointer' : 'default';
}

// Handles mouse clicks for selection and camera focus
function onConceptClick(event, interactableObjects) {
    if (!conceptInitialized || !conceptCamera || !conceptRaycaster || !conceptMouse || !conceptContainer || !conceptControls || !interactableObjects) return;
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
        if (selectedObject === clickedObject) { // Clicked selected again
            selectedObject = null; // Deselect
            hoveredObject = clickedObject; // Immediately hover the deselected object
            // Optional: Move controls target back to general area?
            // conceptControls.target.set(0, 5, -10);
        } else { // Clicked a new object
            selectedObject = clickedObject;
            hoveredObject = null; // Clear hover when selecting
            // Focus camera controls on the selected object
            conceptControls.target.copy(clickedObject.position);
            // Optional: Smoothly move camera position as well? Requires animation loop update.
        }
    } else { // Clicked background
        selectedObject = null; // Deselect
    }

    conceptContainer.style.cursor = (hoveredObject || selectedObject) ? 'pointer' : 'default';
    updateInfoPanel(); // Update info panel based on selection
}

// Handles keyboard interaction (Arrow keys, Enter)
function handleConceptKeyDownWrapper(event) {
     if (!conceptInitialized || !conceptNodes || Object.keys(conceptNodes).length === 0) return;

     const allNodeIds = Object.keys(conceptNodes); // Get IDs of actual concept nodes
     const placeHolderIds = [agentStateMesh?.userData?.id, emergenceCoreMesh?.userData?.id].filter(Boolean);
     const navigableIds = [...allNodeIds, ...placeHolderIds]; // Combine concept and placeholder IDs

     let currentIndex = -1;
     if (selectedObject?.userData?.id) {
         currentIndex = navigableIds.indexOf(selectedObject.userData.id);
     } else if (hoveredObject?.userData?.id) {
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
                 selectedObject = hoveredObject; // Select the currently hovered object
                 hoveredObject = null;
                 if(selectedObject.position) conceptControls.target.copy(selectedObject.position);
                 updateInfoPanel();
             } else if (selectedObject) {
                 // Optional: Could perform an action on Enter when selected, e.g., toggle expansion
             }
             event.preventDefault();
             return; // Don't update hover after Enter
         default:
             return; // Ignore other keys
     }

     // Update hover state based on keyboard navigation
     if (targetIndex !== currentIndex && targetIndex >= 0 && targetIndex < navigableIds.length) {
         const targetId = navigableIds[targetIndex];
         const targetNodeEntry = conceptNodes[targetId] || // Check concept nodes
             (targetId === agentStateMesh?.userData?.id ? { object: agentStateMesh } : null) || // Check agent state
             (targetId === emergenceCoreMesh?.userData?.id ? { object: emergenceCoreMesh } : null); // Check emergence core

         if (targetNodeEntry?.object) {
             hoveredObject = targetNodeEntry.object;
             selectedObject = null; // Clear selection when navigating with keys, only update hover
             updateInfoPanel(); // Update panel to show newly hovered item
             // Optional: Slightly pan camera towards hovered item?
             // conceptControls.target.lerp(hoveredObject.position, 0.1);
         }
     }
}


// Updates the info panel content based on selected/hovered object and simulation state
export function updateInfoPanel() {
    if (!conceptInfoPanel) return;

    let displayObject = selectedObject || hoveredObject; // Prioritize selected

    // Determine if the panel should be visible (only if an object is selected/hovered)
    const shouldBeVisible = !!displayObject;
    conceptInfoPanel.classList.toggle('visible', shouldBeVisible);
    // Update ARIA for toggle button if it exists
     const infoToggleButton = document.getElementById('toggle-info-panel');
     if (infoToggleButton) infoToggleButton.setAttribute('aria-expanded', shouldBeVisible);


    if (displayObject && displayObject.userData?.id) {
        const data = displayObject.userData;
        let displayName = data.name || 'Unknown Concept';
        const baseDescription = data.description || 'No description available.';
        // Basic sanitization for description before adding dynamic parts
        let descriptionToDisplay = baseDescription.replace(/</g, "<").replace(/>/g, ">"); // Use HTML entities
        let dynamicInfoHtml = '';

        // Add dynamic data for simulation placeholders
        if (data.type === 'simulation_state' || data.type === 'live2d_avatar_ref') {
            const emotions = latestAgentEmotions || zeros([Config.Agent.EMOTION_DIM]);
            let dominantIndex = -1, maxIntensity = -1;
            for (let i = 0; i < emotions.length; i++) { if (emotions[i] > maxIntensity) { maxIntensity = emotions[i]; dominantIndex = i; } }
            const dominantEmotion = dominantIndex !== -1 ? emotionNames[dominantIndex] : 'Unknown';

            if (data.id === 'agent_emotional_state') {
                dynamicInfoHtml = `<br><span class="simulated-data">Dominant: ${dominantEmotion} (${(maxIntensity*100).toFixed(0)}%)<br>` +
                    `Joy: ${(emotions[0]*100).toFixed(0)}% | Fear: ${(emotions[1]*100).toFixed(0)}% | Cur: ${(emotions[2]*100).toFixed(0)}%<br>` +
                    `Frust: ${(emotions[3]*100).toFixed(0)}% | Calm: ${(emotions[4]*100).toFixed(0)}% | Surp: ${(emotions[5]*100).toFixed(0)}%</span>`;
            } else if (data.id === 'emergence_core') {
                dynamicInfoHtml = `<br><span class="simulated-data">RIH: ${(latestRIHScore * 100).toFixed(1)}% | ` +
                    `Affinity: ${latestAvgAffinity.toFixed(2)} | ` +
                    `Trust: ${(latestTrustScore * 100).toFixed(1)}%</span>`;
            } else if (data.id === 'live2d_avatar_ref') {
                 const live2dStatus = live2dInitialized ? 'Active' : 'Inactive';
                 displayName = `Live2D Avatar Ref (${live2dStatus})`; // Update name dynamically
                 dynamicInfoHtml = `<br><span class="simulated-data">Reflects: ${dominantEmotion}<br>` +
                     `Action: ${latestHmLabel}</span>`;
            }
            // Append dynamic info if available - Check if already present to avoid duplication
             // Use a more robust check or placeholder replacement if necessary
             if (dynamicInfoHtml && !descriptionToDisplay.includes('<span class="simulated-data">')) {
                descriptionToDisplay = descriptionToDisplay.split('<br><i>Dynamic details')[0]; // Remove old dynamic section if exists
                descriptionToDisplay += '<br><i>Dynamic details reflect current simulation state:</i>' + dynamicInfoHtml;
            }
        }

        // Generate links list HTML
        let linksHtml = '';
        if (data.links && data.links.length > 0) {
            linksHtml = '<p class="links-title"><b>Connected Concepts:</b></p><ul class="links-list">';
            data.links.forEach(linkId => {
                const linkData = conceptData[linkId] || // Check main concept data
                                 (linkId === agentStateMesh?.userData?.id ? agentStateMesh.userData : null) || // Check placeholders
                                 (linkId === emergenceCoreMesh?.userData?.id ? emergenceCoreMesh.userData : null) ||
                                 (linkId === live2dPlaneConcept?.userData?.id ? live2dPlaneConcept.userData : null);
                const linkName = linkData?.name ? linkData.name.replace(/</g, "<").replace(/>/g, ">") : `Unknown (${linkId})`;
                const linkDesc = linkData?.description ? linkData.description.replace(/"/g, '"').replace(/</g, "<").replace(/>/g, ">") : '';
                linksHtml += `<li><span title="${linkDesc}">${linkName}</span></li>`;
            });
            linksHtml += '</ul>';
        }

        // Update panel content (use textContent for name to prevent injection)
        const header = conceptInfoPanel.querySelector('h3') || document.createElement('h3');
        header.textContent = displayName; // Safe update for name

        // Use innerHTML for the rest, relying on the sanitization done above
        conceptInfoPanel.innerHTML = `
            <h3></h3> <!-- Placeholder for name -->
            <p><b>Type:</b> ${data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1).replace(/_/g, ' ') : 'N/A'}</p>
            ${data.chapter ? `<p><b>Chapter:</b> ${data.chapter}</p>` : ''}
            <p class="description">${descriptionToDisplay}</p> <!-- Description already sanitized -->
            ${linksHtml} <!-- Links already sanitized -->
        `;
        conceptInfoPanel.insertBefore(header, conceptInfoPanel.firstChild); // Re-insert the header

    } else {
        // Default content when nothing is selected/hovered
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


/**
 * Animates concept nodes (rotation, oscillation) and applies highlight effects.
 * Includes temporary feedback for user inputs (sliders, chat).
 * @param {number} deltaTime The time elapsed since the last frame in seconds.
 * @param {number} integrationParam Agent's current integration parameter value.
 * @param {number} reflexivityParam Agent's current reflexivity parameter value.
 * @param {number} lastIntegrationTime Timestamp of last integration slider input (-1 if old).
 * @param {number} lastReflexivityTime Timestamp of last reflexivity slider input (-1 if old).
 * @param {number} lastChatTime Timestamp of last chat input impact (-1 if old).
 */
export function animateConceptNodes(deltaTime, integrationParam, reflexivityParam, lastIntegrationTime, lastReflexivityTime, lastChatTime) {
    if (!conceptInitialized || !conceptClock || !conceptNodes || latestAgentEmotions === null) return;

    const elapsedTime = conceptClock.getElapsedTime();
    const inputFeedbackDuration = 0.5; // How long feedback pulse lasts

    // --- Get current simulation metrics ---
    const emotions = latestAgentEmotions || zeros([Config.Agent.EMOTION_DIM]);
    const joyVal = emotions[0] || 0; const fearVal = emotions[1] || 0; const curiosityVal = emotions[2] || 0;
    const frustrationVal = emotions[3] || 0; const calmVal = emotions[4] || 0; const surpriseVal = emotions[5] || 0;
    const emotionAvg = emotions.reduce((a, b) => a + b, 0) / Config.Agent.EMOTION_DIM;

    // --- Define Colors and Lerp Factor ---
    const nodeHighlightColor = new THREE.Color(0xffffff);
    const nodeHighlightEmissive = new THREE.Color(0xffffff).multiplyScalar(0.5);
    const linkedColor = new THREE.Color(0xaaaaee);
    const linkedEmissive = new THREE.Color(0xaaaaee).multiplyScalar(0.3);
    const edgeHighlightColor = new THREE.Color(0x00aaff);
    const edgeHighlightEmissive = new THREE.Color(0x00aaff).multiplyScalar(0.6); // Slightly brighter edge emissive
    const integrationFeedbackColor = new THREE.Color(0x66ffaa); // Greenish
    const reflexivityFeedbackColor = new THREE.Color(0xffddaa); // Orangish
    const chatFeedbackColor = new THREE.Color(0xaaaaff); // Bluish
    const lerpFactor = clamp(deltaTime * 10, 0.01, 0.15); // Animation smoothness factor

    // --- Collect all nodes to animate ---
    const allNodesToAnimate = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh,
        emergenceCoreMesh,
        live2dPlaneConcept, // Include the plane even if invisible, its data might be used
    ].filter(Boolean); // Filter out any null/undefined entries

    // --- Animate Each Node ---
    allNodesToAnimate.forEach(object => {
        if (!object?.material || !object.userData?.originalPosition) return; // Skip invalid objects

        const data = object.userData;
        const originalPosition = data.originalPosition;
        // Retrieve base properties stored in updateAgentSimulationVisuals or createConceptNodes
        const baseColorHex = data.baseColor ?? data.originalColor ?? 0x888888;
        const baseEmissiveHex = data.baseEmissive ?? data.originalEmissive ?? 0x222222;
        const baseScale = data.baseScale ?? 1.0;
        const baseOpacity = data.baseOpacity ?? (object.material.opacity !== undefined ? object.material.opacity : 1.0);

        // Use THREE.Color instances for manipulation
        const originalColor = new THREE.Color(baseColorHex);
        const originalEmissive = new THREE.Color(baseEmissiveHex);


        // --- Determine Node State ---
        const isSelected = selectedObject === object;
        const isHovered = !isSelected && hoveredObject === object;
        const isLinkedToSelected = selectedObject?.userData?.id && ((data.links || []).includes(selectedObject.userData.id) || (selectedObject.userData.links || []).includes(data.id));
        const isLinkedToHovered = !isSelected && !isLinkedToSelected && hoveredObject?.userData?.id && ((data.links || []).includes(hoveredObject.userData.id) || (hoveredObject.userData.links || []).includes(data.id));

        // --- Initialize Target Visual Properties ---
        let targetPosition = originalPosition.clone();
        let targetScale = new THREE.Vector3(baseScale, baseScale, baseScale);
        let targetColor = originalColor.clone(); // Start with current base color
        let targetEmissive = originalEmissive.clone(); // Start with current base emissive
        let targetOpacity = baseOpacity;

        // --- Apply Base Animation (Subtle Oscillation/Pulse for non-placeholders) ---
        if (!isSelected && !isHovered && data.type !== 'simulation_state' && data.type !== 'live2d_avatar_ref') {
            const oscSpeed = 1.0 + (data.chapter % 5) * 0.1; // Vary speed slightly by chapter
            const oscAmount = 0.05 + (data.type.length % 5) * 0.02; // Vary amount slightly by type name length
            targetPosition.y += Math.sin(elapsedTime * oscSpeed + originalPosition.x * 0.1) * oscAmount;
            const pulseFactor = 0.02 + (data.links?.length % 5) * 0.005; // Pulse based on number of links
            const basePulse = Math.sin(elapsedTime * (oscSpeed + 0.5) + originalPosition.y * 0.1) * pulseFactor;
            targetScale.multiplyScalar(1.0 + basePulse);
        }

        // --- Check for Input Feedback ---
        let inputFeedbackIntensity = 0;
        let feedbackEmissiveColor = null;
        let timeSinceInput = -1;

        // Check if this specific node should pulse based on input
        let shouldPulseForInput = false;
        if (lastIntegrationTime > 0 && ['synkolator', 'korporator', 'integrationParam_node', 'konzenter', 'exzenter'].includes(data.id)) {
             timeSinceInput = elapsedTime - lastIntegrationTime; feedbackEmissiveColor = integrationFeedbackColor; shouldPulseForInput = true;
        } else if (lastReflexivityTime > 0 && ['reflexive_abstraction', 'reflexive_integration', 'holoformen', 'metrophorischer_zirkel'].includes(data.id)) {
             timeSinceInput = elapsedTime - lastReflexivityTime; feedbackEmissiveColor = reflexivityFeedbackColor; shouldPulseForInput = true;
        } else if (lastChatTime > 0 && ['agent_emotional_state', 'subjective_aspect', 'dialektik'].includes(data.id)) {
             timeSinceInput = elapsedTime - lastChatTime; feedbackEmissiveColor = chatFeedbackColor; shouldPulseForInput = true;
        }

        if (shouldPulseForInput && timeSinceInput >= 0 && timeSinceInput < inputFeedbackDuration) {
            inputFeedbackIntensity = 1.0 - (timeSinceInput / inputFeedbackDuration);
            inputFeedbackIntensity = inputFeedbackIntensity * inputFeedbackIntensity; // Ease out effect
        }

        // --- Apply Metric/Feedback Influences (ONLY IF NOT Selected/Hovered/Linked) ---
        if (!isSelected && !isHovered && !isLinkedToSelected && !isLinkedToHovered) {
            // Apply Input Feedback Effects (Overrides base animation)
            if (inputFeedbackIntensity > 0 && feedbackEmissiveColor) {
                targetEmissive.lerp(feedbackEmissiveColor, inputFeedbackIntensity * 0.8); // Strong emissive pulse
                const feedbackPulse = Math.sin(elapsedTime * 8.0) * 0.08 * inputFeedbackIntensity; // Faster pulse
                targetScale.multiplyScalar(1.0 + feedbackPulse + inputFeedbackIntensity * 0.1);
                targetOpacity = lerp(baseOpacity, Math.min(baseOpacity + 0.4, 1.0), inputFeedbackIntensity); // Increase opacity
            }
            // Apply Regular Metric/Slider Influences (If NO feedback active)
            else {
                 let metricScaleModifier = 1.0, metricPulseSpeedFactor = 1.0, metricPulseAmountFactor = 1.0;
                 let metricColorShift = new THREE.Color(0x000000);

                 // Example: RIH influence on related concepts
                 if (['reflexive_integration', 'holoformen', 'emergence_core', 'strukturkondensation_realized'].includes(data.id)) {
                     metricScaleModifier += latestRIHScore * 0.1;
                     metricPulseAmountFactor += latestRIHScore * 0.4;
                     targetEmissive.lerp(new THREE.Color(0xffffff), latestRIHScore * 0.3);
                 }
                 // Example: Affinity influence
                 if (['affinitaetssyndrom', 'korporator', 'emergence_core', 'konflexivsyntrix'].includes(data.id)) {
                     const absAffinity = Math.abs(latestAvgAffinity);
                     metricScaleModifier += absAffinity * 0.05;
                     if (latestAvgAffinity > 0.1) metricColorShift.g += 0.15 * latestAvgAffinity;
                     if (latestAvgAffinity < -0.1) metricColorShift.b += 0.15 * absAffinity;
                 }
                  // Example: Trust influence
                 if (['idee', 'metrophor', 'agent_emotional_state'].includes(data.id)) {
                     metricScaleModifier += (latestTrustScore - 0.5) * 0.1; // Scale slightly with trust deviation from 0.5
                     targetEmissive.lerp(new THREE.Color(0xaaaaff), clamp(latestTrustScore - 0.5, 0, 0.5) * 0.4); // Bluish tint for high trust
                 }
                 // Example: Agent parameter influence
                 if (data.id === 'synkolator' || data.id === 'combinatorics') metricPulseSpeedFactor += integrationParam * 0.5;
                 if (data.id === 'reflexive_abstraction' || data.id === 'metrophorischer_zirkel') metricPulseSpeedFactor += reflexivityParam * 0.5;

                 // Apply metric-driven animations (subtly adjust base animation)
                 const metricPulse = Math.sin(elapsedTime * metricPulseSpeedFactor + originalPosition.x * 0.05) * 0.02 * metricPulseAmountFactor;
                 targetScale.multiplyScalar(metricScaleModifier * (1.0 + metricPulse));
                 targetColor.add(metricColorShift); // Add color shift
            }
        }

        // --- Apply Highlight Effects (Overrides previous non-persistent effects) ---
        if (isSelected) {
            targetColor.lerp(nodeHighlightColor, 0.6); // Stronger blend for selected
            targetEmissive.lerp(nodeHighlightEmissive, 0.7);
            targetScale.multiplyScalar(1.2); // Make selected slightly larger
            targetOpacity = Math.min(baseOpacity + 0.3, 1.0); // More opaque
        } else if (isHovered) {
            targetColor.lerp(nodeHighlightColor, 0.4);
            targetEmissive.lerp(nodeHighlightEmissive, 0.5);
            targetScale.multiplyScalar(1.1);
            targetOpacity = Math.min(baseOpacity + 0.2, 1.0);
        } else if (isLinkedToSelected) {
            targetColor.lerp(linkedColor, 0.5);
            targetEmissive.lerp(linkedEmissive, 0.6);
            targetScale.multiplyScalar(1.05);
            targetOpacity = Math.min(baseOpacity + 0.15, 1.0);
        } else if (isLinkedToHovered) {
            targetColor.lerp(linkedColor, 0.3);
            targetEmissive.lerp(linkedEmissive, 0.4);
            targetScale.multiplyScalar(1.025);
            targetOpacity = Math.min(baseOpacity + 0.1, 1.0);
        }

        // --- Smoothly Interpolate Node Properties Towards Targets ---
        // Don't move the invisible plane
        if (data.type !== 'live2d_avatar_ref') {
            object.position.lerp(targetPosition, lerpFactor);
        }
        object.scale.lerp(targetScale, lerpFactor);
        if (object.material.color) object.material.color.lerp(targetColor, lerpFactor);
        if (object.material.emissive) object.material.emissive.lerp(targetEmissive, lerpFactor);
        if (object.material.opacity !== undefined) {
            // Handle potential NaN issues if targetOpacity calculation fails
            const safeTargetOpacity = isNaN(targetOpacity) ? baseOpacity : targetOpacity;
            object.material.opacity = lerp(object.material.opacity, safeTargetOpacity, lerpFactor);
            object.material.transparent = object.material.opacity < 1.0; // Ensure transparency is enabled if needed
        }

        // --- Apply Rotation for Certain Types (if not selected/hovered) ---
        if (!isSelected && !isHovered && ['core', 'dynamics', 'operator', 'geometry_metric', 'transformation'].includes(data.type)) {
            object.rotation.x += deltaTime * 0.15;
            object.rotation.y += deltaTime * 0.2;
        }

         // Update Label Position based on node scale
         if (data.label) {
             const typeSettings = Config.Visualization.Node.TypeSettings[data.type] || Config.Visualization.Node.TypeSettings['concept'];
             const baseSize = Config.Visualization.Node.BaseSize || 1.0;
             const nodeSize = (typeSettings.size || 1.0) * baseSize * 0.6;
             const labelOffset = (typeSettings.labelOffset || 1.5) * nodeSize / baseSize * 1.3;
             data.label.position.y = labelOffset * object.scale.y; // Scale label offset with node
             data.label.element.style.opacity = clamp(object.material.opacity, 0.1, 1.0); // Fade label with node
         }
    }); // End node loop

    // --- Animate Edges ---
    conceptEdges.forEach(edge => {
        if (!edge?.material || !edge.userData) return;

        const sourceId = edge.userData.sourceId;
        const targetId = edge.userData.targetId;
        const baseOpacity = edge.userData.baseOpacity ?? Config.Visualization.Edge.BaseOpacity;
        const originalColor = new THREE.Color(edge.userData.originalColor ?? Config.Visualization.Edge.BaseColor);
        const originalEmissive = new THREE.Color(edge.userData.originalEmissive ?? Config.Visualization.Edge.BaseEmissive);

        let targetEdgeColor = originalColor.clone();
        let targetEdgeEmissive = originalEmissive.clone();
        let targetEdgeOpacity = baseOpacity;

        const isSelectedEdge = selectedObject?.userData?.id && (sourceId === selectedObject.userData.id || targetId === selectedObject.userData.id);
        const isHoveredEdge = !isSelectedEdge && hoveredObject?.userData?.id && (sourceId === hoveredObject.userData.id || targetId === hoveredObject.userData.id);

        if (isSelectedEdge) {
            targetEdgeColor.lerp(edgeHighlightColor, 0.7);
            targetEdgeEmissive.lerp(edgeHighlightEmissive, 0.8);
            targetEdgeOpacity = Math.min(baseOpacity + 0.4, 0.95);
        } else if (isHoveredEdge) {
            targetEdgeColor.lerp(edgeHighlightColor, 0.5);
            targetEdgeEmissive.lerp(edgeHighlightEmissive, 0.6);
            targetEdgeOpacity = Math.min(baseOpacity + 0.3, 0.85);
        } else {
            // Subtle pulse based on time and RIH score
            const edgePulse = Math.sin(elapsedTime * 1.2 + sourceId.charCodeAt(0)) * 0.1 * (0.5 + latestRIHScore * 0.5);
            targetEdgeOpacity = clamp(baseOpacity * (1.0 + edgePulse), 0.1, 0.8);
            // Maybe slightly shift emissive based on connected node states? (Complex)
        }

        // Interpolate edge material properties
        if (edge.material.color) edge.material.color.lerp(targetEdgeColor, lerpFactor);
        if (edge.material.emissive) edge.material.emissive.lerp(targetEdgeEmissive, lerpFactor);
        edge.material.opacity = lerp(edge.material.opacity, targetEdgeOpacity, lerpFactor);
        edge.material.transparent = edge.material.opacity < 1.0;
    }); // End edge loop
}

// Cleans up resources for the concept visualization
export function cleanupConceptVisualization() {
    // Add a check if THREE exists before trying to access its properties
    const CSS2DObjectExists = typeof THREE?.CSS2DObject !== 'undefined';

    // Skip cleanup if not initialized or scene doesn't exist
    if (!conceptInitialized && !conceptScene) return;
    // console.log("Cleaning up Concept visualization..."); // Reduce noise

    try {
        // Remove event listeners
        if (conceptContainer) {
            conceptContainer.removeEventListener('mousemove', handleConceptMouseMoveWrapper, false);
            conceptContainer.removeEventListener('click', handleConceptClickWrapper, false);
            conceptContainer.removeEventListener('keydown', handleConceptKeyDownWrapper, false);
        }
        window.removeEventListener('resize', onConceptWindowResize, false);
         const infoToggleButton = document.getElementById('toggle-info-panel');
         if (infoToggleButton) infoToggleButton.onclick = null; // Remove listener

        // Dispose Three.js objects (Geometries, Materials, Meshes)
        conceptScene?.traverse(object => {
            if (object.isMesh || object.isLine) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            }
            // --- FIXED: Conditional check for CSS2DObject ---
            if (CSS2DObjectExists && object.isCSS2DObject && object.element?.parentNode) {
                object.element.parentNode.removeChild(object.element);
            }
            // --- END FIX ---
        });


        // Dispose renderers and controls
        if (conceptControls) {
             conceptControls.dispose();
             conceptControls = null;
        }
        if (conceptRenderer) {
            conceptRenderer.dispose();
            // Check if context loss is available and needed
            if (typeof conceptRenderer.forceContextLoss === 'function') {
                 conceptRenderer.forceContextLoss();
            }
            if (conceptRenderer.domElement?.parentNode) {
                conceptRenderer.domElement.parentNode.removeChild(conceptRenderer.domElement);
            }
            conceptRenderer = null;
        }
        if (conceptLabelRenderer?.domElement?.parentNode) {
            conceptLabelRenderer.domElement.parentNode.removeChild(conceptLabelRenderer.domElement);
            conceptLabelRenderer = null;
        }
         if(baseConceptEdgeMaterial) {
             baseConceptEdgeMaterial.dispose();
             baseConceptEdgeMaterial = null;
         }

        // Reset internal state variables
        conceptScene = null;
        conceptCamera = null;
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
        hoveredObject = null;
        selectedObject = null;
        latestAgentEmotions = null; // Clear cached data
        conceptInitialized = false;

        // console.log("Concept visualization disposed."); // Reduce noise
    } catch (e) {
        console.error("Error disposing concept visualization:", e);
    }
}

// Handles window resize events for the Concept Graph panel
function onConceptWindowResize() {
    if (!conceptInitialized || !conceptContainer || !conceptCamera || !conceptRenderer || !conceptLabelRenderer) return;

    const width = conceptContainer.clientWidth;
    const height = conceptContainer.clientHeight;

    if (width <= 0 || height <= 0) return; // Ignore resize if container is hidden

    conceptCamera.aspect = width / height;
    conceptCamera.updateProjectionMatrix();
    conceptRenderer.setSize(width, height);
    conceptLabelRenderer.setSize(width, height);
}

// Wrapper functions for event listeners to ensure interactable objects are current
let handleConceptMouseMoveWrapper = (event) => {
    let conceptInteractableObjects = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh,
        emergenceCoreMesh,
        // live2dPlaneConcept, // Exclude invisible plane from hover/click
    ].filter(Boolean);
    onConceptMouseMove(event, conceptInteractableObjects);
    // updateInfoPanel(); // Update info panel on mouse move (can be too frequent)
};

let handleConceptClickWrapper = (event) => {
    let conceptInteractableObjects = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh,
        emergenceCoreMesh,
        // live2dPlaneConcept,
    ].filter(Boolean);
    onConceptClick(event, conceptInteractableObjects);
    // updateInfoPanel(); // Update info panel after click changes selection
};

// Note: handleConceptKeyDownWrapper is already defined above and uses its own logic to get navigable IDs
