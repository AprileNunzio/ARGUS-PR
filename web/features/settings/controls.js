import { el } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

function switchControl(entry, onChange) {
    const isChecked = entry.value === true;
    const label = el('span', {
        className: 'switch__label',
        textContent: isChecked ? 'Attivo' : 'Disattivo'
    });

    const input = el('input', {
        type: 'checkbox',
        className: 'switch__input',
        checked: isChecked
    });

    input.addEventListener('change', () => {
        label.textContent = input.checked ? 'Attivo' : 'Disattivo';
        onChange(input.checked);
    });

    return el('label', { className: 'switch' }, [
        input,
        el('span', { className: 'switch__track' }, [
            el('span', { className: 'switch__thumb' })
        ]),
        label
    ]);
}

function sliderControl(entry, onChange) {
    const min = entry.minimum ?? 0;
    const max = entry.maximum ?? 100;
    const step = entry.step ?? 1;
    const initial = entry.value ?? min;

    const valueBubble = el('span', {
        className: 'slider-val-badge',
        textContent: entry.unit ? `${initial} ${entry.unit}` : String(initial)
    });

    const range = el('input', {
        type: 'range',
        className: 'slider-input',
        min: String(min),
        max: String(max),
        step: String(step),
        value: String(initial)
    });

    range.addEventListener('input', () => {
        const val = Number.parseInt(range.value, 10);
        valueBubble.textContent = entry.unit ? `${val} ${entry.unit}` : String(val);
        onChange(val);
    });

    return el('div', { className: 'slider-wrap' }, [
        range,
        valueBubble
    ]);
}

function segmentedControl(entry, onChange) {
    const options = entry.options ?? [];
    const container = el('div', { className: 'segmented' });

    for (const opt of options) {
        const isActive = opt.value === entry.value;
        const btn = el('button', {
            type: 'button',
            className: isActive ? 'segmented__btn segmented__btn--active' : 'segmented__btn'
        }, [
            opt.icon ? icon(opt.icon) : null,
            el('span', { textContent: opt.label })
        ]);

        btn.addEventListener('click', () => {
            for (const sibling of container.children) {
                sibling.classList.remove('segmented__btn--active');
            }
            btn.classList.add('segmented__btn--active');
            onChange(opt.value);
        });

        container.append(btn);
    }

    return container;
}

function stepperControl(entry, onChange) {
    const min = entry.minimum ?? 0;
    const max = entry.maximum ?? 9999;
    const step = entry.step ?? 1;
    let current = entry.value ?? min;

    const display = el('span', {
        className: 'stepper__val',
        textContent: entry.unit ? `${current} ${entry.unit}` : String(current)
    });

    const minusBtn = el('button', {
        type: 'button',
        className: 'stepper__btn',
        title: 'Diminuisci'
    }, [icon('close')]);

    const plusBtn = el('button', {
        type: 'button',
        className: 'stepper__btn',
        title: 'Aumenta'
    }, [icon('plus')]);

    const update = (val) => {
        current = Math.max(min, Math.min(max, val));
        display.textContent = entry.unit ? `${current} ${entry.unit}` : String(current);
        minusBtn.disabled = current <= min;
        plusBtn.disabled = current >= max;
        onChange(current);
    };

    minusBtn.addEventListener('click', () => update(current - step));
    plusBtn.addEventListener('click', () => update(current + step));

    minusBtn.disabled = current <= min;
    plusBtn.disabled = current >= max;

    return el('div', { className: 'stepper' }, [
        minusBtn,
        display,
        plusBtn
    ]);
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

function timeControl(entry, onChange) {
    const input = el('input', {
        type: 'time',
        className: 'time-input',
        value: entry.value
    });
    input.addEventListener('change', () => onChange(input.value));
    return el('div', { className: 'time-wrap' }, [icon('clock'), input]);
}

function selectControl(entry, onChange) {
    const select = el('select', { className: 'select-input' });

    for (const option of entry.options ?? []) {
        const node = el('option', { value: String(option.value), textContent: option.label });
        if (option.value === entry.value) node.selected = true;
        select.append(node);
    }

    select.addEventListener('change', () => {
        const raw = select.value;
        const matched = (entry.options ?? []).find((opt) => String(opt.value) === raw);
        onChange(matched ? matched.value : raw);
    });

    return el('div', { className: 'select-wrap' }, [select]);
}

function tagsControl(entry, onChange, placeholder = '10.0.0.0/24') {
    let items = Array.isArray(entry.value) ? [...entry.value] : [];
    const container = el('div', { className: 'tag-box' });
    const tagsWrapper = el('div', { className: 'tag-list' });

    const input = el('input', {
        type: 'text',
        className: 'tag-input',
        placeholder: `+ Aggiungi (${placeholder})`
    });

    const renderTags = () => {
        tagsWrapper.replaceChildren();
        for (const item of items) {
            const pill = el('span', { className: 'tag-pill' }, [
                el('span', { textContent: item }),
                el('button', {
                    type: 'button',
                    className: 'tag-remove',
                    title: `Rimuovi ${item}`,
                    onclick: (e) => {
                        e.stopPropagation();
                        items = items.filter((x) => x !== item);
                        renderTags();
                        onChange(items);
                    }
                }, [icon('close')])
            ]);
            tagsWrapper.append(pill);
        }
    };

    const addCurrent = () => {
        const val = input.value.trim();
        if (val.length > 0 && !items.includes(val)) {
            items.push(val);
            input.value = '';
            renderTags();
            onChange(items);
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCurrent();
        }
    });

    input.addEventListener('blur', () => {
        addCurrent();
    });

    renderTags();
    container.append(tagsWrapper, input);
    return container;
}

export function controlFor(entry, onChange) {
    const comp = entry.component ?? entry.type;
    switch (comp) {
        case 'switch':
        case 'boolean': return switchControl(entry, onChange);
        case 'slider': return sliderControl(entry, onChange);
        case 'segmented': return segmentedControl(entry, onChange);
        case 'stepper': return stepperControl(entry, onChange);
        case 'select':
        case 'enum': return (entry.options && entry.options.length <= 4) ? segmentedControl(entry, onChange) : selectControl(entry, onChange);
        case 'days': return daysControl(entry, onChange);
        case 'time': return timeControl(entry, onChange);
        case 'tags':
        case 'cidrList':
        case 'hostList': return tagsControl(entry, onChange);
        case 'integer': return sliderControl(entry, onChange);
        default: return el('span', { className: 'muted', textContent: 'Non supportato' });
    }
}

export function isVisible(entry, values) {
    if (!entry.dependsOn) return true;
    return values[entry.dependsOn.key] === entry.dependsOn.value;
}
