// js/config.js

/**
 * Global configuration settings for the simulation and visualizations.
 */
export const Config = {
    METRON_TAU: 0.1,
    DIMENSIONS: 12, // Number of dimensions in the visible Syntrometry state vector
    CASCADE_LEVELS: 4,
    CASCADE_STAGE: 2, // Stage for Synkolator (used in agent and core)
    TELE_THRESHOLD: 0.85, // Not used currently
    DYSVARIANT_PROB: 0.02,
    RIH_SCALE: 0.5,
    Agent: {
        BASE_STATE_DIM: 18, // Config.DIMENSIONS + Config.Agent.EMOTION_DIM
        EMOTION_DIM: 6,
        HIDDEN_DIM: 64, // Used for Belief Embedding size
        HISTORY_SIZE: 10, // Used for agent memory buffer size
        TAU: 0.1, // Primarily used by environment lattice now
        ATTENTION_THRESHOLD: 0.7 // Not used currently
    },
    Env: {
        EVENT_FREQ: 0.01,
        EVENT_DURATION: 120, // Frames
        EVENT_GAP: 180 // Frames
    },
    RL: { // Ensure this sub-object and LR exist
        LR: 0.001, // Base learning rate (example, currently used only by optimizer init)
        // Add other RL params if needed by agent heuristics later
    }
};

// Ensure BASE_STATE_DIM matches the intended state vector size
Config.Agent.BASE_STATE_DIM = Config.DIMENSIONS + Config.Agent.EMOTION_DIM;


/**
 * Defines emotion keywords and their properties for text analysis and environmental impact.
 */
export const emotionKeywords = {
    0: { name: "Joy", keywords: ["happy", "joy", "great", "wonderful", "love", "good", "nice", "yay", "fun"], strength: 0.9, baseChange: 0.05 },
    1: { name: "Fear", keywords: ["scary", "fear", "afraid", "nervous", "danger", "anxious", "worried"], strength: 0.9, baseChange: -0.05 },
    2: { name: "Curiosity", keywords: ["interesting", "curious", "what", "how", "why", "explain", "learn", "question"], strength: 0.8, baseChange: 0.03 },
    3: { name: "Frustration", keywords: ["ugh", "annoying", "frustrating", "bad", "hate", "stupid", "wrong", "error", "glitch"], strength: 0.8, baseChange: -0.05 },
    4: { name: "Calm", keywords: ["calm", "peaceful", "relax", "quiet", "gentle", "serene", "okay", "fine"], strength: 0.7, baseChange: 0.04 },
    5: { name: "Surprise", keywords: ["wow", "whoa", "surprise", "really", "omg", "sudden", "unexpected"], strength: 0.85, baseChange: 0.02 }
};

/**
 * Array of emotion names based on emotionKeywords.
 */
export const emotionNames = Object.values(emotionKeywords).map(e => e.name);

/**
 * Labels for head movement predictions.
 */
export const HEAD_MOVEMENT_LABELS = ["nod", "shake", "tilt_left", "tilt_right", "idle"];
export const NUM_HEAD_MOVEMENTS = HEAD_MOVEMENT_LABELS.length;
