import { el } from '/assets/dom.js';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

function booleanControl(entry, onChange) {
    const input = el('input', { type: 'checkbox', checked: entry.value === true });
    input.addEventListener('change', () => onChange(input.checked));

    return el('label', { className: 'toggle' }, [
        input,
        el('span', { className: 'toggle__track' }, [el('span', { className: 'toggle__thumb' })]),
        el('span', { className: 'toggle__text', textContent: entry.value ? 'Attivo' : 'Disattivo' })
    ]);
}

function integerControl(entry, onChange) {
    const input = el('input', {
        type: 'number',
        value: String(entry.value),
        min: entry.minimum === null ? undefined : String(entry.minimum),
        max: entry.maximum === null ? undefined : String(entry.maximum)
    });

    input.addEventListener('change', () => onChange(Number.parseInt(input.value, 10)));

    return entry.unit
        ? el('div', { className: 'control control--unit' }, [input, el('span', { className: 'control__unit', textContent: entry.unit })])
        : input;
}

function enumControl(entry, onChange) {
    const select = el('select');

    for (const option of entry.options ?? []) {
        const node = el('option', { value: option.value, textContent: option.label });
        if (option.value === entry.value) node.selected = true;
        select.append(node);
    }

    select.addEventListener('change', () => onChange(select.value));
    return select;
}

function timeControl(entry, onChange) {
    const input = el('input', { type: 'time', value: entry.value });
    input.addEventListener('change', () => onChange(input.value));
    return input;
}

function daysControl(entry, onChange) {
    const selected = new Set(entry.value ?? []);
    const wrapper = el('div', { className: 'daypicker' });

    for (let day = 0; day < 7; day += 1) {
        const active = selected.has(day);
        const button = el('button', {
            type: 'button',
            className: active ? 'daypicker__day daypicker__day--on' : 'daypicker__day',
            textContent: DAY_LABELS[day]
        });

        button.addEventListener('click', () => {
            if (selected.has(day)) selected.delete(day);
            else selected.add(day);

            button.className = selected.has(day) ? 'daypicker__day daypicker__day--on' : 'daypicker__day';
            onChange([...selected].sort((a, b) => a - b));
        });

        wrapper.append(button);
    }

    return wrapper;
}

function listControl(entry, onChange, placeholder) {
    const input = el('input', {
        type: 'text',
        value: (entry.value ?? []).join(', '),
        placeholder
    });

    input.addEventListener('change', () => {
        onChange(input.value.split(',').map((item) => item.trim()).filter((item) => item.length > 0));
    });

    return input;
}

export function controlFor(entry, onChange) {
    switch (entry.type) {
        case 'boolean': return booleanControl(entry, onChange);
        case 'integer': return integerControl(entry, onChange);
        case 'enum': return enumControl(entry, onChange);
        case 'time': return timeControl(entry, onChange);
        case 'days': return daysControl(entry, onChange);
        case 'cidrList': return listControl(entry, onChange, '10.8.0.0/24, 192.168.10.0/24');
        case 'hostList': return listControl(entry, onChange, 'nvr.esempio.it');
        default: return el('span', { className: 'muted', textContent: 'Tipo non supportato' });
    }
}

export function isVisible(entry, values) {
    if (!entry.dependsOn) return true;
    return values[entry.dependsOn.key] === entry.dependsOn.value;
}
