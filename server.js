const express = require('express');
const path = require('node:path');
const db = require('./database.js');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/auth/register', (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Пожалуйста, заполните имя, email и пароль.' });
        }

        const existing = db.getUserByEmail(email.toLowerCase().trim());
        if (existing) {
            return res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован.' });
        }

        
        const assignedRole = role === 'admin' ? 'client' : (role || 'client');

        const user = db.createUser({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            phone: phone ? phone.trim() : '',
            password,
            role: assignedRole
        });

        res.status(201).json({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка регистрации: ' + err.message });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Введите email и пароль.' });
        }

        const user = db.getUserByEmail(email.toLowerCase().trim());
        if (!user) {
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        }

        const isValid = db.verifyPassword(password, user.password_hash, user.salt);
        if (!isValid) {
            return res.status(401).json({ error: 'Неверный email или пароль.' });
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка авторизации: ' + err.message });
    }
});

app.get('/api/users', (req, res) => {
    try {
        const users = db.getAllUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users', (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'Все поля обязательны.' });
        }
        const existing = db.getUserByEmail(email.toLowerCase().trim());
        if (existing) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует.' });
        }
        const user = db.createUser({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            phone: phone ? phone.trim() : '',
            password,
            role
        });
        res.status(201).json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/users/:id/role', (req, res) => {
    try {
        const { role } = req.body;
        if (!['client', 'manager', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Недопустимая роль.' });
        }
        const updated = db.updateUserRole(Number(req.params.id), role);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/:id', (req, res) => {
    try {
        db.deleteUser(Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/equipment', (req, res) => {
    try {
        const { category, search } = req.query;
        const list = db.getAllEquipment(category, search);
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/equipment/:id', (req, res) => {
    try {
        const item = db.getEquipmentById(Number(req.params.id));
        if (!item) return res.status(404).json({ error: 'Оборудование не найдено.' });
        res.json(item);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/equipment', (req, res) => {
    try {
        const { title, category, daily_rate, deposit, description, specs, image, min_rental_days } = req.body;
        if (!title || !category || !daily_rate || !deposit) {
            return res.status(400).json({ error: 'Заполните название, категорию, тариф за сутки и залог.' });
        }
        const created = db.addEquipment({
            title: title.trim(),
            category,
            daily_rate: Number(daily_rate),
            deposit: Number(deposit),
            description,
            specs,
            image,
            min_rental_days: Number(min_rental_days) || 1
        });
        res.status(201).json(created);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/equipment/:id', (req, res) => {
    try {
        const updated = db.updateEquipment(Number(req.params.id), req.body);
        if (!updated) return res.status(404).json({ error: 'Оборудование не найдено.' });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/equipment/:id', (req, res) => {
    try {
        db.deleteEquipment(Number(req.params.id));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/equipment/:id/check-availability', (req, res) => {
    try {
        const { startDate, endDate, excludeBookingId } = req.body;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Укажите дату начала и окончания аренды.' });
        }
        const result = db.checkEquipmentAvailability(Number(req.params.id), startDate, endDate, excludeBookingId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/calculate', (req, res) => {
    try {
        const { equipmentId, startDate, endDate, extraServices } = req.body;
        if (!equipmentId || !startDate || !endDate) {
            return res.status(400).json({ error: 'Укажите equipmentId, дату начала и дату окончания.' });
        }
        const quote = db.calculateBookingQuote(Number(equipmentId), startDate, endDate, extraServices);
        const availability = db.checkEquipmentAvailability(Number(equipmentId), startDate, endDate);
        res.json({ quote, availability });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/bookings', (req, res) => {
    try {
        const { status, client_id, search } = req.query;
        const bookings = db.getAllBookings({ status, client_id, search });
        res.json(bookings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bookings/:id', (req, res) => {
    try {
        const booking = db.getBookingById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Бронирование не найдено.' });
        res.json(booking);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bookings', (req, res) => {
    try {
        const {
            client_id,
            client_name,
            client_phone,
            client_email,
            equipment_id,
            start_date,
            end_date,
            extra_services,
            notes
        } = req.body;

        if (!client_name || !client_phone || !client_email || !equipment_id || !start_date || !end_date) {
            return res.status(400).json({ error: 'Заполните все обязательные поля бронирования.' });
        }

        const newBooking = db.createBooking({
            client_id: client_id ? Number(client_id) : null,
            client_name,
            client_phone,
            client_email,
            equipment_id: Number(equipment_id),
            start_date,
            end_date,
            extra_services: extra_services || [],
            notes
        });

        res.status(201).json(newBooking);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.patch('/api/bookings/:id/confirm', (req, res) => {
    try {
        const managerName = req.body.managerName || 'Менеджер';
        const updated = db.confirmBooking(req.params.id, managerName);
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.patch('/api/bookings/:id/pickup', (req, res) => {
    try {
        const { inventoryUnitId, managerId, managerName, pickupCondition } = req.body;
        if (!inventoryUnitId) {
            return res.status(400).json({ error: 'Выберите инвентарную единицу для выдачи.' });
        }
        const updated = db.pickupEquipment({
            bookingId: req.params.id,
            inventoryUnitId: Number(inventoryUnitId),
            managerId: managerId ? Number(managerId) : null,
            managerName: managerName || 'Менеджер',
            pickupCondition: pickupCondition || 'Исправно, без повреждений'
        });
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.patch('/api/bookings/:id/return', (req, res) => {
    try {
        const {
            actualReturnDate,
            returnCondition,
            conditionSeverity,
            customDamageFine,
            managerName,
            notes
        } = req.body;

        const updated = db.returnEquipment({
            bookingId: req.params.id,
            actualReturnDate,
            returnCondition: returnCondition || 'Без замечаний',
            conditionSeverity: conditionSeverity || 'none',
            customDamageFine: Number(customDamageFine) || 0,
            managerName: managerName || 'Менеджер',
            notes
        });
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.patch('/api/bookings/:id/cancel', (req, res) => {
    try {
        const { actor, reason } = req.body;
        const updated = db.cancelBooking(req.params.id, actor || 'Пользователь', reason || '');
        res.json(updated);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/bookings/:id', (req, res) => {
    try {
        db.deleteBooking(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/inventory', (req, res) => {
    try {
        const units = db.getAllInventoryUnits();
        res.json(units);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/inventory/:id', (req, res) => {
    try {
        const unit = db.getInventoryUnitById(Number(req.params.id));
        if (!unit) return res.status(404).json({ error: 'Единица не найдена.' });
        res.json(unit);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory', (req, res) => {
    try {
        const { equipment_id, inventory_number, serial_number, status, condition_note, location, notes, actor } = req.body;
        if (!equipment_id || !inventory_number || !serial_number) {
            return res.status(400).json({ error: 'Заполните оборудование, инвентарный и серийный номер.' });
        }
        const unit = db.addInventoryUnit({
            equipment_id: Number(equipment_id),
            inventory_number: inventory_number.trim(),
            serial_number: serial_number.trim(),
            status: status || 'available',
            condition_note: condition_note || 'Отличное',
            location: location || 'Склад 1, Секция А',
            notes,
            actor: actor || 'Администратор'
        });
        res.status(201).json(unit);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/inventory/:id/status', (req, res) => {
    try {
        const { status, condition_note, notes, actor } = req.body;
        if (!status) return res.status(400).json({ error: 'Статус обязателен.' });
        const updated = db.updateInventoryUnitStatus(Number(req.params.id), status, condition_note, notes, actor);
        if (!updated) return res.status(404).json({ error: 'Единица не найдена.' });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/inventory-logs', (req, res) => {
    try {
        const logs = db.getWarehouseLogs(Number(req.query.limit) || 50);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/fines', (req, res) => {
    try {
        const fines = db.getFinesCatalog();
        res.json(fines);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/fines/:id', (req, res) => {
    try {
        const { default_amount, calculation_rule, description } = req.body;
        const updated = db.updateFineRule(Number(req.params.id), { default_amount, calculation_rule, description });
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/analytics', (req, res) => {
    try {
        const data = db.getAnalytics();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`[RENTPRO] Сервер запущен на http://localhost:${PORT}`);
    });
}

module.exports = app;
