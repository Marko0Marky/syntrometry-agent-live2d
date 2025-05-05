// Create a new file for agent-specific types
export interface AgentState {
    version: string;
    prevEmotions: number[];
    memoryBuffer: Array<{
        timestamp: number;
        beliefEmbedding: number[][] | null;
    }>;
    lastRIH: number;
    lastCascadeVariance: number;
    latestTrustScore: number;
    integrationParam: number;
    reflexivityParam: number;
    selfState: number[];
    beliefNetworkWeights: any[][] | null;
    cascadeInputLayerWeights: any[][] | null;
    valueHeadWeights: any[][] | null;
    feedbackHeadWeights: any[][] | null;
    error?: string;
}