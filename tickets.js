// ==========================================
// SISTEMA DE TICKETS - Impresora Térmica POS
// Formato: 58mm / 80mm (tirilla)
// ==========================================

function getTicketStyles() {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', 'Lucida Console', monospace; font-size: 12px; width: 280px; padding: 8px; color: #000; line-height: 1.4; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .big { font-size: 14px; }
        .small { font-size: 10px; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .double-line { border-top: 2px solid #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .row-3 { display: flex; margin: 2px 0; }
        .row-3 .qty { width: 30px; }
        .row-3 .name { flex: 1; }
        .row-3 .price { width: 70px; text-align: right; }
        .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin: 4px 0; }
        .logo-section { margin-bottom: 6px; }
        .logo-section img { max-width: 60px; max-height: 60px; }
        .kitchen-item { font-size: 14px; font-weight: bold; margin: 4px 0; padding: 4px 0; border-bottom: 1px dotted #ccc; }
        .kitchen-qty { font-size: 18px; font-weight: bold; }
        @media print { body { width: 100%; } @page { margin: 0; size: 80mm auto; } }
    `;
}

function getBusinessHeader() {
    const logo = settings.customization?.logo;
    const slogan = settings.customization?.slogan;
    let html = '<div class="center logo-section">';
    if (logo) html += `<img src="${logo}"><br>`;
    html += `<span class="bold big">${esc(settings.businessName || 'Mi Negocio')}</span>`;
    if (slogan) html += `<br><span class="small">${esc(slogan)}</span>`;
    html += '</div>';
    return html;
}

// ==========================================
// 1. TICKET DE VENTA (al cobrar)
// ==========================================
function printSaleTicket(sale) {
    const fecha = new Date(sale.date).toLocaleString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const bruto = sale.price * sale.quantity;

    const html = `<!DOCTYPE html><html><head><style>${getTicketStyles()}</style></head><body>
        ${getBusinessHeader()}
        <div class="line"></div>
        <div class="center bold">RECIBO DE VENTA</div>
        <div class="center small">${fecha}</div>
        <div class="line"></div>
        <div class="row-3">
            <span class="qty bold">Cant</span>
            <span class="name bold">Producto</span>
            <span class="price bold">Subtotal</span>
        </div>
        <div class="line"></div>
        <div class="row-3">
            <span class="qty">${sale.quantity}</span>
            <span class="name">${esc(sale.productName)}</span>
            <span class="price">$${Math.round(bruto).toLocaleString('es-CO')}</span>
        </div>
        ${sale.discount > 0 ? `<div class="row"><span>Descuento (${sale.discount}%):</span><span>-$${Math.round(sale.discountAmount).toLocaleString('es-CO')}</span></div>` : ''}
        <div class="double-line"></div>
        <div class="total-row">
            <span>TOTAL:</span>
            <span>$${Math.round(sale.total).toLocaleString('es-CO')}</span>
        </div>
        <div class="double-line"></div>
        <div class="row"><span>Método:</span><span>${esc(sale.method)}</span></div>
        ${sale.client ? `<div class="row"><span>Cliente:</span><span>${esc(sale.client)}</span></div>` : ''}
        ${sale.notes ? `<div class="small">Nota: ${esc(sale.notes)}</div>` : ''}
        <div class="line"></div>
        <div class="center small">¡Gracias por su compra!</div>
        <div class="center small">Vuelva pronto</div>
        <br><br>
        <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;

    openTicketWindow(html);
}

// ==========================================
// 2. TICKET DE VENTA MÚLTIPLE (mesa completa)
// ==========================================
function printTableBillTicket(mesaName, items, total, method) {
    const fecha = new Date().toLocaleString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    let itemsHtml = items.map(i => `
        <div class="row-3">
            <span class="qty">${i.qty}</span>
            <span class="name">${esc(i.name)}</span>
            <span class="price">$${Math.round(i.price * i.qty).toLocaleString('es-CO')}</span>
        </div>
    `).join('');

    const html = `<!DOCTYPE html><html><head><style>${getTicketStyles()}</style></head><body>
        ${getBusinessHeader()}
        <div class="line"></div>
        <div class="center bold">CUENTA DE MESA</div>
        <div class="center">${esc(mesaName)}</div>
        <div class="center small">${fecha}</div>
        <div class="line"></div>
        <div class="row-3">
            <span class="qty bold">#</span>
            <span class="name bold">Producto</span>
            <span class="price bold">Valor</span>
        </div>
        <div class="line"></div>
        ${itemsHtml}
        <div class="double-line"></div>
        <div class="total-row">
            <span>TOTAL:</span>
            <span>$${Math.round(total).toLocaleString('es-CO')}</span>
        </div>
        <div class="double-line"></div>
        <div class="row"><span>Artículos:</span><span>${items.reduce((s,i) => s+i.qty, 0)}</span></div>
        ${method ? `<div class="row"><span>Pago:</span><span>${esc(method)}</span></div>` : ''}
        <div class="line"></div>
        <div class="center small">¡Gracias por su visita!</div>
        <div class="center small">${esc(settings.businessName || '')}</div>
        <br><br>
        <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;

    openTicketWindow(html);
}

// ==========================================
// 3. TICKET DE COCINA (pedido para preparar)
// ==========================================
function printKitchenTicket(mesaName, items) {
    const fecha = new Date().toLocaleString('es-CO', { hour:'2-digit', minute:'2-digit' });

    let itemsHtml = items.map(i => `
        <div class="kitchen-item">
            <span class="kitchen-qty">x${i.qty}</span> ${esc(i.name)}
            ${i.notes ? `<div class="small">  → ${esc(i.notes)}</div>` : ''}
        </div>
    `).join('');

    const html = `<!DOCTYPE html><html><head><style>${getTicketStyles()}</style></head><body>
        <div class="center bold big">🍳 PEDIDO COCINA</div>
        <div class="double-line"></div>
        <div class="row">
            <span class="bold big">${esc(mesaName)}</span>
            <span>${fecha}</span>
        </div>
        <div class="double-line"></div>
        ${itemsHtml}
        <div class="double-line"></div>
        <div class="center bold">Total items: ${items.reduce((s,i) => s+i.qty, 0)}</div>
        <br><br><br>
        <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;

    openTicketWindow(html);
}

// ==========================================
// 4. PRE-CUENTA (para que el cliente vea antes de pagar)
// ==========================================
function printPreBillTicket(mesaName, items, total) {
    const fecha = new Date().toLocaleString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

    let itemsHtml = items.map(i => `
        <div class="row-3">
            <span class="qty">${i.qty}</span>
            <span class="name">${esc(i.name)}</span>
            <span class="price">$${Math.round(i.price * i.qty).toLocaleString('es-CO')}</span>
        </div>
    `).join('');

    const html = `<!DOCTYPE html><html><head><style>${getTicketStyles()}</style></head><body>
        ${getBusinessHeader()}
        <div class="line"></div>
        <div class="center bold">PRE-CUENTA</div>
        <div class="center">${esc(mesaName)}</div>
        <div class="center small">${fecha}</div>
        <div class="line"></div>
        <div class="row-3">
            <span class="qty bold">#</span>
            <span class="name bold">Descripción</span>
            <span class="price bold">Valor</span>
        </div>
        <div class="line"></div>
        ${itemsHtml}
        <div class="double-line"></div>
        <div class="total-row">
            <span>TOTAL:</span>
            <span>$${Math.round(total).toLocaleString('es-CO')}</span>
        </div>
        <div class="double-line"></div>
        <div class="center small">* Este NO es un recibo fiscal *</div>
        <div class="center small">Solicite su factura al pagar</div>
        <br><br>
        <script>window.onload=function(){window.print();}<\/script>
    </body></html>`;

    openTicketWindow(html);
}

// ==========================================
// UTILIDAD: Abrir ventana de impresión
// ==========================================
function openTicketWindow(html) {
    // Intentar con popup primero
    const win = window.open('', '_blank', 'width=320,height=600');
    if (win) {
        win.document.write(html);
        win.document.close();
        return;
    }
    
    // Fallback: usar iframe oculto si el popup fue bloqueado
    let iframe = document.getElementById('print-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe';
        iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:320px;height:600px;border:none;';
        document.body.appendChild(iframe);
    }
    iframe.contentDocument.open();
    iframe.contentDocument.write(html.replace('window.print()', ''));
    iframe.contentDocument.close();
    setTimeout(() => {
        iframe.contentWindow.print();
    }, 500);
    showToast('Imprimiendo ticket...', 'info');
}
