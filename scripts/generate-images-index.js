// Node.js script to recursively index all image files in Assets/images (or subfolders)
// Usage: node scripts/generate-images-index.js [subfolder]

const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.mp4'];

function getAllImageFiles(dir, baseDir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllImageFiles(filePath, baseDir));
        } else if (IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
            results.push(path.relative(baseDir, filePath).replace(/\\/g, '/'));
        }
    });
    return results;
}

function generateImagesIndex(subfolder = '') {
    const imagesRoot = path.join(__dirname, '..', 'public', 'Assets', 'images', subfolder);
    if (!fs.existsSync(imagesRoot)) {
        console.error('Directory not found:', imagesRoot);
        process.exit(1);
    }
    const baseDir = path.join(__dirname, '..', 'public');
    const files = getAllImageFiles(imagesRoot, baseDir);
    const outPath = path.join(imagesRoot, 'images_index.json');
    fs.writeFileSync(outPath, JSON.stringify({ files }, null, 2));
    console.log(`Images index written: ${outPath} (${files.length} files)`);
}

if (require.main === module) {
    const subfolder = process.argv[2] || '';
    generateImagesIndex(subfolder);
}
