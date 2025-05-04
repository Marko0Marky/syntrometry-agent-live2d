// Replace tf.randomUniform with tf.random.uniform
// Around line 81
// From:
// const randomWeights = tf.randomUniform([inputDim, outputDim], -0.1, 0.1);

// To:
const randomWeights = tf.random.uniform([inputDim, outputDim], -0.1, 0.1);