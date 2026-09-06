const fs = require('fs');
let c2 = fs.readFileSync('web/features/setup/setup_steps.js', 'utf8');
const lines2 = c2.split('\n');
for (let i = 0; i < lines2.length; i++) {
    if (lines2[i].includes('Controlla il riepilogo. Completando')) {
        lines2[i] = "            el('p', { className: 'step__lead', textContent: t('setup.controllaIlRiepilogoComple', \"Controlla il riepilogo. Completando, l'account viene creato e la configurazione iniziale si chiude definitivamente.\") }),";
    }
}
fs.writeFileSync('web/features/setup/setup_steps.js', lines2.join('\n'));
