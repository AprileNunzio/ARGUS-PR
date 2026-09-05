import { el, empty } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const MAX_VISIBLE = 60;

function matches(person, needle) {
    if (needle.length === 0) return true;
    const haystack = `${person.name} ${person.role ?? ''} ${person.department ?? ''}`.toLowerCase();
    return haystack.includes(needle);
}

function personRow(person, isSelected, onPick) {
    const avatar = person.photoPath
        ? el('img', { src: person.photoPath, className: 'picker-row__avatar' })
        : el('div', { className: 'picker-row__avatar picker-row__avatar--empty' }, [icon('users')]);

    const vectors = Array.isArray(person.embedding) && person.embedding.length > 0
        ? `${person.sampleCount || 1} campioni`
        : 'senza vettore';

    return el('button', {
        className: `picker-row${isSelected ? ' picker-row--on' : ''}`,
        type: 'button',
        onclick: () => onPick(person)
    }, [
        avatar,
        el('div', { className: 'picker-row__info' }, [
            el('span', { className: 'picker-row__name', textContent: person.name }),
            el('span', { className: 'section__hint mono', textContent: `${person.role ?? 'dipendente'}${person.department ? ` · ${person.department}` : ''} · ${vectors}` })
        ]),
        isSelected ? icon('check', { className: 'picker-row__check' }) : null
    ]);
}

export function createPersonPicker({ people = [], excludeId = null, selectedId = null, allowNone = false, noneLabel = 'Segna come sconosciuto' }) {
    const pool = people.filter((person) => person.id !== excludeId);
    let chosen = pool.find((person) => person.id === selectedId) ?? null;

    const searchInput = el('input', {
        className: 'input',
        type: 'search',
        placeholder: 'Cerca per nome, ruolo o reparto…',
        autocomplete: 'off'
    });

    const listHost = el('div', { className: 'picker-list' });
    const summary = el('div', { className: 'section__hint mono' });

    function paintSummary() {
        summary.textContent = chosen
            ? `Selezionata: ${chosen.name}`
            : (allowNone ? 'Nessuna persona: il transito resterà sconosciuto.' : 'Nessuna persona selezionata.');
    }

    function paintList() {
        const needle = searchInput.value.trim().toLowerCase();
        const found = pool.filter((person) => matches(person, needle));

        const rows = found.slice(0, MAX_VISIBLE).map((person) => personRow(person, chosen?.id === person.id, (picked) => {
            chosen = chosen?.id === picked.id ? null : picked;
            paintList();
            paintSummary();
        }));

        if (allowNone) {
            rows.unshift(el('button', {
                className: `picker-row picker-row--none${chosen === null ? ' picker-row--on' : ''}`,
                type: 'button',
                onclick: () => {
                    chosen = null;
                    paintList();
                    paintSummary();
                }
            }, [
                el('div', { className: 'picker-row__avatar picker-row__avatar--empty' }, [icon('close')]),
                el('div', { className: 'picker-row__info' }, [el('span', { className: 'picker-row__name', textContent: noneLabel })])
            ]));
        }

        if (rows.length === 0) {
            listHost.replaceChildren(empty('Nessuna persona corrisponde alla ricerca.'));
            return;
        }

        listHost.replaceChildren(...rows);
        if (found.length > MAX_VISIBLE) {
            listHost.append(el('div', { className: 'section__hint mono picker-list__more', textContent: `Altri ${found.length - MAX_VISIBLE} profili: affina la ricerca.` }));
        }
    }

    searchInput.addEventListener('input', paintList);
    paintList();
    paintSummary();

    const element = el('div', { className: 'stack stack--tight person-picker' }, [
        searchInput,
        listHost,
        summary
    ]);

    return {
        element,
        get value() {
            return chosen?.id ?? null;
        },
        get person() {
            return chosen;
        },
        focus() {
            searchInput.focus();
        }
    };
}
