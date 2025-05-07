// js/viz-concepts.js

import { Config, emotionNames } from './config.js';
import { clamp, displayError, zeros, lerp, debounce } from './utils.js'; // Added debounce
import { live2dInitialized } from './viz-live2d.js';

// Dependencies loaded via <script> in index.html:
// THREE, OrbitControls, CSS2DRenderer, CSS2DObject

export let conceptScene = null;
export let conceptCamera = null;
export let conceptRenderer = null;
export let conceptLabelRenderer = null;
export let conceptControls = null;
export let conceptInitialized = false;

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

const debouncedOnConceptWindowResize = debounce(onConceptWindowResize, 250); // Debounced resize handler

// Concept Data (Keep as is - very long, included in previous thought process)
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
    'korporator': { id: 'korporator', name: 'Korporator ({})', chapter: 3, position: new THREE.Vector3(0, -2, -5), type: 'operator', links: ['syntrix', 'konzenter', 'exzenter', 'nullsyntrix', 'syntropodenarchitektonik', 'affinitaetssyndrom'], description: "Operator combining multiple Syntrices." },
    'konzenter': { id: 'konzenter', name: 'Konzenter', chapter: 3, position: new THREE.Vector3(-10, -5, -3), type: 'architecture', links: ['korporator', 'syntropodenarchitektonik'], description: "Korporation mode emphasizing composition (layered hierarchies)." },
    'exzenter': { id: 'exzenter', name: 'Exzenter', chapter: 3, position: new THREE.Vector3(10, -5, -3), type: 'architecture', links: ['korporator', 'konflexivsyntrix', 'syntropodenarchitektonik'], description: "Korporation mode emphasizing coupling (networked complexity)." },
    'konflexivsyntrix': { id: 'konflexivsyntrix', name: 'Konflexivsyntrix', chapter: 3, position: new THREE.Vector3(15, -5, -3), type: 'structure', links: ['exzenter', 'syntropoden'], description: "Resulting structure from excentric Korporation (network node)." },
    'syntropoden': { id: 'syntropoden', name: 'Syntropoden', chapter: 3, position: new THREE.Vector3(-15, -5, -1), type: 'component', links: ['konflexivsyntrix'], description: "Uncorporated base segments of a Syntrix within a Konflexivsyntrix." },
    'syntropodenarchitektonik': { id: 'syntropodenarchitektonik', name: 'Syntropodenarchitektonik', chapter: 3, position: new THREE.Vector3(0, -8, 0), type: 'architecture', links: ['konflexivsyntrix', 'syntropoden', 'konzenter', 'exzenter'], description: "Overall network architecture of multi-membered Konflexivsyntrizen." },
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
    'metroplex': { id: 'metroplex', name: 'Metroplex (n M)', chapter: 5, position: new THREE.Vector3(0, -22, 15), type: 'structure', links: ['hypersyntrix', 'syntrokline_metroplexbruecken', 'metroplexkombinat', 'syntrixtotalitaet'], description: "Higher-order syntrometric structure; recursively defined hierarchy of Syntrices." },
    'hypersyntrix': { id: 'hypersyntrix', name: 'Hypersyntrix (1 M)', chapter: 5, position: new THREE.Vector3(-10, -25, 15), type: 'structure', links: ['metroplex', 'syntrixtotalitaet'], description: "Metroplex of the first grade; ensemble of Syntrices treated as a unit." },
    'syntrokline_metroplexbruecken': { id: 'syntrokline_metroplexbruecken', name: 'Syntrokline Metroplexbrücken', chapter: 5, position: new THREE.Vector3(10, -25, 15), type: 'operator', links: ['metroplex', 'metroplexkombinat'], description: "Operators connecting structures across different Metroplex grades." },
    'metroplexkombinat': { id: 'metroplexkombinat', name: 'Metroplexkombinat', chapter: 5, position: new THREE.Vector3(0, -28, 18), type: 'architecture', links: ['metroplex', 'syntrokline_metroplexbruecken'], description: "Complete integrated architecture of nested Metroplexes and Bridges." },
    'kontraktion': { id: 'kontraktion', name: 'Kontraktion', chapter: 5, position: new THREE.Vector3(5, -25, 18), type: 'transformation', links: ['metroplex'], description: "Structure-reducing transformation for managing complexity." },
    'aonische_area': { id: 'aonische_area', name: 'Äonische Area', chapter: 6, position: new THREE.Vector3(0, -32, 20), type: 'field', links: ['telezentrum', 'polydromie', 'transzendenzstufen', 'telezentrik', 'telewarianz', 'dyswarianz'], description: "Evolutionary landscape/state space structured by Telezentren." },
    'telezentrum': { id: 'telezentrum', name: 'Telezentrum', chapter: 6, position: new THREE.Vector3(-10, -35, 20), type: 'concept', links: ['aonische_area', 'transzendenzstufen', 'telezentrik'], description: "Stable attractor states; points of maximal coherence/integration (purpose/goals)." },
    'polydromie': { id: 'polydromie', name: 'Polydromie', chapter: 6, position: new THREE.Vector3(10, -35, 20), type: 'dynamics', links: ['aonische_area'], description: "Multiple potential evolutionary paths simultaneously or probabilistically." },
    'transzendenzstufen': { id: 'transzendenzstufen', name: 'Transzendenzstufen', chapter: 6, position: new THREE.Vector3(0, -38, 23), type: 'concept', links: ['telezentrum', 'aonische_area', 'transzendentaltektonik'], description: "Qualitative leaps to higher organizational levels." },
    'transzendentaltektonik': { id: 'transzendentaltektonik', name: 'Transzendentaltektonik', chapter: 6, position: new THREE.Vector3(5, -38, 23), type: 'architecture', links: ['transzendenzstufen'], description: "Architecture governing transcendent levels and their interrelations." },
    'telezentrik': { id: 'telezentrik', name: 'Telezentrik', chapter: 6, position: new THREE.Vector3(-5, -35, 20), type: 'purpose', links: ['aonische_area', 'telezentrum'], description: "Principle of directedness towards stable states." },
    'telewarianz': { id: 'telewarianz', name: 'Telewarianz', chapter: 6, position: new THREE.Vector3(15, -35, 23), type: 'concept', links: ['telezentrik', 'aonische_area'], description: "Stable, purpose-aligned evolutionary paths towards Telezentren." },
    'dyswarianz': { id: 'dyswarianz', name: 'Dyswarianz', chapter: 6, position: new THREE.Vector3(20, -35, 23), type: 'concept', links: ['aonische_area'], description: "Disruptive or unstable evolutionary paths away from Telezentren." },
    'quantitaetssyntrix': { id: 'quantitaetssyntrix', name: 'Quantitätssyntrix', chapter: 7, position: new THREE.Vector3(0, -42, 28), type: 'structure', links: ['subjective_aspect', 'metron', 'metronische_gitter'], description: "Specialized Syntrix for modeling quantifiable dimensions of perception." },
    'metron': { id: 'metron', name: 'Metron (tau)', chapter: 7, position: new THREE.Vector3(-10, -45, 28), type: 'parameter', links: ['quantitaetssyntrix', 'metronische_gitter'], description: "Smallest indivisible quantum or step size." },
    'metronische_gitter': { id: 'metronische_gitter', name: 'Metronische Gitter', chapter: 7, position: new THREE.Vector3(-15, -45, 28), type: 'structure', links: ['metron', 'metronische_elementaroperationen', 'quantitaetssyntrix'], description: "Fundamental discrete lattice underlying reality." },
    'metronische_elementaroperationen': { id: 'metronische_elementaroperationen', name: 'Metronische Elementaroperationen', chapter: 7, position: new THREE.Vector3(0, -45, 30), type: 'operator', links: ['metronische_gitter', 'metrondifferential', 'metronintegral'], description: "Discrete calculus (differential & integral) on the Metronic Gitter." },
    'metrondifferential': { id: 'metrondifferential', name: 'Metrondifferential (delta)', chapter: 7, position: new THREE.Vector3(-5, -48, 30), type: 'operator', links: ['metronische_elementaroperationen'], description: "Discrete analogue of the differential operator." },
    'metronintegral': { id: 'metronintegral', name: 'Metronintegral (S)', chapter: 7, position: new THREE.Vector3(5, -48, 30), type: 'operator', links: ['metronische_elementaroperationen'], description: "Discrete analogue of the integral operator." },
    'reflexive_integration': { id: 'reflexive_integration', name: 'Reflexive Integration (RIH)', chapter: 8, position: new THREE.Vector3(0, -52, 35), type: 'concept', links: ['holoformen', 'affinitaetssyndrom', 'selection_principles', 'strukturkondensation_realized'], description: "Measure of system coherence or self-awareness (linked to Holoformen/Affinities)." },
    'geometric_field': { id: 'geometric_field', name: 'Geometric Field (g_ik, Gamma, R)', chapter: 8, position: new THREE.Vector3(10, -52, 35), type: 'geometry_metric', links: ['syntrixfeld', 'reflexive_integration', 'selection_principles', 'metronization'], description: "Field with intrinsic geometry (metric, connection, curvature) emerging from Syntrixfeld." },
    'selection_principles': { id: 'selection_principles', name: 'Selection Principles', chapter: 8, position: new THREE.Vector3(0, -55, 38), type: 'principle', links: ['reflexive_integration', 'geometric_field'], description: "Principles for selecting stable geometric configurations (relevant for RIH)." },
    'metronization': { id: 'metronization', name: 'Metronization', chapter: 11, position: new THREE.Vector3(-10, -55, 38), type: 'method', links: ['geometric_field', 'metronische_gitter', 'hyperstruktur'], description: "Process of realizing geometric fields on the Metronic Gitter." },
    'hyperstruktur': { id: 'hyperstruktur', name: 'Hyperstruktur', chapter: 11, position: new THREE.Vector3(-5, -58, 40), type: 'structure', links: ['metronization', 'metronische_gitter', 'strukturkondensation_realized'], description: "Localized, quantized structure (candidate for particles) realized on the grid." },
    'strukturkondensation_realized': { id: 'strukturkondensation_realized', name: 'Strukturkondensation (Realized)', chapter: 11, position: new THREE.Vector3(5, -58, 40), type: 'concept', links: ['hyperstruktur', 'reflexive_integration'], description: "Quantified realized order from Hyperstrukturen (linked to RIH)." },
    'agent_emotional_state': { id: 'agent_emotional_state', name: 'Agent Emotional State', chapter: 'Simulation', position: new THREE.Vector3(25, -5, 0), type: 'simulation_state', links: ['subjective_aspect', 'aonische_area', 'reflexive_integration', 'live2d_avatar_ref'], description: 'Represents the agent\'s emotional state (Joy, Fear, etc.). Updates dynamically based on simulation.' },
    'emergence_core': { id: 'emergence_core', name: 'Emergence Core (RIH/Affinity)', chapter: 'Simulation', position: new THREE.Vector3(-25, -5, 0), type: 'simulation_state', links: ['reflexive_integration', 'affinitaetssyndrom', 'syntropodenarchitektonik', 'agent_emotional_state'], description: 'Represents key emergent properties like Reflexive Integration (RIH), Affinities, and Trust from agent processing.' },
    'live2d_avatar_ref': { id: 'live2d_avatar_ref', name: 'Live2D Avatar Ref', chapter: 'Visualization', position: new THREE.Vector3(0, -10, 0), type: 'live2d_avatar_ref', links: ['agent_emotional_state'], description: `Logical link point for the Live2D avatar. Its appearance in the other panel reflects the Agent Emotional State.<br><i>(This node is visually represented by an invisible plane).</i>` }
};

// Helper function (defined only once is enough)
function getApproxBoundaryRadius(geometry, scale) {
    if (!geometry || (!geometry.isGeometry && !geometry.isBufferGeometry)) return 1.0;
    if (!geometry.boundingSphere) {
        try { geometry.computeBoundingSphere(); }
        catch (e) { console.warn("Could not compute bounding sphere:", geometry, e); return 1.0; }
    }
    return (geometry.boundingSphere ? geometry.boundingSphere.radius : 1.0) * (scale || 1.0);
}

/**
 * Initializes the Three.js visualization for the Concept Graph panel.
 * @param {THREE.Clock} appClock The main clock instance from app.js.
 * @returns {boolean} True if initialization was successful, false otherwise.
 */
export function initConceptVisualization(appClock) {
    if (typeof THREE === 'undefined' || typeof THREE.OrbitControls === 'undefined' || typeof THREE.CSS2DRenderer === 'undefined' || typeof THREE.CSS2DObject === 'undefined') {
        displayError("Three.js or its examples not fully loaded for Concept Graph.", false, 'concept-error-message');
        conceptInitialized = false;
        return false;
    }

    try {
        cleanupConceptVisualization();

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

        conceptClock = appClock;
        conceptScene = new THREE.Scene();
        conceptScene.background = new THREE.Color(Config.Visualization.ConceptGraph.backgroundColor);
        conceptScene.fog = new THREE.Fog(Config.Visualization.ConceptGraph.backgroundColor, 60, 160);

        conceptCamera = new THREE.PerspectiveCamera(Config.Visualization.ConceptGraph.fov, width / Math.max(height, 1), Config.Visualization.ConceptGraph.near, Config.Visualization.ConceptGraph.far);
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

        // Lighting setup
        const ambientLight = new THREE.AmbientLight(0x8080a0, 0.6);
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
            side: THREE.DoubleSide
        });

        // Create graph elements
        createConceptNodes();
        createAgentSimulationPlaceholders();
        createConceptEdges(); // Create edges after all nodes exist

        // Setup interaction listeners
        const interactableObjects = [
            ...Object.values(conceptNodes).map(n => n.object),
            agentStateMesh,
            emergenceCoreMesh,
        ].filter(Boolean); // Filter out nulls, exclude invisible plane
        setupConceptInteraction(interactableObjects);

        // Info panel toggle logic
        infoToggleButton.onclick = () => {
             conceptInfoPanel.classList.toggle('visible');
             // Allow user to force panel open/closed
             conceptInfoPanel.classList.toggle('user-forced-visible', conceptInfoPanel.classList.contains('visible'));
             infoToggleButton.setAttribute('aria-expanded', conceptInfoPanel.classList.contains('visible'));
             if (!conceptInfoPanel.classList.contains('visible')) { // Clear selection if hiding panel
                 selectedObject = null;
                 updateInfoPanel(); // Update to show default state
             }
        };
        // Default state based on screen width
        if (window.innerWidth <= 850) {
            conceptInfoPanel.classList.remove('visible', 'user-forced-visible');
            infoToggleButton.setAttribute('aria-expanded', 'false');
        } else {
             conceptInfoPanel.classList.add('visible', 'user-forced-visible');
             infoToggleButton.setAttribute('aria-expanded', 'true');
        }

        // Add window resize listener
        window.addEventListener('resize', debouncedOnConceptWindowResize, false); // Use debounced handler

        console.log('Concept visualization initialized successfully.');
        conceptInitialized = true;
        return true;
    } catch (e) {
        displayError(`Error initializing concept visualization: ${e.message}`, false, 'concept-error-message');
        console.error("Concept Viz Init Error:", e);
        cleanupConceptVisualization();
        conceptInitialized = false;
        return false;
    }
}

/** Creates the 3D meshes and labels for the concept nodes */
function createConceptNodes() {
    // Cleanup previous nodes
    Object.values(conceptNodes).forEach(cn => {
        if (cn.object) {
            if (cn.label && cn.object.children.includes(cn.label)) cn.object.remove(cn.label);
            if (cn.label?.element?.parentNode) cn.label.element.parentNode.removeChild(cn.label.element);
            if (cn.object.geometry) cn.object.geometry.dispose();
            if (cn.object.material) {
                 if (Array.isArray(cn.object.material)) cn.object.material.forEach(m => m.dispose());
                 else cn.object.material.dispose();
            }
            conceptScene?.remove(cn.object);
        }
    });
    conceptNodes = {};

    const VisConfig = Config.Visualization.Node;

    for (const id in conceptData) {
        const data = conceptData[id];
        if (data.type === 'simulation_state' || data.type === 'live2d_avatar_ref') continue;

        const typeSettings = VisConfig.TypeSettings[data.type] || VisConfig.TypeSettings['concept'];
        const baseSize = VisConfig.BaseSize || 1.0;
        const nodeSize = (typeSettings.size || 1.0) * baseSize * 0.6;
        let geometry;
        // --- Select geometry based on type ---
        switch(data.type) {
            case 'framework': geometry = new THREE.BoxGeometry(nodeSize * 1.5, nodeSize * 1.5, nodeSize * 1.5); break;
            case 'architecture': geometry = new THREE.BoxGeometry(nodeSize * 1.2, nodeSize * 1.2, nodeSize * 1.2); break;
            case 'principle': geometry = new THREE.BoxGeometry(nodeSize, nodeSize, nodeSize); break;
            case 'transformation': geometry = new THREE.BoxGeometry(nodeSize * 1.2, nodeSize * 0.8, nodeSize * 1.2); break;
            case 'operator': geometry = new THREE.OctahedronGeometry(nodeSize, 0); break;
            case 'method': geometry = new THREE.CylinderGeometry(nodeSize * 0.8, nodeSize * 0.8, nodeSize * 2.5, 16); break;
            case 'dynamics': geometry = new THREE.IcosahedronGeometry(nodeSize, 0); break;
            default: geometry = new THREE.SphereGeometry(nodeSize, 16, 12); // Sphere for structure, core, component, property, param, concept, field, purpose, geom_metric, relation, level
        }
        // ------------------------------------

        const material = new THREE.MeshPhongMaterial({
            color: typeSettings.color, emissive: typeSettings.emissive, shininess: typeSettings.shininess,
            specular: new THREE.Color(typeSettings.color).multiplyScalar(0.5),
            transparent: true, opacity: typeSettings.opacity
        });

        const node = new THREE.Mesh(geometry, material);
        node.position.copy(data.position);
        node.userData = {
            ...data, // Copy concept data
            originalPosition: data.position.clone(),
            originalColor: material.color.getHex(),
            originalEmissive: material.emissive.getHex(),
            baseScale: 1.0, // Base scale multiplier
            baseOpacity: material.opacity, // Initial opacity
            label: null // Initialize label reference
        };
        conceptScene.add(node);

        // Create and add CSS2D Label
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label';
        labelDiv.textContent = data.name;
        const label = new THREE.CSS2DObject(labelDiv);
        const labelOffset = (typeSettings.labelOffset || 1.5) * nodeSize / baseSize * 1.3;
        label.position.set(0, labelOffset, 0); // Relative to node center
        node.add(label); // Attach to node
        node.userData.label = label; // Store reference

        conceptNodes[id] = { object: node, label: label, data: node.userData };
    }
}


/** Creates the curved tube edges between concept nodes */
function createConceptEdges() {
    // Cleanup previous edges
    conceptEdges.forEach(edge => {
        if (edge.geometry) edge.geometry.dispose();
        if (edge.material) edge.material.dispose(); // Cloned material needs disposal
        conceptScene?.remove(edge);
    });
    conceptEdges = [];

    if (!baseConceptEdgeMaterial) {
        console.error("Base edge material not initialized!");
        return;
    }

    const visitedEdges = new Set();
    const EdgeConfig = Config.Visualization.Edge;
    // Create a temporary map including placeholders for linking
    const allGraphNodes = { ...conceptNodes };
    if (agentStateMesh?.userData?.id) allGraphNodes[agentStateMesh.userData.id] = { object: agentStateMesh, data: agentStateMesh.userData, label: agentStateMesh.userData.label };
    if (emergenceCoreMesh?.userData?.id) allGraphNodes[emergenceCoreMesh.userData.id] = { object: emergenceCoreMesh, data: emergenceCoreMesh.userData, label: emergenceCoreMesh.userData.label };
    if (live2dPlaneConcept?.userData?.id) allGraphNodes[live2dPlaneConcept.userData.id] = { object: live2dPlaneConcept, data: live2dPlaneConcept.userData, label: null };


    for (const id in allGraphNodes) {
        const sourceNodeEntry = allGraphNodes[id];
        if (!sourceNodeEntry?.object?.position || !sourceNodeEntry.data?.links) continue;

        const sourceObject = sourceNodeEntry.object;
        const sourcePos = sourceObject.position;

        for (const targetId of sourceNodeEntry.data.links) {
            const targetNodeEntry = allGraphNodes[targetId];
            if (!targetNodeEntry?.object?.position) continue; // Target not found

            const targetObject = targetNodeEntry.object;
            const targetPos = targetObject.position;

            // Avoid self-loops visually
            if (id === targetId) continue;

            // Avoid duplicate edges (A->B is same as B->A)
            const sortedIds = [id, targetId].sort();
            const edgeKey = sortedIds.join('--');
            if (visitedEdges.has(edgeKey)) continue;
            visitedEdges.add(edgeKey);

            // Calculate adjusted start/end points based on node size
            const sourceBoundary = getApproxBoundaryRadius(sourceObject.geometry, sourceObject.scale.x);
            const targetBoundary = getApproxBoundaryRadius(targetObject.geometry, targetObject.scale.x);

            const direction = new THREE.Vector3().subVectors(targetPos, sourcePos);
            const distance = direction.length();
            if (distance < sourceBoundary + targetBoundary + EdgeConfig.TubeRadius * 2) continue; // Avoid edges if nodes overlap too much

            // Normalize direction only once
            const normDirection = direction.normalize();
            const startPoint = sourcePos.clone().addScaledVector(normDirection, sourceBoundary * 1.1); // Slightly outside boundary
            const endPoint = targetPos.clone().addScaledVector(normDirection, -targetBoundary * 1.1); // Slightly outside boundary

            if (startPoint.distanceTo(endPoint) < EdgeConfig.TubeRadius * 2) continue; // Check adjusted distance

            // Calculate control points for curve
            const midPoint = new THREE.Vector3().lerpVectors(startPoint, endPoint, 0.5);
            const curveHeight = Math.sqrt(distance) * (Math.random() * 0.3 + 0.2); // Randomize curve slightly
            let curveNormal = new THREE.Vector3().crossVectors(direction, conceptCamera.up).normalize(); // Use camera.up for consistent curve direction
            if (curveNormal.lengthSq() < 0.1) { // Handle edge case if direction aligns with camera.up
                 curveNormal = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize(); // Random fallback
                 if (curveNormal.lengthSq() < 0.1) curveNormal = new THREE.Vector3(0, 1, 0); // Absolute fallback
            }
            const curveOffset = curveNormal.multiplyScalar(curveHeight);

            const controlPoint1 = new THREE.Vector3().lerpVectors(startPoint, midPoint, 0.5).add(curveOffset);
            const controlPoint2 = new THREE.Vector3().lerpVectors(midPoint, endPoint, 0.5).add(curveOffset);

            // Create curve and geometry
            const curve = new THREE.CubicBezierCurve3(startPoint, controlPoint1, controlPoint2, endPoint);
            const tubeGeo = new THREE.TubeGeometry(curve, EdgeConfig.TubularSegments, EdgeConfig.TubeRadius, EdgeConfig.TubeDetail, false);

            // Create mesh with cloned material
            const edgeMaterial = baseConceptEdgeMaterial.clone();
            const edgeMesh = new THREE.Mesh(tubeGeo, edgeMaterial);
            edgeMesh.userData = {
                sourceId: id, targetId: targetId, type: 'edge', baseOpacity: edgeMaterial.opacity,
                originalColor: edgeMaterial.color.getHex(), originalEmissive: edgeMaterial.emissive.getHex()
            };
            conceptScene.add(edgeMesh);
            conceptEdges.push(edgeMesh);
        }
    }
}

/** Creates placeholder objects for agent state and emergence core */
function createAgentSimulationPlaceholders() {
    // Dispose previous meshes and labels first
    [agentStateMesh, emergenceCoreMesh, live2dPlaneConcept].forEach(mesh => {
        if (mesh) {
            // Dispose label if attached
            if (mesh.userData?.label && mesh.children.includes(mesh.userData.label)) {
                const label = mesh.userData.label;
                 if (label.element?.parentNode) {
                    label.element.parentNode.removeChild(label.element);
                 }
                 mesh.remove(label);
            }
            // Dispose geometry and material
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
            // Remove from scene
            conceptScene?.remove(mesh);
        }
    });
    agentStateMesh = emergenceCoreMesh = live2dPlaneConcept = agentStateLabel = emergenceCoreLabel = null;


    const VisConfig = Config.Visualization.Node;

    // Helper to create placeholders
    const createPlaceholder = (id, geometryFn) => {
        const data = conceptData[id];
        if (!data) { console.warn(`Placeholder data for ${id} not found.`); return null; }
        const typeSettings = VisConfig.TypeSettings[data.type];
        const baseSize = VisConfig.BaseSize || 1.0;
        const nodeSize = (typeSettings.size || 1.0) * baseSize * 0.6;
        const geo = geometryFn(nodeSize);
        const mat = new THREE.MeshPhongMaterial({
             color: typeSettings.color, emissive: typeSettings.emissive, shininess: typeSettings.shininess,
             specular: new THREE.Color(typeSettings.color).multiplyScalar(0.5),
             transparent: true, opacity: typeSettings.opacity });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(data.position);
        mesh.userData = {
            ...data, originalPosition: data.position.clone(), originalColor: mat.color.getHex(),
            originalEmissive: mat.emissive.getHex(), baseOpacity: mat.opacity, baseScale: 1.0, label: null
        };
        conceptScene.add(mesh);

        let label = null;
        if (data.type !== 'live2d_avatar_ref') { // No label for invisible plane
            const labelDiv = document.createElement('div');
            labelDiv.className = 'label';
            labelDiv.textContent = data.name;
            label = new THREE.CSS2DObject(labelDiv);
            const labelOffset = (typeSettings.labelOffset || 1.5) * nodeSize / baseSize * 1.3;
            label.position.set(0, labelOffset * (id === 'emergence_core' ? 1.1 : 1), 0); // Adjust height
            mesh.add(label);
            mesh.userData.label = label;
        }
        return { mesh, label }; // Return both mesh and label
    };

    // Create placeholders
    const agentPlaceholder = createPlaceholder('agent_emotional_state', (size) => new THREE.SphereGeometry(size, 32, 16));
    if (agentPlaceholder) { agentStateMesh = agentPlaceholder.mesh; agentStateLabel = agentPlaceholder.label; }

    const corePlaceholder = createPlaceholder('emergence_core', (size) => new THREE.TetrahedronGeometry(size * 1.2, 1));
    if (corePlaceholder) { emergenceCoreMesh = corePlaceholder.mesh; emergenceCoreLabel = corePlaceholder.label; }

    const live2dPlaceholder = createPlaceholder('live2d_avatar_ref', (size) => new THREE.PlaneGeometry(Config.Visualization.Node.TypeSettings.live2d_avatar_ref.size, Config.Visualization.Node.TypeSettings.live2d_avatar_ref.size));
    if (live2dPlaceholder) { live2dPlaneConcept = live2dPlaceholder.mesh; }
}

/** Updates placeholder visuals based on simulation metrics */
export function updateAgentSimulationVisuals(emotionsTensor, rihScore, avgAffinity, hmLabel, trustScore) {
    if (!conceptInitialized || !agentStateMesh || !emergenceCoreMesh || !live2dPlaneConcept) return;

    // Cache latest simulation data
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
        emotions.forEach((val, i) => { if (val > maxIntensity) { maxIntensity = val; dominantIndex = i; }});
        const emotionAvg = emotions.reduce((s, v) => s + v, 0) / Math.max(1, Config.Agent.EMOTION_DIM);
        const emotionColorMap = [0x66ff66, 0xff6666, 0x66ccff, 0xff9966, 0x99ffcc, 0xffff66]; // Joy, Fear, Cur, Frust, Calm, Surp
        const targetColor = new THREE.Color(emotionColorMap[dominantIndex] ?? 0xcccccc);
        const targetEmissiveIntensity = clamp(maxIntensity * 0.6 + 0.1, 0.1, 0.7);
        // Store base values for animation reference (lerping happens in animateConceptNodes)
        agentStateMesh.userData.baseColor = targetColor.getHex();
        agentStateMesh.userData.baseEmissive = targetColor.clone().multiplyScalar(targetEmissiveIntensity).getHex();
        agentStateMesh.userData.baseScale = 1.0 + emotionAvg * 0.4;
        agentStateMesh.userData.baseOpacity = Config.Visualization.Node.TypeSettings.simulation_state.opacity;
    }

    // --- Update Emergence Core Mesh (Reflects RIH, Affinity, Trust) ---
    if (emergenceCoreMesh?.material && emergenceCoreMesh.userData) {
        const baseColor = new THREE.Color(Config.Visualization.Node.TypeSettings.simulation_state.color);
        const rihTargetColor = new THREE.Color(0xffffff); // White for high RIH
        const trustTargetColor = new THREE.Color(0xaaaaff); // Bluish for high trust
        let targetColor = baseColor.clone().lerp(rihTargetColor, latestRIHScore * 0.4).lerp(trustTargetColor, latestTrustScore * 0.3);
        const emissiveIntensity = clamp((latestRIHScore * 0.4 + latestTrustScore * 0.3 + Math.abs(latestAvgAffinity) * 0.2), 0.15, 0.8);
        // Store base values for animation reference
        emergenceCoreMesh.userData.baseColor = targetColor.getHex();
        emergenceCoreMesh.userData.baseEmissive = targetColor.clone().multiplyScalar(emissiveIntensity).getHex();
        emergenceCoreMesh.userData.baseScale = 1.0 + clamp(latestRIHScore * 0.5 + latestTrustScore * 0.3 + Math.abs(latestAvgAffinity) * 0.2, 0, 0.8);
        emergenceCoreMesh.userData.baseOpacity = clamp(0.6 + latestRIHScore * 0.2 + (latestTrustScore - 0.5) * 0.3, 0.5, 0.95);
    }

    // --- Update Live2D Placeholder Info (Name change based on status) ---
    if (live2dPlaneConcept?.userData) {
        const live2dStatus = live2dInitialized ? 'Active' : 'Inactive';
        live2dPlaneConcept.userData.name = `Live2D Avatar Ref (Status: ${live2dStatus})`;
        live2dPlaneConcept.userData.baseOpacity = Config.Visualization.Node.TypeSettings.live2d_avatar_ref.opacity;
        live2dPlaneConcept.userData.baseScale = 1.0;
    }

    // --- Update Edge Base Opacity Based on Global Metrics (RIH/Affinity) ---
    conceptEdges.forEach(edge => {
        if (edge?.material && edge.userData) {
            const baseOpacity = clamp(0.3 + latestRIHScore * 0.2 + Math.abs(latestAvgAffinity) * 0.15, 0.2, 0.7);
            edge.userData.baseOpacity = baseOpacity; // Store for animation reference
        }
    });
}

/** Sets up raycasting and event listeners for concept graph interaction */
function setupConceptInteraction(interactableObjects) {
    if (!conceptContainer || !conceptInfoPanel || !conceptCamera) return;
    conceptRaycaster = new THREE.Raycaster();
    conceptMouse = new THREE.Vector2();

    // Remove previous listeners if any
    conceptContainer.removeEventListener('mousemove', handleConceptMouseMoveWrapper, false);
    conceptContainer.removeEventListener('click', handleConceptClickWrapper, false);
    conceptContainer.removeEventListener('keydown', handleConceptKeyDownWrapper, false);

    // Add new listeners
    conceptContainer.addEventListener('mousemove', handleConceptMouseMoveWrapper, false);
    conceptContainer.addEventListener('click', handleConceptClickWrapper, false);
    conceptContainer.tabIndex = 0; // Make container focusable for keydown events
    conceptContainer.addEventListener('keydown', handleConceptKeyDownWrapper, false);

    updateInfoPanel(); // Initial info panel update
}

/** Handles mouse movement for hover effects */
function onConceptMouseMove(event, interactableObjects) {
    if (!conceptInitialized || !conceptCamera || !conceptRaycaster || !conceptMouse || !conceptContainer || !interactableObjects) return;
    const rect = conceptContainer.getBoundingClientRect();
    conceptMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    conceptMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    conceptRaycaster.setFromCamera(conceptMouse, conceptCamera);
    const intersects = conceptRaycaster.intersectObjects(interactableObjects, false);

    let newHoveredObject = null;
    if (intersects.length > 0 && intersects[0].object?.userData?.id) {
        newHoveredObject = intersects[0].object;
    }

    if (!selectedObject) { // Only update hover if nothing is selected
        if (newHoveredObject !== hoveredObject) {
            hoveredObject = newHoveredObject;
            updateInfoPanel(); // Update panel on hover change
        }
    } else { // Something is selected
         if (newHoveredObject !== hoveredObject) { // If hover target changes
             hoveredObject = newHoveredObject;
             // Don't update info panel automatically if something is selected,
             // unless the user hovers over the selected item itself.
             if (hoveredObject === selectedObject) {
                 updateInfoPanel(); // Show selected item info again
             } else {
                 // Optionally show minimal hover info elsewhere or do nothing
             }
         }
    }
    conceptContainer.style.cursor = (hoveredObject || selectedObject) ? 'pointer' : 'default';
}

/** Handles mouse clicks for selection and camera focus */
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
            conceptInfoPanel.classList.remove('user-forced-visible'); // Allow hiding panel on deselect
        } else { // Clicked a new object
            selectedObject = clickedObject;
            hoveredObject = null; // Clear hover
            conceptInfoPanel.classList.add('visible', 'user-forced-visible'); // Force panel visible on selection
            if (selectedObject.position) conceptControls.target.copy(selectedObject.position);
        }
    } else { // Clicked background
        selectedObject = null; // Deselect
        conceptInfoPanel.classList.remove('user-forced-visible'); // Allow hiding panel on background click
    }

    updateInfoPanel(); // Update info panel based on new selection/hover state
    conceptContainer.style.cursor = (hoveredObject || selectedObject) ? 'pointer' : 'default';
}

/** Handles keyboard interaction (Arrow keys, Enter) */
function handleConceptKeyDownWrapper(event) {
     if (!conceptInitialized || (!conceptNodes && !agentStateMesh && !emergenceCoreMesh) ) return;

     // Get all objects that can be navigated
     const actualConceptNodeEntries = Object.values(conceptNodes).map(n => n.object);
     const placeholderEntries = [agentStateMesh, emergenceCoreMesh].filter(Boolean);
     const allNavigableObjects = [...actualConceptNodeEntries, ...placeholderEntries];
     if (allNavigableObjects.length === 0) return;

     let currentIndex = -1;
     const currentFocusObject = selectedObject || hoveredObject; // Prioritize selected for index finding
     if (currentFocusObject) {
         currentIndex = allNavigableObjects.findIndex(obj => obj === currentFocusObject);
     }

     let targetIndex = currentIndex;

     switch (event.key) {
         case 'ArrowUp': case 'ArrowLeft':
             targetIndex = (currentIndex <= 0) ? allNavigableObjects.length - 1 : currentIndex - 1;
             event.preventDefault(); break;
         case 'ArrowDown': case 'ArrowRight':
             targetIndex = (currentIndex < 0 || currentIndex >= allNavigableObjects.length - 1) ? 0 : currentIndex + 1;
             event.preventDefault(); break;
         case 'Enter':
             if (hoveredObject) { // Select the currently hovered object
                 selectedObject = hoveredObject;
                 hoveredObject = null;
                 conceptInfoPanel.classList.add('visible', 'user-forced-visible'); // Force panel visible
                 if(selectedObject?.position) conceptControls.target.copy(selectedObject.position);
                 updateInfoPanel();
             } else if (selectedObject) {
                 // Optional: Action on Enter when selected? Currently does nothing.
             }
             event.preventDefault(); return; // Don't navigate further on Enter
        case 'Escape': // Deselect on Escape
            if (selectedObject){
                selectedObject = null;
                hoveredObject = null; // Clear hover too
                conceptInfoPanel.classList.remove('user-forced-visible');
                updateInfoPanel();
                event.preventDefault();
            }
            return;
         default: return; // Ignore other keys
     }

     // Navigate hover state based on arrow keys
     if (targetIndex !== currentIndex && targetIndex >= 0 && targetIndex < allNavigableObjects.length) {
         hoveredObject = allNavigableObjects[targetIndex];
         selectedObject = null; // Clear selection when navigating hover with keys
         conceptInfoPanel.classList.remove('user-forced-visible'); // Allow panel to hide if not selected
         updateInfoPanel(); // Update panel to show newly hovered item
         if (hoveredObject?.position) { // Gently pan camera toward new hover
             const newTarget = conceptControls.target.clone().lerp(hoveredObject.position, 0.2);
             conceptControls.target.copy(newTarget);
         }
     }
}


/** Updates the info panel content based on selected/hovered object and simulation state */
export function updateInfoPanel() {
    if (!conceptInfoPanel) return;

    let displayObject = selectedObject || hoveredObject; // Prioritize selected object

    // Determine if the panel should be visible. It's visible if:
    // 1. An object is selected OR
    // 2. An object is hovered OR
    // 3. It was previously forced visible by user (selection or toggle button) and nothing is selected/hovered now.
    const isForcedVisible = conceptInfoPanel.classList.contains('user-forced-visible');
    const shouldBeVisible = !!displayObject || isForcedVisible;

    conceptInfoPanel.classList.toggle('visible', shouldBeVisible);
    const infoToggleButton = document.getElementById('toggle-info-panel');
    if (infoToggleButton) infoToggleButton.setAttribute('aria-expanded', shouldBeVisible.toString());


    if (displayObject?.userData?.id) { // Display info for the focused object
        const data = displayObject.userData;
        let displayName = data.name || 'Unknown Concept';
        const baseDescription = data.description || 'No description available.';
        let descriptionToDisplay = baseDescription.replace(/</g, "<").replace(/>/g, ">"); // Sanitize base description
        let dynamicInfoHtml = '';

        // Add dynamic data for simulation placeholders
        const emotions = latestAgentEmotions || zeros([Config.Agent.EMOTION_DIM]);
        let dominantIndex = -1, maxIntensity = -1;
        emotions.forEach((val, i) => { if(val > maxIntensity) { maxIntensity = val; dominantIndex = i; }});
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
        // Append dynamic info if available
        if (dynamicInfoHtml) {
           // Simple append, assumes base description doesn't contain the dynamic class
           descriptionToDisplay += '<br><i>Dynamic Details:</i>' + dynamicInfoHtml;
       }


        // Generate links list HTML with clickable spans
        let linksHtml = '';
        if (data.links && data.links.length > 0) {
            linksHtml = '<p class="links-title"><b>Connected Concepts:</b></p><ul class="links-list">';
            data.links.forEach(linkId => {
                // Find the linked node data (concept or placeholder)
                const linkData = conceptData[linkId] ||
                                 (agentStateMesh?.userData?.id === linkId ? agentStateMesh.userData : null) ||
                                 (emergenceCoreMesh?.userData?.id === linkId ? emergenceCoreMesh.userData : null) ||
                                 (live2dPlaneConcept?.userData?.id === linkId ? live2dPlaneConcept.userData : null);

                const linkName = linkData?.name ? linkData.name.replace(/</g, "<").replace(/>/g, ">") : `Unknown (${linkId})`;
                // Sanitize description for title attribute
                const linkDesc = linkData?.description ? linkData.description.replace(/"/g, '\\"').replace(/</g, "<").replace(/>/g, ">") : '';
                linksHtml += `<li><span title="${linkDesc}" data-link-id="${linkId}" class="info-panel-link">${linkName}</span></li>`; // Add class and data-link-id
            });
            linksHtml += '</ul>';
        }

        // Update panel content
        const typeString = data.type ? data.type.charAt(0).toUpperCase() + data.type.slice(1).replace(/_/g, ' ') : 'N/A';
        conceptInfoPanel.innerHTML = `
            <h3>${displayName.replace(/</g, "<").replace(/>/g, ">")}</h3>
            <p><b>Type:</b> ${typeString}</p>
            ${data.chapter && data.chapter !== 'Simulation' && data.chapter !== 'Visualization' ? `<p><b>Chapter:</b> ${data.chapter}</p>` : ''}
            <p class="description">${descriptionToDisplay}</p>
            ${linksHtml}
        `;

        // Add event listeners to newly created links
        conceptInfoPanel.querySelectorAll('.info-panel-link').forEach(linkEl => {
            linkEl.addEventListener('click', (e) => {
                const targetId = e.target.dataset.linkId;
                // Find the target object (concept or placeholder)
                const targetNodeEntry = conceptNodes[targetId] ||
                                     (agentStateMesh?.userData?.id === targetId ? { object: agentStateMesh } : null) ||
                                     (emergenceCoreMesh?.userData?.id === targetId ? { object: emergenceCoreMesh } : null) ||
                                     (live2dPlaneConcept?.userData?.id === targetId ? { object: live2dPlaneConcept } : null);

                if (targetNodeEntry?.object) {
                    selectedObject = targetNodeEntry.object; // Select the clicked link target
                    hoveredObject = null; // Clear hover
                    conceptInfoPanel.classList.add('visible', 'user-forced-visible'); // Ensure panel stays visible
                    if (selectedObject.position) conceptControls.target.copy(selectedObject.position); // Focus camera
                    updateInfoPanel(); // Refresh panel for the new selection
                }
            });
             linkEl.addEventListener('mouseenter', (e) => e.target.style.textDecoration = 'underline');
             linkEl.addEventListener('mouseleave', (e) => e.target.style.textDecoration = 'none');
        });

    } else if (shouldBeVisible) { // Panel is visible but nothing specific is focused (e.g., forced open)
        conceptInfoPanel.innerHTML = `
            <h3>Concept Information</h3>
            <p>Hover over or click a node to see details. Use Arrow keys to navigate, Enter to select, Esc to deselect.</p>
            <hr>
            <p><b>Simulation Snapshot:</b></p>
            <p><span class="simulated-data">RIH: ${(latestRIHScore * 100).toFixed(1)}% | Affinity: ${latestAvgAffinity.toFixed(2)} | Trust: ${(latestTrustScore * 100).toFixed(1)}%</span></p>
        `;
    }
    // If !shouldBeVisible, the panel's display is already set to 'none' by the toggle('visible', ...) call.
}


/** Animates concept nodes and edges based on state and interaction */
export function animateConceptNodes(deltaTime, integrationParam, reflexivityParam, lastIntegrationTime, lastReflexivityTime, lastChatTime) {
    if (!conceptInitialized || !conceptClock || !conceptNodes || latestAgentEmotions === null) return;

    const elapsedTime = conceptClock.getElapsedTime();
    const inputFeedbackDuration = 0.5;

    const emotions = latestAgentEmotions || zeros([Config.Agent.EMOTION_DIM]);
    // const emotionAvg = emotions.reduce((a, b) => a + b, 0) / Math.max(1, Config.Agent.EMOTION_DIM);

    // Colors and Lerp Factor
    const nodeHighlightColor = new THREE.Color(0xffffff);
    const nodeHighlightEmissive = new THREE.Color(0xffffff).multiplyScalar(0.5);
    const linkedColor = new THREE.Color(0xaaaaee);
    const linkedEmissive = new THREE.Color(0xaaaaee).multiplyScalar(0.3);
    const edgeHighlightColor = new THREE.Color(0x00aaff);
    const edgeHighlightEmissive = new THREE.Color(0x00aaff).multiplyScalar(0.6);
    const integrationFeedbackColor = new THREE.Color(0x66ffaa); // Greenish
    const reflexivityFeedbackColor = new THREE.Color(0xffddaa); // Orangish
    const chatFeedbackColor = new THREE.Color(0xaaaaff); // Bluish
    const lerpFactor = clamp(deltaTime * 10, 0.01, 0.15); // Animation smoothness factor

    // Get all nodes including placeholders
    const allNodesToAnimate = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh, emergenceCoreMesh, live2dPlaneConcept,
    ].filter(Boolean); // Filter out nulls

    // --- Animate Each Node ---
    allNodesToAnimate.forEach(object => {
        if (!object?.material || !object.userData?.originalPosition) return; // Skip invalid objects

        const data = object.userData;
        const originalPosition = data.originalPosition;
        // Retrieve base properties set during creation or updateAgentSimulationVisuals
        const baseColorHex = data.baseColor ?? data.originalColor ?? 0x888888;
        const baseEmissiveHex = data.baseEmissive ?? data.originalEmissive ?? 0x222222;
        const baseScale = data.baseScale ?? 1.0;
        const baseOpacity = data.baseOpacity ?? (object.material.opacity !== undefined ? object.material.opacity : 1.0);

        // Use THREE.Color instances for manipulation
        const currentBaseColor = new THREE.Color(baseColorHex);
        const currentBaseEmissive = new THREE.Color(baseEmissiveHex);

        // Determine node state
        const isSelected = selectedObject === object;
        const isHovered = !isSelected && hoveredObject === object;
        // Check links (handle cases where userData might be missing links temporarily)
        const sourceLinks = data.links || [];
        const selectedTargetLinks = selectedObject?.userData?.links || [];
        const hoveredTargetLinks = hoveredObject?.userData?.links || [];
        const isLinkedToSelected = selectedObject?.userData?.id && (sourceLinks.includes(selectedObject.userData.id) || selectedTargetLinks.includes(data.id));
        const isLinkedToHovered = !isSelected && !isLinkedToSelected && hoveredObject?.userData?.id && (sourceLinks.includes(hoveredObject.userData.id) || hoveredTargetLinks.includes(data.id));


        // Initialize Target Visual Properties
        let targetPosition = originalPosition.clone();
        let targetScaleVec = new THREE.Vector3(baseScale, baseScale, baseScale); // Use Vector3
        let targetColor = currentBaseColor.clone();
        let targetEmissive = currentBaseEmissive.clone();
        let targetOpacity = baseOpacity;

        // Apply Base Animation (Subtle Oscillation/Pulse for non-placeholders)
        if (!isSelected && !isHovered && data.type !== 'simulation_state' && data.type !== 'live2d_avatar_ref') {
            const oscSpeed = 1.0 + (data.chapter % 5) * 0.1;
            const oscAmount = 0.05 + (data.type.length % 5) * 0.02;
            targetPosition.y += Math.sin(elapsedTime * oscSpeed + originalPosition.x * 0.1) * oscAmount;
            const pulseFactor = 0.02 + ((data.links?.length || 0) % 5) * 0.005;
            const basePulse = Math.sin(elapsedTime * (oscSpeed + 0.5) + originalPosition.y * 0.1) * pulseFactor;
            targetScaleVec.multiplyScalar(1.0 + basePulse);
        }

        // Check for Input Feedback Pulse
        let inputFeedbackIntensity = 0; let feedbackEmissiveColor = null; let timeSinceInput = -1;
        let shouldPulseForInput = false;
        const feedbackConcepts = {
            integration: ['synkolator', 'korporator', 'konzenter', 'exzenter', 'combinatorics'],
            reflexivity: ['reflexive_abstraction', 'reflexive_integration', 'holoformen', 'metrophorischer_zirkel', 'idee', 'metrophor'],
            chat: ['agent_emotional_state', 'subjective_aspect', 'dialektik', 'pradikatrix']
        };
        if (lastIntegrationTime > 0 && feedbackConcepts.integration.includes(data.id)) {
             timeSinceInput = elapsedTime - lastIntegrationTime; feedbackEmissiveColor = integrationFeedbackColor; shouldPulseForInput = true;
        } else if (lastReflexivityTime > 0 && feedbackConcepts.reflexivity.includes(data.id)) {
             timeSinceInput = elapsedTime - lastReflexivityTime; feedbackEmissiveColor = reflexivityFeedbackColor; shouldPulseForInput = true;
        } else if (lastChatTime > 0 && feedbackConcepts.chat.includes(data.id)) {
             timeSinceInput = elapsedTime - lastChatTime; feedbackEmissiveColor = chatFeedbackColor; shouldPulseForInput = true;
        }
        if (shouldPulseForInput && timeSinceInput >= 0 && timeSinceInput < inputFeedbackDuration) {
            inputFeedbackIntensity = (1.0 - (timeSinceInput / inputFeedbackDuration)) ** 2; // Ease out
        }

        // Apply Metric/Feedback Influences (ONLY IF NOT Selected/Hovered/Linked)
        if (!isSelected && !isHovered && !isLinkedToSelected && !isLinkedToHovered) {
            if (inputFeedbackIntensity > 0 && feedbackEmissiveColor) {
                // Apply Feedback Pulse
                targetEmissive.lerp(feedbackEmissiveColor, inputFeedbackIntensity * 0.8);
                const feedbackPulse = Math.sin(elapsedTime * 8.0) * 0.08 * inputFeedbackIntensity;
                targetScaleVec.multiplyScalar(1.0 + feedbackPulse + inputFeedbackIntensity * 0.1);
                targetOpacity = lerp(baseOpacity, Math.min(baseOpacity + 0.4, 1.0), inputFeedbackIntensity);
            } else {
                // Apply Regular Metric/Slider Influences
                 let metricScaleModifier = 1.0, metricPulseSpeedFactor = 1.0, metricPulseAmountFactor = 1.0;
                 let metricColorShift = new THREE.Color(0x000000);
                 // Example influences (keep or adjust as needed)
                 if (['reflexive_integration', 'holoformen', 'emergence_core', 'strukturkondensation_realized'].includes(data.id)) {
                     metricScaleModifier += latestRIHScore * 0.1; metricPulseAmountFactor += latestRIHScore * 0.4;
                     targetEmissive.lerp(new THREE.Color(0xffffff), latestRIHScore * 0.3);
                 }
                 if (['affinitaetssyndrom', 'korporator', 'emergence_core', 'konflexivsyntrix'].includes(data.id)) {
                     const absAffinity = Math.abs(latestAvgAffinity); metricScaleModifier += absAffinity * 0.05;
                     if (latestAvgAffinity > 0.1) metricColorShift.g += 0.15 * latestAvgAffinity;
                     if (latestAvgAffinity < -0.1) metricColorShift.b += 0.15 * absAffinity;
                 }
                  if (['idee', 'metrophor', 'agent_emotional_state'].includes(data.id)) {
                     metricScaleModifier += (latestTrustScore - 0.5) * 0.1;
                     targetEmissive.lerp(new THREE.Color(0xaaaaff), clamp(latestTrustScore - 0.5, 0, 0.5) * 0.4);
                 }
                 if (data.id === 'synkolator' || data.id === 'combinatorics') metricPulseSpeedFactor += integrationParam * 0.5;
                 if (data.id === 'reflexive_abstraction' || data.id === 'metrophorischer_zirkel') metricPulseSpeedFactor += reflexivityParam * 0.5;

                 const metricPulse = Math.sin(elapsedTime * metricPulseSpeedFactor + originalPosition.x * 0.05) * 0.02 * metricPulseAmountFactor;
                 targetScaleVec.multiplyScalar(metricScaleModifier * (1.0 + metricPulse));
                 targetColor.add(metricColorShift); // Apply additive color shift
            }
        }

        // Apply Highlight Effects (Overrides non-persistent effects)
        if (isSelected) {
            targetColor.lerp(nodeHighlightColor, 0.6); targetEmissive.lerp(nodeHighlightEmissive, 0.7);
            targetScaleVec.multiplyScalar(1.2); targetOpacity = Math.min(baseOpacity + 0.3, 1.0);
        } else if (isHovered) {
            targetColor.lerp(nodeHighlightColor, 0.4); targetEmissive.lerp(nodeHighlightEmissive, 0.5);
            targetScaleVec.multiplyScalar(1.1); targetOpacity = Math.min(baseOpacity + 0.2, 1.0);
        } else if (isLinkedToSelected) {
            targetColor.lerp(linkedColor, 0.5); targetEmissive.lerp(linkedEmissive, 0.6);
            targetScaleVec.multiplyScalar(1.05); targetOpacity = Math.min(baseOpacity + 0.15, 1.0);
        } else if (isLinkedToHovered) {
            targetColor.lerp(linkedColor, 0.3); targetEmissive.lerp(linkedEmissive, 0.4);
            targetScaleVec.multiplyScalar(1.025); targetOpacity = Math.min(baseOpacity + 0.1, 1.0);
        }

        // Smoothly Interpolate Node Properties Towards Targets
        if (data.type !== 'live2d_avatar_ref') object.position.lerp(targetPosition, lerpFactor); // Don't move invisible plane
        object.scale.lerp(targetScaleVec, lerpFactor);
        if (object.material.color) object.material.color.lerp(targetColor, lerpFactor);
        if (object.material.emissive) object.material.emissive.lerp(targetEmissive, lerpFactor);
        if (object.material.opacity !== undefined) {
            const safeTargetOpacity = isNaN(targetOpacity) ? baseOpacity : targetOpacity;
            object.material.opacity = lerp(object.material.opacity, safeTargetOpacity, lerpFactor);
            object.material.transparent = object.material.opacity < 1.0;
        }

        // Apply Rotation for Certain Types (if not selected/hovered)
        if (!isSelected && !isHovered && ['core', 'dynamics', 'operator', 'geometry_metric', 'transformation'].includes(data.type)) {
            object.rotation.x += deltaTime * 0.15; object.rotation.y += deltaTime * 0.2;
        }

         // Update Label Position and Opacity based on node scale/opacity
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

        // Retrieve base properties stored during edge creation
        const {sourceId, targetId, baseOpacity: edgeBaseOpacity, originalColor: edgeOriginalColorHex, originalEmissive: edgeOriginalEmissiveHex} = edge.userData;
        const currentEdgeBaseOpacity = edgeBaseOpacity ?? Config.Visualization.Edge.BaseOpacity; // Fallback
        const currentEdgeOriginalColor = new THREE.Color(edgeOriginalColorHex ?? Config.Visualization.Edge.BaseColor);
        const currentEdgeOriginalEmissive = new THREE.Color(edgeOriginalEmissiveHex ?? Config.Visualization.Edge.BaseEmissive);

        // Initialize targets
        let targetEdgeColor = currentEdgeOriginalColor.clone();
        let targetEdgeEmissive = currentEdgeOriginalEmissive.clone();
        let targetEdgeOpacity = currentEdgeBaseOpacity;

        // Determine edge state
        const isSelectedEdge = selectedObject?.userData?.id && (sourceId === selectedObject.userData.id || targetId === selectedObject.userData.id);
        const isHoveredEdge = !isSelectedEdge && hoveredObject?.userData?.id && (sourceId === hoveredObject.userData.id || targetId === hoveredObject.userData.id);

        // Apply effects
        if (isSelectedEdge) {
            targetEdgeColor.lerp(edgeHighlightColor, 0.7);
            targetEdgeEmissive.lerp(edgeHighlightEmissive, 0.8);
            targetEdgeOpacity = Math.min(currentEdgeBaseOpacity + 0.4, 0.95);
        } else if (isHoveredEdge) {
            targetEdgeColor.lerp(edgeHighlightColor, 0.5);
            targetEdgeEmissive.lerp(edgeHighlightEmissive, 0.6);
            targetEdgeOpacity = Math.min(currentEdgeBaseOpacity + 0.3, 0.85);
        } else {
            // Subtle pulse based on time and RIH score
            const edgePulse = Math.sin(elapsedTime * 1.2 + (sourceId ? sourceId.charCodeAt(0) : 0)) * 0.1 * (0.5 + latestRIHScore * 0.5);
            targetEdgeOpacity = clamp(currentEdgeBaseOpacity * (1.0 + edgePulse), 0.1, 0.8);
            // Optional: Blend emissive slightly towards connected nodes?
            // const nodeA = conceptNodes[sourceId]?.object || (agentStateMesh?.userData?.id === sourceId ? agentStateMesh : null) || ...
            // const nodeB = ...
            // if (nodeA?.material.emissive && nodeB?.material.emissive) {
            //    targetEdgeEmissive.lerpColors(nodeA.material.emissive, nodeB.material.emissive, 0.5); // Example blend
            //    targetEdgeEmissive.multiplyScalar(0.3); // Dim the blend
            // }
        }

        // Interpolate edge material properties
        if (edge.material.color) edge.material.color.lerp(targetEdgeColor, lerpFactor);
        if (edge.material.emissive) edge.material.emissive.lerp(targetEdgeEmissive, lerpFactor);
        edge.material.opacity = lerp(edge.material.opacity, targetEdgeOpacity, lerpFactor);
        edge.material.transparent = edge.material.opacity < 1.0;
    }); // End edge loop
}

/** Cleans up Three.js resources for the concept visualization */
export function cleanupConceptVisualization() {
    if (!conceptInitialized && !conceptScene) return; // Skip if already clean or never inited

    window.removeEventListener('resize', debouncedOnConceptWindowResize, false); // Use debounced
    if (conceptContainer) {
        conceptContainer.removeEventListener('mousemove', handleConceptMouseMoveWrapper);
        conceptContainer.removeEventListener('click', handleConceptClickWrapper);
        conceptContainer.removeEventListener('keydown', handleConceptKeyDownWrapper);
    }

    // Dispose scene children more carefully
    if (conceptScene) {
        while(conceptScene.children.length > 0){
            const object = conceptScene.children[0];
            conceptScene.remove(object); // Remove from scene first

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
            // Recursively remove CSS2D labels from nodes before disposing node
            if (object.traverse) { // Check if object can be traversed
                 object.traverse((child) => {
                     if (child.isCSS2DObject) {
                         if (child.element?.parentNode) {
                             child.element.parentNode.removeChild(child.element);
                         }
                     }
                 });
            }
        }
    }

    // Clear collections and references
    conceptNodes = {};
    conceptEdges = [];
    agentStateMesh = null;
    emergenceCoreMesh = null;
    live2dPlaneConcept = null;
    agentStateLabel = null;
    emergenceCoreLabel = null;

    // Dispose renderers and controls
    if (conceptRenderer) {
        conceptRenderer.dispose();
        conceptRenderer.forceContextLoss();
        if (conceptRenderer.domElement && conceptContainer?.contains(conceptRenderer.domElement)) {
             conceptContainer.removeChild(conceptRenderer.domElement);
        }
        conceptRenderer = null;
    }
    if (conceptLabelRenderer?.domElement?.parentNode) {
        conceptLabelRenderer.domElement.parentNode.removeChild(conceptLabelRenderer.domElement);
        conceptLabelRenderer = null;
    }
    if (conceptControls) {
        conceptControls.dispose();
        conceptControls = null;
    }
    if (baseConceptEdgeMaterial) {
        baseConceptEdgeMaterial.dispose();
        baseConceptEdgeMaterial = null;
    }

    // Clear scene reference last
    conceptScene = null;
    conceptCamera = null;
    conceptInfoPanel = null;
    hoveredObject = null;
    selectedObject = null;
    conceptClock = null;

    conceptInitialized = false;
    console.log("Concept visualization cleanup complete.");
}

/** Handles window resize events for the Concept Graph panel */
function onConceptWindowResize() {
    if (!conceptInitialized || !conceptContainer || !conceptCamera || !conceptRenderer || !conceptLabelRenderer) return;
    const width = conceptContainer.clientWidth;
    const height = conceptContainer.clientHeight;
    if (width <= 0 || height <= 0) return; // Ignore resize if container is hidden
    conceptCamera.aspect = width / height;
    conceptCamera.updateProjectionMatrix();
    conceptRenderer.setSize(width, height);
    conceptLabelRenderer.setSize(width, height);
    // Re-rendering will happen in the main animation loop
}

// Wrapper functions for event listeners to ensure interactable objects are current
let handleConceptMouseMoveWrapper = (event) => {
    let conceptInteractableObjects = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh, emergenceCoreMesh,
        // live2dPlaneConcept, // Exclude invisible plane
    ].filter(Boolean);
    onConceptMouseMove(event, conceptInteractableObjects);
};

let handleConceptClickWrapper = (event) => {
    let conceptInteractableObjects = [
        ...Object.values(conceptNodes).map(n => n.object),
        agentStateMesh, emergenceCoreMesh,
        // live2dPlaneConcept,
    ].filter(Boolean);
    onConceptClick(event, conceptInteractableObjects);
};
// handleConceptKeyDownWrapper is already defined and uses dynamic lookup
// Export additional functions for UiManager integration
export function renderConceptVisualization() {
    if (!conceptInitialized || !conceptRenderer || !conceptLabelRenderer || !conceptScene || !conceptCamera) return;
    
    try {
        conceptRenderer.render(conceptScene, conceptCamera);
        conceptLabelRenderer.render(conceptScene, conceptCamera);
    } catch (e) {
        console.error("Error rendering concept visualization:", e);
    }
}

export function isConceptVisualizationReady() {
    return conceptInitialized && 
           conceptRenderer !== null && 
           conceptLabelRenderer !== null && 
           conceptScene !== null && 
           conceptCamera !== null;
}
