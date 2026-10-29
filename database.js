const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const crypto = require('node:crypto');

const dbPath = path.join(__dirname, 'rental.db');
const db = new DatabaseSync(dbPath);

db.exec(`PRAGMA foreign_keys = ON;`);

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('client', 'manager', 'admin')),
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS equipment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('Спортивное', 'Туристическое', 'Строительное')),
        daily_rate INTEGER NOT NULL,
        deposit INTEGER NOT NULL,
        description TEXT,
        specs TEXT,
        image TEXT,
        min_rental_days INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_units (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
        inventory_number TEXT UNIQUE NOT NULL,
        serial_number TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('available', 'rented', 'maintenance', 'decommissioned')),
        condition_note TEXT DEFAULT 'Отличное',
        location TEXT DEFAULT 'Склад 1, Секция А',
        purchased_date TEXT NOT NULL,
        last_service_date TEXT,
        notes TEXT
    );

    CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        client_name TEXT NOT NULL,
        client_phone TEXT NOT NULL,
        client_email TEXT NOT NULL,
        equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
        inventory_unit_id INTEGER REFERENCES inventory_units(id) ON DELETE SET NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        days_count INTEGER NOT NULL,
        daily_rate INTEGER NOT NULL,
        rental_cost INTEGER NOT NULL,
        deposit_amount INTEGER NOT NULL,
        extra_services_json TEXT DEFAULT '[]',
        extra_cost INTEGER DEFAULT 0,
        total_cost INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'confirmed', 'active', 'completed', 'overdue', 'cancelled')),
        pickup_date TEXT,
        return_date TEXT,
        manager_id INTEGER REFERENCES users(id),
        manager_name TEXT,
        pickup_condition TEXT DEFAULT 'Исправно, без повреждений',
        return_condition TEXT,
        late_days INTEGER DEFAULT 0,
        late_fine INTEGER DEFAULT 0,
        damage_fine INTEGER DEFAULT 0,
        total_fines INTEGER DEFAULT 0,
        deposit_refunded INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        notes TEXT
    );

    CREATE TABLE IF NOT EXISTS booking_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        actor TEXT NOT NULL,
        comment TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fines_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        default_amount INTEGER NOT NULL,
        calculation_rule TEXT NOT NULL,
        description TEXT
    );

    CREATE TABLE IF NOT EXISTS warehouse_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inventory_unit_id INTEGER NOT NULL REFERENCES inventory_units(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL,
        details TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
`);

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, hash, salt) {
    const computed = hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'));
}

function createUser({ name, email, phone, password, role = 'client' }) {
    const salt = crypto.randomBytes(16).toString('hex');
    const password_hash = hashPassword(password, salt);
    const createdAt = new Date().toISOString();

    const stmt = db.prepare(`
        INSERT INTO users (name, email, phone, password_hash, salt, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(name, email.toLowerCase().trim(), phone || '', password_hash, salt, role, createdAt);
    return {
        id: Number(res.lastInsertRowid),
        name,
        email: email.toLowerCase().trim(),
        phone: phone || '',
        role,
        created_at: createdAt
    };
}

function getUserByEmail(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

function getUserById(id) {
    return db.prepare('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?').get(id);
}

function getAllUsers() {
    return db.prepare('SELECT id, name, email, phone, role, created_at FROM users ORDER BY id ASC').all();
}

function updateUserRole(id, role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    return getUserById(id);
}

function deleteUser(id) {
    return db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function getAllEquipment(category = null, search = null) {
    let sql = 'SELECT * FROM equipment WHERE 1=1';
    const params = [];

    if (category && category !== 'Все') {
        sql += ' AND category = ?';
        params.push(category);
    }
    if (search && search.trim() !== '') {
        sql += ' AND (title LIKE ? OR description LIKE ?)';
        const query = `%${search.trim()}%`;
        params.push(query, query);
    }
    sql += ' ORDER BY id ASC';

    const items = db.prepare(sql).all(...params);
    return items.map(item => {
        let specsObj = {};
        try {
            specsObj = item.specs ? JSON.parse(item.specs) : {};
        } catch (_) {}

        
        const units = db.prepare('SELECT status FROM inventory_units WHERE equipment_id = ?').all(item.id);
        const totalCount = units.length;
        const availableNow = units.filter(u => u.status === 'available').length;
        const inRentNow = units.filter(u => u.status === 'rented').length;
        const inMaintenance = units.filter(u => u.status === 'maintenance').length;

        return {
            ...item,
            specs: specsObj,
            stock: {
                total: totalCount,
                available: availableNow,
                rented: inRentNow,
                maintenance: inMaintenance
            }
        };
    });
}

function getEquipmentById(id) {
    const item = db.prepare('SELECT * FROM equipment WHERE id = ?').get(id);
    if (!item) return null;

    let specsObj = {};
    try {
        specsObj = item.specs ? JSON.parse(item.specs) : {};
    } catch (_) {}

    const units = db.prepare(`
        SELECT id, inventory_number, serial_number, status, condition_note, location, last_service_date
        FROM inventory_units WHERE equipment_id = ?
    `).all(item.id);

    return {
        ...item,
        specs: specsObj,
        units
    };
}

function addEquipment({ title, category, daily_rate, deposit, description, specs, image, min_rental_days = 1 }) {
    const createdAt = new Date().toISOString();
    const specsStr = typeof specs === 'object' ? JSON.stringify(specs) : (specs || '{}');
    const stmt = db.prepare(`
        INSERT INTO equipment (title, category, daily_rate, deposit, description, specs, image, min_rental_days, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(title, category, daily_rate, deposit, description || '', specsStr, image || '', min_rental_days, createdAt);
    return getEquipmentById(Number(res.lastInsertRowid));
}

function updateEquipment(id, { title, category, daily_rate, deposit, description, specs, image, min_rental_days }) {
    const current = getEquipmentById(id);
    if (!current) return null;

    const specsStr = specs !== undefined ? (typeof specs === 'object' ? JSON.stringify(specs) : specs) : JSON.stringify(current.specs);
    const stmt = db.prepare(`
        UPDATE equipment 
        SET title = ?, category = ?, daily_rate = ?, deposit = ?, description = ?, specs = ?, image = ?, min_rental_days = ?
        WHERE id = ?
    `);
    stmt.run(
        title !== undefined ? title : current.title,
        category !== undefined ? category : current.category,
        daily_rate !== undefined ? daily_rate : current.daily_rate,
        deposit !== undefined ? deposit : current.deposit,
        description !== undefined ? description : current.description,
        specsStr,
        image !== undefined ? image : current.image,
        min_rental_days !== undefined ? min_rental_days : current.min_rental_days,
        id
    );
    return getEquipmentById(id);
}

function deleteEquipment(id) {
    return db.prepare('DELETE FROM equipment WHERE id = ?').run(id);
}

function getAllInventoryUnits() {
    return db.prepare(`
        SELECT u.*, e.title as equipment_title, e.category as equipment_category, e.daily_rate, e.deposit
        FROM inventory_units u
        JOIN equipment e ON u.equipment_id = e.id
        ORDER BY u.id ASC
    `).all();
}

function getInventoryUnitById(id) {
    return db.prepare(`
        SELECT u.*, e.title as equipment_title, e.category as equipment_category, e.daily_rate, e.deposit
        FROM inventory_units u
        JOIN equipment e ON u.equipment_id = e.id
        WHERE u.id = ?
    `).get(id);
}

function addInventoryUnit({ equipment_id, inventory_number, serial_number, status = 'available', condition_note = 'Отличное', location = 'Склад 1, Секция А', notes = '', actor = 'Администратор' }) {
    const purchasedDate = new Date().toISOString().split('T')[0];
    const stmt = db.prepare(`
        INSERT INTO inventory_units (equipment_id, inventory_number, serial_number, status, condition_note, location, purchased_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(equipment_id, inventory_number, serial_number, status, condition_note, location, purchasedDate, notes);
    const newId = Number(res.lastInsertRowid);

    
    addWarehouseLog({
        inventory_unit_id: newId,
        action_type: 'inflow',
        details: `Поступление на склад единицы ${inventory_number} (${serial_number}), состояние: ${condition_note}`,
        actor_name: actor
    });

    return getInventoryUnitById(newId);
}

function updateInventoryUnitStatus(id, newStatus, conditionNote = null, notes = null, actor = 'Менеджер') {
    const unit = getInventoryUnitById(id);
    if (!unit) return null;

    let sql = 'UPDATE inventory_units SET status = ?';
    const params = [newStatus];

    if (conditionNote !== null) {
        sql += ', condition_note = ?';
        params.push(conditionNote);
    }
    if (notes !== null) {
        sql += ', notes = ?';
        params.push(notes);
    }
    if (newStatus === 'maintenance') {
        sql += ', last_service_date = ?';
        params.push(new Date().toISOString().split('T')[0]);
    }
    sql += ' WHERE id = ?';
    params.push(id);

    db.prepare(sql).run(...params);

    addWarehouseLog({
        inventory_unit_id: id,
        action_type: 'status_change',
        details: `Смена статуса с "${unit.status}" на "${newStatus}". Примечание: ${conditionNote || notes || 'плановое'}`,
        actor_name: actor
    });

    return getInventoryUnitById(id);
}

function addWarehouseLog({ inventory_unit_id, action_type, details, actor_name = 'Система' }) {
    const createdAt = new Date().toISOString();
    return db.prepare(`
        INSERT INTO warehouse_logs (inventory_unit_id, action_type, details, actor_name, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(inventory_unit_id, action_type, details, actor_name, createdAt);
}

function getWarehouseLogs(limit = 50) {
    return db.prepare(`
        SELECT l.*, u.inventory_number, e.title as equipment_title
        FROM warehouse_logs l
        JOIN inventory_units u ON l.inventory_unit_id = u.id
        JOIN equipment e ON u.equipment_id = e.id
        ORDER BY l.id DESC
        LIMIT ?
    `).all(limit);
}

function checkEquipmentAvailability(equipmentId, startDate, endDate, excludeBookingId = null) {
    if (!startDate || !endDate || startDate > endDate) {
        return {
            available: false,
            error: 'Некорректный диапазон дат: дата начала должна быть не позже даты окончания.',
            availableCount: 0,
            totalUnits: 0,
            bookedUnits: 0
        };
    }

    
    const activeUnits = db.prepare(`
        SELECT id, inventory_number, status, condition_note 
        FROM inventory_units 
        WHERE equipment_id = ? AND status != 'decommissioned'
    `).all(equipmentId);

    const totalUnits = activeUnits.length;
    if (totalUnits === 0) {
        return {
            available: false,
            reason: 'Оборудование отсутствует на складе или списано',
            availableCount: 0,
            totalUnits: 0,
            bookedUnits: 0
        };
    }

    
    
    
    let sql = `
        SELECT id, start_date, end_date, inventory_unit_id, status 
        FROM bookings 
        WHERE equipment_id = ? 
          AND status IN ('pending', 'confirmed', 'active', 'overdue')
          AND NOT (end_date < ? OR start_date > ?)
    `;
    const params = [equipmentId, startDate, endDate];

    if (excludeBookingId) {
        sql += ' AND id != ?';
        params.push(excludeBookingId);
    }

    const overlappingBookings = db.prepare(sql).all(...params);
    const bookedUnitsCount = overlappingBookings.length;
    const availableCount = Math.max(0, totalUnits - bookedUnitsCount);

    
    const busyUnitIds = new Set(overlappingBookings.map(b => b.inventory_unit_id).filter(Boolean));
    const freeUnit = activeUnits.find(u => u.status === 'available' && !busyUnitIds.has(u.id)) || null;

    return {
        available: availableCount > 0,
        availableCount,
        totalUnits,
        bookedUnits: bookedUnitsCount,
        freeUnitCandidate: freeUnit
    };
}

function getDaysCount(startDate, endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diffTime = e.getTime() - s.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
    return Math.max(1, days);
}

function calculateBookingQuote(equipmentId, startDate, endDate, extraServices = []) {
    const eq = getEquipmentById(equipmentId);
    if (!eq) throw new Error('Оборудование не найдено');

    const days = getDaysCount(startDate, endDate);
    const rentalCost = eq.daily_rate * days;

    let extraCost = 0;
    const detailedExtras = [];

    
    if (Array.isArray(extraServices)) {
        for (const item of extraServices) {
            if (item === 'insurance') {
                const insCost = Math.round(rentalCost * 0.15); 
                extraCost += insCost;
                detailedExtras.push({ id: 'insurance', title: 'Страховка от случайных повреждений (15%)', cost: insCost });
            } else if (item === 'accessories') {
                const accCost = 300 * days; 
                extraCost += accCost;
                detailedExtras.push({ id: 'accessories', title: `Комплект аксессуаров и защиты (${days} сут.)`, cost: accCost });
            } else if (item === 'delivery') {
                const delivCost = 700; 
                extraCost += delivCost;
                detailedExtras.push({ id: 'delivery', title: 'Доставка и вывоз курьером', cost: delivCost });
            }
        }
    }

    const totalCost = rentalCost + extraCost;

    return {
        equipment: {
            id: eq.id,
            title: eq.title,
            category: eq.category,
            daily_rate: eq.daily_rate,
            deposit: eq.deposit
        },
        startDate,
        endDate,
        daysCount: days,
        rentalCost,
        extraCost,
        detailedExtras,
        depositAmount: eq.deposit,
        totalCost, 
        totalWithDeposit: totalCost + eq.deposit
    };
}

function createBooking({
    client_id = null,
    client_name,
    client_phone,
    client_email,
    equipment_id,
    start_date,
    end_date,
    extra_services = [],
    notes = ''
}) {
    
    const availability = checkEquipmentAvailability(equipment_id, start_date, end_date);
    if (!availability.available) {
        throw new Error(`На выбранные даты (${start_date} — ${end_date}) оборудование занято или недоступно.`);
    }

    
    const quote = calculateBookingQuote(equipment_id, start_date, end_date, extra_services);
    
    
    const lastBooking = db.prepare('SELECT id FROM bookings ORDER BY ROWID DESC LIMIT 1').get();
    let nextNum = 101;
    if (lastBooking && lastBooking.id) {
        const match = lastBooking.id.match(/BRN-(\d+)/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const bookingId = `BRN-${nextNum}`;
    const createdAt = new Date().toISOString();

    const stmt = db.prepare(`
        INSERT INTO bookings (
            id, client_id, client_name, client_phone, client_email,
            equipment_id, start_date, end_date, days_count, daily_rate,
            rental_cost, deposit_amount, extra_services_json, extra_cost,
            total_cost, status, created_at, notes
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, 'pending', ?, ?
        )
    `);

    stmt.run(
        bookingId,
        client_id,
        client_name.trim(),
        client_phone.trim(),
        client_email.toLowerCase().trim(),
        equipment_id,
        start_date,
        end_date,
        quote.daysCount,
        quote.equipment.daily_rate,
        quote.rentalCost,
        quote.depositAmount,
        JSON.stringify(extra_services),
        quote.extraCost,
        quote.totalCost,
        createdAt,
        notes || ''
    );

    
    addBookingHistory(bookingId, 'pending', client_name, 'Бронирование оформлено клиентом через онлайн-витрину.');

    return getBookingById(bookingId);
}

function addBookingHistory(bookingId, status, actor, comment = '') {
    const createdAt = new Date().toISOString();
    return db.prepare(`
        INSERT INTO booking_history (booking_id, status, actor, comment, created_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(bookingId, status, actor, comment, createdAt);
}

function getBookingById(id) {
    const booking = db.prepare(`
        SELECT b.*, 
               e.title as equipment_title, e.category as equipment_category, e.image as equipment_image,
               u.inventory_number, u.serial_number, u.location as unit_location
        FROM bookings b
        JOIN equipment e ON b.equipment_id = e.id
        LEFT JOIN inventory_units u ON b.inventory_unit_id = u.id
        WHERE b.id = ?
    `).get(id);

    if (!booking) return null;

    let extras = [];
    try {
        extras = JSON.parse(booking.extra_services_json || '[]');
    } catch (_) {}

    const history = db.prepare(`
        SELECT * FROM booking_history WHERE booking_id = ? ORDER BY id ASC
    `).all(id);

    return {
        ...booking,
        extra_services: extras,
        history
    };
}

function getAllBookings(filters = {}) {
    let sql = `
        SELECT b.*, 
               e.title as equipment_title, e.category as equipment_category,
               u.inventory_number
        FROM bookings b
        JOIN equipment e ON b.equipment_id = e.id
        LEFT JOIN inventory_units u ON b.inventory_unit_id = u.id
        WHERE 1=1
    `;
    const params = [];

    if (filters.status && filters.status !== 'Все') {
        sql += ' AND b.status = ?';
        params.push(filters.status);
    }
    if (filters.client_id) {
        sql += ' AND b.client_id = ?';
        params.push(filters.client_id);
    }
    if (filters.search && filters.search.trim() !== '') {
        const q = `%${filters.search.trim()}%`;
        sql += ' AND (b.id LIKE ? OR b.client_name LIKE ? OR b.client_phone LIKE ? OR e.title LIKE ?)';
        params.push(q, q, q, q);
    }

    sql += ' ORDER BY b.created_at DESC';

    const list = db.prepare(sql).all(...params);
    return list.map(b => {
        let extras = [];
        try { extras = JSON.parse(b.extra_services_json || '[]'); } catch (_) {}
        return { ...b, extra_services: extras };
    });
}

function confirmBooking(bookingId, managerName = 'Менеджер') {
    const booking = getBookingById(bookingId);
    if (!booking) throw new Error('Бронирование не найдено');
    if (booking.status !== 'pending') throw new Error(`Нельзя подтвердить бронирование в статусе "${booking.status}"`);

    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('confirmed', bookingId);
    addBookingHistory(bookingId, 'confirmed', managerName, 'Бронирование подтверждено менеджером. Оборудование зарезервировано.');
    return getBookingById(bookingId);
}

function pickupEquipment({ bookingId, inventoryUnitId, managerId = null, managerName = 'Менеджер', pickupCondition = 'Исправно, без дефектов' }) {
    const booking = getBookingById(bookingId);
    if (!booking) throw new Error('Бронирование не найдено');
    if (!['pending', 'confirmed'].includes(booking.status)) {
        throw new Error(`Выдача невозможна: заказ в статусе "${booking.status}"`);
    }

    
    const unit = getInventoryUnitById(inventoryUnitId);
    if (!unit) throw new Error('Единица инвентаря не найдена');
    if (unit.equipment_id !== booking.equipment_id) {
        throw new Error('Выбранная единица инвентаря не соответствует модели в бронировании');
    }
    if (unit.status !== 'available') {
        throw new Error(`Единица ${unit.inventory_number} сейчас недоступна (статус: ${unit.status})`);
    }

    const pickupDate = new Date().toISOString();

    
    db.prepare(`
        UPDATE bookings 
        SET status = 'active',
            inventory_unit_id = ?,
            manager_id = ?,
            manager_name = ?,
            pickup_date = ?,
            pickup_condition = ?
        WHERE id = ?
    `).run(inventoryUnitId, managerId, managerName, pickupDate, pickupCondition, bookingId);

    
    db.prepare('UPDATE inventory_units SET status = ? WHERE id = ?').run('rented', inventoryUnitId);

    addBookingHistory(bookingId, 'active', managerName, `Оборудование выдано клиенту. Инв. номер: ${unit.inventory_number}. Состояние: ${pickupCondition}`);
    
    addWarehouseLog({
        inventory_unit_id: inventoryUnitId,
        action_type: 'pickup',
        details: `Выдано клиенту ${booking.client_name} по брони ${bookingId}`,
        actor_name: managerName
    });

    return getBookingById(bookingId);
}

function returnEquipment({
    bookingId,
    actualReturnDate = null,
    returnCondition = 'Без замечаний',
    conditionSeverity = 'none', 
    customDamageFine = 0,
    managerName = 'Менеджер',
    notes = ''
}) {
    const booking = getBookingById(bookingId);
    if (!booking) throw new Error('Бронирование не найдено');
    if (!['active', 'overdue'].includes(booking.status)) {
        throw new Error(`Приём невозможен: заказ в статусе "${booking.status}"`);
    }

    const returnTimestamp = actualReturnDate ? new Date(actualReturnDate).toISOString() : new Date().toISOString();
    const returnDateStr = returnTimestamp.split('T')[0];

    
    
    let lateDays = 0;
    let lateFine = 0;

    const plannedEnd = new Date(booking.end_date);
    const actualEnd = new Date(returnDateStr);
    if (actualEnd > plannedEnd) {
        const diffMs = actualEnd.getTime() - plannedEnd.getTime();
        lateDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        lateFine = Math.round(lateDays * booking.daily_rate * 1.5);
    }

    
    let damageFine = Number(customDamageFine) || 0;
    if (damageFine === 0) {
        if (conditionSeverity === 'cleaning') damageFine = 500;
        else if (conditionSeverity === 'minor_damage') damageFine = 1500;
        else if (conditionSeverity === 'major_damage') damageFine = 3500;
        else if (conditionSeverity === 'lost') damageFine = booking.deposit_amount;
    }

    const totalFines = lateFine + damageFine;
    
    const depositRefunded = Math.max(0, booking.deposit_amount - totalFines);

    
    db.prepare(`
        UPDATE bookings 
        SET status = 'completed',
            return_date = ?,
            return_condition = ?,
            late_days = ?,
            late_fine = ?,
            damage_fine = ?,
            total_fines = ?,
            deposit_refunded = ?,
            notes = ?
        WHERE id = ?
    `).run(
        returnTimestamp,
        returnCondition,
        lateDays,
        lateFine,
        damageFine,
        totalFines,
        depositRefunded,
        notes || booking.notes,
        bookingId
    );

    
    if (booking.inventory_unit_id) {
        let newUnitStatus = 'available';
        let unitConditionNote = returnCondition;

        if (['minor_damage', 'major_damage'].includes(conditionSeverity)) {
            newUnitStatus = 'maintenance';
            unitConditionNote = `Требуется ремонт: ${returnCondition}`;
        } else if (conditionSeverity === 'lost') {
            newUnitStatus = 'decommissioned';
            unitConditionNote = `Списано: утрата арендатором (${returnCondition})`;
        }

        db.prepare('UPDATE inventory_units SET status = ?, condition_note = ? WHERE id = ?')
          .run(newUnitStatus, unitConditionNote, booking.inventory_unit_id);

        addWarehouseLog({
            inventory_unit_id: booking.inventory_unit_id,
            action_type: newUnitStatus === 'available' ? 'return' : (newUnitStatus === 'maintenance' ? 'maintenance_start' : 'decommission'),
            details: `Возврат от клиента ${booking.client_name} по брони ${bookingId}. Состояние: ${returnCondition}. Штраф: ${totalFines} ₽`,
            actor_name: managerName
        });
    }

    const historyComment = `Оборудование возвращено. ` +
        (lateDays > 0 ? `Просрочка: ${lateDays} дн. (штраф ${lateFine} ₽). ` : '') +
        (damageFine > 0 ? `Ущерб: ${damageFine} ₽ (${returnCondition}). ` : '') +
        `Возврат залога: ${depositRefunded} ₽ из ${booking.deposit_amount} ₽.`;

    addBookingHistory(bookingId, 'completed', managerName, historyComment);

    return getBookingById(bookingId);
}

function cancelBooking(bookingId, actor = 'Клиент', reason = '') {
    const booking = getBookingById(bookingId);
    if (!booking) throw new Error('Бронирование не найдено');
    if (!['pending', 'confirmed'].includes(booking.status)) {
        throw new Error(`Нельзя отменить бронь в статусе "${booking.status}"`);
    }

    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('cancelled', bookingId);
    addBookingHistory(bookingId, 'cancelled', actor, `Бронирование отменено. Причина: ${reason || 'по запросу пользователя'}`);
    return getBookingById(bookingId);
}

function deleteBooking(id) {
    return db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
}

function getFinesCatalog() {
    return db.prepare('SELECT * FROM fines_catalog ORDER BY id ASC').all();
}

function updateFineRule(id, { default_amount, calculation_rule, description }) {
    db.prepare(`
        UPDATE fines_catalog 
        SET default_amount = ?, calculation_rule = ?, description = ?
        WHERE id = ?
    `).run(default_amount, calculation_rule, description, id);
    return db.prepare('SELECT * FROM fines_catalog WHERE id = ?').get(id);
}

function getAnalytics() {
    
    const bookingsList = db.prepare('SELECT * FROM bookings').all();
    const inventoryList = db.prepare('SELECT * FROM inventory_units').all();

    let totalRentalRevenue = 0;
    let totalFinesRevenue = 0;
    let activeCount = 0;
    let completedCount = 0;
    let overdueCount = 0;

    for (const b of bookingsList) {
        if (b.status !== 'cancelled') {
            totalRentalRevenue += b.total_cost || 0;
        }
        totalFinesRevenue += b.total_fines || 0;

        if (b.status === 'active') activeCount++;
        else if (b.status === 'completed') completedCount++;
        else if (b.status === 'overdue') overdueCount++;
    }

    const totalUnits = inventoryList.length;
    const rentedUnits = inventoryList.filter(u => u.status === 'rented').length;
    const maintenanceUnits = inventoryList.filter(u => u.status === 'maintenance').length;
    const decommissionedUnits = inventoryList.filter(u => u.status === 'decommissioned').length;
    const availableUnits = inventoryList.filter(u => u.status === 'available').length;

    const utilizationRate = totalUnits > 0 ? Math.round((rentedUnits / totalUnits) * 100) : 0;

    
    const categoryStats = db.prepare(`
        SELECT e.category, COUNT(b.id) as bookings_count, SUM(b.total_cost) as total_revenue
        FROM equipment e
        LEFT JOIN bookings b ON e.id = b.equipment_id AND b.status != 'cancelled'
        GROUP BY e.category
    `).all();

    
    const dailyStats = db.prepare(`
        SELECT substr(created_at, 1, 10) as date, 
               COUNT(id) as bookings_count,
               SUM(total_cost) as rental_revenue,
               SUM(total_fines) as fines_revenue
        FROM bookings
        WHERE status != 'cancelled'
        GROUP BY substr(created_at, 1, 10)
        ORDER BY date ASC
        LIMIT 10
    `).all();

    
    const topEquipment = db.prepare(`
        SELECT e.id, e.title, e.category, COUNT(b.id) as rent_count, SUM(b.total_cost) as revenue
        FROM equipment e
        JOIN bookings b ON e.id = b.equipment_id AND b.status != 'cancelled'
        GROUP BY e.id
        ORDER BY rent_count DESC
        LIMIT 5
    `).all();

    return {
        kpi: {
            totalRevenue: totalRentalRevenue + totalFinesRevenue,
            rentalRevenue: totalRentalRevenue,
            finesRevenue: totalFinesRevenue,
            activeBookings: activeCount,
            completedBookings: completedCount,
            overdueBookings: overdueCount,
            totalInventory: totalUnits,
            availableUnits,
            rentedUnits,
            maintenanceUnits,
            decommissionedUnits,
            utilizationRate
        },
        categoryStats,
        dailyStats,
        topEquipment,
        inventoryStatus: {
            available: availableUnits,
            rented: rentedUnits,
            maintenance: maintenanceUnits,
            decommissioned: decommissionedUnits
        }
    };
}

function seedDatabase() {
    const usersCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (usersCount > 0) return; 

    console.log('[RENTPRO] Инициализация демонстрационных данных в rental.db...');

    
    const admin = createUser({
        name: 'Александр Волков (Главный администратор)',
        email: 'admin@rentpro.ru',
        phone: '+7 (999) 000-01-01',
        password: 'admin123',
        role: 'admin'
    });

    const manager1 = createUser({
        name: 'Иван Сергеев (Старший менеджер)',
        email: 'manager@rentpro.ru',
        phone: '+7 (999) 111-02-02',
        password: 'manager123',
        role: 'manager'
    });

    const manager2 = createUser({
        name: 'Анна Воронова (Менеджер выдачи)',
        email: 'anna@rentpro.ru',
        phone: '+7 (999) 222-03-03',
        password: 'manager123',
        role: 'manager'
    });

    const client1 = createUser({
        name: 'Дмитрий Соколов',
        email: 'client@mail.ru',
        phone: '+7 (999) 333-04-04',
        password: 'client123',
        role: 'client'
    });

    const client2 = createUser({
        name: 'Алексей Морозов',
        email: 'alex@sport.ru',
        phone: '+7 (999) 444-05-05',
        password: 'client123',
        role: 'client'
    });

    
    const eqData = [
        
        {
            title: 'Горный велосипед GT Avalanche Expert 29"',
            category: 'Спортивное',
            daily_rate: 1200,
            deposit: 5000,
            description: 'Профессиональный горный хардтейл с алюминиевой рамой Triple Triangle, дисковой гидравликой Shimano и трансмиссией 1x12.',
            specs: { 'Колеса': '29 дюймов', 'Тормоза': 'Дисковая гидравлика Shimano', 'Рама': 'Алюминий 6061 T6', 'Скорости': '12 (SRAM SX Eagle)', 'Вес': '13.8 кг' },
            image: 'bike.png'
        },
        {
            title: 'Электросамокат Kugoo Kirin G2 Pro',
            category: 'Спортивное',
            daily_rate: 1500,
            deposit: 6000,
            description: 'Мощный внедорожный электросамокат для города и пересеченной местности. Полный привод, двойная подвеска, светодиодная оптика.',
            specs: { 'Мощность': '1000 Вт', 'Макс. скорость': '50 км/ч', 'Запас хода': 'до 45 км', 'Грузоподъемность': 'до 130 кг', 'Вес': '25 кг' },
            image: 'scooter.png'
        },

        
        {
            title: 'Палатка кемпинговая 4-местная Tramp Brest 4 V2',
            category: 'Туристическое',
            daily_rate: 900,
            deposit: 4000,
            description: 'Двухкомнатная кемпинговая палатка с просторным высоким тамбуром в полный рост, двумя отдельными спальными отсеками и ветрозащитной юбкой.',
            specs: { 'Вместимость': '4 человека', 'Водостойкость тента': '5000 мм в.ст.', 'Водостойкость дна': '10000 мм', 'Каркас': 'Дюрапол 11 мм', 'Вес': '12.5 кг' },
            image: 'tent.png'
        },
        {
            title: 'Генератор бензиновый инверторный Champion IGG1200',
            category: 'Туристическое',
            daily_rate: 1300,
            deposit: 5000,
            description: 'Компактный бесшумный инверторный генератор с чистой синусоидой для кемпинга, полевых работ и чувствительной электроники.',
            specs: { 'Мощность': '1.0 кВт (пик 1.2 кВт)', 'Объем бака': '2.8 л', 'Расход топлива': '0.6 л/ч', 'Уровень шума': '58 дБ', 'Вес': '12 кг' },
            image: 'generator.png'
        },

        
        {
            title: 'Перфоратор тяжелый SDS-Max Bosch GBH 8-45 DV',
            category: 'Строительное',
            daily_rate: 1600,
            deposit: 7000,
            description: 'Мощный строительный перфоратор SDS-Max с энергией удара 12.5 Дж, системой гашения вибрации Vibration Control и кейсом с бурами.',
            specs: { 'Энергия удара': '12.5 Дж', 'Мощность': '1500 Вт', 'Патрон': 'SDS-Max', 'Макс. диаметр': '45 мм (коронкой 125 мм)', 'Вес': '8.9 кг' },
            image: 'drill.png'
        },
        {
            title: 'Виброплита бензиновая Husqvarna LF 75 (75 кг)',
            category: 'Строительное',
            daily_rate: 2200,
            deposit: 10000,
            description: 'Профессиональная прямоходная виброплита с двигателем Honda GX160 и встроенным баком для воды для уплотнения асфальта и песка.',
            specs: { 'Двигатель': 'Honda GX160 (5.5 л.с.)', 'Центробежная сила': '15 кН', 'Ширина плиты': '420 мм', 'Скорость': '27 м/мин', 'Вес': '75 кг' },
            image: 'compactor.png'
        }
    ];

    const insertedEquipment = [];
    for (const item of eqData) {
        insertedEquipment.push(addEquipment(item));
    }

    
    const unitConfigs = [
        
        { eqIdx: 0, code: 'INV-SPT-101', sn: 'GT-2025-9941', status: 'available', cond: 'Отличное, смазка цепи свежая', loc: 'Склад 1, Стойка В-1' },
        { eqIdx: 0, code: 'INV-SPT-102', sn: 'GT-2025-9942', status: 'available', cond: 'Отличное', loc: 'Склад 1, Стойка В-2' },
        { eqIdx: 0, code: 'INV-SPT-103', sn: 'GT-2025-9943', status: 'available', cond: 'Хорошее', loc: 'Склад 1, Стойка В-3' },

        
        { eqIdx: 1, code: 'INV-SPT-201', sn: 'KG-G2P-0081', status: 'available', cond: 'Отличное, батарея 100%', loc: 'Склад 1, Зарядная станция' },
        { eqIdx: 1, code: 'INV-SPT-202', sn: 'KG-G2P-0082', status: 'available', cond: 'Отличное', loc: 'Склад 1, Зарядная станция' },
        { eqIdx: 1, code: 'INV-SPT-203', sn: 'KG-G2P-0083', status: 'maintenance', cond: 'Требуется замена задней колодки', loc: 'Ремзона, Стол 2' },

        
        { eqIdx: 2, code: 'INV-TRM-101', sn: 'TRP-BR4-101', status: 'available', cond: 'Чистая, колышки и дуги в комплекте', loc: 'Склад 2, Стеллаж T-1' },
        { eqIdx: 2, code: 'INV-TRM-102', sn: 'TRP-BR4-102', status: 'available', cond: 'Отличное', loc: 'Склад 2, Стеллаж T-1' },

        
        { eqIdx: 3, code: 'INV-TRM-201', sn: 'CHP-IG1-301', status: 'available', cond: 'Масло заменено, готов к пуску', loc: 'Склад 2, Секция Г-1' },
        { eqIdx: 3, code: 'INV-TRM-202', sn: 'CHP-IG1-302', status: 'available', cond: 'Отличное состояние', loc: 'Склад 2, Секция Г-1' },

        
        { eqIdx: 4, code: 'INV-BLD-101', sn: 'BSH-845-111', status: 'available', cond: 'В смазке, буры в кейсе', loc: 'Склад 3, Стеллаж Б-1' },
        { eqIdx: 4, code: 'INV-BLD-102', sn: 'BSH-845-112', status: 'available', cond: 'Отличное', loc: 'Склад 3, Стеллаж Б-1' },

        
        { eqIdx: 5, code: 'INV-BLD-201', sn: 'HSQ-LF7-201', status: 'available', cond: 'Проверена на вибростенде', loc: 'Тяжелая площадка 1' },
        { eqIdx: 5, code: 'INV-BLD-202', sn: 'HSQ-LF7-202', status: 'available', cond: 'Новая, резервная', loc: 'Тяжелая площадка 1' }
    ];

    const insertedUnits = [];
    for (const uc of unitConfigs) {
        const eq = insertedEquipment[uc.eqIdx];
        const unit = addInventoryUnit({
            equipment_id: eq.id,
            inventory_number: uc.code,
            serial_number: uc.sn,
            status: uc.status,
            condition_note: uc.cond,
            location: uc.loc,
            actor: 'Александр Волков'
        });
        insertedUnits.push(unit);
    }

    
    const fines = [
        {
            code: 'late_penalty',
            title: 'Штраф за просрочку возврата инвентаря',
            category: 'Сроки',
            default_amount: 150, 
            calculation_rule: '1.5 * daily_rate * late_days',
            description: 'Начисляется автоматически за каждый календарный день задержки инвентаря сверх согласованной даты.'
        },
        {
            code: 'cleaning_fee',
            title: 'Штраф за возврат инвентаря в грязном виде',
            category: 'Уход',
            default_amount: 500,
            calculation_rule: '500 ₽ фикс',
            description: 'Взимается, если снаряжение возвращено с засохшей грязью, битумом или масляными следами.'
        },
        {
            code: 'minor_damage',
            title: 'Незначительное повреждение (скол, царапина, порез)',
            category: 'Ущерб',
            default_amount: 1500,
            calculation_rule: '1500 ₽ фикс',
            description: 'Повреждения лакокрасочного покрытия, мелкие вмятины корпуса, не влияющие на работоспособность.'
        },
        {
            code: 'major_damage',
            title: 'Существенное повреждение узлов и механизмов',
            category: 'Ущерб',
            default_amount: 3500,
            calculation_rule: '3500 ₽ или стоимость запчасти',
            description: 'Поломка привода, повреждение редуктора, глубокие трещины в раме или деформация вилки.'
        },
        {
            code: 'lost_item',
            title: 'Полная утрата или неремонтопригодность инвентаря',
            category: 'Утрата',
            default_amount: 10000,
            calculation_rule: '100% залога + возмещение',
            description: 'Утеря оборудования арендатором или критическое разрушение конструкции.'
        }
    ];

    for (const f of fines) {
        db.prepare(`
            INSERT INTO fines_catalog (code, title, category, default_amount, calculation_rule, description)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(f.code, f.title, f.category, f.default_amount, f.calculation_rule, f.description);
    }

    
    const today = new Date();
    const fmt = (d) => d.toISOString().split('T')[0];

    const unitBike = insertedUnits.find(u => u.inventory_number === 'INV-SPT-101');
    const unitTent = insertedUnits.find(u => u.inventory_number === 'INV-TRM-101');
    const unitPlate = insertedUnits.find(u => u.inventory_number === 'INV-BLD-201');

    
    const d1_start = new Date(today);
    d1_start.setDate(today.getDate() - 1);
    const d1_end = new Date(today);
    d1_end.setDate(today.getDate() + 2);

    const b1 = createBooking({
        client_id: client1.id,
        client_name: client1.name,
        client_phone: client1.phone,
        client_email: client1.email,
        equipment_id: insertedEquipment[0].id,
        start_date: fmt(d1_start),
        end_date: fmt(d1_end),
        extra_services: ['insurance', 'accessories'],
        notes: 'Дополнительно выдан защитный шлем и велозамок.'
    });

    confirmBooking(b1.id, manager1.name);
    pickupEquipment({
        bookingId: b1.id,
        inventoryUnitId: unitBike.id,
        managerId: manager1.id,
        managerName: manager1.name,
        pickupCondition: 'Идеальное состояние, протектор без износа'
    });

    
    const d2_start = new Date(today);
    d2_start.setDate(today.getDate() - 6);
    const d2_end = new Date(today);
    d2_end.setDate(today.getDate() - 3);

    const b2 = createBooking({
        client_id: client2.id,
        client_name: client2.name,
        client_phone: client2.phone,
        client_email: client2.email,
        equipment_id: insertedEquipment[2].id,
        start_date: fmt(d2_start),
        end_date: fmt(d2_end),
        extra_services: ['insurance'],
        notes: 'Поход выходного дня на озеро.'
    });
    confirmBooking(b2.id, manager2.name);
    pickupEquipment({
        bookingId: b2.id,
        inventoryUnitId: unitTent.id,
        managerId: manager2.id,
        managerName: manager2.name,
        pickupCondition: 'Чистая, комплектная'
    });
    returnEquipment({
        bookingId: b2.id,
        actualReturnDate: fmt(d2_end),
        returnCondition: 'Без замечаний, сдана вовремя',
        conditionSeverity: 'none',
        managerName: manager2.name
    });

    
    const d3_start = new Date(today);
    d3_start.setDate(today.getDate() - 5);
    const d3_end = new Date(today);
    d3_end.setDate(today.getDate() - 3);
    const d3_actual = new Date(today);
    d3_actual.setDate(today.getDate() - 1); 

    const b3 = createBooking({
        client_id: client1.id,
        client_name: client1.name,
        client_phone: client1.phone,
        client_email: client1.email,
        equipment_id: insertedEquipment[5].id,
        start_date: fmt(d3_start),
        end_date: fmt(d3_end),
        extra_services: ['delivery'],
        notes: 'Укладка тротуарной плитки на загородном участке.'
    });
    confirmBooking(b3.id, manager1.name);
    pickupEquipment({
        bookingId: b3.id,
        inventoryUnitId: unitPlate.id,
        managerId: manager1.id,
        managerName: manager1.name,
        pickupCondition: 'Исправна, заправлен бак для воды'
    });
    returnEquipment({
        bookingId: b3.id,
        actualReturnDate: fmt(d3_actual),
        returnCondition: 'Опоздание на 2 дня, возвращена чистой',
        conditionSeverity: 'none',
        managerName: manager1.name
    });

    
    const d4_start = new Date(today);
    d4_start.setDate(today.getDate() + 1);
    const d4_end = new Date(today);
    d4_end.setDate(today.getDate() + 3);

    createBooking({
        client_id: client2.id,
        client_name: client2.name,
        client_phone: client2.phone,
        client_email: client2.email,
        equipment_id: insertedEquipment[4].id,
        start_date: fmt(d4_start),
        end_date: fmt(d4_end),
        extra_services: ['accessories'],
        notes: 'Демонтаж бетонных перегородок в квартире.'
    });

    console.log('[RENTPRO] Демонстрационная база данных rental.db успешно создана и заполнена!');
}

seedDatabase();

module.exports = {
    
    hashPassword,
    verifyPassword,
    createUser,
    getUserByEmail,
    getUserById,
    getAllUsers,
    updateUserRole,
    deleteUser,

    
    getAllEquipment,
    getEquipmentById,
    addEquipment,
    updateEquipment,
    deleteEquipment,

    
    getAllInventoryUnits,
    getInventoryUnitById,
    addInventoryUnit,
    updateInventoryUnitStatus,
    addWarehouseLog,
    getWarehouseLogs,

    
    checkEquipmentAvailability,
    getDaysCount,
    calculateBookingQuote,

    
    createBooking,
    getBookingById,
    getAllBookings,
    confirmBooking,
    pickupEquipment,
    returnEquipment,
    cancelBooking,
    deleteBooking,

    
    getFinesCatalog,
    updateFineRule,

    
    getAnalytics
};
