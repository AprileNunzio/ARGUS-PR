import { el, field, chip, notice } from '/assets/dom.js';
import { icon } from '/assets/icons.js';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const SLOTS_PER_DAY = 48;
const TOTAL_SLOTS = 336;

export function renderScheduleEditor({ camera, api, onSaved, onCancel }) {
    let mode = 'continuous';
    let maskArray = Array(TOTAL_SLOTS).fill(1);
    let exceptions = [];

    const feedback = el('div', { hidden: 'hidden' });
    const saveBtn = el('button', { className: 'btn btn--primary', type: 'button', textContent: 'Salva pianificazione' });

    const modeSelect = el('select', { className: 'select' }, [
        el('option', { value: 'continuous', textContent: 'Continua (24h / 7 giorni)' }),
        el('option', { value: 'scheduled', textContent: 'Pianificata (secondo la griglia settimanale)' }),
        el('option', { value: 'motion', textContent: 'Su Movimento (conservazione selettiva eventi)' }),
        el('option', { value: 'off', textContent: 'Disattivata' })
    ]);

    const gridContainer = el('div', { className: 'schedule-grid-host' });
    const gridRows = [];

    function updateGridDisplay() {
        for (let day = 0; day < 7; day += 1) {
            for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
                const index = day * SLOTS_PER_DAY + slot;
                const cell = gridRows[day]?.[slot];
                if (cell) {
                    if (maskArray[index] === 1) {
                        cell.classList.add('schedule-cell--active');
                    } else {
                        cell.classList.remove('schedule-cell--active');
                    }
                }
            }
        }
    }

    function buildGrid() {
        gridContainer.replaceChildren();

        const table = el('div', { className: 'schedule-table' });
        const headerRow = el('div', { className: 'schedule-row schedule-row--header' }, [
            el('div', { className: 'schedule-day-label', textContent: 'Giorno' }),
            el('div', { className: 'schedule-slots-header' }, [
                el('span', { textContent: '00:00' }),
                el('span', { textContent: '06:00' }),
                el('span', { textContent: '12:00' }),
                el('span', { textContent: '18:00' }),
                el('span', { textContent: '24:00' })
            ])
        ]);
        table.append(headerRow);

        let isDragging = false;
        let dragTargetState = 1;

        window.addEventListener('mouseup', () => { isDragging = false; });

        for (let day = 0; day < 7; day += 1) {
            gridRows[day] = [];
            const cellsContainer = el('div', { className: 'schedule-cells' });

            for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
                const index = day * SLOTS_PER_DAY + slot;
                const hour = String(Math.floor(slot / 2)).padStart(2, '0');
                const min = slot % 2 === 0 ? '00' : '30';

                const cell = el('div', {
                    className: 'schedule-cell',
                    title: `${DAYS[day]} ${hour}:${min}`,
                    onmousedown: () => {
                        isDragging = true;
                        dragTargetState = maskArray[index] === 1 ? 0 : 1;
                        maskArray[index] = dragTargetState;
                        updateGridDisplay();
                    },
                    onmouseenter: () => {
                        if (isDragging) {
                            maskArray[index] = dragTargetState;
                            updateGridDisplay();
                        }
                    }
                });

                gridRows[day][slot] = cell;
                cellsContainer.append(cell);
            }

            const dayLabel = el('button', {
                className: 'schedule-day-label btn btn--sm btn--ghost',
                type: 'button',
                title: 'Clicca per alternare tutto il giorno',
                textContent: DAYS[day],
                onclick: () => {
                    const daySlots = maskArray.slice(day * SLOTS_PER_DAY, (day + 1) * SLOTS_PER_DAY);
                    const allActive = daySlots.every((v) => v === 1);
                    const nextVal = allActive ? 0 : 1;
                    for (let s = 0; s < SLOTS_PER_DAY; s += 1) {
                        maskArray[day * SLOTS_PER_DAY + s] = nextVal;
                    }
                    updateGridDisplay();
                }
            });

            const dayRow = el('div', { className: 'schedule-row' }, [
                dayLabel,
                cellsContainer
            ]);
            table.append(dayRow);
        }

        const presetsRow = el('div', { className: 'row row--wrap schedule-presets' }, [
            el('button', {
                className: 'btn btn--sm',
                type: 'button',
                textContent: 'Tutto attivo (24/7)',
                onclick: () => { maskArray.fill(1); updateGridDisplay(); }
            }),
            el('button', {
                className: 'btn btn--sm',
                type: 'button',
                textContent: 'Tutto disattivo',
                onclick: () => { maskArray.fill(0); updateGridDisplay(); }
            }),
            el('button', {
                className: 'btn btn--sm',
                type: 'button',
                textContent: 'Ufficio (Lun-Ven 08-18)',
                onclick: () => {
                    maskArray.fill(0);
                    for (let day = 1; day <= 5; day += 1) {
                        for (let slot = 16; slot < 36; slot += 1) {
                            maskArray[day * SLOTS_PER_DAY + slot] = 1;
                        }
                    }
                    updateGridDisplay();
                }
            }),
            el('button', {
                className: 'btn btn--sm',
                type: 'button',
                textContent: 'Notturno (Tutti 20-06)',
                onclick: () => {
                    maskArray.fill(0);
                    for (let day = 0; day < 7; day += 1) {
                        for (let slot = 0; slot < 12; slot += 1) maskArray[day * SLOTS_PER_DAY + slot] = 1;
                        for (let slot = 40; slot < 48; slot += 1) maskArray[day * SLOTS_PER_DAY + slot] = 1;
                    }
                    updateGridDisplay();
                }
            }),
            el('button', {
                className: 'btn btn--sm',
                type: 'button',
                textContent: 'Fine settimana (Sab-Dom 24h)',
                onclick: () => {
                    maskArray.fill(0);
                    for (let s = 0; s < SLOTS_PER_DAY; s += 1) {
                        maskArray[0 * SLOTS_PER_DAY + s] = 1;
                        maskArray[6 * SLOTS_PER_DAY + s] = 1;
                    }
                    updateGridDisplay();
                }
            })
        ]);

        gridContainer.append(presetsRow, table);
        updateGridDisplay();
    }

    modeSelect.onchange = () => {
        mode = modeSelect.value;
        if (mode === 'scheduled') {
            gridContainer.removeAttribute('hidden');
        } else {
            gridContainer.setAttribute('hidden', 'hidden');
        }
    };

    const exceptionsContainer = el('div', { className: 'stack' });

    function renderExceptionsList() {
        exceptionsContainer.replaceChildren();
        if (exceptions.length === 0) {
            exceptionsContainer.append(el('div', { className: 'section__hint', textContent: 'Nessuna eccezione configurata.' }));
            return;
        }

        for (const ex of exceptions) {
            const item = el('div', { className: 'device-row' }, [
                el('div', {}, [
                    el('strong', { textContent: ex.day }),
                    el('span', { className: 'section__hint', textContent: ` · ${ex.mode} ${ex.note ? `(${ex.note})` : ''}` })
                ]),
                el('button', {
                    className: 'btn btn--sm btn--danger',
                    type: 'button',
                    textContent: 'Rimuovi',
                    onclick: async () => {
                        await api.remove(`/api/cameras/${camera.id}/schedule/exceptions/${ex.day}`);
                        exceptions = exceptions.filter((e) => e.day !== ex.day);
                        renderExceptionsList();
                    }
                })
            ]);
            exceptionsContainer.append(item);
        }
    }

    const exDayInput = el('input', { className: 'input', type: 'date' });
    const exModeSelect = el('select', { className: 'select' }, [
        el('option', { value: 'continuous', textContent: 'Continua' }),
        el('option', { value: 'off', textContent: 'Disattivata' }),
        el('option', { value: 'motion', textContent: 'Su Movimento' })
    ]);
    const exNoteInput = el('input', { className: 'input', type: 'text', placeholder: 'Motivo (es. Festività)' });
    const addExBtn = el('button', {
        className: 'btn btn--sm',
        type: 'button',
        textContent: 'Aggiungi eccezione',
        onclick: async () => {
            if (!exDayInput.value) return;
            const res = await api.post(`/api/cameras/${camera.id}/schedule/exceptions`, {
                day: exDayInput.value,
                mode: exModeSelect.value,
                note: exNoteInput.value || undefined
            }).catch((err) => ({ error: err.message }));

            if (res?.exception) {
                exceptions.push(res.exception);
                renderExceptionsList();
                exDayInput.value = '';
                exNoteInput.value = '';
            }
        }
    });

    const exForm = el('div', { className: 'row row--wrap' }, [
        field('Data eccezione', exDayInput),
        field('Modalità', exModeSelect),
        field('Nota', exNoteInput),
        el('div', { className: 'field' }, [el('label', { className: 'field__label', textContent: '\u00A0' }), addExBtn])
    ]);

    saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        feedback.setAttribute('hidden', 'hidden');

        const weekMask = maskArray.map(String).join('');
        const res = await api.put(`/api/cameras/${camera.id}/schedule`, {
            mode,
            weekMask
        }).then(() => null).catch((err) => err);

        saveBtn.disabled = false;
        if (res instanceof Error) {
            feedback.replaceChildren(notice('error', res.message));
            feedback.removeAttribute('hidden');
            return;
        }

        onSaved();
    };

    api.get(`/api/cameras/${camera.id}/schedule`).then(({ schedule, exceptions: exList }) => {
        if (schedule) {
            mode = schedule.mode;
            modeSelect.value = mode;
            if (schedule.weekMask && schedule.weekMask.length === TOTAL_SLOTS) {
                maskArray = schedule.weekMask.split('').map(Number);
            }
        }
        exceptions = exList ?? [];
        buildGrid();
        renderExceptionsList();
        if (mode !== 'scheduled') gridContainer.setAttribute('hidden', 'hidden');
    }).catch(() => {
        buildGrid();
        renderExceptionsList();
    });

    return el('section', { className: 'panel' }, [
        el('div', { className: 'panel__head' }, [
            el('span', { className: 'panel__title', textContent: `Pianificazione oraria: ${camera.name}` })
        ]),
        el('div', { className: 'panel__body stack' }, [
            field('Modalità di registrazione', modeSelect),
            gridContainer,
            el('hr', { className: 'divider' }),
            el('div', { className: 'section__title' }, [icon('calendar'), el('span', { textContent: 'Eccezioni di calendario' })]),
            exForm,
            exceptionsContainer,
            feedback,
            el('div', { className: 'row row--end' }, [
                el('button', { className: 'btn', type: 'button', textContent: 'Chiudi', onclick: onCancel }),
                saveBtn
            ])
        ])
    ]);
}
