import * as tf from '@tensorflow/tfjs';

export let live2dInitialized: boolean;

export function initLive2D(): Promise<boolean>;
export function updateLive2D(deltaTime: number): void;
export function updateLive2DEmotions(emotionsTensor: tf.Tensor | null): void;
export function updateLive2DHeadMovement(hmLabel: string, deltaTime: number): void;
export function cleanupLive2D(): void;
export function setTargetExpression(expression: Record<string, number>): void;2