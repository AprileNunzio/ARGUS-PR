import { api } from '/assets/api.js';
import { el, brandMark, notice } from '/assets/dom.js';
import { welcomeStep, accountStep, mediaStep, storageStep, reviewStep } from './setup_steps.js';

export function renderSetup({ status, onComplete }) {
    const state = {
        username: 'admin',
        password: '',
        passwordConfirm: '',
        media: status.media
    };

    let index = 0;

    const railList = el('ol', { className: 'wizard__rail' });
    const stage = el('div', { className: 'wizard__stage' });
    const feedback = el('div', {});

    const back = el('button', { className: 'btn', type: 'button', textContent: 'Indietro' });
    const next = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Continua' });

    const steps = [
        welcomeStep({ status }),
        accountStep({ state }),
        mediaStep({ state, onStatusChange: () => renderRail() }),
        storageStep({ status }),
        reviewStep({ state, status })
    ];

    function renderRail() {
        railList.replaceChildren(...steps.map((step, position) => {
            const stateName = position === index ? 'current' : (position < index ? 'done' : 'todo');
            return el('li', { className: `wizard__step wizard__step--${stateName}` }, [
                el('span', { className: 'wizard__marker', textContent: position < index ? '✓' : String(position + 1) }),
                el('span', { className: 'wizard__label' }, [
                    el('strong', { textContent: step.title }),
                    el('span', { textContent: step.summary })
                ])
            ]);
        }));
    }

    function renderStage() {
        const step = steps[index];
        step.onEnter?.();

        stage.replaceChildren(
            el('div', { className: 'wizard__heading' }, [
                el('span', { className: 'wizard__counter', textContent: `Passo ${index + 1} di ${steps.length}` }),
                el('h2', { className: 'wizard__title', textContent: step.title })
            ]),
            step.body
        );

        back.disabled = index === 0;
        next.textContent = index === steps.length - 1 ? 'Completa configurazione' : 'Continua';
        feedback.replaceChildren();
        renderRail();
    }

    back.addEventListener('click', () => {
        if (index === 0) return;
        index -= 1;
        renderStage();
    });

    next.addEventListener('click', async () => {
        if (!steps[index].validate()) return;

        if (index < steps.length - 1) {
            index += 1;
            renderStage();
            return;
        }

        next.disabled = true;
        next.textContent = 'Creazione account…';

        const outcome = await api.post('/api/setup/claim', {
            username: state.username,
            password: state.password,
            passwordConfirm: state.passwordConfirm
        }).then(() => null).catch((error) => error);

        next.disabled = false;
        next.textContent = 'Completa configurazione';

        if (outcome) {
            const problems = outcome.details?.problems;
            feedback.replaceChildren(notice('error',
                problems ? `${outcome.message}: ${problems.join(', ')}` : outcome.message));
            return;
        }

        await onComplete();
    });

    renderStage();

    return el('div', { className: 'wizard' }, [
        el('aside', { className: 'wizard__aside' }, [
            el('div', { className: 'wizard__brand' }, [
                brandMark(),
                el('div', {}, [
                    el('strong', { textContent: 'ARGUS-PR' }),
                    el('span', { className: 'wizard__brandsub', textContent: 'Configurazione iniziale' })
                ])
            ]),
            railList
        ]),
        el('section', { className: 'wizard__main' }, [
            stage,
            el('div', { className: 'wizard__actions' }, [
                feedback,
                el('div', { className: 'row row--end' }, [back, next])
            ])
        ])
    ]);
}
