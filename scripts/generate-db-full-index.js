// Node.js script to recursively index all .json files in the entire DB directory (objects, characters, rooms, etc.)
// Usage: node scripts/generate-db-full-index.js

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

function generateFullDbIndex() {
    const dbRoot = path.join(__dirname, '..', 'public', 'DB');
    if (!fs.existsSync(dbRoot)) {
        console.error('Directory not found:', dbRoot);
        process.exit(1);
    }
    const files = getAllJsonFiles(dbRoot, path.join(__dirname, '..', 'public'));
    const outPath = path.join(dbRoot, 'full_index.json');
    fs.writeFileSync(outPath, JSON.stringify({ files }, null, 2));
    console.log(`Full DB index written: ${outPath} (${files.length} files)`);
}

if (require.main === module) {
    generateFullDbIndex();
}
