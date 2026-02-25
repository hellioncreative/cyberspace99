const fs = require('fs');
const buffer = fs.readFileSync('public/ghost.gltf');
const jsonStr = buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12));
const j = JSON.parse(jsonStr);
const binStart = 20 + buffer.readUInt32LE(12) + 8;
const imageView = j.bufferViews[j.images[0].bufferView];
const img = buffer.subarray(binStart + imageView.byteOffset, binStart + imageView.byteOffset + imageView.byteLength);
// This is a PNG. Let's find IHDR width/height
const w = img.readUInt32BE(16);
const h = img.readUInt32BE(20);
console.log(`Texture size: ${w}x${h}`);
