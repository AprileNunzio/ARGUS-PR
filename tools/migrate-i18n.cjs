const fs = require('fs');
const path = require('path');

const dirs = ['web/features', 'web/assets'];
const regex = /(textContent|placeholder|title):\s*(['"])([^'"]*[a-zA-Z]{3,}[^'"]*)\2/g;

function toCamelCase(str) {
    return str.replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '').replace(/^[A-Z]/, c => c.toLowerCase());
}

let modifiedCount = 0;

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    let namespace = path.basename(path.dirname(filePath));
    if (namespace === 'assets' || namespace === 'features') namespace = 'common';
    
    let hasChanges = false;
    
    content = content.replace(regex, (match, prop, quote, text) => {
        if (text.includes('dashboard.') || text.includes('hub.')) return match;
        hasChanges = true;
        let key = toCamelCase(text.substring(0, 30));
        if (!key) key = 'str' + Math.floor(Math.random() * 1000);
        return `${prop}: t('${namespace}.${key}', '${text}')`;
    });
    
    if (hasChanges) {
        if (!content.includes('import { t }') && !content.includes('import { t,') && !content.includes(', t }')) {
            const importStmt = "import { t } from '/assets/i18n.js';\n";
            content = importStmt + content;
        }
        fs.writeFileSync(filePath, content);
        modifiedCount++;
    }
}

function walk(dir) {
    fs.readdirSync(dir).forEach(file => {
        const p = path.join(dir, file);
        if (fs.statSync(p).isDirectory()) {
            walk(p);
        } else if (p.endsWith('.js') && !p.endsWith('i18n.js') && !p.endsWith('dom.js') && !p.endsWith('dashboard.js')) {
            processFile(p);
        }
    });
}

dirs.forEach(walk);
console.log('Modified files:', modifiedCount);
