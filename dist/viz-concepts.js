// js/viz-concepts.ts
// Import THREE properly as namespace
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
// Import local modules
import { Config, emotionNames } from './config.js';
import { clamp, displayError, zeros, lerp } from './utils.js';
import { live2dInitialized } from './viz-live2d.js';
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
let conceptNodes = {};
let conceptEdges = [];
let conceptContainer = null;
let conceptInfoPanel = null;
let conceptClock = null;
let agentStateMesh = null;
let emergenceCoreMesh = null;
let agentStateLabel = null;
let emergenceCoreLabel = null;
let live2dPlaneConcept = null;
let baseConceptEdgeMaterial = null;
let hoveredObject = null;
let selectedObject = null;
// Cached simulation state
let latestAgentEmotions = null; // Store as array
let latestRIHScore = 0;
let latestAvgAffinity = 0;
let latestTrustScore = 1.0;
let latestHmLabel = "idle"; // Use HeadMovementLabel type from config if strict
// Type the main conceptData object
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
    'syntropodenarchitektonik': { id: 'syntropodenarchitektonik', name: 'Syntropodenarchitektonik', chapter: 3, position: new THREE.Vector3(0, -8, 0), type: 'architecture', links: ['konflexivsyntrix', 'syntropoden', 'konzenter', 'exzenter', 'emergence_core'], description: "Overall network architecture of multi-membered Konflexivsyntrizen." },
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
    'affinitaetssyndrom': { id: 'affinitaetssyndrom', name: 'Affinitätssyndrom', chapter: 4, position: new THREE.Vector3(10, -21, 10), type: 'concept', links: ['syntrixfeld', 'reflexive_integration', 'korporator', 'emergence_core'], description: "Formal measure for coupling strength or interaction potential between systems." },
    'metroplex': { id: 'metroplex', name: 'Metroplex (n M)', chapter: 5, position: new THREE.Vector3(0, -22, 15), type: 'structure', links: ['hypersyntrix', 'syntrokline_metroplexbruecken', 'metroplexkombinat', 'syntrixtotalitaet'], description: "Higher-order syntrometric structure; recursively defined hierarchy of Syntrices." },
    'hypersyntrix': { id: 'hypersyntrix', name: 'Hypersyntrix (1 M)', chapter: 5, position: new THREE.Vector3(-10, -25, 15), type: 'structure', links: ['metroplex', 'syntrixtotalitaet'], description: "Metroplex of the first grade; ensemble of Syntrices treated as a unit." },
    'syntrokline_metroplexbruecken': { id: 'syntrokline_metroplexbruecken', name: 'Syntrokline Metroplexbrücken', chapter: 5, position: new THREE.Vector3(10, -25, 15), type: 'operator', links: ['metroplex', 'metroplexkombinat'], description: "Operators connecting structures across different Metroplex grades." },
    'metroplexkombinat': { id: 'metroplexkombinat', name: 'Metroplexkombinat', chapter: 5, position: new THREE.Vector3(0, -28, 18), type: 'architecture', links: ['metroplex', 'syntrokline_metroplexbruecken'], description: "Complete integrated architecture of nested Metroplexes and Bridges." },
    'kontraktion': { id: 'kontraktion', name: 'Kontraktion', chapter: 5, position: new THREE.Vector3(5, -25, 18), type: 'transformation', links: ['metroplex'], description: "Structure-reducing transformation for managing complexity." },
    'aonische_area': { id: 'aonische_area', name: 'Äonische Area', chapter: 6, position: new THREE.Vector3(0, -32, 20), type: 'field', links: ['telezentrum', 'polydromie', 'transzendenzstufen', 'telezentrik', 'telewarianz', 'dyswarianz', 'agent_emotional_state'], description: "Evolutionary landscape/state space structured by Telezentren." },
    'telezentrum': { id: 'telezentrum', name: 'Telezentrum', chapter: 6, position: new THREE.Vector3(-10, -35, 20), type: 'concept', links: ['aonische_area', 'transzendenzstufen', 'telezentrik'], description: "Stable attractor states; points of maximal coherence/integration (purpose/goals)." },
    'polydromie': { id: 'polydromie', name: 'Polydromie', chapter: 6, position: new THREE.Vector3(10, -35, 20), type: 'dynamics', links: ['aonische_area'], description: "Multiple potential evolutionary paths simultaneously or probabilistically." },
    'transzendenzstufen': { id: 'transzendenzstufen', name: 'Transzendenzstufen', chapter: 6, position: new THREE.Vector3(0, -38, 23), type: 'concept', links: ['telezentrum', 'aonische_area', 'transzendentaltektonik'], description: "Qualitative leaps to higher organizational levels." },
    'transzendentaltektonik': { id: 'transzendentaltektonik', name: 'Transzendentaltektonik', chapter: 6, position: new THREE.Vector3(5, -38, 23), type: 'architecture', links: ['transzendenzstufen'], description: "Architecture governing transcendent levels and their interrelations." },
    'telezentrik': { id: 'telezentrik', name: 'Telezentrik', chapter: 6, position: new THREE.Vector3(-5, -35, 20), type: 'purpose', links: ['aonische_area', 'telezentrum'], description: "Principle of directedness towards stable states." },
    'telewarianz': { id: 'telewarianz', name: 'Telewarianz', chapter: 6, position: new THREE.Vector3(15, -35, 23), type: 'concept', links: ['telezentrik', 'aonische_area'], description: "Stable, purpose-aligned evolutionary paths towards Telezentren." },
    'dyswarianz': { id: 'dyswarianz', name: 'Dyswarianz', chapter: 6, position: new THREE.Vector3(20, -35, 23), type: 'concept', links: ['aonische_area'], description: "Disruptive or unstable evolutionary paths away from Telezentren." },
    'quantitaetssyntrix': { id: 'quantitaetssyntrix', name: 'Quantitätssyntrix', chapter: 7, position: new THREE.Vector3(0, -42, 28), type: 'structure', links: ['subjective_aspect', 'metron', 'metronische_gitter'], description: "Specialized Syntrix for modeling quantifiable dimensions of perception." },
    'metron': { id: 'metron', name: 'Metron (tau)', chapter: 7, position: new THREE.Vector3(-10, -45, 28), type: 'parameter', links: ['quantitaetssyntrix', 'metronische_gitter'], description: "Smallest indivisible quantum or step size." },
    'metronische_gitter': { id: 'metronische_gitter', name: 'Metronische Gitter', chapter: 7, position: new THREE.Vector3(-15, -45, 28), type: 'structure', links: ['metron', 'metronische_elementaroperationen', 'quantitaetssyntrix', 'metronization'], description: "Fundamental discrete lattice underlying reality." },
    'metronische_elementaroperationen': { id: 'metronische_elementaroperationen', name: 'Metronische Elementaroperationen', chapter: 7, position: new THREE.Vector3(0, -45, 30), type: 'operator', links: ['metronische_gitter', 'metrondifferential', 'metronintegral'], description: "Discrete calculus (differential & integral) on the Metronic Gitter." },
    'metrondifferential': { id: 'metrondifferential', name: 'Metrondifferential (delta)', chapter: 7, position: new THREE.Vector3(-5, -48, 30), type: 'operator', links: ['metronische_elementaroperationen'], description: "Discrete analogue of the differential operator." },
    'metronintegral': { id: 'metronintegral', name: 'Metronintegral (S)', chapter: 7, position: new THREE.Vector3(5, -48, 30), type: 'operator', links: ['metronische_elementaroperationen'], description: "Discrete analogue of the integral operator." },
    'reflexive_integration': { id: 'reflexive_integration', name: 'Reflexive Integration (RIH)', chapter: 8, position: new THREE.Vector3(0, -52, 35), type: 'concept', links: ['holoformen', 'affinitaetssyndrom', 'selection_principles', 'strukturkondensation_realized', 'emergence_core', 'agent_emotional_state'], description: "Measure of system coherence or self-awareness (linked to Holoformen/Affinities)." },
    'geometric_field': { id: 'geometric_field', name: 'Geometric Field (g_ik, Gamma, R)', chapter: 8, position: new THREE.Vector3(10, -52, 35), type: 'geometry_metric', links: ['syntrixfeld', 'reflexive_integration', 'selection_principles', 'metronization', 'aondyne_primigene'], description: "Field with intrinsic geometry (metric, connection, curvature) emerging from Syntrixfeld." },
    'selection_principles': { id: 'selection_principles', name: 'Selection Principles', chapter: 8, position: new THREE.Vector3(0, -55, 38), type: 'principle', links: ['reflexive_integration', 'geometric_field'], description: "Principles for selecting stable geometric configurations (relevant for RIH)." },
    'metronization': { id: 'metronization', name: 'Metronization', chapter: 11, position: new THREE.Vector3(-10, -55, 38), type: 'method', links: ['geometric_field', 'metronische_gitter', 'hyperstruktur'], description: "Process of realizing geometric fields on the Metronic Gitter." },
    'hyperstruktur': { id: 'hyperstruktur', name: 'Hyperstruktur', chapter: 11, position: new THREE.Vector3(-5, -58, 40), type: 'structure', links: ['metronization', 'metronische_gitter', 'strukturkondensation_realized'], description: "Localized, quantized structure (candidate for particles) realized on the grid." },
    'strukturkondensation_realized': { id: 'strukturkondensation_realized', name: 'Strukturkondensation (Realized)', chapter: 11, position: new THREE.Vector3(5, -58, 40), type: 'concept', links: ['hyperstruktur', 'reflexive_integration'], description: "Quantified realized order from Hyperstrukturen (linked to RIH)." },
    'agent_emotional_state': { id: 'agent_emotional_state', name: 'Agent Emotional State', chapter: 'Simulation', position: new THREE.Vector3(25, -5, 0), type: 'simulation_state', links: ['subjective_aspect', 'aonische_area', 'reflexive_integration', 'live2d_avatar_ref', 'emergence_core'], description: 'Represents the agent\'s emotional state (Joy, Fear, etc.). Updates dynamically based on simulation.' },
    'emergence_core': { id: 'emergence_core', name: 'Emergence Core (RIH/Affinity)', chapter: 'Simulation', position: new THREE.Vector3(-25, -5, 0), type: 'simulation_state', links: ['reflexive_integration', 'affinitaetssyndrom', 'syntropodenarchitektonik', 'agent_emotional_state'], description: 'Represents key emergent properties like Reflexive Integration (RIH), Affinities, and Trust from agent processing.' },
    'live2d_avatar_ref': { id: 'live2d_avatar_ref', name: 'Live2D Avatar Ref', chapter: 'Visualization', position: new THREE.Vector3(0, -10, 0), type: 'live2d_avatar_ref', links: ['agent_emotional_state'], description: `Logical link point for the Live2D avatar. Its appearance in the other panel reflects the Agent Emotional State.<br><i>(This node is visually represented by an invisible plane).</i>` }
};
// --- Helper to get approximate boundary radius ---
function getApproxBoundaryRadius(geometry, scale = 1.0) {
    if (!geometry) {
        return 1.0 * scale; // Default radius if geometry is invalid
    }
    
    // Import the safeComputeBoundingSphere function
    // Note: This is a dynamic import to avoid circular dependencies
    import('./tensorUtils.js').then(module => {
        if (module.safeComputeBoundingSphere) {
            module.safeComputeBoundingSphere(geometry);
        }
    }).catch(err => {
        console.warn("Could not import safeComputeBoundingSphere:", err);
    });
    
    // Ensure bounding sphere exists
    if (!geometry.boundingSphere) {
        try {
            geometry.computeBoundingSphere();
        } catch (e) {
            console.warn("Could not compute bounding sphere for geometry:", e);
            return 1.0 * scale; // Fallback radius on error
        }
    }
    
    // Check if bounding sphere radius is valid
    const radius = geometry.boundingSphere && !isNaN(geometry.boundingSphere.radius) 
        ? geometry.boundingSphere.radius 
        : 1.0;
    
    return radius * scale;
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
            ...[agentStateMesh, emergenceCoreMesh].filter((o) => o !== null && o.type === 'Mesh')
        ];
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
            position: data.position, // Original position stored here
            type: data.type,
            links: data.links,
            description: data.description,
            originalPosition: data.position.clone(), // Explicit clone
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
        agentStateMesh.userData = {
            id: agentData.id,
            name: agentData.name,
            chapter: agentData.chapter,
            position: agentData.position,
            type: agentData.type,
            links: agentData.links,
            description: agentData.description,
            originalPosition: agentData.position.clone(),
            originalColor: mat.color.getHex(),
            originalEmissive: mat.emissive.getHex(),
            baseScale: 1.0,
            baseOpacity: mat.opacity,
            label: null
        };
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
function onConceptKeyDown(event) {
    if (!conceptInitialized || !conceptNodes || Object.keys(conceptNodes).length === 0 || !conceptControls)
        return;
    const allNodeIds = Object.keys(conceptNodes);
    const placeHolderIds = [agentStateMesh?.userData?.id, emergenceCoreMesh?.userData?.id].filter((id) => !!id);
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
/**
 * Animates concept nodes based on simulation state
 * @param {number} deltaTime - Time since last frame in seconds
 */
export function animateConceptNodes(deltaTime) {
    if (!conceptInitialized || !conceptScene) return;
    
    try {
        // Safely check if latestAgentEmotions exists and has length
        const emotionValues = latestAgentEmotions && 
                             Array.isArray(latestAgentEmotions) && 
                             latestAgentEmotions.length > 0 ? 
                             latestAgentEmotions : 
                             [0, 0, 0, 0, 0, 0];
        
        // Rest of the function...
        
        // When iterating over arrays, add safety checks
        Object.values(conceptNodes).forEach(node => {
            if (!node || !node.object) return;
            
            // Rest of the node animation code...
        });
    } catch (e) {
        console.warn("Error animating concept nodes:", e);
    }
}
// Cleans up resources
export function cleanupConceptVisualization() {
    if (!conceptScene)
        return; // Already cleaned
    const CSS2DObjectExists = typeof CSS2DObject !== 'undefined';
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
        conceptScene.traverse((object) => {
            const mesh = object;
            if (mesh.geometry) {
                mesh.geometry.dispose();
            }
            if (mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(material => material.dispose());
                }
                else if (mesh.material instanceof THREE.Material) {
                    mesh.material.dispose();
                }
            }
            if (CSS2DObjectExists && object instanceof CSS2DObject && object.element?.parentNode) {
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
        if (baseConceptEdgeMaterial) {
            baseConceptEdgeMaterial.dispose();
        }
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
// Fix for error on line 219 - correct type predicate
function isMesh(obj) {
    return obj !== null && obj.type === 'Mesh';
}
// Wrapper functions for event listeners
function handleConceptMouseMoveWrapper(event) {
    const conceptInteractableObjects = [
        ...Object.values(conceptNodes).map(n => n.object),
        ...[agentStateMesh, emergenceCoreMesh, live2dPlaneConcept].filter((o) => o !== null && o.type === 'Mesh')
    ];
    onConceptMouseMove(event, conceptInteractableObjects);
}
function handleConceptClickWrapper(event) {
    const conceptInteractableObjects = [
        ...Object.values(conceptNodes).map(n => n.object),
        ...[agentStateMesh, emergenceCoreMesh, live2dPlaneConcept].filter((o) => o !== null && o.type === 'Mesh')
    ];
    onConceptClick(event, conceptInteractableObjects);
}
function handleConceptKeyDownWrapper(event) {
    onConceptKeyDown(event);
} // Type event
/**
 * Helper function to safely access material on an Object3D
 * @param object The object to get material from
 * @returns The material or null if not available
 */
function getMeshMaterial(object) {
    if (!object)
        return null;
    // Check if it's a Mesh with material
    if (object instanceof THREE.Mesh) {
        if (Array.isArray(object.material)) {
            return object.material[0] || null;
        }
        else {
            return object.material || null;
        }
    }
    return null;
}









