
let allBookings = [];
let selectedBooking = null;

document.addEventListener('DOMContentLoaded', () => {
    checkManagerAuth();
    loadManagerData();
    setupManagerEvents();
});

function checkManagerAuth() {
    const user = getCurrentUser();
    if (!user || !['manager', 'admin'].includes(user.role)) {
        alert('Доступ ограничен. Требуются права менеджера.');
        window.location.href = 'index.html';
        return;
    }
    const nameEl = document.getElementById('manager-name-display'); if (nameEl) nameEl.textContent = user.name;

    const navAdmin = document.getElementById('nav-admin-link');
    if (navAdmin) navAdmin.style.display = (user.role === 'admin') ? 'inline-block' : 'none';
}

function getCurrentUser() {
    try {
        const u = localStorage.getItem('rentpro_user');
        return u ? JSON.parse(u) : null;
    } catch (_) { return null; }
}

async function loadManagerData() {
    try {
        const res = await fetch('/api/bookings');
        allBookings = await res.json();
        updateManagerKPI();
        renderManagerTable(allBookings);
    } catch (err) {
        console.error(err);
        showToast('Ошибка загрузки данных', 'error');
    }
}

function updateManagerKPI() {
    let pendingCount = 0;
    let confirmedCount = 0;
    let activeCount = 0;
    let overdueCount = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    for (const b of allBookings) {
        if (b.status === 'pending') pendingCount++;
        else if (b.status === 'confirmed') confirmedCount++;
        else if (b.status === 'active') {
            activeCount++;
            if (b.end_date < todayStr) overdueCount++;
        } else if (b.status === 'overdue') overdueCount++;
    }

    document.getElementById('kpi-pending').textContent = pendingCount;
    document.getElementById('kpi-confirmed').textContent = confirmedCount;
    document.getElementById('kpi-active').textContent = activeCount;
    document.getElementById('kpi-overdue').textContent = overdueCount;
}

function renderManagerTable(list) {
    const tbody = document.getElementById('manager-table-body');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">Бронирования не найдены</td></tr>`;
        return;
    }

    const statusMap = {
        'pending': { text: 'Ожидает', class: 'status-pending' },
        'confirmed': { text: 'Подтверждено', class: 'status-confirmed' },
        'active': { text: 'В аренде', class: 'status-active' },
        'completed': { text: 'Возвращено', class: 'status-completed' },
        'overdue': { text: 'Просрочено', class: 'status-overdue' },
        'cancelled': { text: 'Отменено', class: 'status-cancelled' }
    };

    const todayStr = new Date().toISOString().split('T')[0];

    tbody.innerHTML = list.map(b => {
        let isOverdue = b.status === 'active' && b.end_date < todayStr;
        let sInfo = statusMap[b.status] || { text: b.status, class: 'status-pending' };
        if (isOverdue) sInfo = { text: 'Просрочено', class: 'status-overdue' };

        let actions = `
            <button onclick="fetchAndPrint('${b.id}')" class="btn btn-secondary btn-sm" title="Печать">Печать</button>
        `;

        if (b.status === 'pending') {
            actions += `
                <button onclick="handleConfirmBooking('${b.id}')" class="btn btn-secondary btn-sm" style="color: var(--accent-cyan);">Подтвердить</button>
                <button onclick="openPickupModal('${b.id}')" class="btn btn-primary btn-sm">Выдать</button>
            `;
        } else if (b.status === 'confirmed') {
            actions += `
                <button onclick="openPickupModal('${b.id}')" class="btn btn-primary btn-sm">Выдать</button>
            `;
        } else if (b.status === 'active' || isOverdue) {
            actions += `
                <button onclick="openReturnModal('${b.id}')" class="btn btn-primary btn-sm">Принять</button>
            `;
        }

        return `
            <tr>
                <td><strong style="color: var(--accent-emerald); font-family: var(--font-heading);">${b.id}</strong></td>
                <td>
                    <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(b.client_name)}</div>
                    <div style="font-size: 0.76rem; color: var(--text-muted);">${escapeHtml(b.client_phone)}</div>
                </td>
                <td>
                    <div><strong>${escapeHtml(b.equipment_title)}</strong></div>
                    <div style="font-size: 0.76rem; color: var(--text-muted);">${b.equipment_category}</div>
                </td>
                <td>
                    <span style="font-family: monospace; font-weight: 600;">${b.inventory_number || '—'}</span>
                </td>
                <td>
                    <div>${b.start_date} — ${b.end_date}</div>
                    <div style="font-size: 0.76rem; color: var(--text-muted);">${b.days_count} сут.</div>
                </td>
                <td>
                    <div><strong>${b.total_cost} ₽</strong></div>
                    <div style="font-size: 0.76rem; color: var(--text-muted);">Залог: ${b.deposit_amount} ₽</div>
                </td>
                <td>
                    <span class="status-pill ${sInfo.class}">${sInfo.text}</span>
                </td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        ${actions}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function handleConfirmBooking(bookingId) {
    const user = getCurrentUser();
    try {
        const res = await fetch(`/api/bookings/${bookingId}/confirm`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ managerName: user ? user.name : 'Менеджер' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast(`Бронирование ${bookingId} подтверждено`);
        loadManagerData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function openPickupModal(bookingId) {
    try {
        const res = await fetch(`/api/bookings/${bookingId}`);
        selectedBooking = await res.json();
        if (!res.ok) throw new Error(selectedBooking.error);

        document.getElementById('pickup-modal-id').textContent = selectedBooking.id;
        document.getElementById('pickup-modal-client').textContent = `${selectedBooking.client_name} (${selectedBooking.client_phone})`;
        document.getElementById('pickup-modal-equipment').textContent = selectedBooking.equipment_title;

        const eqRes = await fetch(`/api/equipment/${selectedBooking.equipment_id}`);
        const eqData = await eqRes.json();

        const unitSelect = document.getElementById('pickup-unit-select');
        const availableUnits = (eqData.units || []).filter(u => u.status === 'available');

        if (availableUnits.length === 0) {
            unitSelect.innerHTML = `<option value="">Нет свободных единиц на складе</option>`;
            document.getElementById('pickup-submit-btn').disabled = true;
        } else {
            unitSelect.innerHTML = availableUnits.map(u => `
                <option value="${u.id}">${u.inventory_number} (SN: ${u.serial_number}) • ${u.condition_note}</option>
            `).join('');
            document.getElementById('pickup-submit-btn').disabled = false;
        }

        openModal('pickup-modal');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function submitPickupForm(e) {
    e.preventDefault();
    if (!selectedBooking) return;
    const user = getCurrentUser();

    const unitId = document.getElementById('pickup-unit-select').value;
    const condition = document.getElementById('pickup-condition-note').value;

    if (!unitId) {
        showToast('Выберите единицу инвентаря для выдачи', 'error');
        return;
    }

    try {
        const res = await fetch(`/api/bookings/${selectedBooking.id}/pickup`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inventoryUnitId: unitId,
                managerId: user ? user.id : null,
                managerName: user ? user.name : 'Менеджер',
                pickupCondition: condition
            })
        });

        const updated = await res.json();
        if (!res.ok) throw new Error(updated.error);

        closeModal('pickup-modal');
        showToast(`Инвентарь по брони ${selectedBooking.id} выдан`);
        loadManagerData();

        if (confirm('Распечатать Акт приёма-передачи оборудования?')) {
            printRentalContract(updated);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function openReturnModal(bookingId) {
    try {
        const res = await fetch(`/api/bookings/${bookingId}`);
        selectedBooking = await res.json();
        if (!res.ok) throw new Error(selectedBooking.error);

        document.getElementById('return-modal-id').textContent = selectedBooking.id;
        document.getElementById('return-modal-client').textContent = `${selectedBooking.client_name} (${selectedBooking.client_phone})`;
        document.getElementById('return-modal-equipment').textContent = `${selectedBooking.equipment_title} [${selectedBooking.inventory_number || 'б/н'}]`;
        document.getElementById('return-modal-planned-end').textContent = selectedBooking.end_date;

        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById('return-actual-date').value = todayStr;
        document.getElementById('return-severity').value = 'none';
        document.getElementById('return-custom-fine').value = 0;
        document.getElementById('return-condition-note').value = 'Инвентарь сдан в исправном состоянии';

        calculateReturnFineBreakdown();
        openModal('return-modal');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function calculateReturnFineBreakdown() {
    if (!selectedBooking) return;

    const plannedEnd = new Date(selectedBooking.end_date);
    const actualDateVal = document.getElementById('return-actual-date').value;
    const actualEnd = new Date(actualDateVal);

    let lateDays = 0;
    let lateFine = 0;

    if (actualEnd > plannedEnd) {
        const diffMs = actualEnd.getTime() - plannedEnd.getTime();
        lateDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        lateFine = Math.round(lateDays * selectedBooking.daily_rate * 1.5);
    }

    const severity = document.getElementById('return-severity').value;
    let damageFine = 0;
    if (severity === 'cleaning') damageFine = 500;
    else if (severity === 'minor_damage') damageFine = 1500;
    else if (severity === 'major_damage') damageFine = 3500;
    else if (severity === 'lost') damageFine = selectedBooking.deposit_amount;

    const customFine = Number(document.getElementById('return-custom-fine').value) || 0;
    const finalDamageFine = customFine > 0 ? customFine : damageFine;

    const totalFines = lateFine + finalDamageFine;
    const deposit = selectedBooking.deposit_amount;
    const refund = Math.max(0, deposit - totalFines);

    document.getElementById('ret-calc-late-days').textContent = `${lateDays} дн.`;
    document.getElementById('ret-calc-late-fine').textContent = `${lateFine} ₽`;
    document.getElementById('ret-calc-damage-fine').textContent = `${finalDamageFine} ₽`;
    document.getElementById('ret-calc-total-fines').textContent = `${totalFines} ₽`;
    document.getElementById('ret-calc-deposit').textContent = `${deposit} ₽`;

    const refundEl = document.getElementById('ret-calc-refund');
    refundEl.textContent = `${refund} ₽`;
    if (refund < deposit) {
        refundEl.style.color = 'var(--accent-amber)';
    } else {
        refundEl.style.color = 'var(--accent-emerald)';
    }
}

async function submitReturnForm(e) {
    e.preventDefault();
    if (!selectedBooking) return;
    const user = getCurrentUser();

    const actualDate = document.getElementById('return-actual-date').value;
    const severity = document.getElementById('return-severity').value;
    const conditionNote = document.getElementById('return-condition-note').value;
    const customFine = document.getElementById('return-custom-fine').value;

    try {
        const res = await fetch(`/api/bookings/${selectedBooking.id}/return`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                actualReturnDate: actualDate,
                returnCondition: conditionNote,
                conditionSeverity: severity,
                customDamageFine: customFine,
                managerName: user ? user.name : 'Менеджер'
            })
        });

        const updated = await res.json();
        if (!res.ok) throw new Error(updated.error);

        closeModal('return-modal');
        showToast(`Инвентарь по брони ${selectedBooking.id} принят на склад`);
        loadManagerData();

        if (confirm('Распечатать Акт возврата со штрафным расчётом?')) {
            printRentalContract(updated);
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function setupManagerEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            const todayStr = new Date().toISOString().split('T')[0];

            if (filter === 'all') {
                renderManagerTable(allBookings);
            } else if (filter === 'overdue') {
                renderManagerTable(allBookings.filter(b => b.status === 'overdue' || (b.status === 'active' && b.end_date < todayStr)));
            } else {
                renderManagerTable(allBookings.filter(b => b.status === filter));
            }
        });
    });

    const searchInput = document.getElementById('manager-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().trim();
            if (!q) {
                renderManagerTable(allBookings);
                return;
            }
            const filtered = allBookings.filter(b =>
                b.id.toLowerCase().includes(q) ||
                b.client_name.toLowerCase().includes(q) ||
                b.client_phone.includes(q) ||
                b.equipment_title.toLowerCase().includes(q)
            );
            renderManagerTable(filtered);
        });
    }

    ['return-actual-date', 'return-severity', 'return-custom-fine'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', calculateReturnFineBreakdown);
        if (el) el.addEventListener('input', calculateReturnFineBreakdown);
    });

    const pickupForm = document.getElementById('pickup-form');
    if (pickupForm) pickupForm.addEventListener('submit', submitPickupForm);

    const returnForm = document.getElementById('return-form');
    if (returnForm) returnForm.addEventListener('submit', submitReturnForm);
}

async function fetchAndPrint(bookingId) {
    try {
        const res = await fetch(`/api/bookings/${bookingId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        printRentalContract(data);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function handleLogout() {
    localStorage.removeItem('rentpro_user');
    window.location.href = 'index.html';
}

function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
    }, 3000);
}

window.openPickupModal = openPickupModal;
window.openReturnModal = openReturnModal;
window.handleConfirmBooking = handleConfirmBooking;
window.fetchAndPrint = fetchAndPrint;
window.handleLogout = handleLogout;
window.openModal = openModal;
window.closeModal = closeModal;
