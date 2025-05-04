// dependency-checker.js
// This script checks if all dependencies are loaded

(function() {
    // Function to check if all dependencies are loaded
    function checkDependencies() {
        const dependencies = {
            'TensorFlow.js': typeof window.tf !== 'undefined' && typeof window.tf.layers !== 'undefined',
            'Three.js': typeof window.THREE !== 'undefined',
            'OrbitControls': typeof window.THREE !== 'undefined' && typeof window.THREE.OrbitControls !== 'undefined',
            'CSS2DRenderer': typeof window.THREE !== 'undefined' && typeof window.THREE.CSS2DRenderer !== 'undefined',
            'Chart.js': typeof window.Chart !== 'undefined',
            'Luxon': typeof window.luxon !== 'undefined',
            'Chart.js Luxon Adapter': typeof window._adapters !== 'undefined' && typeof window._adapters._date !== 'undefined',
            'Chart.js Streaming': typeof window.ChartStreaming !== 'undefined'
        };
        
        // Check if all dependencies are loaded
        const allLoaded = Object.values(dependencies).every(Boolean);
        
        // Log the status of each dependency
        console.log('Dependency status:');
        for (const [name, loaded] of Object.entries(dependencies)) {
            console.log(`- ${name}: ${loaded ? 'Loaded' : 'Not loaded'}`);
        }
        
        return allLoaded;
    }
    
    // Check dependencies every 500ms until all are loaded or timeout
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds
    
    function attemptCheck() {
        attempts++;
        
        if (checkDependencies()) {
            console.log('All dependencies loaded successfully');
            window.allDependenciesLoaded = true;
            
            // Dispatch an event to signal that all dependencies are loaded
            window.dispatchEvent(new Event('dependenciesLoaded'));
            return;
        }
        
        if (attempts >= maxAttempts) {
            console.error('Timed out waiting for dependencies to load');
            return;
        }
        
        // Try again in 500ms
        setTimeout(attemptCheck, 500);
    }
    
    // Start checking dependencies
    attemptCheck();
})();