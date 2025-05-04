// module-loader.js
// This script converts ES module imports to UMD/global imports

(function() {
    // Map of module names to global objects
    const moduleMap = {
        'three': window.THREE,
        'three/examples/jsm/controls/OrbitControls.js': {
            OrbitControls: window.THREE.OrbitControls
        },
        'three/examples/jsm/renderers/CSS2DRenderer.js': {
            CSS2DRenderer: window.THREE.CSS2DRenderer,
            CSS2DObject: window.THREE.CSS2DObject
        },
        'chart.js': window.Chart,
        'chartjs-adapter-luxon': window._adapters,
        'chartjs-plugin-streaming': window.ChartStreaming,
        '@tensorflow/tfjs': window.tf,
        '@tensorflow/tfjs-core': window.tf
    };

    // Override the import function
    const originalImport = window.import;
    window.import = function(moduleName) {
        if (moduleMap[moduleName]) {
            return Promise.resolve(moduleMap[moduleName]);
        }
        
        // If not in our map, try the original import
        if (originalImport) {
            return originalImport(moduleName);
        }
        
        // If all else fails, reject
        return Promise.reject(new Error(`Module not found: ${moduleName}`));
    };

    // Create a custom import.meta object
    if (!window.import.meta) {
        window.import.meta = { url: window.location.href };
    }

    console.log('Module loader initialized');
})();