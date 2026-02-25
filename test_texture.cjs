const jimp = require('jimp');

async function main() {
    const img = await jimp.read('public/ghost_texture.png');
    console.log(`Image size: ${img.getWidth()}x${img.getHeight()}`);
    let blackPixels = 0;
    let whitePixels = 0;
    let coloredPixels = 0;
    let transPixels = 0;
    
    for (let y = 0; y < img.getHeight(); y++) {
        for (let x = 0; x < img.getWidth(); x++) {
            const hex = img.getPixelColor(x, y);
            const r = (hex >> 24) & 255;
            const g = (hex >> 16) & 255;
            const b = (hex >> 8) & 255;
            const a = hex & 255;
            
            if (a < 255) transPixels++;
            if (r === 0 && g === 0 && b === 0) blackPixels++;
            else if (r > 250 && g > 250 && b > 250) whitePixels++;
            else coloredPixels++;
        }
    }
    console.log(`Black: ${blackPixels}, White/Grey: ${whitePixels}, Colored/Shaded: ${coloredPixels}, Transparent: ${transPixels}`);
}
main();
