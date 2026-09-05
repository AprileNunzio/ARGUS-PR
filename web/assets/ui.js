import { el } from './dom.js';
import { icon } from './icons.js';

export function card({ title, subtitle, iconName, tone = 'blue', badge = null, actions = [], body = [], footer = null }) {
    return el('section', { className: `xcard xcard--${tone} rise` }, [
        el('header', { className: 'xcard__head' }, [
            el('span', { className: `xcard__icon xcard__icon--${tone}` }, [icon(iconName ?? 'settings', { className: 'icon--lg' })]),
            el('div', { className: 'xcard__titles' }, [
                el('h2', { className: 'xcard__title', textContent: title }),
                subtitle ? el('p', { className: 'xcard__subtitle', textContent: subtitle }) : null
            ]),
            badge,
            actions.length > 0 ? el('div', { className: 'xcard__actions' }, actions) : null
        ]),
        el('div', { className: 'xcard__body' }, body),
        footer ? el('footer', { className: 'xcard__foot' }, footer) : null
    ]);
}

export function segmented(options, value, onChange, { compact = false } = {}) {
    const container = el('div', { className: compact ? 'xseg xseg--compact' : 'xseg' });

    for (const option of options) {
        const button = el('button', {
            type: 'button',
            className: option.value === value ? 'xseg__btn xseg__btn--on' : 'xseg__btn',
            title: option.hint ?? option.label
        }, [
            option.icon ? icon(option.icon) : null,
            el('span', { textContent: option.label })
        ]);

        button.addEventListener('click', () => {
            for (const sibling of container.children) sibling.classList.remove('xseg__btn--on');
            button.classList.add('xseg__btn--on');
            onChange(option.value);
        });

        container.append(button);
    }

    return container;
}

export function toggle(checked, onChange, labels = ['Attivo', 'Disattivo']) {
    const input = el('input', { type: 'checkbox', className: 'switch__input', checked });
    const label = el('span', { className: 'switch__label', textContent: checked ? labels[0] : labels[1] });

    input.addEventListener('change', () => {
        label.textContent = input.checked ? labels[0] : labels[1];
        onChange(input.checked);
    });

    return el('label', { className: 'switch' }, [
        input,
        el('span', { className: 'switch__track' }, [el('span', { className: 'switch__thumb' })]),
        label
    ]);
}

export function optionRow({ title, hint, iconName, control, tone = null }) {
    return el('div', { className: tone ? `xrow xrow--${tone}` : 'xrow' }, [
        iconName ? el('span', { className: 'xrow__icon' }, [icon(iconName)]) : null,
        el('div', { className: 'xrow__info' }, [
            el('span', { className: 'xrow__title', textContent: title }),
            hint ? el('span', { className: 'xrow__hint', textContent: hint }) : null
        ]),
        el('div', { className: 'xrow__control' }, [control])
    ]);
}

export function metricTile({ label, value, hint, iconName, tone = 'blue' }) {
    return el('div', { className: `xtile xtile--${tone}` }, [
        el('span', { className: 'xtile__icon' }, [icon(iconName ?? 'activity', { className: 'icon--lg' })]),
        el('div', { className: 'xtile__body' }, [
            el('span', { className: 'xtile__value', textContent: value }),
            el('span', { className: 'xtile__label', textContent: label }),
            hint ? el('span', { className: 'xtile__hint', textContent: hint }) : null
        ])
    ]);
}

export function statusDot(tone) {
    return el('span', { className: `xdot xdot--${tone}` });
}

export function tabsBar(items, activeId, onSelect) {
    return el('div', { className: 'xtabs' }, items.map((item) => el('button', {
        type: 'button',
        className: item.id === activeId ? 'xtabs__btn xtabs__btn--on' : 'xtabs__btn',
        onclick: () => onSelect(item.id)
    }, [
        icon(item.icon ?? 'apps'),
        el('span', { textContent: item.label }),
        item.count === undefined ? null : el('span', { className: 'xtabs__count', textContent: String(item.count) })
    ])));
}
