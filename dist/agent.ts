// In _updateEmotions method
_updateEmotions(stateTensor, prevEmotionsInput, reward, contextValue) {
  return tf.tidy(() => {
    const rewardTensor = tf.tensor([[reward]]);
    const contextSignal = tf.tensor([[contextValue]]);
    
    // Use beliefEmbedding instead of raw state tensor
    // This should match the expected input shape of 64 for the dense layer
    const input = tf.concat([
      this.beliefEmbedding, // This should be shape [1, 64]
      prevEmotionsInput,
      rewardTensor, 
      contextSignal
    ], 1);
    
    // Rest of the function remains the same
    const predictedEmotions = this.emotionalModule.apply(input);
    // ...
  });
}