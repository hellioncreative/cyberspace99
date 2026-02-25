const fs = require('fs');
const buffer = fs.readFileSync('public/ghost.gltf');
const jsonstr = buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12));
console.log(JSON.parse(jsonstr).materials[0]);
