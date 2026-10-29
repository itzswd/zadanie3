
let allEquipment = [];
let currentCategory = 'Все';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', () => {
    initAuthUI();
    loadEquipment();
    initCalculator();
    setupEventListeners();
});

function getCurrentUser() {
    try {
        const u = localStorage.getItem('rentpro_user');
        return u ? JSON.parse(u) : null;
    } catch (_) {
        return null;
    }
}

function setCurrentUser(user) {
    if (user) {
        localStorage.setItem('rentpro_user', JSON.stringify(user));
    } else {
        localStorage.removeItem('rentpro_user');
    }
    initAuthUI();
}

function initAuthUI() {
    const user = getCurrentUser();
    const navAuth = document.getElementById('nav-auth');
    const navAdminItem = document.getElementById('nav-admin-link');
    const navManagerItem = document.getElementById('nav-manager-link');

    
    if (navAdminItem) {
        navAdminItem.style.display = (user && user.role === 'admin') ? 'inline-block' : 'none';
    }
    if (navManagerItem) {
        navManagerItem.style.display = (user && user.role === 'manager') ? 'inline-block' : 'none';
    }

    if (!navAuth) return;

    if (user) {
        navAuth.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <a href="cabinet.html" class="btn btn-secondary btn-sm">Личный кабинет</a>
                <button onclick="handleLogout()" class="btn btn-secondary btn-sm" title="Выйти">Выход</button>
            </div>
        `;
    } else {
        navAuth.innerHTML = `
            <button onclick="openModal('auth-modal')" class="btn btn-auth btn-sm">Вход / Регистрация</button>
        `;
    }
}

function handleLogout() {
    setCurrentUser(null);
    showToast('Вы вышли из системы');
}

async function handleLogin(email, password) {
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка входа');

        setCurrentUser(data);
        closeModal('auth-modal');
        showToast(`Добро пожаловать, ${data.name}`);

        if (data.role === 'manager') window.location.href = 'manager.html';
        else if (data.role === 'admin') window.location.href = 'admin.html';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleRegister(name, email, phone, password) {
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password, role: 'client' })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');

        setCurrentUser(data);
        closeModal('auth-modal');
        showToast(`Регистрация завершена, ${data.name}`);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function quickLogin(role) {
    if (role === 'admin') handleLogin('admin@rentpro.ru', 'admin123');
    else if (role === 'manager') handleLogin('manager@rentpro.ru', 'manager123');
    else if (role === 'client') handleLogin('client@mail.ru', 'client123');
}

async function loadEquipment() {
    try {
        const res = await fetch('/api/equipment');
        allEquipment = await res.json();
        renderEquipment();
        populateCalcSelect();
    } catch (err) {
        console.error(err);
        showToast('Ошибка загрузки каталога', 'error');
    }
}

function renderEquipment() {
    const grid = document.getElementById('equipment-grid');
    if (!grid) return;

    let filtered = allEquipment;
    if (currentCategory !== 'Все') {
        filtered = filtered.filter(item => item.category === currentCategory);
    }
    if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(item => 
            item.title.toLowerCase().includes(q) || 
            (item.description && item.description.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 36px; color: var(--text-muted);">
                <h3>Оборудование не найдено</h3>
                <p>Попробуйте выбрать другую категорию</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(item => {
        let stockStatus = `<span class="stock-status-badge stock-available">В наличии: ${item.stock.available} шт.</span>`;
        if (item.stock.available === 0) {
            stockStatus = `<span class="stock-status-badge stock-empty">Все в аренде</span>`;
        } else if (item.stock.available <= 1) {
            stockStatus = `<span class="stock-status-badge stock-low">Осталась 1 шт.</span>`;
        }

        const specsHtml = Object.entries(item.specs || {})
            .slice(0, 3)
            .map(([k, v]) => `<span class="spec-chip">${escapeHtml(k)}: ${escapeHtml(v)}</span>`)
            .join('');

        return `
            <div class="equipment-card">
                <div class="card-img-wrap">
                    <span class="card-badge">${escapeHtml(item.category)}</span>
                    ${stockStatus}
                    <img src="images/${item.image || 'drill.png'}" alt="${escapeHtml(item.title)}">
                </div>
                <div class="card-body">
                    <h3 class="card-title">${escapeHtml(item.title)}</h3>
                    <p class="card-desc">${escapeHtml(item.description)}</p>
                    <div class="card-specs">
                        ${specsHtml}
                    </div>
                    <div class="card-footer">
                        <div class="price-box">
                            <div class="price-val">${item.daily_rate} ₽ <span class="price-unit">/ сутки</span></div>
                            <div class="deposit-val">Залог: ${item.deposit} ₽</div>
                        </div>
                        <button onclick="openBookingModal(${item.id})" class="btn btn-primary btn-sm">
                            Забронировать
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function populateCalcSelect() {
    const sel = document.getElementById('calc-equipment-select');
    if (!sel) return;
    sel.innerHTML = allEquipment.map(e => `
        <option value="${e.id}">${escapeHtml(e.title)} (${e.daily_rate} ₽/сут)</option>
    `).join('');
    updateCalculatorQuote();
}

function initCalculator() {
    const today = new Date();
    const inTwoDays = new Date(today);
    inTwoDays.setDate(today.getDate() + 2);

    const fmt = d => d.toISOString().split('T')[0];
    const startInput = document.getElementById('calc-start-date');
    const endInput = document.getElementById('calc-end-date');

    if (startInput && endInput) {
        startInput.value = fmt(today);
        startInput.min = fmt(today);
        endInput.value = fmt(inTwoDays);
        endInput.min = fmt(today);

        startInput.addEventListener('change', () => {
            if (endInput.value < startInput.value) endInput.value = startInput.value;
            updateCalculatorQuote();
        });
        endInput.addEventListener('change', updateCalculatorQuote);
    }

    const sel = document.getElementById('calc-equipment-select');
    if (sel) sel.addEventListener('change', updateCalculatorQuote);

    document.querySelectorAll('.calc-extra-checkbox').forEach(cb => {
        cb.addEventListener('change', updateCalculatorQuote);
    });
}

async function updateCalculatorQuote() {
    const eqId = document.getElementById('calc-equipment-select')?.value;
    const startDate = document.getElementById('calc-start-date')?.value;
    const endDate = document.getElementById('calc-end-date')?.value;

    if (!eqId || !startDate || !endDate) return;

    const extras = [];
    if (document.getElementById('calc-extra-insurance')?.checked) extras.push('insurance');
    if (document.getElementById('calc-extra-accessories')?.checked) extras.push('accessories');
    if (document.getElementById('calc-extra-delivery')?.checked) extras.push('delivery');

    try {
        const res = await fetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ equipmentId: eqId, startDate, endDate, extraServices: extras })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const q = data.quote;
        const av = data.availability;

        document.getElementById('calc-days-val').textContent = `${q.daysCount} дн.`;
        document.getElementById('calc-rental-val').textContent = `${q.rentalCost} ₽`;
        document.getElementById('calc-deposit-val').textContent = `${q.depositAmount} ₽`;
        document.getElementById('calc-total-val').textContent = `${q.totalCost} ₽`;

        const availBadge = document.getElementById('calc-avail-status');
        if (availBadge) {
            if (av.available) {
                availBadge.className = 'status-pill status-active';
                availBadge.textContent = `Доступно (${av.availableCount} шт.)`;
            } else {
                availBadge.className = 'status-pill status-overdue';
                availBadge.textContent = `Занято на эти даты`;
            }
        }
    } catch (err) {
        console.error(err);
    }
}

function handleCalcBookNow() {
    const eqId = document.getElementById('calc-equipment-select')?.value;
    const startDate = document.getElementById('calc-start-date')?.value;
    const endDate = document.getElementById('calc-end-date')?.value;

    const extras = [];
    if (document.getElementById('calc-extra-insurance')?.checked) extras.push('insurance');
    if (document.getElementById('calc-extra-accessories')?.checked) extras.push('accessories');
    if (document.getElementById('calc-extra-delivery')?.checked) extras.push('delivery');

    openBookingModal(eqId, startDate, endDate, extras);
}

function openBookingModal(equipmentId, preStartDate = null, preEndDate = null, preExtras = []) {
    const eq = allEquipment.find(e => e.id == equipmentId);
    if (!eq) return;

    const user = getCurrentUser();
    const today = new Date();
    const inTwoDays = new Date(today);
    inTwoDays.setDate(today.getDate() + 2);
    const fmt = d => d.toISOString().split('T')[0];

    document.getElementById('book-eq-id').value = eq.id;
    document.getElementById('book-modal-title').textContent = `Бронирование: ${eq.title}`;
    document.getElementById('book-rate-text').textContent = `${eq.daily_rate} ₽/сутки • Залог: ${eq.deposit} ₽`;

    document.getElementById('book-start-date').value = preStartDate || fmt(today);
    document.getElementById('book-end-date').value = preEndDate || fmt(inTwoDays);

    if (user) {
        document.getElementById('book-client-name').value = user.name || '';
        document.getElementById('book-client-phone').value = user.phone || '';
        document.getElementById('book-client-email').value = user.email || '';
    }

    document.getElementById('book-extra-ins').checked = preExtras.includes('insurance');
    document.getElementById('book-extra-acc').checked = preExtras.includes('accessories');
    document.getElementById('book-extra-del').checked = preExtras.includes('delivery');

    updateBookingModalQuote();
    openModal('booking-modal');
}

async function updateBookingModalQuote() {
    const eqId = document.getElementById('book-eq-id').value;
    const startDate = document.getElementById('book-start-date').value;
    const endDate = document.getElementById('book-end-date').value;

    if (!eqId || !startDate || !endDate) return;

    const extras = [];
    if (document.getElementById('book-extra-ins').checked) extras.push('insurance');
    if (document.getElementById('book-extra-acc').checked) extras.push('accessories');
    if (document.getElementById('book-extra-del').checked) extras.push('delivery');

    try {
        const res = await fetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ equipmentId: eqId, startDate, endDate, extraServices: extras })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const q = data.quote;
        const av = data.availability;

        document.getElementById('book-summary-days').textContent = `${q.daysCount} дн.`;
        document.getElementById('book-summary-rental').textContent = `${q.rentalCost} ₽`;
        document.getElementById('book-summary-extras').textContent = `${q.extraCost} ₽`;
        document.getElementById('book-summary-deposit').textContent = `${q.depositAmount} ₽`;
        document.getElementById('book-summary-total').textContent = `${q.totalCost} ₽`;

        const submitBtn = document.getElementById('book-submit-btn');
        const warnBox = document.getElementById('book-avail-warning');

        if (av.available) {
            submitBtn.disabled = false;
            warnBox.style.display = 'none';
        } else {
            submitBtn.disabled = true;
            warnBox.style.display = 'block';
            warnBox.textContent = 'На выбранные даты всё оборудование данной модели уже занято.';
        }
    } catch (err) {
        console.error(err);
    }
}

async function submitBookingForm(e) {
    e.preventDefault();
    const user = getCurrentUser();

    const eqId = document.getElementById('book-eq-id').value;
    const clientName = document.getElementById('book-client-name').value.trim();
    const clientPhone = document.getElementById('book-client-phone').value.trim();
    const clientEmail = document.getElementById('book-client-email').value.trim();
    const startDate = document.getElementById('book-start-date').value;
    const endDate = document.getElementById('book-end-date').value;
    const notes = document.getElementById('book-notes').value.trim();

    const extras = [];
    if (document.getElementById('book-extra-ins').checked) extras.push('insurance');
    if (document.getElementById('book-extra-acc').checked) extras.push('accessories');
    if (document.getElementById('book-extra-del').checked) extras.push('delivery');

    try {
        const res = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: user ? user.id : null,
                client_name: clientName,
                client_phone: clientPhone,
                client_email: clientEmail,
                equipment_id: eqId,
                start_date: startDate,
                end_date: endDate,
                extra_services: extras,
                notes
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        closeModal('booking-modal');
        loadEquipment();

        openTrackingModal(data.id);
        showToast(`Бронирование ${data.id} оформлено`);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function handleTrackingSearch() {
    const input = document.getElementById('tracking-number-input');
    const num = input?.value.trim().toUpperCase();
    if (!num) {
        showToast('Введите номер заказа (например, BRN-101)', 'error');
        return;
    }
    openTrackingModal(num);
}

async function openTrackingModal(bookingId) {
    try {
        const res = await fetch(`/api/bookings/${bookingId}`);
        const b = await res.json();
        if (!res.ok) throw new Error(b.error || 'Бронирование не найдено');

        document.getElementById('track-booking-id').textContent = b.id;
        document.getElementById('track-client-name').textContent = b.client_name;
        document.getElementById('track-equipment-title').textContent = b.equipment_title;
        document.getElementById('track-dates').textContent = `${b.start_date} — ${b.end_date} (${b.days_count} дн.)`;
        document.getElementById('track-total-cost').textContent = `${b.total_cost} ₽`;
        document.getElementById('track-deposit').textContent = `${b.deposit_amount} ₽`;
        document.getElementById('track-inv-number').textContent = b.inventory_number || 'Назначается при выдаче';

        const statusMap = {
            'pending': { text: 'Ожидает подтверждения', class: 'status-pending' },
            'confirmed': { text: 'Подтверждено', class: 'status-confirmed' },
            'active': { text: 'Выдано клиенту', class: 'status-active' },
            'completed': { text: 'Возвращено', class: 'status-completed' },
            'overdue': { text: 'Просрочено', class: 'status-overdue' },
            'cancelled': { text: 'Отменено', class: 'status-cancelled' }
        };
        const sInfo = statusMap[b.status] || { text: b.status, class: 'status-pending' };
        const statusBadge = document.getElementById('track-status-badge');
        statusBadge.className = `status-pill ${sInfo.class}`;
        statusBadge.textContent = sInfo.text;

        updateTrackingTimeline(b.status);

        const printBtn = document.getElementById('track-print-btn');
        printBtn.onclick = () => printRentalContract(b);

        openModal('tracking-modal');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function updateTrackingTimeline(status) {
    const steps = ['pending', 'confirmed', 'active', 'completed'];
    const currentIdx = steps.indexOf(status);

    steps.forEach((step, idx) => {
        const el = document.getElementById(`step-${step}`);
        if (!el) return;
        el.className = 'timeline-step';
        if (currentIdx >= idx) el.classList.add('completed');
        if (status === step) el.classList.add('active');
    });

    if (status === 'overdue') {
        const activeStep = document.getElementById('step-active');
        if (activeStep) activeStep.classList.add('active');
    }
}

function setupEventListeners() {
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentCategory = chip.dataset.category;
            renderEquipment();
        });
    });

    const searchInput = document.getElementById('catalog-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value;
            renderEquipment();
        });
    }

    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const mode = document.getElementById('auth-mode').value;
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;

            if (mode === 'login') {
                handleLogin(email, password);
            } else {
                const name = document.getElementById('auth-name').value;
                const phone = document.getElementById('auth-phone').value;
                handleRegister(name, email, phone, password);
            }
        });
    }

    const bookingForm = document.getElementById('booking-form');
    if (bookingForm) {
        bookingForm.addEventListener('submit', submitBookingForm);
    }

    ['book-start-date', 'book-end-date', 'book-extra-ins', 'book-extra-acc', 'book-extra-del'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateBookingModalQuote);
    });
}

function switchAuthMode(mode) {
    document.getElementById('auth-mode').value = mode;
    const registerFields = document.getElementById('register-extra-fields');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleText = document.getElementById('auth-toggle-text');

    if (mode === 'register') {
        registerFields.style.display = 'block';
        submitBtn.textContent = 'Зарегистрироваться';
        toggleText.innerHTML = 'Уже есть аккаунт? <a href="#" onclick="switchAuthMode(\'login\'); return false;" style="color: var(--accent-emerald);">Войти</a>';
    } else {
        registerFields.style.display = 'none';
        submitBtn.textContent = 'Войти в систему';
        toggleText.innerHTML = 'Нет аккаунта? <a href="#" onclick="switchAuthMode(\'register\'); return false;" style="color: var(--accent-emerald);">Зарегистрироваться</a>';
    }
}

function openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
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

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

window.openBookingModal = openBookingModal;
window.openTrackingModal = openTrackingModal;
window.handleTrackingSearch = handleTrackingSearch;
window.handleCalcBookNow = handleCalcBookNow;
window.quickLogin = quickLogin;
window.switchAuthMode = switchAuthMode;
window.handleLogout = handleLogout;
window.openModal = openModal;
window.closeModal = closeModal;
