// Node.js script to recursively index all .json files in a given DB subfolder (e.g., objects, characters, rooms)
// Usage: node scripts/generate-db-index.js <subfolder>

const fs = require('fs');
const path = require('path');

function getAllJsonFiles(dir, baseDir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllJsonFiles(filePath, baseDir));
        } else if (file.toLowerCase().endsWith('.json')) {
            // Store relative path from baseDir, using forward slashes
            results.push(path.relative(baseDir, filePath).replace(/\\/g, '/'));
        }
    });
    return results;
}

function generateIndex(subfolder) {
    const dbRoot = path.join(__dirname, '..', 'public', 'DB', subfolder);
    if (!fs.existsSync(dbRoot)) {
        console.error('Directory not found:', dbRoot);
        process.exit(1);
    }
    const files = getAllJsonFiles(dbRoot, path.join(__dirname, '..', 'public'));
    const outPath = path.join(dbRoot, 'index.json');
    fs.writeFileSync(outPath, JSON.stringify({ files }, null, 2));
    console.log(`Index written: ${outPath} (${files.length} files)`);
}

if (require.main === module) {
    const subfolder = process.argv[2];
    if (!subfolder) {
        console.error('Usage: node scripts/generate-db-index.js <subfolder>');
        process.exit(1);
    }
    generateIndex(subfolder);
}
