
let clientBookings = [];

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadClientData();
    setupFilters();
});

function checkAuth() {
    const user = getCurrentUser();
    if (!user) {
        alert('Для доступа в личный кабинет необходимо авторизоваться.');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('cabinet-user-name').textContent = user.name;
    document.getElementById('cabinet-user-email').textContent = user.email;
    document.getElementById('cabinet-user-phone').textContent = user.phone || 'Телефон не указан';

    
    const navAdmin = document.getElementById('nav-admin-link');
    const navManager = document.getElementById('nav-manager-link');
    if (navAdmin) navAdmin.style.display = (user.role === 'admin') ? 'inline-block' : 'none';
    if (navManager) navManager.style.display = (user.role === 'manager') ? 'inline-block' : 'none';
}

function getCurrentUser() {
    try {
        const u = localStorage.getItem('rentpro_user');
        return u ? JSON.parse(u) : null;
    } catch (_) {
        return null;
    }
}

async function loadClientData() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const res = await fetch(`/api/bookings?client_id=${user.id}`);
        clientBookings = await res.json();

        updateStats();
        renderBookings(clientBookings);
    } catch (err) {
        console.error(err);
        showToast('Ошибка загрузки данных кабинета', 'error');
    }
}

function updateStats() {
    let totalSpent = 0;
    let activeCount = 0;
    let completedCount = 0;

    for (const b of clientBookings) {
        if (b.status !== 'cancelled') {
            totalSpent += (b.total_cost || 0) + (b.total_fines || 0);
        }
        if (b.status === 'active') activeCount++;
        else if (b.status === 'completed') completedCount++;
    }

    document.getElementById('stat-total-bookings').textContent = clientBookings.length;
    document.getElementById('stat-active-rentals').textContent = activeCount;
    document.getElementById('stat-completed-rentals').textContent = completedCount;
    document.getElementById('stat-total-spent').textContent = `${totalSpent.toLocaleString()} ₽`;
}

function renderBookings(list) {
    const container = document.getElementById('cabinet-bookings-list');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 36px; background: var(--glass-panel); border-radius: var(--radius-md); border: var(--border-glass);">
                <h3>У вас пока нет заказов</h3>
                <p style="color: var(--text-muted); margin-top: 6px;">Выберите инвентарь в каталоге и оформите бронирование</p>
                <a href="index.html#catalog" class="btn btn-primary btn-sm" style="margin-top: 14px;">Перейти в каталог</a>
            </div>
        `;
        return;
    }

    const statusMap = {
        'pending': { text: 'Ожидает подтверждения', class: 'status-pending' },
        'confirmed': { text: 'Подтверждено', class: 'status-confirmed' },
        'active': { text: 'Выдано клиенту', class: 'status-active' },
        'completed': { text: 'Возвращено', class: 'status-completed' },
        'overdue': { text: 'Просрочено', class: 'status-overdue' },
        'cancelled': { text: 'Отменено', class: 'status-cancelled' }
    };

    container.innerHTML = list.map(b => {
        const sInfo = statusMap[b.status] || { text: b.status, class: 'status-pending' };
        
        let cancelBtn = '';
        if (['pending', 'confirmed'].includes(b.status)) {
            cancelBtn = `<button onclick="handleCancelBooking('${b.id}')" class="btn btn-danger btn-sm">Отменить</button>`;
        }

        let finesBadge = '';
        if (b.total_fines > 0) {
            finesBadge = `
                <div style="margin-top: 6px; font-size: 0.8rem; color: var(--accent-rose); background: rgba(244, 63, 94, 0.1); padding: 4px 8px; border-radius: 2px;">
                    Удержан штраф: ${b.total_fines} ₽ (${b.return_condition || 'по акту'})
                </div>
            `;
        }

        return `
            <div class="equipment-card" style="margin-bottom: 14px; flex-direction: row; flex-wrap: wrap;">
                <div class="card-body" style="flex: 2; min-width: 260px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                        <span style="font-family: var(--font-heading); font-weight: 700; color: var(--accent-emerald);">${b.id}</span>
                        <span class="status-pill ${sInfo.class}">${sInfo.text}</span>
                    </div>

                    <h3 style="font-family: var(--font-heading); font-size: 1.05rem; margin-bottom: 4px;">${escapeHtml(b.equipment_title)}</h3>
                    <div style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 10px;">
                        Категория: <strong>${b.equipment_category}</strong> • Инв. номер: <span style="font-family: monospace;">${b.inventory_number || 'Назначается при выдаче'}</span>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; font-size: 0.82rem; background: rgba(0,0,0,0.25); padding: 10px; border-radius: var(--radius-sm);">
                        <div>
                            <span style="color: var(--text-muted); display: block;">Период:</span>
                            <strong>${b.start_date} — ${b.end_date}</strong> (${b.days_count} дн.)
                        </div>
                        <div>
                            <span style="color: var(--text-muted); display: block;">Аренда:</span>
                            <strong style="color: var(--accent-emerald);">${b.total_cost} ₽</strong>
                        </div>
                        <div>
                            <span style="color: var(--text-muted); display: block;">Залог:</span>
                            <strong>${b.deposit_amount} ₽</strong>
                        </div>
                    </div>

                    ${finesBadge}
                </div>

                <div style="padding: 16px; display: flex; flex-direction: column; justify-content: center; gap: 8px; border-left: 1px solid rgba(255, 255, 255, 0.06); min-width: 160px;">
                    <button onclick="fetchAndPrint('${b.id}')" class="btn btn-secondary btn-sm" style="width: 100%;">
                        Печать акта
                    </button>
                    ${cancelBtn}
                </div>
            </div>
        `;
    }).join('');
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

async function handleCancelBooking(bookingId) {
    if (!confirm(`Отменить бронирование ${bookingId}?`)) return;

    try {
        const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: 'Клиент', reason: 'Отмена в кабинете' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast(`Бронирование ${bookingId} отменено`);
        loadClientData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function setupFilters() {
    const chips = document.querySelectorAll('.cabinet-filter-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const status = chip.dataset.status;

            if (status === 'all') {
                renderBookings(clientBookings);
            } else {
                renderBookings(clientBookings.filter(b => b.status === status));
            }
        });
    });
}

function handleLogout() {
    localStorage.removeItem('rentpro_user');
    window.location.href = 'index.html';
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

window.handleCancelBooking = handleCancelBooking;
window.fetchAndPrint = fetchAndPrint;
window.handleLogout = handleLogout;
