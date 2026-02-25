const fs = require('fs');
const buffer = fs.readFileSync('public/ghost.gltf');
const magic = buffer.readUInt32LE(0);
if (magic !== 0x46546C67) { console.log('Not GLB'); process.exit(1); }
const jsonChunkLength = buffer.readUInt32LE(12);
const jsonChunkType = buffer.readUInt32LE(16);
if (jsonChunkType !== 0x4E4F534A) { console.log('Not JSON chunk'); process.exit(1); }
const jsonString = buffer.toString('utf8', 20, 20 + jsonChunkLength);
const json = JSON.parse(jsonString);
console.log('Materials:', json.materials.map(m =>({name: m.name, color: m.pbrMetallicRoughness?.baseColorFactor})));
console.log('Meshes:', json.meshes.map(m => m.name));
