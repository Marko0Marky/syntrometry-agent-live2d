/**
 * Test script for Live2D functionality
 */

// Function to test Live2D emotion updates
function testLive2DEmotions() {
  if (typeof updateLive2DEmotions === 'function' && live2dInitialized) {
    console.log("Testing Live2D emotion updates...");
    
    // Create a test emotion array (values between 0-1)
    const testEmotions = Array(20).fill(0).map((_, i) => i % 2 === 0 ? 0.8 : 0.2);
    
    // Update emotions
    updateLive2DEmotions(testEmotions);
    console.log("Live2D emotions updated with test values:", testEmotions);
    
    // Test different emotions after a delay
    setTimeout(() => {
      const newEmotions = Array(20).fill(0).map((_, i) => i % 2 === 0 ? 0.2 : 0.8);
      updateLive2DEmotions(newEmotions);
      console.log("Live2D emotions updated with new test values:", newEmotions);
    }, 2000);
  } else {
    console.error("Live2D is not initialized or updateLive2DEmotions function is not available");
  }
}

// Function to test head movement
function testLive2DHeadMovement() {
  if (typeof updateLive2DHeadMovement === 'function' && live2dInitialized) {
    console.log("Testing Live2D head movement...");
    
    // Test different head movements
    const headMovements = ["neutral", "left", "right", "up", "down"];
    let index = 0;
    
    // Update head movement every 2 seconds
    const intervalId = setInterval(() => {
      const movement = headMovements[index % headMovements.length];
      updateLive2DHeadMovement(movement, 0.5);
      console.log(`Live2D head movement updated to: ${movement}`);
      index++;
      
      // Stop after testing all movements
      if (index >= headMovements.length) {
        clearInterval(intervalId);
      }
    }, 2000);
  } else {
    console.error("Live2D is not initialized or updateLive2DHeadMovement function is not available");
  }
}

// Run tests when the page is fully loaded
window.addEventListener('load', () => {
  // Wait a bit for Live2D to initialize
  setTimeout(() => {
    if (live2dInitialized) {
      console.log("Live2D is initialized, running tests...");
      testLive2DEmotions();
      testLive2DHeadMovement();
    } else {
      console.error("Live2D failed to initialize");
    }
  }, 3000); // Wait 3 seconds
});