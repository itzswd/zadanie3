
function generateBarcodeSVG(code) {
    let bars = '';
    let x = 10;
    for (let i = 0; i < code.length; i++) {
        const charCode = code.charCodeAt(i);
        const w1 = (charCode % 3) + 1;
        const w2 = ((charCode >> 1) % 2) + 1;
        bars += `<rect x="${x}" y="0" width="${w1 * 2}" height="40" fill="#000" />`;
        x += (w1 * 2) + w2 + 2;
    }
    return `<svg class="barcode-svg" viewBox="0 0 ${x + 10} 50" xmlns="http://www.w3.org/2000/svg">${bars}<text x="${(x + 10) / 2}" y="48" font-size="10" text-anchor="middle" font-family="monospace">${code}</text></svg>`;
}

function printRentalContract(booking) {
    let printArea = document.getElementById('print-area');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'print-area';
        document.body.appendChild(printArea);
    }

    const todayStr = new Date().toLocaleDateString('ru-RU');
    const invNumber = booking.inventory_number || 'Назначается при выдаче';
    const sn = booking.serial_number || 'По акту склада';

    let finesSection = '';
    if (booking.total_fines > 0) {
        finesSection = `
            <div style="margin: 12px 0; padding: 8px; border: 1px dashed #d00; background: #fff5f5;">
                <strong>Акт фиксации нарушений и штрафных санкций:</strong><br>
                ${booking.late_days > 0 ? `• Просрочка возврата: ${booking.late_days} дн. (штраф ${booking.late_fine} ₽)<br>` : ''}
                ${booking.damage_fine > 0 ? `• Повреждение инвентаря: ${booking.damage_fine} ₽ (Состояние: ${booking.return_condition})<br>` : ''}
                <strong>Итого удержано из залога: ${booking.total_fines} ₽. Возврат клиенту: ${booking.deposit_refunded} ₽.</strong>
            </div>
        `;
    }

    const html = `
        <div class="contract-header">
            <div style="font-size: 11pt; color: #555; text-transform: uppercase; letter-spacing: 1px;">Сеть пунктов проката профессионального оборудования «RENTPRO»</div>
            <div class="contract-title">ДОГОВОР ПРОКАТА И АКТ ПРИЁМА-ПЕРЕДАЧИ № ${booking.id}</div>
            <div style="font-size: 10pt;">г. Москва • Дата составления: ${todayStr}</div>
        </div>

        <div class="contract-parties">
            <p><strong>Арендодатель:</strong> ООО «РЕНТПРО СЕРВИС», ОГРН 1247700891234, ИНН 7701984210, адрес: г. Москва, ул. Промышленная, д. 14, тел: +7 (800) 555-35-35.</p>
            <p><strong>Арендатор:</strong> ${booking.client_name}, телефон: ${booking.client_phone}, email: ${booking.client_email}.</p>
        </div>

        <table class="contract-table">
            <thead>
                <tr>
                    <th>№</th>
                    <th>Наименование инвентаря</th>
                    <th>Инвентарный №</th>
                    <th>Серийный №</th>
                    <th>Срок аренды</th>
                    <th>Суточный тариф</th>
                    <th>Залог</th>
                    <th>Итого аренда</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>1</td>
                    <td><strong>${booking.equipment_title}</strong> (${booking.equipment_category})</td>
                    <td>${invNumber}</td>
                    <td>${sn}</td>
                    <td>${booking.start_date} — ${booking.end_date} (${booking.days_count} сут.)</td>
                    <td>${booking.daily_rate} ₽</td>
                    <td>${booking.deposit_amount} ₽</td>
                    <td><strong>${booking.total_cost} ₽</strong></td>
                </tr>
            </tbody>
        </table>

        ${finesSection}

        <div class="contract-terms">
            <p><strong>1. Предмет договора:</strong> Арендодатель передает, а Арендатор принимает во временное владение и пользование указанное в настоящем договоре оборудование в исправном техническом и санитарном состоянии.</p>
            <p><strong>2. Состояние при передаче:</strong> ${booking.pickup_condition || 'Оборудование проверено в присутствии клиента, механических повреждений и дефектов не обнаружено.'}</p>
            <p><strong>3. Ответственность и штрафные санкции:</strong> В случае задержки возврата инвентаря Арендатор уплачивает штраф в размере 150% суточной стоимости за каждый день просрочки. При возврате оборудования в грязном виде удерживается 500 ₽ за чистку. При повреждении или утрате инвентаря ущерб компенсируется из суммы внесенного залога в соответствии с утвержденным прейскурантом сервиса.</p>
            <p><strong>4. Статус оборудования:</strong> Инвентарь возвращен в установленный срок: _____________________ (подпись сотрудника пункта).</p>
        </div>

        <div class="barcode-box">
            ${generateBarcodeSVG(booking.id)}
        </div>

        <div class="contract-signatures">
            <div class="sign-col">
                <p><strong>От Арендодателя:</strong></p>
                <div class="sign-line"></div>
                <p style="font-size: 9pt; color: #555;">(Менеджер: ${booking.manager_name || 'Пункт выдачи RENTPRO'} / Подпись / М.П.)</p>
            </div>
            <div class="sign-col">
                <p><strong>От Арендатора:</strong></p>
                <div class="sign-line"></div>
                <p style="font-size: 9pt; color: #555;">(Клиент: ${booking.client_name} / Подпись)</p>
            </div>
        </div>
    `;

    printArea.innerHTML = html;
    window.print();
}

window.printRentalContract = printRentalContract;
