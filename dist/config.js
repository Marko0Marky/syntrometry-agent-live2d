/**
 * Global configuration settings for the simulation and visualizations.
 * Version 2.3.1
 */
export const Config = {
    VERSION: "2.3.1", // Added version tracking
    METRON_TAU: 0.1, // Hypothetical Metron constant
    DIMENSIONS: 12, // Number of dimensions in the core processing state vector
    CASCADE_LEVELS: 4, // Number of levels in the Strukturkondensation cascade
    CASCADE_STAGE: 2, // Synkolator stage (arity) used in Strukturkondensation
    RIH_SCALE: 0.5, // Scaling factor for the final RIH score calculation
    TELE_THRESHOLD: 0.85, // Threshold for televariant state (Not actively used)
    DYSVARIANT_PROB: 0.02, // Base probability of dysvariant fluctuation in environment

    Agent: {
        EMOTION_DIM: 6, // Number of emotion dimensions
        HIDDEN_DIM: 64, // Dimensionality of Belief Embedding and Self-State
        HISTORY_SIZE: 15, // Memory buffer size for trust calculation
        BASE_STATE_DIM: 0, // ** Will be calculated below **
        BELIEF_EMBEDDING_DIM: 64, // Explicitly define for clarity (should match HIDDEN_DIM)
        CASCADE_INPUT_DIM: 12,    // Explicitly define (should match DIMENSIONS)
        EMOTIONAL_DECAY_RATE: 0.97, // Decay for blending emotions
        SELF_STATE_DECAY: 0.98,     // Decay for self-state update
        SELF_STATE_LEARN_RATE: 0.05,// Base learning rate for self-state
        INTEGRATION_INIT: 0.5,     // Initial value for integration param
        REFLEXIVITY_INIT: 0.5,     // Initial value for reflexivity param
        SELF_STATE_DIM: 64          // Dimensionality of self-state (should match HIDDEN_DIM)
    },
    Env: {
        EVENT_FREQ: 0.015, // Base probability of random environmental events per step
        EVENT_DURATION: 120, // Duration (in steps) an event actively influences
        EVENT_GAP: 180, // Minimum steps between events
        BASE_EMOTION_DRIFT_RATE: 0.005, // How quickly env emotions drift towards agent's
        BASE_EMOTION_REVERSION_RATE: 0.001, // How quickly env emotions revert towards neutral (0.5)
    },
    RL: { // Parameter Tuning Settings
        LR: 0.001, // Base learning rate for potential future model training
        PARAM_LEARN_RATE: 0.006, // Learning rate for heuristic adjustment of Integration/Reflexivity
        PARAM_DECAY: 0.03, // Strength of mean reversion for params towards 0.5
        highVarianceThreshold: 0.15, // Threshold for high cascade variance rule
        increasingVarianceThreshold: 0.01 // Threshold for increasing cascade variance rule
    },
    Visualization: { // Settings for Concept Graph visualization
        Node: {
            BaseSize: 1.5,
            TypeSettings: { // Specific visual properties per concept type
                framework: { size: 2.5, color: 0x66ccff, emissive: 0x3366ff, shininess: 60, opacity: 0.9, labelOffset: 1.8 },
                structure: { size: 1.2, color: 0xffffff, emissive: 0x555555, shininess: 80, opacity: 1.0, labelOffset: 1.5 },
                core: { size: 0.9, color: 0xffff66, emissive: 0x888833, shininess: 100, opacity: 1.0, labelOffset: 1.3 },
                component: { size: 1.0, color: 0x66ffaa, emissive: 0x338855, shininess: 50, opacity: 1.0, labelOffset: 1.5 },
                property: { size: 0.8, color: 0xffaaff, emissive: 0x885588, shininess: 40, opacity: 1.0, labelOffset: 1.2 },
                parameter: { size: 0.7, color: 0xaaffff, emissive: 0x558888, shininess: 30, opacity: 1.0, labelOffset: 1.1 },
                operator: { size: 1.1, color: 0xffaa66, emissive: 0x885533, shininess: 70, opacity: 1.0, labelOffset: 1.6 },
                method: { size: 0.6, color: 0xff66ff, emissive: 0x883388, shininess: 60, opacity: 1.0, labelOffset: 1.8 },
                concept: { size: 0.9, color: 0xaaaaaa, emissive: 0x555555, shininess: 40, opacity: 1.0, labelOffset: 1.4 },
                architecture: { size: 1.8, color: 0xccaa66, emissive: 0x665533, shininess: 55, opacity: 1.0, labelOffset: 1.9 },
                field: { size: 1.5, color: 0x88ccff, emissive: 0x446688, shininess: 70, opacity: 1.0, labelOffset: 1.7 },
                dynamics: { size: 1.1, color: 0x66ffcc, emissive: 0x338866, shininess: 60, opacity: 1.0, labelOffset: 1.6 },
                purpose: { size: 1.3, color: 0xaa66ff, emissive: 0x553388, shininess: 75, opacity: 1.0, labelOffset: 1.6 },
                principle: { size: 1.5, color: 0xffaa66, emissive: 0x885533, shininess: 50, opacity: 1.0, labelOffset: 1.6 },
                geometry_metric: { size: 1.3, color: 0xffffff, emissive: 0x888888, shininess: 85, opacity: 1.0, labelOffset: 1.6 },
                relation: { size: 0.5, color: 0xeecc88, emissive: 0x776644, shininess: 45, opacity: 1.0, labelOffset: 1.3 },
                level: { size: 0.6, color: 0xccccff, emissive: 0x666688, shininess: 50, opacity: 1.0, labelOffset: 1.4 },
                transformation: { size: 1.5, color: 0xcc5555, emissive: 0x662222, shininess: 50, opacity: 1.0, labelOffset: 1.4 },
                // Simulation placeholders
                simulation_state: { size: 1.5, color: 0x66ff66, emissive: 0x338833, shininess: 80, opacity: 0.7, labelOffset: 2.0 },
                live2d_avatar_ref: { size: 10.0, color: 0x555566, emissive: 0x000000, shininess: 0, opacity: 0.0, labelOffset: 0 } // Invisible reference plane
            }
        },
        Edge: { // Settings for Concept Graph edges
            TubeRadius: 0.1,
            TubularSegments: 20, // Segments along the curve
            TubeDetail: 8, // Segments around the tube radius
            BaseColor: 0x888888,
            BaseEmissive: 0x222222,
            BaseOpacity: 0.5
        }
    },
    /** Basic config validation on import */
    validate() {
        const check = (path, expectedType) => {
            const parts = path.split('.');
            let current = this;
            for (const part of parts) {
                if (current && typeof current === 'object' && current !== null && part in current) {
                    current = current[part];
                } else {
                    console.error(`Config Validation Error: Missing required field: ${path}`);
                    return false;
                }
            }
            if (typeof current !== expectedType) {
                console.error(`Config Validation Error: Field ${path} has wrong type (${typeof current}), expected (${expectedType})`);
                return false;
            }
            return true;
        };
        const checks = [
            check('DIMENSIONS', 'number'), check('CASCADE_LEVELS', 'number'),
            check('Agent.EMOTION_DIM', 'number'), check('Agent.HIDDEN_DIM', 'number'),
            check('Agent.HISTORY_SIZE', 'number'), check('Agent.EMOTIONAL_DECAY_RATE', 'number'),
            check('Agent.SELF_STATE_DECAY', 'number'), check('Agent.SELF_STATE_LEARN_RATE', 'number'),
            check('Env.EVENT_FREQ', 'number'), check('Env.EVENT_DURATION', 'number'),
            check('RL.PARAM_LEARN_RATE', 'number'), check('RL.PARAM_DECAY', 'number')
        ];
        if (!checks.every(Boolean)) {
            throw new Error("Configuration validation failed. Check console for details.");
        }
        // Calculate derived values *after* validation
        this.Agent.BASE_STATE_DIM = this.DIMENSIONS + this.Agent.EMOTION_DIM;
        // Ensure consistent embedding/hidden dims
        this.Agent.BELIEF_EMBEDDING_DIM = this.Agent.HIDDEN_DIM;
        this.Agent.SELF_STATE_DIM = this.Agent.HIDDEN_DIM;
        // Ensure cascade input matches dimensions
        this.Agent.CASCADE_INPUT_DIM = this.DIMENSIONS;

        console.log("Configuration validated successfully. Calculated BASE_STATE_DIM:", this.Agent.BASE_STATE_DIM);
        return true;
    }
};

// Validate config on load
Config.validate();

/**
 * Defines emotion keywords and their properties for text analysis and environmental impact.
 * Structure: { emotionIndex: { name, keywords[], strength, baseChange } }
 */
export const emotionKeywords = {
    0: { name: "Joy", keywords: ["happy", "joy", "great", "wonderful", "love", "good", "nice", "yay", "fun", "excellent", "positive"], strength: 0.9, baseChange: 0.05 },
    1: { name: "Fear", keywords: ["scary", "fear", "afraid", "nervous", "danger", "anxious", "worried", "threat", "panic"], strength: 0.9, baseChange: -0.05 },
    2: { name: "Curiosity", keywords: ["interesting", "curious", "what", "how", "why", "explain", "learn", "question", "investigate", "explore"], strength: 0.8, baseChange: 0.03 },
    3: { name: "Frustration", keywords: ["ugh", "annoying", "frustrating", "bad", "hate", "stupid", "wrong", "error", "glitch", "stuck", "fail"], strength: 0.8, baseChange: -0.05 },
    4: { name: "Calm", keywords: ["calm", "peaceful", "relax", "quiet", "gentle", "serene", "okay", "fine", "stable", "neutral"], strength: 0.7, baseChange: 0.04 },
    5: { name: "Surprise", keywords: ["wow", "whoa", "surprise", "really", "omg", "sudden", "unexpected", "amazing", "incredible"], strength: 0.85, baseChange: 0.02 }
};

/**
 * Array of emotion names derived from emotionKeywords, maintaining index order.
 * Used for mapping indices to names throughout the application.
 */
export const emotionNames = Object.keys(emotionKeywords)
    .sort((a, b) => parseInt(a) - parseInt(b)) // Ensure order by index
    .map(key => emotionKeywords[key].name)
    .slice(0, Config.Agent.EMOTION_DIM); // Ensure it matches config dim

if (emotionNames.length !== Config.Agent.EMOTION_DIM) {
    console.warn(`Number of emotion names (${emotionNames.length}) does not match Config.Agent.EMOTION_DIM (${Config.Agent.EMOTION_DIM}). Check config.js.`);
}


/**
 * Labels for head movement predictions, defining the possible discrete actions.
 */
export const HEAD_MOVEMENT_LABELS = ["nod", "shake", "tilt_left", "tilt_right", "idle"];
export const NUM_HEAD_MOVEMENTS = HEAD_MOVEMENT_LABELS.length;