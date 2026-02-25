const fs = require('fs');
// Very simple PNG parser to just dump some info
const buf = fs.readFileSync('public/ghost_texture.png');
// We can use a library to decode the png if needed, or write a tiny one.
// Actually, let's just use jimp or pngjs. Are they installed?
