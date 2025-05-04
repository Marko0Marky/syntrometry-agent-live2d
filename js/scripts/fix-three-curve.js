// js/scripts/fix-three-curve.js
// Script to fix the Three.js curve issue in viz-concepts.ts

const fs = require('fs');
const path = require('path');

console.log('Fixing Three.js curve issue in viz-concepts.ts...');

// Read the file
const filePath = path.join(process.cwd(), 'js', 'viz-concepts.ts');
let content;

try {
  content = fs.readFileSync(filePath, 'utf8');
} catch (error) {
  console.error(`Error reading file: ${error.message}`);
  process.exit(1);
}

// Find and replace the createConceptEdges function
const functionRegex = /function createConceptEdges\(\): void {[\s\S]*?}(\s*\/\/[\s\S]*?createConceptEdges)?/;

const replacementFunction = `function createConceptEdges(): void {
    // Clear existing edges
    conceptEdges.forEach(edge => {
        if (conceptScene) conceptScene.remove(edge);
    });
    conceptEdges = [];

    // Create base material for edges
    baseConceptEdgeMaterial = new THREE.MeshPhongMaterial({
        color: 0x888888,
        emissive: 0x222222,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });

    // For each node with links
    Object.values(conceptNodes).forEach(nodeEntry => {
        const sourceNode = nodeEntry.object;
        const sourceData = nodeEntry.data;
        
        if (!sourceData.links || !conceptScene) return;
        
        sourceData.links.forEach(targetId => {
            if (!conceptNodes[targetId]) {
                console.warn(\`Target node \${targetId} not found for link from \${sourceData.id}\`);
                return;
            }
            
            const targetNode = conceptNodes[targetId].object;
            const targetData = conceptNodes[targetId].data;
            
            // Get positions
            const startPoint = sourceNode.position.clone();
            const endPoint = targetNode.position.clone();
            
            // Calculate midpoint with offset for curve
            const midPoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);
            const direction = new THREE.Vector3().subVectors(endPoint, startPoint).normalize();
            const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
            
            // Create a simple line with curve effect
            const points = [];
            const segments = 20; // Number of segments for the line
            
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                // Linear interpolation between start and end points
                const point = new THREE.Vector3().lerpVectors(startPoint, endPoint, t);
                // Add a slight curve by moving points perpendicular to the direction
                const offset = Math.sin(t * Math.PI) * 5; // Adjust the 5 to control curve height
                point.add(perpendicular.clone().multiplyScalar(offset));
                points.push(point);
            }
            
            // Create geometry from points
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            
            // Create a line instead of a tube
            const edgeMaterial = baseConceptEdgeMaterial.clone();
            const material = new THREE.LineBasicMaterial({ 
                color: edgeMaterial.color,
                transparent: true,
                opacity: 0.6
            });
            
            const edge = new THREE.Line(geometry, material);
            edge.userData = {
                sourceId: sourceData.id,
                targetId: targetData.id,
                type: 'edge',
                baseOpacity: 0.6,
                originalColor: 0x888888,
                originalEmissive: 0x222222
            };
            
            conceptEdges.push(edge);
            conceptScene.add(edge);
        });
    });
}`;

// Replace the function
const updatedContent = content.replace(functionRegex, replacementFunction);

// Write the updated content back to the file
try {
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log('Successfully fixed Three.js curve issue in viz-concepts.ts');
} catch (error) {
  console.error(`Error writing file: ${error.message}`);
  process.exit(1);
}