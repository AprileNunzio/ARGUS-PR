const PHASE_COPY = {
    requested: {
        title: 'Aggiornamento in corso',
        detail: 'Download e installazione della nuova versione',
        step: 1
    },
    pending: {
        title: 'Verifica della nuova versione',
        detail: 'Controllo di stabilita in corso, il ripristino automatico e pronto',
        step: 2
    },
    'rolled-back': {
        title: 'Versione precedente ripristinata',
        detail: 'La nuova versione non si e avviata, il sistema e tornato a quella funzionante',
        step: 3
    },
    failed: {
        title: 'Aggiornamento non riuscito',
        detail: 'Il sistema continua a funzionare con la versione installata',
        step: 3
    },
    reconnecting: {
        title: 'Riavvio del servizio',
        detail: 'Attendo che il server torni disponibile',
        step: 2
    },
    ready: {
        title: 'Sistema pronto',
        detail: 'Ripristino della vista in corso',
        step: 3
    }
};

const STEPS = ['Preparazione', 'Installazione', 'Avvio'];

function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined) continue;
        if (key === 'className' || key === 'textContent') node[key] = value;
        else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
        if (child) node.append(child);
    }
    return node;
}

export function createBootScreen() {
    const title = el('h1', { className: 'boot-screen__title', textContent: 'Avvio del sistema' });
    const detail = el('p', { className: 'boot-screen__detail', textContent: 'Attendere prego' });
    const versions = el('p', { className: 'boot-screen__versions' });
    const warning = el('p', { className: 'boot-screen__warning', textContent: 'Non spegnere il dispositivo' });
    const bar = el('span', { className: 'boot-screen__bar-fill' });

    const dots = STEPS.map((label) => el('span', { className: 'boot-screen__step' }, [
        el('span', { className: 'boot-screen__step-dot' }),
        el('span', { className: 'boot-screen__step-label', textContent: label })
    ]));

    const element = el('div', { className: 'boot-screen' }, [
        el('div', { className: 'boot-screen__glow' }),
        el('div', { className: 'boot-screen__panel' }, [
            el('div', { className: 'boot-screen__mark' }, [
                el('span', { className: 'boot-screen__ring' }),
                el('span', { className: 'boot-screen__logo', textContent: 'A' })
            ]),
            el('span', { className: 'boot-screen__brand', textContent: 'ARGUS-PR' }),
            title,
            detail,
            el('div', { className: 'boot-screen__bar' }, [bar]),
            el('div', { className: 'boot-screen__steps' }, dots),
            versions,
            warning
        ])
    ]);

    element.hidden = true;

    return {
        element,
        hide() {
            element.hidden = true;
        },
        show(phase, { currentVersion = null, targetRef = null, attempts = 0, maxAttempts = 3 } = {}) {
            const copy = PHASE_COPY[phase] ?? PHASE_COPY.reconnecting;

            element.hidden = false;
            title.textContent = copy.title;
            detail.textContent = copy.detail;

            const progress = Math.min(100, Math.round((copy.step / STEPS.length) * 100));
            bar.style.setProperty('width', `${progress}%`);

            dots.forEach((node, index) => {
                node.classList.toggle('boot-screen__step--done', index + 1 < copy.step);
                node.classList.toggle('boot-screen__step--active', index + 1 === copy.step);
            });

            const parts = [];
            if (currentVersion) parts.push(`versione installata v${currentVersion}`);
            if (targetRef) parts.push(`destinazione ${targetRef}`);
            if (phase === 'pending' && attempts > 0) parts.push(`tentativo ${attempts} di ${maxAttempts}`);
            versions.textContent = parts.join(' · ');

            const risky = phase === 'requested' || phase === 'pending';
            warning.hidden = !risky;
            element.classList.toggle('boot-screen--warn', phase === 'rolled-back' || phase === 'failed');
        }
    };
}
