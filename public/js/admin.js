

let chartRevenue = null;
let chartCategories = null;
let chartInventory = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    loadAnalytics();
    setupAdminTabs();
    loadCatalog();
    loadInventory();
    loadFines();
    loadUsers();
    loadAllBookings();
    setupAdminForms();
});

function checkAdminAuth() {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
        alert('Доступ в панель администратора разрешён только администраторам.');
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('admin-name-display').textContent = user.name;

    const navManager = document.getElementById('nav-manager-link');
    if (navManager) navManager.style.display = (user.role === 'manager') ? 'inline-block' : 'none';
}

function getCurrentUser() {
    try {
        const u = localStorage.getItem('rentpro_user');
        return u ? JSON.parse(u) : null;
    } catch (_) { return null; }
}

async function loadAnalytics() {
    try {
        const res = await fetch('/api/analytics');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const k = data.kpi;
        document.getElementById('kpi-total-revenue').textContent = `${(k.totalRevenue || 0).toLocaleString()} ₽`;
        document.getElementById('kpi-rental-revenue').textContent = `${(k.rentalRevenue || 0).toLocaleString()} ₽`;
        document.getElementById('kpi-fines-revenue').textContent = `${(k.finesRevenue || 0).toLocaleString()} ₽`;
        document.getElementById('kpi-active-bookings').textContent = k.activeBookings || 0;
        document.getElementById('kpi-utilization-rate').textContent = `${k.utilizationRate || 0}%`;
        document.getElementById('kpi-maintenance-units').textContent = k.maintenanceUnits || 0;

        renderCharts(data);
    } catch (err) {
        console.error(err);
        showToast('Ошибка загрузки аналитики', 'error');
    }
}

function renderCharts(data) {
    if (typeof Chart === 'undefined') return;

    
    const ctxRevenue = document.getElementById('chart-revenue')?.getContext('2d');
    if (ctxRevenue) {
        if (chartRevenue) chartRevenue.destroy();
        const labels = data.dailyStats.map(d => d.date);
        const rentalData = data.dailyStats.map(d => d.rental_revenue);
        const finesData = data.dailyStats.map(d => d.fines_revenue);

        chartRevenue = new Chart(ctxRevenue, {
            type: 'line',
            data: {
                labels: labels.length > 0 ? labels : ['Сегодня'],
                datasets: [
                    {
                        label: 'Выручка от аренды (₽)',
                        data: rentalData.length > 0 ? rentalData : [0],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 5
                    },
                    {
                        label: 'Штрафы и компенсации (₽)',
                        data: finesData.length > 0 ? finesData : [0],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 5
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#f8fafc', font: { family: 'Inter' } } }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }

    
    const ctxCat = document.getElementById('chart-categories')?.getContext('2d');
    if (ctxCat) {
        if (chartCategories) chartCategories.destroy();
        const catLabels = data.categoryStats.map(c => c.category);
        const catCounts = data.categoryStats.map(c => c.bookings_count);

        chartCategories = new Chart(ctxCat, {
            type: 'doughnut',
            data: {
                labels: catLabels,
                datasets: [{
                    data: catCounts,
                    backgroundColor: ['#38bdf8', '#10b981', '#f59e0b'],
                    borderColor: '#090d16',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Inter' } } }
                }
            }
        });
    }

    
    const ctxInv = document.getElementById('chart-inventory')?.getContext('2d');
    if (ctxInv) {
        if (chartInventory) chartInventory.destroy();
        const s = data.inventoryStatus;
        chartInventory = new Chart(ctxInv, {
            type: 'pie',
            data: {
                labels: ['В наличии', 'В аренде', 'На ТО / Ремонте', 'Списано'],
                datasets: [{
                    data: [s.available, s.rented, s.maintenance, s.decommissioned],
                    backgroundColor: ['#10b981', '#06b6d4', '#f59e0b', '#f43f5e'],
                    borderColor: '#090d16',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#f8fafc', font: { family: 'Inter' } } }
                }
            }
        });
    }
}

async function loadCatalog() {
    try {
        const res = await fetch('/api/equipment');
        const equipment = await res.json();
        const tbody = document.getElementById('admin-catalog-tbody');
        if (!tbody) return;

        tbody.innerHTML = equipment.map(item => `
            <tr>
                <td><strong>#${item.id}</strong></td>
                <td>
                    <div style="font-weight: 600;">${escapeHtml(item.title)}</div>
                    <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(item.description || '')}</div>
                </td>
                <td><span class="status-pill status-confirmed">${item.category}</span></td>
                <td><strong>${item.daily_rate} ₽</strong></td>
                <td>${item.deposit} ₽</td>
                <td>
                    <span style="color: var(--accent-emerald); font-weight: 600;">${item.stock.available}</span> / ${item.stock.total} шт.
                </td>
                <td>
                    <div style="display: flex; gap: 6px;">
                        <button onclick="handleEditEquipment(${item.id})" class="btn btn-secondary btn-sm" title="Редактировать">Изм.</button>
                        <button onclick="handleDeleteEquipment(${item.id})" class="btn btn-danger btn-sm" title="Удалить">Удалить</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function handleEditEquipment(id) {
    try {
        const res = await fetch(`/api/equipment/${id}`);
        const eq = await res.json();
        if (!res.ok) throw new Error(eq.error);

        document.getElementById('eq-modal-mode').value = 'edit';
        document.getElementById('eq-modal-id').value = eq.id;
        document.getElementById('eq-form-title').value = eq.title;
        document.getElementById('eq-form-category').value = eq.category;
        document.getElementById('eq-form-rate').value = eq.daily_rate;
        document.getElementById('eq-form-deposit').value = eq.deposit;
        document.getElementById('eq-form-desc').value = eq.description || '';
        document.getElementById('eq-form-image').value = eq.image || 'drill.svg';
        document.getElementById('eq-form-specs').value = JSON.stringify(eq.specs || {}, null, 2);

        document.getElementById('equipment-modal-title').textContent = `Редактирование: ${eq.title}`;
        openModal('equipment-modal');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleDeleteEquipment(id) {
    if (!confirm(`Удалить модель #${id} из каталога? Все связанные единицы инвентаря будут удалены.`)) return;
    try {
        const res = await fetch(`/api/equipment/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Ошибка удаления');
        showToast('Оборудование удалено');
        loadCatalog();
        loadInventory();
        loadAnalytics();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function openAddEquipmentModal() {
    document.getElementById('eq-modal-mode').value = 'create';
    document.getElementById('eq-modal-id').value = '';
    document.getElementById('equipment-form').reset();
    document.getElementById('equipment-modal-title').textContent = 'Добавление нового оборудования в каталог';
    openModal('equipment-modal');
}

async function loadInventory() {
    try {
        const res = await fetch('/api/inventory');
        const units = await res.json();
        const tbody = document.getElementById('admin-inventory-tbody');
        if (!tbody) return;

        const statusMap = {
            'available': { text: 'На складе (доступно)', class: 'status-active' },
            'rented': { text: 'В аренде', class: 'status-confirmed' },
            'maintenance': { text: 'На ТО / в ремонте', class: 'status-pending' },
            'decommissioned': { text: 'Списано', class: 'status-cancelled' }
        };

        tbody.innerHTML = units.map(u => {
            const sInfo = statusMap[u.status] || { text: u.status, class: 'status-pending' };
            return `
                <tr>
                    <td><strong style="font-family: monospace; color: var(--accent-emerald);">${u.inventory_number}</strong></td>
                    <td><span style="font-family: monospace; font-size: 0.82rem;">${u.serial_number}</span></td>
                    <td>
                        <div><strong>${escapeHtml(u.equipment_title)}</strong></div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">${u.equipment_category}</div>
                    </td>
                    <td><span class="status-pill ${sInfo.class}">${sInfo.text}</span></td>
                    <td>${escapeHtml(u.condition_note || 'Отличное')}</td>
                    <td>${escapeHtml(u.location || 'Склад 1')}</td>
                    <td>
                        <select onchange="handleUnitStatusChange(${u.id}, this.value)" class="form-control" style="padding: 4px 8px; font-size: 0.8rem;">
                            <option value="available" ${u.status === 'available' ? 'selected' : ''}>Доступно</option>
                            <option value="rented" ${u.status === 'rented' ? 'selected' : ''}>В аренде</option>
                            <option value="maintenance" ${u.status === 'maintenance' ? 'selected' : ''}>На ремонт</option>
                            <option value="decommissioned" ${u.status === 'decommissioned' ? 'selected' : ''}>Списать</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join('');

        loadWarehouseLogs();
    } catch (err) {
        console.error(err);
    }
}

async function handleUnitStatusChange(unitId, newStatus) {
    const user = getCurrentUser();
    let note = prompt(`Причина / примечание для изменения статуса на "${newStatus}":`, 'Плановое обслуживание');
    if (note === null) {
        loadInventory();
        return;
    }

    try {
        const res = await fetch(`/api/inventory/${unitId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: newStatus,
                condition_note: note,
                actor: user ? user.name : 'Администратор'
            })
        });
        if (!res.ok) throw new Error('Ошибка смены статуса');
        showToast('Статус единицы инвентаря обновлен');
        loadInventory();
        loadAnalytics();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadWarehouseLogs() {
    try {
        const res = await fetch('/api/inventory-logs?limit=15');
        const logs = await res.json();
        const tbody = document.getElementById('admin-logs-tbody');
        if (!tbody) return;

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td style="font-size: 0.8rem; color: var(--text-muted);">${l.created_at.replace('T', ' ').substring(0, 19)}</td>
                <td><strong style="font-family: monospace;">${l.inventory_number}</strong> (${escapeHtml(l.equipment_title)})</td>
                <td><span class="status-pill status-confirmed">${l.action_type}</span></td>
                <td>${escapeHtml(l.details)}</td>
                <td>${escapeHtml(l.actor_name)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

function openAddUnitModal() {
    
    fetch('/api/equipment').then(r => r.json()).then(items => {
        const sel = document.getElementById('unit-form-eq-select');
        sel.innerHTML = items.map(e => `<option value="${e.id}">${e.title} (${e.category})</option>`).join('');
        openModal('unit-modal');
    });
}

async function loadFines() {
    try {
        const res = await fetch('/api/fines');
        const fines = await res.json();
        const tbody = document.getElementById('admin-fines-tbody');
        if (!tbody) return;

        tbody.innerHTML = fines.map(f => `
            <tr>
                <td><strong>${escapeHtml(f.title)}</strong></td>
                <td><span class="status-pill status-pending">${f.category}</span></td>
                <td><strong style="color: var(--accent-rose);">${f.default_amount} ₽</strong></td>
                <td><code style="background: rgba(0,0,0,0.3); padding: 3px 6px; border-radius: 4px;">${escapeHtml(f.calculation_rule)}</code></td>
                <td>${escapeHtml(f.description || '')}</td>
                <td>
                    <button onclick="handleEditFine(${f.id}, ${f.default_amount}, '${escapeHtml(f.calculation_rule)}', '${escapeHtml(f.description)}')" class="btn btn-secondary btn-sm" title="Редактировать">Изм.</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function handleEditFine(id, curAmount, curRule, curDesc) {
    const newAmount = prompt('Новая сумма штрафа (₽):', curAmount);
    if (newAmount === null) return;
    const newRule = prompt('Формула / правило расчёта:', curRule);
    if (newRule === null) return;
    const newDesc = prompt('Описание штрафа:', curDesc);
    if (newDesc === null) return;

    try {
        const res = await fetch(`/api/fines/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                default_amount: Number(newAmount),
                calculation_rule: newRule,
                description: newDesc
            })
        });
        if (!res.ok) throw new Error('Ошибка обновления тарифа');
        showToast('Тариф штрафа обновлен');
        loadFines();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function loadUsers() {
    try {
        const res = await fetch('/api/users');
        const users = await res.json();
        const tbody = document.getElementById('admin-users-tbody');
        if (!tbody) return;

        const roleBadges = {
            'client': '<span class="status-pill status-pending">Клиент</span>',
            'manager': '<span class="status-pill status-active">Менеджер</span>',
            'admin': '<span class="status-pill status-confirmed">Админ</span>'
        };

        tbody.innerHTML = users.map(u => `
            <tr>
                <td>#${u.id}</td>
                <td><strong>${escapeHtml(u.name)}</strong></td>
                <td>${escapeHtml(u.email)}</td>
                <td>${escapeHtml(u.phone || '—')}</td>
                <td>${roleBadges[u.role] || u.role}</td>
                <td>
                    <select onchange="handleUserRoleChange(${u.id}, this.value)" class="form-control" style="padding: 4px 8px; font-size: 0.8rem;">
                        <option value="client" ${u.role === 'client' ? 'selected' : ''}>Клиент</option>
                        <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Менеджер</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Администратор</option>
                    </select>
                </td>
                <td>
                    <button onclick="handleDeleteUser(${u.id})" class="btn btn-danger btn-sm" title="Удалить">Удалить</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
    }
}

async function handleUserRoleChange(userId, newRole) {
    try {
        const res = await fetch(`/api/users/${userId}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        if (!res.ok) throw new Error('Ошибка смены роли');
        showToast('Роль пользователя успешно изменена');
        loadUsers();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleDeleteUser(userId) {
    if (!confirm(`Удалить пользователя #${userId}?`)) return;
    try {
        const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Ошибка удаления пользователя');
        showToast('Пользователь удален');
        loadUsers();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function openAddUserModal() {
    document.getElementById('user-form').reset();
    openModal('user-modal');
}

async function loadAllBookings() {
    try {
        const res = await fetch('/api/bookings');
        const list = await res.json();
        const tbody = document.getElementById('admin-bookings-tbody');
        if (!tbody) return;

        const statusMap = {
            'pending': { text: 'Ожидает', class: 'status-pending' },
            'confirmed': { text: 'Подтверждено', class: 'status-confirmed' },
            'active': { text: 'В аренде', class: 'status-active' },
            'completed': { text: 'Возвращено', class: 'status-completed' },
            'overdue': { text: 'Просрочено', class: 'status-overdue' },
            'cancelled': { text: 'Отменено', class: 'status-cancelled' }
        };

        tbody.innerHTML = list.map(b => {
            const sInfo = statusMap[b.status] || { text: b.status, class: 'status-pending' };
            return `
                <tr>
                    <td><strong style="color: var(--accent-emerald); font-family: var(--font-heading);">${b.id}</strong></td>
                    <td>
                        <div><strong>${escapeHtml(b.client_name)}</strong></div>
                        <div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(b.client_phone)} • ${escapeHtml(b.client_email)}</div>
                    </td>
                    <td>${escapeHtml(b.equipment_title)}</td>
                    <td>${b.start_date} — ${b.end_date}</td>
                    <td><strong>${b.total_cost} ₽</strong></td>
                    <td>
                        ${b.total_fines > 0 ? `<span style="color: var(--accent-rose); font-weight: 700;">${b.total_fines} ₽</span>` : '0 ₽'}
                    </td>
                    <td><span class="status-pill ${sInfo.class}">${sInfo.text}</span></td>
                    <td>
                        <button onclick="fetchAndPrint('${b.id}')" class="btn btn-secondary btn-sm" title="Печать договора">Печать</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error(err);
    }
}

function setupAdminForms() {
    
    const eqForm = document.getElementById('equipment-form');
    if (eqForm) {
        eqForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const mode = document.getElementById('eq-modal-mode').value;
            const id = document.getElementById('eq-modal-id').value;

            let specsObj = {};
            try {
                specsObj = JSON.parse(document.getElementById('eq-form-specs').value);
            } catch (_) {
                showToast('Ошибка в JSON характеристик', 'error');
                return;
            }

            const payload = {
                title: document.getElementById('eq-form-title').value.trim(),
                category: document.getElementById('eq-form-category').value,
                daily_rate: Number(document.getElementById('eq-form-rate').value),
                deposit: Number(document.getElementById('eq-form-deposit').value),
                description: document.getElementById('eq-form-desc').value.trim(),
                image: document.getElementById('eq-form-image').value.trim(),
                specs: specsObj
            };

            try {
                const url = mode === 'edit' ? `/api/equipment/${id}` : '/api/equipment';
                const method = mode === 'edit' ? 'PUT' : 'POST';

                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                closeModal('equipment-modal');
                showToast(mode === 'edit' ? 'Оборудование обновлено' : 'Новое оборудование добавлено в каталог');
                loadCatalog();
                loadAnalytics();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }

    
    const unitForm = document.getElementById('unit-form');
    if (unitForm) {
        unitForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = getCurrentUser();

            const payload = {
                equipment_id: document.getElementById('unit-form-eq-select').value,
                inventory_number: document.getElementById('unit-form-code').value.trim(),
                serial_number: document.getElementById('unit-form-sn').value.trim(),
                condition_note: document.getElementById('unit-form-cond').value.trim(),
                location: document.getElementById('unit-form-loc').value.trim(),
                notes: document.getElementById('unit-form-notes').value.trim(),
                actor: user ? user.name : 'Администратор'
            };

            try {
                const res = await fetch('/api/inventory', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                closeModal('unit-modal');
                showToast(`Единица ${payload.inventory_number} оприходована на склад`);
                loadInventory();
                loadCatalog();
                loadAnalytics();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }

    
    const userForm = document.getElementById('user-form');
    if (userForm) {
        userForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const payload = {
                name: document.getElementById('user-form-name').value.trim(),
                email: document.getElementById('user-form-email').value.trim(),
                phone: document.getElementById('user-form-phone').value.trim(),
                password: document.getElementById('user-form-pass').value,
                role: document.getElementById('user-form-role').value
            };

            try {
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);

                closeModal('user-modal');
                showToast(`Пользователь ${payload.name} успешно создан`);
                loadUsers();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }
}

function setupAdminTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.dataset.tab;
            document.getElementById(targetId)?.classList.add('active');
        });
    });
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
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

window.openAddEquipmentModal = openAddEquipmentModal;
window.handleEditEquipment = handleEditEquipment;
window.handleDeleteEquipment = handleDeleteEquipment;
window.openAddUnitModal = openAddUnitModal;
window.handleUnitStatusChange = handleUnitStatusChange;
window.handleEditFine = handleEditFine;
window.openAddUserModal = openAddUserModal;
window.handleUserRoleChange = handleUserRoleChange;
window.handleDeleteUser = handleDeleteUser;
window.fetchAndPrint = fetchAndPrint;
window.handleLogout = handleLogout;
window.openModal = openModal;
window.closeModal = closeModal;
