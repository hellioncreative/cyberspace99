const fs = require('fs');

console.log("Creating a small HTML to inspect the material properties in the browser console.");
const html = `
<!DOCTYPE html>
<html><body>
<script type="module">
import * as THREE from './node_modules/three/build/three.module.js';
import { GLTFLoader } from './node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
loader.load('/ghost.gltf', (gltf) => {
    const model = gltf.scene;
    let materialData = {};
    model.traverse((child) => {
        if (child.isMesh) {
            materialData[child.name] = {
                type: child.material.type,
                map: !!child.material.map,
                color: child.material.color.getHexString(),
                emissive: child.material.emissive.getHexString(),
                transparent: child.material.transparent,
                alphaTest: child.material.alphaTest
            };
        }
    });
    fetch('/debug', { method: 'POST', body: JSON.stringify(materialData) });
});
</script>
</body></html>
`;
fs.writeFileSync('inspect.html', html);
