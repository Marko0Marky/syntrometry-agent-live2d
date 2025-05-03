// @ts-nocheck
// js/config.ts
/**
 * Global configuration settings for the simulation and visualizations.
 */
export const Config = {
    METRON_TAU: 0.1,
    DIMENSIONS: 12,
    CASCADE_LEVELS: 4,
    CASCADE_STAGE: 2,
    RIH_SCALE: 0.5,
    TELE_THRESHOLD: 0.85,
    DYSVARIANT_PROB: 0.02,
    Agent: {
        // BASE_STATE_DIM is calculated below
        BASE_STATE_DIM: 0,
        EMOTION_DIM: 6,
        HIDDEN_DIM: 64,
        HISTORY_SIZE: 15,
    },
    Env: {
        EVENT_FREQ: 0.015,
        EVENT_DURATION: 120,
        EVENT_GAP: 180,
        BASE_EMOTION_DRIFT_RATE: 0.005,
        BASE_EMOTION_REVERSION_RATE: 0.001,
    },
    RL: {
        LR: 0.001,
        PARAM_LEARN_RATE: 0.006,
        PARAM_DECAY: 0.03,
        highVarianceThreshold: 0.15,
        increasingVarianceThreshold: 0.01
    },
    Visualization: {
        Node: {
            BaseSize: 1.5,
            TypeSettings: {
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
                simulation_state: { size: 1.5, color: 0x66ff66, emissive: 0x338833, shininess: 80, opacity: 0.7, labelOffset: 2.0 },
                live2d_avatar_ref: { size: 10.0, color: 0x555566, emissive: 0x000000, shininess: 0, opacity: 0.0, labelOffset: 0 }
            }
        },
        Edge: {
            TubeRadius: 0.1,
            TubularSegments: 20,
            TubeDetail: 8,
            BaseColor: 0x888888,
            BaseEmissive: 0x222222,
            BaseOpacity: 0.5
        }
    }
};
// Derived Configuration Value
Config.Agent.BASE_STATE_DIM = Config.DIMENSIONS + Config.Agent.EMOTION_DIM;
export const emotionKeywords = {
    0: { name: "Joy", keywords: ["happy", "joy", "great", "wonderful", "love", "good", "nice", "yay", "fun", "excellent", "positive"], strength: 0.9, baseChange: 0.05 },
    1: { name: "Fear", keywords: ["scary", "fear", "afraid", "nervous", "danger", "anxious", "worried", "threat", "panic"], strength: 0.9, baseChange: -0.05 },
    2: { name: "Curiosity", keywords: ["interesting", "curious", "what", "how", "why", "explain", "learn", "question", "investigate", "explore"], strength: 0.8, baseChange: 0.03 },
    3: { name: "Frustration", keywords: ["ugh", "annoying", "frustrating", "bad", "hate", "stupid", "wrong", "error", "glitch", "stuck", "fail"], strength: 0.8, baseChange: -0.05 },
    4: { name: "Calm", keywords: ["calm", "peaceful", "relax", "quiet", "gentle", "serene", "okay", "fine", "stable", "neutral"], strength: 0.7, baseChange: 0.04 },
    5: { name: "Surprise", keywords: ["wow", "whoa", "surprise", "really", "omg", "sudden", "unexpected", "amazing", "incredible"], strength: 0.85, baseChange: 0.02 }
};
/**
 * Array of emotion names derived from emotionKeywords.
 */
export const emotionNames = Object.values(emotionKeywords).map(e => e.name);
/**
 * Labels for head movement predictions. Using 'as const' makes it a readonly tuple
 * with literal types, which can be useful for type checking hmLabel values.
 */
export const HEAD_MOVEMENT_LABELS = ["nod", "shake", "tilt_left", "tilt_right", "idle"];
export const NUM_HEAD_MOVEMENTS = HEAD_MOVEMENT_LABELS.length;
//# sourceMappingURL=config.js.map