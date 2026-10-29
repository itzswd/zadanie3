const test = require('node:test');
const assert = require('node:assert');
const db = require('./database.js');
const app = require('./server.js');

test('1. Пользователи, роли и криптографическое хеширование паролей', () => {
    const testEmail = `tester_${Date.now()}@rentpro.ru`;
    const user = db.createUser({
        name: 'Инженер-Тестировщик',
        email: testEmail,
        phone: '+7 999 111-22-33',
        password: 'securePassword2026',
        role: 'manager'
    });

    assert.ok(user.id, 'Пользователь должен получить ID');
    assert.strictEqual(user.email, testEmail);
    assert.strictEqual(user.role, 'manager');

    
    const stored = db.getUserByEmail(testEmail);
    assert.notStrictEqual(stored.password_hash, 'securePassword2026');
    assert.ok(stored.salt, 'Соль должна быть сгенерирована');

    
    assert.strictEqual(db.verifyPassword('securePassword2026', stored.password_hash, stored.salt), true);
    assert.strictEqual(db.verifyPassword('wrongPassword', stored.password_hash, stored.salt), false);

    
    const updated = db.updateUserRole(user.id, 'admin');
    assert.strictEqual(updated.role, 'admin');

    
    db.deleteUser(user.id);
    assert.strictEqual(db.getUserByEmail(testEmail), undefined);
});

test('2. Каталог оборудования (CRUD и фильтрация по категориям)', () => {
    const initialList = db.getAllEquipment();
    assert.ok(Array.isArray(initialList));
    assert.ok(initialList.length >= 5);

    
    const newEq = db.addEquipment({
        title: 'Тестовый профессиональный нивелир Laser 3D',
        category: 'Строительное',
        daily_rate: 850,
        deposit: 4000,
        description: 'Лазерный построитель плоскостей на 360 градусов с зеленым лучом.',
        specs: { 'Точность': '±0.2 мм/м', 'Дальность': '30 м', 'Питание': 'Li-Ion' },
        image: 'drill.svg',
        min_rental_days: 1
    });

    assert.ok(newEq.id);
    assert.strictEqual(newEq.daily_rate, 850);
    assert.strictEqual(newEq.category, 'Строительное');

    
    const buildingItems = db.getAllEquipment('Строительное');
    assert.ok(buildingItems.some(i => i.id === newEq.id));

    
    const updated = db.updateEquipment(newEq.id, { daily_rate: 900 });
    assert.strictEqual(updated.daily_rate, 900);

    
    db.deleteEquipment(newEq.id);
    assert.strictEqual(db.getEquipmentById(newEq.id), null);
});

test('3. Складской учёт (добавление единиц, статусы, ремонт и лог)', () => {
    const eqList = db.getAllEquipment();
    const testEq = eqList[0];

    const invNum = `TEST-INV-${Date.now()}`;
    const unit = db.addInventoryUnit({
        equipment_id: testEq.id,
        inventory_number: invNum,
        serial_number: 'SN-TEST-999',
        status: 'available',
        condition_note: 'Новое, с заводской консервации',
        location: 'Склад 1, Стеллаж Т-9',
        actor: 'Тестировщик'
    });

    assert.ok(unit.id);
    assert.strictEqual(unit.status, 'available');
    assert.strictEqual(unit.inventory_number, invNum);

    
    const inMaint = db.updateInventoryUnitStatus(unit.id, 'maintenance', 'Плановая замена подшипников', null, 'Мастер');
    assert.strictEqual(inMaint.status, 'maintenance');
    assert.ok(inMaint.last_service_date);

    
    const logs = db.getWarehouseLogs(10);
    assert.ok(logs.some(l => l.inventory_unit_id === unit.id));

    
    const restored = db.updateInventoryUnitStatus(unit.id, 'available', 'ТО завершено, готов к выдаче');
    assert.strictEqual(restored.status, 'available');
});

test('4. Калькулятор стоимости проката и дополнительных услуг', () => {
    const eqList = db.getAllEquipment();
    const testEq = eqList[0]; 

    const quote = db.calculateBookingQuote(testEq.id, '2026-11-01', '2026-11-03', ['insurance', 'accessories', 'delivery']);

    assert.strictEqual(quote.daysCount, 3, '1, 2 и 3 ноября = 3 суток');
    assert.strictEqual(quote.rentalCost, testEq.daily_rate * 3);

    
    const expectedIns = Math.round(testEq.daily_rate * 3 * 0.15);
    
    const expectedAcc = 300 * 3;
    
    const expectedDeliv = 700;
    const expectedExtras = expectedIns + expectedAcc + expectedDeliv;

    assert.strictEqual(quote.extraCost, expectedExtras);
    assert.strictEqual(quote.totalCost, quote.rentalCost + expectedExtras);
    assert.strictEqual(quote.depositAmount, testEq.deposit);
});

test('5. Граничные условия и проверка пересечений дат бронирования', () => {
    
    const eq = db.addEquipment({
        title: 'Уникальный стенд калибровки (1 шт)',
        category: 'Строительное',
        daily_rate: 2000,
        deposit: 10000,
        description: 'Оборудование в единственном экземпляре',
        specs: {},
        min_rental_days: 1
    });

    const unit = db.addInventoryUnit({
        equipment_id: eq.id,
        inventory_number: `UNIQ-${Date.now()}`,
        serial_number: 'SN-001',
        status: 'available',
        actor: 'Тест'
    });

    
    const chk1 = db.checkEquipmentAvailability(eq.id, '2026-11-10', '2026-11-15');
    assert.strictEqual(chk1.available, true);
    assert.strictEqual(chk1.availableCount, 1);

    
    const b1 = db.createBooking({
        client_name: 'Тест Арендатор',
        client_phone: '+7 999 000-00-00',
        client_email: 'test@rent.ru',
        equipment_id: eq.id,
        start_date: '2026-11-10',
        end_date: '2026-11-15'
    });
    assert.ok(b1.id);

    
    const chkExact = db.checkEquipmentAvailability(eq.id, '2026-11-10', '2026-11-15');
    assert.strictEqual(chkExact.available, false);
    assert.strictEqual(chkExact.availableCount, 0);

    
    const chkOverlapStart = db.checkEquipmentAvailability(eq.id, '2026-11-08', '2026-11-12');
    assert.strictEqual(chkOverlapStart.available, false);

    
    const chkOverlapEnd = db.checkEquipmentAvailability(eq.id, '2026-11-13', '2026-11-18');
    assert.strictEqual(chkOverlapEnd.available, false);

    
    const chkInside = db.checkEquipmentAvailability(eq.id, '2026-11-11', '2026-11-14');
    assert.strictEqual(chkInside.available, false);

    
    const chkEnclosing = db.checkEquipmentAvailability(eq.id, '2026-11-05', '2026-11-20');
    assert.strictEqual(chkEnclosing.available, false);

    
    assert.throws(() => {
        db.createBooking({
            client_name: 'Второй Арендатор',
            client_phone: '+7 999 222-22-22',
            client_email: 'overlap@rent.ru',
            equipment_id: eq.id,
            start_date: '2026-11-12',
            end_date: '2026-11-14'
        });
    }, /занято или недоступно/);

    
    
    const chkBefore = db.checkEquipmentAvailability(eq.id, '2026-11-05', '2026-11-09');
    assert.strictEqual(chkBefore.available, true);

    
    const chkAfter = db.checkEquipmentAvailability(eq.id, '2026-11-16', '2026-11-20');
    assert.strictEqual(chkAfter.available, true);

    
    db.deleteBooking(b1.id);
    db.deleteEquipment(eq.id);
});

test('6. Полный жизненный цикл аренды (создание, подтверждение, выдача, возврат)', () => {
    const eqList = db.getAllEquipment();
    const testEq = eqList[1]; 
    const units = db.getEquipmentById(testEq.id).units.filter(u => u.status === 'available');
    assert.ok(units.length > 0);
    const targetUnit = units[0];

    
    const b = db.createBooking({
        client_name: 'Сергей Тестовый',
        client_phone: '+7 999 555-55-55',
        client_email: 'sergey@test.ru',
        equipment_id: testEq.id,
        start_date: '2026-11-20',
        end_date: '2026-11-22',
        extra_services: ['insurance']
    });

    assert.strictEqual(b.status, 'pending');

    
    const confirmed = db.confirmBooking(b.id, 'Менеджер Анна');
    assert.strictEqual(confirmed.status, 'confirmed');

    
    const pickedUp = db.pickupEquipment({
        bookingId: b.id,
        inventoryUnitId: targetUnit.id,
        managerName: 'Менеджер Анна',
        pickupCondition: 'Идеальное состояние, батарея 100%'
    });

    assert.strictEqual(pickedUp.status, 'active');
    assert.strictEqual(pickedUp.inventory_unit_id, targetUnit.id);

    
    const unitAfterPickup = db.getInventoryUnitById(targetUnit.id);
    assert.strictEqual(unitAfterPickup.status, 'rented');

    
    const returned = db.returnEquipment({
        bookingId: b.id,
        actualReturnDate: '2026-11-22',
        returnCondition: 'Без повреждений, возвращен вовремя',
        conditionSeverity: 'none',
        managerName: 'Менеджер Анна'
    });

    assert.strictEqual(returned.status, 'completed');
    assert.strictEqual(returned.late_days, 0);
    assert.strictEqual(returned.total_fines, 0);
    assert.strictEqual(returned.deposit_refunded, testEq.deposit);

    
    const unitAfterReturn = db.getInventoryUnitById(targetUnit.id);
    assert.strictEqual(unitAfterReturn.status, 'available');

    db.deleteBooking(b.id);
});

test('7. Расчёт штрафов за просрочку и повреждение инвентаря', () => {
    const eqList = db.getAllEquipment();
    const testEq = eqList[2]; 
    const units = db.getEquipmentById(testEq.id).units.filter(u => u.status === 'available');
    assert.ok(units.length > 0);
    const targetUnit = units[0];

    
    const b = db.createBooking({
        client_name: 'Виктор Штрафной',
        client_phone: '+7 999 777-88-99',
        client_email: 'viktor@test.ru',
        equipment_id: testEq.id,
        start_date: '2026-11-01',
        end_date: '2026-11-01'
    });

    db.confirmBooking(b.id);
    db.pickupEquipment({ bookingId: b.id, inventoryUnitId: targetUnit.id });

    
    const returned = db.returnEquipment({
        bookingId: b.id,
        actualReturnDate: '2026-11-03',
        returnCondition: 'Порез плавника, опоздание на 2 дня',
        conditionSeverity: 'minor_damage',
        managerName: 'Менеджер'
    });

    assert.strictEqual(returned.late_days, 2);
    
    const expectedLateFine = Math.round(2 * testEq.daily_rate * 1.5);
    assert.strictEqual(returned.late_fine, expectedLateFine);
    assert.strictEqual(returned.damage_fine, 1500);

    const totalFines = expectedLateFine + 1500;
    assert.strictEqual(returned.total_fines, totalFines);
    assert.strictEqual(returned.deposit_refunded, Math.max(0, testEq.deposit - totalFines));

    
    const unitState = db.getInventoryUnitById(targetUnit.id);
    assert.strictEqual(unitState.status, 'maintenance');

    
    db.updateInventoryUnitStatus(targetUnit.id, 'available', 'Плавник заменен');
    db.deleteBooking(b.id);
});

test('8. HTTP REST API эндпоинты (сервер, авторизация, заказы, калькулятор)', async (t) => {
    const server = app.listen(0);
    t.after(() => server.close());
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    
    const resCatalog = await fetch(`${baseUrl}/api/equipment`);
    assert.strictEqual(resCatalog.status, 200);
    const catalog = await resCatalog.json();
    assert.ok(Array.isArray(catalog));
    assert.ok(catalog.length >= 5);

    
    const resCalc = await fetch(`${baseUrl}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            equipmentId: catalog[0].id,
            startDate: '2026-12-01',
            endDate: '2026-12-03',
            extraServices: ['insurance']
        })
    });
    assert.strictEqual(resCalc.status, 200);
    const calcData = await resCalc.json();
    assert.ok(calcData.quote);
    assert.strictEqual(calcData.quote.daysCount, 3);
    assert.strictEqual(calcData.availability.available, true);

    
    const resLoginGood = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'client@mail.ru', password: 'client123' })
    });
    assert.strictEqual(resLoginGood.status, 200);
    const loginUser = await resLoginGood.json();
    assert.strictEqual(loginUser.email, 'client@mail.ru');

    const resLoginBad = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'client@mail.ru', password: 'WRONG' })
    });
    assert.strictEqual(resLoginBad.status, 401);

    
    const resAnalytics = await fetch(`${baseUrl}/api/analytics`);
    assert.strictEqual(resAnalytics.status, 200);
    const analytics = await resAnalytics.json();
    assert.ok(analytics.kpi);
    assert.ok(typeof analytics.kpi.totalRevenue === 'number');
});
