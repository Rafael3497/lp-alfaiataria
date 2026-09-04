/* ============================================================
   O SEU ALFAIATE — CRM & Gestão de Atelier
   Lógica da aplicação & Sincronização Automática com o Google Sheets
   ============================================================ */

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzakRzQJnIMTYRvkMwU40hEy5PDZHIQV6PblEsj2j1gmhdO38ZqTKWpoHALiqGD6ZYMcw/exec";
const STORAGE_KEY = 'OSeuAlfaiate_CRM_Data';
const TAB_STORAGE_KEY = 'OSeuAlfaiate_LastTab';

const INITIAL_DATA = {
  clients: [
    { id: "cli-1", name: "Dr. Eduardo Alencar", phone: "11998765432", email: "eduardo.alencar@advocacia.com.br", notes: "Gosta de corte clássico inglês.", createdAt: "2026-02-15", measurements: { paleto: '', calca: '', colete: '', camisa: '' } },
    { id: "cli-2", name: "Gabriel Vasconcelos", phone: "11987651234", email: "gabriel.v@invest.com.br", notes: "Noivo. Casamento em breve.", createdAt: "2026-02-20", measurements: { paleto: '', calca: '', colete: '', camisa: '' } },
    { id: "cli-3", name: "Carlos Henrique Siqueira", phone: "21991234567", email: "carlos.siqueira@construtora.com", notes: "Cliente de camisaria.", createdAt: "2026-02-28", measurements: { paleto: '', calca: '', colete: '', camisa: '' } },
    { id: "cli-4", name: "Marcos Vinicius Prado", phone: "11977778888", email: "marcos.prado@tech.io", notes: "Blazer informal desestruturado.", createdAt: "2026-03-01", measurements: { paleto: '', calca: '', colete: '', camisa: '' } }
  ],
  orders: [
    { id: "ord-1", code: "PED-101", clientId: "cli-1", category: "Costume 2 Peças", description: "Lã Fria Super 130s Azul Marinho Pinstripe", totalValue: 5800.00, deadline: "2026-03-01", status: "Ajustes Finais", createdAt: "2026-02-16" },
    { id: "ord-2", code: "PED-102", clientId: "cli-2", category: "Terno 3 Peças", description: "Terno de Gala Cinza Chumbo com Colete Seda e Forro Jacquard", totalValue: 7500.00, deadline: getTodayIsoString(), status: "Pronto p/ Entrega", createdAt: "2026-02-20" },
    { id: "ord-3", code: "PED-103", clientId: "cli-3", category: "Camisa Sob Medida", description: "Kit com 3 Camisas Puro Algodão Egípcio 200 fios Branco e Azul Céu", totalValue: 2400.00, deadline: getFutureIsoDate(10), status: "1ª Prova", createdAt: "2026-02-28" },
    { id: "ord-4", code: "PED-104", clientId: "cli-4", category: "Blazer Sob Medida", description: "Blazer Italiano Verde Oliva em Linho com Seda", totalValue: 3900.00, deadline: getFutureIsoDate(15), status: "Corte & Modelagem", createdAt: "2026-03-02" }
  ],
  payments: [
    { id: "pay-1", orderId: "ord-1", amount: 3000.00, date: "2026-02-16", method: "Pix", notes: "Sinal de 50% no fechamento do corte" },
    { id: "pay-2", orderId: "ord-2", amount: 4000.00, date: "2026-02-20", method: "Cartão de Crédito", notes: "Entrada na medição" },
    { id: "pay-3", orderId: "ord-2", amount: 3500.00, date: getTodayIsoString(), method: "Pix", notes: "Quitação final no ato da liberação" },
    { id: "pay-4", orderId: "ord-3", amount: 1200.00, date: "2026-02-28", method: "Pix", notes: "Entrada" }
  ]
};

let appState = { clients: [], orders: [], payments: [] };

let financialChartInstance = null;
let statusChartInstance = null;
let syncTimeout = null;
let openModalStack = [];
let pendingOrderClientSelection = false;
let currentMeasurementsClientId = null;

// ================= HELPERS GERAIS =================

function getTodayIsoString() { return new Date().toISOString().split('T')[0]; }
function getFutureIsoDate(daysAhead) { const d = new Date(); d.setDate(d.getDate() + daysAhead); return d.toISOString().split('T')[0]; }
function formatBRL(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0); }
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const clean = String(dateStr).split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function debounce(fn, delay = 300) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

// ================= MÁSCARAS DE INPUT =================

function attachCurrencyMask(input) {
  input.setAttribute('inputmode', 'decimal');
  input.setAttribute('autocomplete', 'off');
  input.addEventListener('input', () => {
    let digits = input.value.replace(/\D/g, '');
    digits = digits.replace(/^0+(?=\d)/, '');
    if (!digits) { input.value = ''; input.dataset.raw = '0'; return; }
    while (digits.length < 3) digits = '0' + digits;
    const intPart = digits.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
    const decPart = digits.slice(-2);
    const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    input.value = `${withThousands},${decPart}`;
    input.dataset.raw = (parseInt(digits, 10) / 100).toString();
  });
}
function getCurrencyValue(input) {
  if (input.dataset.raw !== undefined) return parseFloat(input.dataset.raw) || 0;
  return parseFloat(String(input.value).replace(/\./g, '').replace(',', '.')) || 0;
}
function setCurrencyValue(input, value) {
  const v = Number(value) || 0;
  input.dataset.raw = v.toString();
  input.value = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function resetCurrencyInput(input) { input.value = ''; input.dataset.raw = '0'; }

function attachPhoneMask(input) {
  input.setAttribute('inputmode', 'tel');
  input.addEventListener('input', () => {
    let d = input.value.replace(/\D/g, '').slice(0, 11);
    let out = d;
    if (d.length > 10) { out = d.replace(/(\d{2})(\d{5})(\d{0,4})/, (m, a, b, c) => (c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`)); } 
    else if (d.length > 6) { out = d.replace(/(\d{2})(\d{4})(\d{0,4})/, (m, a, b, c) => (c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`)); } 
    else if (d.length > 2) { out = d.replace(/(\d{2})(\d{0,5})/, (m, a, b) => (b ? `(${a}) ${b}` : `(${a}`)); } 
    else if (d.length > 0) { out = `(${d}`; }
    input.value = out;
  });
}

// ================= TOASTS =================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');

  let borderClass = 'border-blue-500/30 bg-blue-500/10 text-blue-400';
  let icon = 'info';

  if (type === 'success') {
    borderClass = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
    icon = 'check-circle';
  } else if (type === 'error') {
    borderClass = 'border-red-500/30 bg-red-500/10 text-red-400';
    icon = 'alert-triangle';
  } else if (type === 'warning') {
    borderClass = 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    icon = 'alert-circle';
  }

  toast.className = `toast-item flex items-start gap-2.5 px-4 py-3 rounded-lg border ${borderClass} shadow-xl text-sm font-medium opacity-0 translate-y-2 pointer-events-auto bg-brand-darkCard transition-all duration-300`;
  toast.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4 shrink-0 mt-0.5"></i> <div class="flex-1 leading-snug">${escapeHtml(message)}</div>`;

  container.appendChild(toast);
  lucide.createIcons();
  requestAnimationFrame(() => toast.classList.remove('opacity-0', 'translate-y-2'));

  setTimeout(() => {
    toast.classList.add('opacity-0', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ================= DIÁLOGO DE CONFIRMAÇÃO =================

function confirmDialog({ title = 'Confirmar ação', message = '', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = {}) {
  return new Promise((resolve) => {
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const iconWrap = document.getElementById('confirm-icon');

    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    okBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;

    if(danger) {
      okBtn.className = 'bg-red-600 hover:bg-red-700 text-white py-2 px-4 text-xs font-bold rounded-lg transition';
      iconWrap.className = 'w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-red-500/15 text-red-500';
      iconWrap.innerHTML = `<i data-lucide="trash-2" class="w-5 h-5"></i>`;
    } else {
      okBtn.className = 'bg-brand-gold hover:bg-brand-goldHover text-brand-darkCard py-2 px-4 text-xs font-bold rounded-lg transition';
      iconWrap.className = 'w-10 h-10 rounded-lg flex items-center justify-center mb-4 bg-brand-gold/15 text-brand-gold';
      iconWrap.innerHTML = `<i data-lucide="help-circle" class="w-5 h-5"></i>`;
    }

    function cleanup(result) {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeModal('modal-confirm');
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);

    openModal('modal-confirm');
    lucide.createIcons();
  });
}

// ================= CACHE LOCAL & SINCRONIZAÇÃO AUTOMÁTICA COM GOOGLE SHEETS =================

function loadLocalCache() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      appState = JSON.parse(stored);
      appState.clients = appState.clients || [];
      appState.orders = appState.orders || [];
      appState.payments = appState.payments || [];
      appState.clients.forEach(c => {
        if(!c.measurements) c.measurements = { paleto: '', calca: '', colete: '', camisa: '' };
      });
    } else {
      appState = JSON.parse(JSON.stringify(INITIAL_DATA));
      saveLocalCache();
    }
  } catch (err) {
    appState = JSON.parse(JSON.stringify(INITIAL_DATA));
  }
}

function saveLocalCache() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); } 
  catch (err) { console.error("Erro ao salvar cache local:", err); }
}

function triggerRealtimeSync() {
  saveLocalCache();
  if (syncTimeout) clearTimeout(syncTimeout);

  syncTimeout = setTimeout(async () => {
    try {
      await fetch(WEB_APP_URL, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'SYNC_ALL', clients: appState.clients, orders: appState.orders, payments: appState.payments })
      });
    } catch (err) {
      console.warn("Sincronização em segundo plano adiada (modo offline detectado).", err);
    }
  }, 300);
}

async function fetchFromGoogleSheets(isManual = false) {
  const btn = document.getElementById('btn-manual-reload');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-brand-gold"></i>'; lucide.createIcons(); }

  try {
    const response = await fetch(WEB_APP_URL, { method: 'GET', redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.status === 'error') throw new Error(data.message || 'Erro retornado pela planilha');

    const normalized = normalizeGoogleSheetData(data);
    let hasData = false;
    if (normalized.clients.length > 0) { appState.clients = normalized.clients; hasData = true; }
    if (normalized.orders.length > 0) { appState.orders = normalized.orders; hasData = true; }
    if (normalized.payments.length > 0) { appState.payments = normalized.payments; hasData = true; }

    if (hasData) saveLocalCache();
    refreshData();
    if (isManual) showToast('Dados sincronizados com sucesso!', 'success');
  } catch (err) {
    if (isManual) showToast('Não foi possível conectar à planilha. Dados locais mantidos.', 'warning');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="rotate-cw" class="w-4 h-4"></i>'; lucide.createIcons(); }
  }
}

function normalizeGoogleSheetData(remoteData) {
  let normalizedClients = [], normalizedOrders = [], normalizedPayments = [];

  if (Array.isArray(remoteData.clients) && remoteData.clients.length > 0) {
    normalizedClients = remoteData.clients.map((c, index) => {
      const id = String(c.id || c['ID'] || c['Código'] || `cli-${index + 1}`).trim();
      const name = String(c.name || c['Nome'] || c['Cliente'] || c['NOME'] || `Cliente ${index + 1}`).trim();
      const phone = String(c.phone || c['Telefone'] || c['WhatsApp'] || c['Celular'] || '').trim();
      const email = String(c.email || c['E-mail'] || c['Email'] || '').trim();
      const notes = String(c.notes || c['Observações'] || c['Notas'] || '').trim();
      
      let measurements = { paleto: '', calca: '', colete: '', camisa: '' };
      if (c.measurements || c['Medidas']) {
        try { measurements = typeof (c.measurements || c['Medidas']) === 'string' ? JSON.parse(c.measurements || c['Medidas']) : (c.measurements || c['Medidas']); } catch(e) { }
      }
      return { id, name, phone, email, notes, createdAt: getTodayIsoString(), measurements };
    });
  }

  if (Array.isArray(remoteData.orders) && remoteData.orders.length > 0) {
    normalizedOrders = remoteData.orders.map((o, index) => {
      const id = String(o.id || o['ID'] || `ord-${index + 1}`).trim();
      const code = String(o.code || o['Código'] || o['CODIGO'] || o['Pedido'] || `PED-${100 + index + 1}`).trim();
      let clientId = String(o.clientId || o['Cliente ID'] || o['ID Cliente'] || '').trim();
      if (!clientId && (o['Cliente'] || o['Nome'])) {
        const clientName = String(o['Cliente'] || o['Nome']).toLowerCase();
        const found = normalizedClients.find(c => c.name.toLowerCase() === clientName);
        if (found) clientId = found.id;
      }
      if (!clientId && normalizedClients.length > 0) clientId = normalizedClients[0].id;
      const category = String(o.category || o['Produto'] || o['Peça'] || o['Categoria'] || 'Costume 2 Peças').trim();
      const description = String(o.description || o['Descrição'] || o['Tecido'] || '').trim();
      let rawVal = o.totalValue || o['Valor'] || o['Valor Total'] || o['Total'] || 0;
      if (typeof rawVal === 'string') rawVal = rawVal.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
      const totalValue = parseFloat(rawVal) || 0;
      let deadline = String(o.deadline || o['Prazo'] || o['Data de Entrega'] || o['Entrega'] || getFutureIsoDate(10)).trim();
      if (deadline.includes('T')) deadline = deadline.split('T')[0];
      const status = String(o.status || o['Status'] || o['Etapa'] || '1ª Prova').trim();
      return { id, code, clientId: clientId || 'cli-1', category, description, totalValue, deadline, status, createdAt: getTodayIsoString() };
    });
  }

  if (Array.isArray(remoteData.payments) && remoteData.payments.length > 0) {
    normalizedPayments = remoteData.payments.map((p, index) => {
      const id = String(p.id || p['ID'] || `pay-${index + 1}`).trim();
      let orderId = String(p.orderId || p['Pedido ID'] || p['ID Pedido'] || '').trim();
      if (!orderId && (p['Pedido'] || p['Código'])) {
        const orderCode = String(p['Pedido'] || p['Código']).trim();
        const found = normalizedOrders.find(o => o.code === orderCode);
        if (found) orderId = found.id;
      }
      if (!orderId && normalizedOrders.length > 0) orderId = normalizedOrders[0].id;
      let rawAmount = p.amount || p['Valor'] || p['Valor Pago'] || 0;
      if (typeof rawAmount === 'string') rawAmount = rawAmount.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
      const amount = parseFloat(rawAmount) || 0;
      let date = String(p.date || p['Data'] || getTodayIsoString()).trim();
      if (date.includes('T')) date = date.split('T')[0];
      const method = String(p.method || p['Forma de Pagamento'] || p['Método'] || 'Pix').trim();
      const notes = String(p.notes || p['Observações'] || '').trim();
      return { id, orderId, amount, date, method, notes };
    });
  }
  return { clients: normalizedClients, orders: normalizedOrders, payments: normalizedPayments };
}

// ================= CÁLCULOS =================

function calculateOrderFinancials(orderId) {
  const order = appState.orders.find(o => o.id === orderId);
  if (!order) return { paid: 0, remaining: 0, status: 'Em aberto' };

  const orderPayments = appState.payments.filter(p => p.orderId === orderId);
  const paid = orderPayments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
  const remaining = Math.max(0, Number(order.totalValue) - paid);

  let status = 'Em aberto';
  if (paid >= Number(order.totalValue) && Number(order.totalValue) > 0) status = 'Pago';
  else if (paid > 0) status = 'Parcial';
  return { paid, remaining, status };
}

function calculateOrderDeadline(deadlineStr, orderStatus) {
  if (orderStatus === 'Entregue') return { label: 'Entregue', class: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' };
  const today = getTodayIsoString();
  if (!deadlineStr) return { label: 'Sem prazo', class: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20' };
  const cleanDeadline = String(deadlineStr).split('T')[0];
  if (cleanDeadline < today) return { label: 'Atrasado', class: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/20' };
  if (cleanDeadline === today) return { label: 'Entrega hoje', class: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-500 border border-amber-500/30' };
  return { label: 'No prazo', class: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20' };
}

function calculateClientFinancials(clientId) {
  const clientOrders = appState.orders.filter(o => o.clientId === clientId);
  const ordersCount = clientOrders.length;
  let totalBought = 0, totalPaid = 0;
  clientOrders.forEach(o => {
    totalBought += Number(o.totalValue || 0);
    totalPaid += calculateOrderFinancials(o.id).paid;
  });
  const balance = Math.max(0, totalBought - totalPaid);
  return { ordersCount, totalBought, totalPaid, balance };
}

// ================= NAVEGAÇÃO =================

function switchTab(tabName) {
  const tabs = ['dashboard', 'pedidos', 'clientes', 'pagamentos'];
  tabs.forEach(t => {
    const view = document.getElementById(`view-${t}`);
    const btn = document.getElementById(`tab-btn-${t}`);
    const mBtn = document.getElementById(`m-tab-${t}`);
    if (view) view.classList.toggle('hidden', t !== tabName);

    if (btn) {
      btn.className = t === tabName
        ? "nav-tab px-3 py-2 rounded-lg text-sm font-medium text-brand-gold bg-brand-darkBorder transition-all flex items-center gap-2 shadow-sm"
        : "nav-tab px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-brand-slate/40 transition-all flex items-center gap-2";
      btn.setAttribute('aria-current', t === tabName ? 'page' : 'false');
    }
    if (mBtn) {
      mBtn.className = t === tabName
        ? "flex flex-col items-center text-[10px] text-brand-gold font-medium py-1"
        : "flex flex-col items-center text-[10px] text-slate-400 font-medium py-1";
    }
  });

  try { localStorage.setItem(TAB_STORAGE_KEY, tabName); } catch (e) { }

  if (tabName === 'dashboard') renderDashboard();
  else if (tabName === 'pedidos') renderOrdersTable();
  else if (tabName === 'clientes') renderClientsTable();
  else if (tabName === 'pagamentos') renderPaymentsTable();
  lucide.createIcons();
}

// ================= DASHBOARD =================

function renderDashboard() {
  let totalFaturado = 0, totalRecebido = 0, totalEmAberto = 0;
  let noPrazoCount = 0, hojeCount = 0, atrasadoCount = 0, entreguesCount = 0;

  appState.orders.forEach(order => {
    totalFaturado += Number(order.totalValue || 0);
    const fin = calculateOrderFinancials(order.id);
    totalRecebido += fin.paid;
    totalEmAberto += fin.remaining;

    const dl = calculateOrderDeadline(order.deadline, order.status);
    if (dl.label === 'No prazo') noPrazoCount++;
    else if (dl.label === 'Entrega hoje') hojeCount++;
    else if (dl.label === 'Atrasado') atrasadoCount++;
    else if (dl.label === 'Entregue') entreguesCount++;
  });

  const taxa = totalFaturado > 0 ? ((totalRecebido / totalFaturado) * 100).toFixed(0) : 0;

  document.getElementById('metric-faturamento').textContent = formatBRL(totalFaturado);
  document.getElementById('metric-recebido').textContent = formatBRL(totalRecebido);
  document.getElementById('metric-taxa-recebimento').textContent = `${taxa}% já liquidado em caixa`;
  document.getElementById('metric-aberto').textContent = formatBRL(totalEmAberto);
  document.getElementById('metric-clientes').textContent = appState.clients.length;
  document.getElementById('metric-pedidos-count').textContent = `${appState.orders.length} pedidos cadastrados`;
  document.getElementById('metric-no-prazo').textContent = noPrazoCount;
  document.getElementById('metric-hoje').textContent = hojeCount;
  document.getElementById('metric-atrasado').textContent = atrasadoCount;
  document.getElementById('metric-entregues').textContent = entreguesCount;

  renderAlertBanner(atrasadoCount, hojeCount);
  updateCharts(noPrazoCount, hojeCount, atrasadoCount, entreguesCount);
}

function renderAlertBanner(atrasados, hoje) {
  const container = document.getElementById('alert-box-container');
  container.innerHTML = '';
  if (atrasados <= 0 && hoje <= 0) return;

  const box = document.createElement('div');
  box.className = "bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm";
  box.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
        <i data-lucide="alert-triangle" class="w-5 h-5"></i>
      </div>
      <div>
        <h4 class="text-sm font-bold text-slate-100">Atenção aos Prazos</h4>
        <p class="text-xs text-slate-400 mt-0.5">
          ${atrasados > 0 ? `<strong>${atrasados} pedido(s) atrasado(s)</strong>. ` : ''}
          ${hoje > 0 ? `<strong>${hoje} entrega(s) para hoje</strong>.` : ''}
        </p>
      </div>
    </div>
    <button onclick="switchTab('pedidos')" class="text-xs font-semibold px-4 py-2 rounded-lg bg-brand-dark hover:bg-brand-darkBorder text-brand-gold border border-brand-darkBorder transition-colors shadow-sm">
      Ver Pedidos
    </button>`;
  container.appendChild(box);
  lucide.createIcons();
}

function updateCharts(noPrazo, hoje, atrasado, entregue) {
  const mutedColor = '#94A3B8';
  const gridColor = '#DCC9A333';
  
  const successColor = '#10B981';
  const dangerColor = '#EF4444';
  const warningColor = '#F59E0B';
  const infoColor = '#3B82F6';

  const ctxFin = document.getElementById('chartFinancial')?.getContext('2d');
  if (ctxFin) {
    if (financialChartInstance) financialChartInstance.destroy();
    const recentOrders = [...appState.orders].slice(-6);
    const labels = recentOrders.map(o => o.code);
    const dataTotal = recentOrders.map(o => o.totalValue);
    const dataPaid = recentOrders.map(o => calculateOrderFinancials(o.id).paid);

    financialChartInstance = new Chart(ctxFin, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['Sem pedidos'],
        datasets: [
          { label: 'Valor Total (R$)', data: dataTotal.length ? dataTotal : [0], backgroundColor: '#DCC9A366', borderColor: '#DCC9A3', borderWidth: 1.5, borderRadius: 4 },
          { label: 'Valor Pago (R$)', data: dataPaid.length ? dataPaid : [0], backgroundColor: '#10B98166', borderColor: '#10B981', borderWidth: 1.5, borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: mutedColor, font: { family: 'Inter', size: 11, weight: '500' } } } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: mutedColor, font: { weight: '500' } } },
          y: { grid: { color: gridColor }, ticks: { color: mutedColor, font: { weight: '500' }, callback: (v) => 'R$ ' + v } }
        }
      }
    });
  }

  const ctxStat = document.getElementById('chartStatus')?.getContext('2d');
  if (ctxStat) {
    if (statusChartInstance) statusChartInstance.destroy();
    statusChartInstance = new Chart(ctxStat, {
      type: 'doughnut',
      data: {
        labels: ['No Prazo', 'Hoje', 'Atrasado', 'Entregue'],
        datasets: [{
          data: [noPrazo, hoje, atrasado, entregue],
          backgroundColor: [infoColor, warningColor, dangerColor, successColor],
          borderColor: '#EADBC6',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: mutedColor, font: { family: 'Inter', size: 11, weight: '500' } } } },
        cutout: '70%'
      }
    });
  }
}

// ================= PEDIDOS =================

function renderOrdersTable() {
  const tbody = document.getElementById('orders-table-body');
  const emptyState = document.getElementById('orders-empty-state');
  const query = (document.getElementById('order-search')?.value || '').toLowerCase().trim();
  const filterDeadline = document.getElementById('order-filter-deadline')?.value || 'ALL';
  const filterPayment = document.getElementById('order-filter-payment')?.value || 'ALL';

  tbody.innerHTML = '';
  const filtered = appState.orders.filter(order => {
    const client = appState.clients.find(c => c.id === order.clientId);
    const clientName = client ? client.name.toLowerCase() : '';
    const matchesQuery = !query || order.code.toLowerCase().includes(query) || order.category.toLowerCase().includes(query) || order.description.toLowerCase().includes(query) || clientName.includes(query);
    if (!matchesQuery) return false;
    const dl = calculateOrderDeadline(order.deadline, order.status);
    if (filterDeadline !== 'ALL' && dl.label !== filterDeadline) return false;
    const fin = calculateOrderFinancials(order.id);
    if (filterPayment !== 'ALL' && fin.status !== filterPayment) return false;
    return true;
  }).sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));

  if (filtered.length === 0) { emptyState.classList.remove('hidden'); return; }
  emptyState.classList.add('hidden');

  filtered.forEach(order => {
    const client = appState.clients.find(c => c.id === order.clientId);
    const { paid, remaining, status: payStatus } = calculateOrderFinancials(order.id);
    const dl = calculateOrderDeadline(order.deadline, order.status);

    let payBadgeClass = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/20";
    if (payStatus === 'Pago') payBadgeClass = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
    if (payStatus === 'Parcial') payBadgeClass = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-500 border border-amber-500/30";

    const tr = document.createElement('tr');
    tr.className = "hover:bg-brand-slate/40 transition-colors";
    tr.innerHTML = `
      <td class="py-3 px-4 text-xs">
        <span class="font-bold font-mono text-brand-gold cursor-pointer hover:underline" onclick="openOrderDetailsModal('${order.id}')">${escapeHtml(order.code)}</span>
        <span class="block text-[11px] font-medium text-slate-400 mt-0.5 truncate max-w-[180px]">${escapeHtml(order.category)}</span>
      </td>
      <td class="py-3 px-4 font-medium text-slate-200">
        ${client ? escapeHtml(client.name) : '<span class="text-slate-500">Removido</span>'}
      </td>
      <td class="py-3 px-4 text-xs font-medium text-slate-300">
        <span class="inline-flex items-center px-2.5 py-1 rounded bg-brand-dark border border-brand-darkBorder text-[11px]">${escapeHtml(order.status)}</span>
      </td>
      <td class="py-3 px-4 text-xs">
        <div class="font-medium text-slate-200">${formatDate(order.deadline)}</div>
        <span class="mt-1 ${dl.class}">${dl.label}</span>
      </td>
      <td class="py-3 px-4 text-right font-medium text-slate-200">${formatBRL(order.totalValue)}</td>
      <td class="py-3 px-4 text-right font-medium text-emerald-500">${formatBRL(paid)}</td>
      <td class="py-3 px-4 text-right font-semibold ${remaining > 0 ? 'text-amber-500' : 'text-slate-500'}">${formatBRL(remaining)}</td>
      <td class="py-3 px-4 text-center">
        <span class="${payBadgeClass}">${payStatus}</span>
      </td>
      <td class="py-3 px-4 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="openOrderDetailsModal('${order.id}')" title="Ver Detalhes" class="p-1.5 rounded hover:bg-brand-dark text-slate-400 hover:text-brand-gold transition"><i data-lucide="eye" class="w-4 h-4"></i></button>
          <button onclick="openPaymentForOrder('${order.id}')" title="Registrar Pagamento" class="p-1.5 rounded hover:bg-brand-gold/10 text-brand-gold transition"><i data-lucide="dollar-sign" class="w-4 h-4"></i></button>
          <button onclick="editOrder('${order.id}')" title="Editar Pedido" class="p-1.5 rounded hover:bg-brand-dark text-slate-400 hover:text-slate-200 transition"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
          <button onclick="deleteOrder('${order.id}')" title="Excluir" class="p-1.5 rounded hover:bg-red-500/10 text-red-400 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

// ================= CLIENTES =================

function renderClientsTable() {
  const tbody = document.getElementById('clients-table-body');
  const emptyState = document.getElementById('clients-empty-state');
  const query = (document.getElementById('client-search')?.value || '').toLowerCase().trim();

  tbody.innerHTML = '';
  const filtered = appState.clients.filter(c =>
    !query || c.name.toLowerCase().includes(query) || c.phone.includes(query) || (c.email && c.email.toLowerCase().includes(query))
  );

  if (filtered.length === 0) { emptyState.classList.remove('hidden'); return; }
  emptyState.classList.add('hidden');

  filtered.forEach(client => {
    const { ordersCount, totalBought, totalPaid, balance } = calculateClientFinancials(client.id);
    const cleanPhone = client.phone.replace(/\D/g, '');
    const waLink = cleanPhone ? `https://wa.me/55${cleanPhone}` : null;

    const tr = document.createElement('tr');
    tr.className = "hover:bg-brand-slate/40 transition-colors";
    tr.innerHTML = `
      <td class="py-3 px-4">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-brand-dark border border-brand-darkBorder text-brand-gold font-bold flex items-center justify-center text-xs shrink-0">${escapeHtml(getInitials(client.name))}</div>
          <div>
            <div class="font-medium text-slate-100">${escapeHtml(client.name)}</div>
            <div class="text-xs text-slate-400 font-mono">${escapeHtml(client.phone || '-')}</div>
            ${client.email ? `<div class="text-[11px] text-slate-500">${escapeHtml(client.email)}</div>` : ''}
          </div>
        </div>
      </td>
      <td class="py-3 px-4 text-center font-medium text-slate-200">${ordersCount}</td>
      <td class="py-3 px-4 text-right font-medium text-slate-200">${formatBRL(totalBought)}</td>
      <td class="py-3 px-4 text-right font-medium text-emerald-500">${formatBRL(totalPaid)}</td>
      <td class="py-3 px-4 text-right font-semibold ${balance > 0 ? 'text-amber-500' : 'text-slate-500'}">${formatBRL(balance)}</td>
      <td class="py-3 px-4 text-center">
        ${waLink
          ? `<a href="${waLink}" target="_blank" rel="noopener" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 transition"><i data-lucide="message-square" class="w-3 h-3"></i> WhatsApp</a>`
          : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">Sem telefone</span>`}
      </td>
      <td class="py-3 px-4 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="openMeasurementsModal('${client.id}')" title="Medidas & PDF" class="p-1.5 rounded hover:bg-brand-gold/10 text-brand-gold transition"><i data-lucide="ruler" class="w-4 h-4"></i></button>
          <button onclick="editClient('${client.id}')" title="Editar" class="p-1.5 rounded hover:bg-brand-dark text-slate-400 hover:text-slate-200 transition"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
          <button onclick="deleteClient('${client.id}')" title="Excluir" class="p-1.5 rounded hover:bg-red-500/10 text-red-400 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

// ================= PAGAMENTOS =================

function renderPaymentsTable() {
  const tbody = document.getElementById('payments-table-body');
  const emptyState = document.getElementById('payments-empty-state');
  tbody.innerHTML = '';

  if (appState.payments.length === 0) { emptyState.classList.remove('hidden'); return; }
  emptyState.classList.add('hidden');
  const sorted = [...appState.payments].sort((a, b) => new Date(b.date) - new Date(a.date));

  sorted.forEach(pay => {
    const order = appState.orders.find(o => o.id === pay.orderId);
    const client = order ? appState.clients.find(c => c.id === order.clientId) : null;
    const tr = document.createElement('tr');
    tr.className = "hover:bg-brand-slate/40 transition-colors";
    tr.innerHTML = `
      <td class="py-3 px-4 text-xs font-mono text-slate-300">${formatDate(pay.date)}</td>
      <td class="py-3 px-4 font-mono text-xs font-semibold text-brand-gold">${order ? escapeHtml(order.code) : 'Avulso'}</td>
      <td class="py-3 px-4 font-medium text-slate-200">${client ? escapeHtml(client.name) : '-'}</td>
      <td class="py-3 px-4"><span class="inline-flex items-center px-2 py-0.5 rounded bg-brand-dark border border-brand-darkBorder text-[11px] font-medium text-slate-300">${escapeHtml(pay.method)}</span></td>
      <td class="py-3 px-4 text-xs text-slate-400 truncate max-w-[200px]">${escapeHtml(pay.notes || '-')}</td>
      <td class="py-3 px-4 text-right font-semibold text-emerald-500">${formatBRL(pay.amount)}</td>
      <td class="py-3 px-4 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="editPayment('${pay.id}')" title="Editar" class="p-1.5 rounded hover:bg-brand-dark text-slate-400 hover:text-brand-gold transition"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
          <button onclick="deletePayment('${pay.id}')" title="Excluir" class="p-1.5 rounded hover:bg-red-500/10 text-red-400 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

// ================= MODAIS =================

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.classList.remove('hidden');
  el.classList.add('flex');
  openModalStack.push(modalId);
  const panel = el.querySelector('.modal-panel') || el;
  const focusable = panel.querySelector('input, select, textarea, button');
  if (focusable && modalId !== 'modal-measurements') { setTimeout(() => focusable.focus(), 60); }
  lucide.createIcons();
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.classList.add('hidden');
  el.classList.remove('flex');
  openModalStack = openModalStack.filter(id => id !== modalId);
  if (modalId === 'modal-client' && pendingOrderClientSelection) {
    pendingOrderClientSelection = false; openModal('modal-order');
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openModalStack.length > 0) { closeModal(openModalStack[openModalStack.length - 1]); }
});
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) { closeModal(e.target.id); }
});

// ================= FORMULÁRIO: PEDIDOS =================

function openNewOrderModal() {
  if (appState.clients.length === 0) { showToast('Cadastre um cliente antes de criar um pedido.', 'warning'); openNewClientModal(true); return; }
  document.getElementById('order-form').reset();
  document.getElementById('order-id').value = '';
  document.getElementById('modal-order-title').textContent = 'Novo Pedido de Alfaiataria';
  document.getElementById('order-deadline').value = getFutureIsoDate(15);
  resetCurrencyInput(document.getElementById('order-total'));
  populateClientDropdown();
  openModal('modal-order');
}

function populateClientDropdown(selectedClientId = null) {
  const select = document.getElementById('order-client-id');
  select.innerHTML = '';
  if (appState.clients.length === 0) { select.innerHTML = '<option value="">Nenhum cliente cadastrado</option>'; return; }
  appState.clients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = `${c.name} (${c.phone || 'sem telefone'})`;
    if (c.id === selectedClientId) opt.selected = true;
    select.appendChild(opt);
  });
}

function handleSaveOrder(e) {
  e.preventDefault();
  const id = document.getElementById('order-id').value;
  const clientId = document.getElementById('order-client-id').value;
  const category = document.getElementById('order-category').value;
  const description = document.getElementById('order-description').value.trim();
  const totalValue = getCurrencyValue(document.getElementById('order-total'));
  const deadline = document.getElementById('order-deadline').value;
  const status = document.getElementById('order-status').value;

  if (!clientId) { showToast('Selecione um cliente.', 'error'); return; }
  if (totalValue <= 0) { showToast('Informe o valor total.', 'error'); return; }
  if (!deadline) { showToast('Informe a data de entrega.', 'error'); return; }

  if (id) {
    const order = appState.orders.find(o => o.id === id);
    if (order) { Object.assign(order, { clientId, category, description, totalValue, deadline, status }); showToast(`Pedido ${order.code} atualizado!`, 'success'); }
  } else {
    const newCode = `PED-${100 + appState.orders.length + 1}`;
    appState.orders.push({ id: 'ord-' + Date.now(), code: newCode, clientId, category, description, totalValue, deadline, status, createdAt: getTodayIsoString() });
    showToast(`Pedido ${newCode} criado!`, 'success');
  }
  closeModal('modal-order'); renderOrdersTable(); renderDashboard(); triggerRealtimeSync();
}

function editOrder(orderId) {
  const order = appState.orders.find(o => o.id === orderId);
  if (!order) return;
  document.getElementById('order-id').value = order.id;
  document.getElementById('modal-order-title').textContent = `Editar Pedido ${order.code}`;
  populateClientDropdown(order.clientId);
  document.getElementById('order-category').value = order.category;
  document.getElementById('order-description').value = order.description;
  setCurrencyValue(document.getElementById('order-total'), order.totalValue);
  document.getElementById('order-deadline').value = order.deadline;
  document.getElementById('order-status').value = order.status;
  openModal('modal-order');
}

async function deleteOrder(orderId) {
  const order = appState.orders.find(o => o.id === orderId);
  if (!order) return;
  const ok = await confirmDialog({ title: 'Excluir pedido', message: `Remover o pedido ${order.code}? Os pagamentos também serão apagados.`, confirmLabel: 'Excluir', danger: true });
  if (!ok) return;
  appState.orders = appState.orders.filter(o => o.id !== orderId);
  appState.payments = appState.payments.filter(p => p.orderId !== orderId);
  renderOrdersTable(); renderDashboard(); showToast(`Pedido excluído.`, 'success'); triggerRealtimeSync();
}

// ================= FORMULÁRIO: CLIENTES =================

function openNewClientModal(fromOrderModal = false) {
  document.getElementById('client-form').reset();
  document.getElementById('client-id').value = '';
  document.getElementById('modal-client-title').textContent = 'Cadastrar Cliente';
  pendingOrderClientSelection = !!fromOrderModal;
  if (fromOrderModal && !document.getElementById('modal-order').classList.contains('hidden')) { closeModal('modal-order'); }
  openModal('modal-client');
}

function handleSaveClient(e) {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const name = document.getElementById('client-name').value.trim();
  const phone = document.getElementById('client-phone').value.trim();
  const email = document.getElementById('client-email').value.trim();
  const notes = document.getElementById('client-notes').value.trim();

  if (!name || !phone) { showToast('Nome e telefone são obrigatórios.', 'error'); return; }

  let savedClient = null; const wasPendingForOrder = pendingOrderClientSelection;

  if (id) {
    const client = appState.clients.find(c => c.id === id);
    if (client) { Object.assign(client, { name, phone, email, notes }); savedClient = client; showToast(`Cliente atualizado!`, 'success'); }
  } else {
    savedClient = { id: 'cli-' + Date.now(), name, phone, email, notes, createdAt: getTodayIsoString(), measurements: { paleto: '', calca: '', colete: '', camisa: '' } };
    appState.clients.push(savedClient); showToast(`Cliente cadastrado!`, 'success');
  }

  pendingOrderClientSelection = false; closeModal('modal-client'); renderClientsTable(); renderDashboard(); triggerRealtimeSync();
  if (wasPendingForOrder && savedClient) { populateClientDropdown(savedClient.id); openModal('modal-order'); } else { populateClientDropdown(); }
}

function editClient(clientId) {
  const client = appState.clients.find(c => c.id === clientId);
  if (!client) return;
  document.getElementById('client-id').value = client.id;
  document.getElementById('modal-client-title').textContent = 'Editar Cliente';
  document.getElementById('client-name').value = client.name;
  document.getElementById('client-phone').value = client.phone;
  document.getElementById('client-email').value = client.email || '';
  document.getElementById('client-notes').value = client.notes || '';
  openModal('modal-client');
}

async function deleteClient(clientId) {
  const client = appState.clients.find(c => c.id === clientId);
  if (!client) return;
  const hasOrders = appState.orders.some(o => o.clientId === clientId);
  if (hasOrders) { showToast('Não é possível excluir: existem pedidos vinculados a este cliente.', 'error'); return; }
  const ok = await confirmDialog({ title: 'Excluir cliente', message: `Remover o cliente ${client.name}?`, confirmLabel: 'Excluir', danger: true });
  if (!ok) return;
  appState.clients = appState.clients.filter(c => c.id !== clientId);
  renderClientsTable(); renderDashboard(); showToast('Cliente removido.', 'success'); triggerRealtimeSync();
}

// ================= FICHA DE MEDIDAS & PDF =================

function openMeasurementsModal(clientId) {
  const client = appState.clients.find(c => c.id === clientId);
  if(!client) return;
  currentMeasurementsClientId = clientId;
  document.getElementById('meas-client-name').textContent = client.name;
  const m = client.measurements || { paleto: '', calca: '', colete: '', camisa: '' };
  document.getElementById('meas-paleto').value = m.paleto || '';
  document.getElementById('meas-calca').value = m.calca || '';
  document.getElementById('meas-colete').value = m.colete || '';
  document.getElementById('meas-camisa').value = m.camisa || '';
  document.getElementById('chk-paleto').checked = true;
  document.getElementById('chk-calca').checked = true;
  document.getElementById('chk-colete').checked = true;
  document.getElementById('chk-camisa').checked = true;
  document.getElementById('meas-pdf-obs').value = '';
  openModal('modal-measurements');
}

function handleSaveMeasurements() {
  const client = appState.clients.find(c => c.id === currentMeasurementsClientId);
  if(!client) return;
  client.measurements = {
    paleto: document.getElementById('meas-paleto').value,
    calca: document.getElementById('meas-calca').value,
    colete: document.getElementById('meas-colete').value,
    camisa: document.getElementById('meas-camisa').value
  };
  saveLocalCache(); triggerRealtimeSync(); showToast('Medidas do cliente salvas!', 'success');
}

function generateMeasurementsPDF() {
  const client = appState.clients.find(c => c.id === currentMeasurementsClientId);
  if(!client) return;
  handleSaveMeasurements();

  const includePaleto = document.getElementById('chk-paleto').checked;
  const includeCalca = document.getElementById('chk-calca').checked;
  const includeColete = document.getElementById('chk-colete').checked;
  const includeCamisa = document.getElementById('chk-camisa').checked;
  const obs = document.getElementById('meas-pdf-obs').value;

  if (!includePaleto && !includeCalca && !includeColete && !includeCamisa) { showToast('Selecione ao menos uma peça.', 'warning'); return; }
  showToast('Preparando e Gerando PDF...', 'info');

  const container = document.createElement('div');
  container.style.padding = '40px';
  container.style.color = '#0F1826';
  container.style.fontFamily = 'Inter, sans-serif';

  let html = `
    <div style="text-align: center; border-bottom: 2px solid #DCC9A3; padding-bottom: 20px; margin-bottom: 30px;">
      <h1 style="font-family: 'Cinzel', serif; font-size: 28px; font-weight: 700; margin: 0; letter-spacing: 2px; color: #0F1826;">O SEU ALFAIATE</h1>
      <p style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: #0F1826; margin-top: 5px;">Atelier & Alta Alfaiataria</p>
    </div>
    <h2 style="font-family: 'Playfair Display', serif; font-size: 22px; font-weight: bold; margin-bottom: 10px; color: #0F1826;">Ficha de Medidas</h2>
    <p style="font-size: 14px; margin-bottom: 30px; line-height: 1.5; color: #2E415A;">
      <strong>Cliente:</strong> ${escapeHtml(client.name)}<br>
      <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </p>
  `;

  const addSection = (title, content) => {
    const text = content.trim() ? escapeHtml(content) : 'Não avaliado.';
    html += `
      <div style="margin-bottom: 25px;">
        <h3 style="font-size: 13px; font-weight: bold; background-color: #F5EEDF; padding: 6px 12px; border-left: 4px solid #0F1826; margin-bottom: 12px; text-transform: uppercase; color: #0F1826;">${title}</h3>
        <div style="font-size: 14px; line-height: 1.6; white-space: pre-wrap; padding-left: 12px; color: #2E415A;">${text}</div>
      </div>
    `;
  }

  if (includePaleto) addSection('Medidas — Paletó', client.measurements.paleto);
  if (includeCalca) addSection('Medidas — Calça', client.measurements.calca);
  if (includeColete) addSection('Medidas — Colete', client.measurements.colete);
  if (includeCamisa) addSection('Medidas — Camisa', client.measurements.camisa);

  if (obs.trim()) {
     html += `
      <div style="margin-top: 40px; border-top: 1px dashed #DCC9A3; padding-top: 20px;">
        <h3 style="font-size: 13px; font-weight: bold; margin-bottom: 10px; color: #0F1826;">Observações Adicionais</h3>
        <div style="font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #2E415A;">${escapeHtml(obs)}</div>
      </div>
    `;
  }

  container.innerHTML = html;
  const opt = { margin: 15, filename: `Ficha_Medidas_${client.name.replace(/\s+/g, '_')}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
  html2pdf().set(opt).from(container).save().then(() => { showToast('PDF Gerado com sucesso!', 'success'); }).catch(err => { console.error(err); showToast('Houve um erro ao gerar o PDF.', 'error'); });
}

// ================= FORMULÁRIO: PAGAMENTOS =================

function openNewPaymentModal(preselectedOrderId = null) {
  if (appState.orders.length === 0) { showToast('Cadastre um pedido antes de registrar um pagamento.', 'warning'); return; }
  document.getElementById('payment-form').reset();
  document.getElementById('payment-id').value = ''; 
  document.getElementById('modal-payment-title').textContent = 'Registrar Pagamento';
  document.getElementById('payment-date').value = getTodayIsoString();
  resetCurrencyInput(document.getElementById('payment-amount'));

  const select = document.getElementById('payment-order-id'); select.innerHTML = '';
  appState.orders.forEach(order => {
    const client = appState.clients.find(c => c.id === order.clientId);
    const { remaining } = calculateOrderFinancials(order.id);
    const opt = document.createElement('option');
    opt.value = order.id; opt.textContent = `${order.code} - ${client ? client.name : ''} - Falta: ${formatBRL(remaining)}`;
    if (order.id === preselectedOrderId) opt.selected = true;
    select.appendChild(opt);
  });
  updatePaymentHelperInfo(); openModal('modal-payment');
}

function openPaymentForOrder(orderId) { openNewPaymentModal(orderId); }

function updatePaymentHelperInfo() {
  const orderId = document.getElementById('payment-order-id')?.value;
  if (!orderId) return;
  const order = appState.orders.find(o => o.id === orderId);
  if (!order) return;
  const { paid, remaining } = calculateOrderFinancials(orderId);
  document.getElementById('pay-sum-total').textContent = formatBRL(order.totalValue);
  document.getElementById('pay-sum-paid').textContent = formatBRL(paid);
  document.getElementById('pay-sum-remaining').textContent = formatBRL(remaining);

  const amountInput = document.getElementById('payment-amount');
  const isEditing = !!document.getElementById('payment-id').value;
  if (!isEditing && getCurrencyValue(amountInput) === 0 && remaining > 0) { setCurrencyValue(amountInput, remaining); }
}

function editPayment(payId) {
  const pay = appState.payments.find(p => p.id === payId);
  if (!pay) return;
  document.getElementById('payment-id').value = pay.id;
  document.getElementById('modal-payment-title').textContent = 'Editar Pagamento';
  
  const select = document.getElementById('payment-order-id'); select.innerHTML = '';
  appState.orders.forEach(order => {
    const client = appState.clients.find(c => c.id === order.clientId);
    const opt = document.createElement('option');
    opt.value = order.id; opt.textContent = `${order.code} - ${client ? client.name : ''} (${order.category})`;
    if (order.id === pay.orderId) opt.selected = true;
    select.appendChild(opt);
  });
  document.getElementById('payment-date').value = pay.date;
  document.getElementById('payment-method').value = pay.method;
  document.getElementById('payment-notes').value = pay.notes || '';
  setCurrencyValue(document.getElementById('payment-amount'), pay.amount);
  updatePaymentHelperInfo(); openModal('modal-payment');
}

async function handleSavePayment(e) {
  e.preventDefault();
  const payId = document.getElementById('payment-id').value;
  const orderId = document.getElementById('payment-order-id').value;
  const amount = getCurrencyValue(document.getElementById('payment-amount'));
  const date = document.getElementById('payment-date').value;
  const method = document.getElementById('payment-method').value;
  const notes = document.getElementById('payment-notes').value.trim();

  if (!orderId || amount <= 0) { showToast('Informe um valor de pagamento válido.', 'error'); return; }

  const { remaining } = calculateOrderFinancials(orderId);
  let adjustedRemaining = remaining;
  if (payId) {
      const existingPay = appState.payments.find(p => p.id === payId);
      if (existingPay && existingPay.orderId === orderId) adjustedRemaining += Number(existingPay.amount);
  }

  if (amount > adjustedRemaining + 0.009 && adjustedRemaining > 0) {
    const ok = await confirmDialog({ title: 'Valor acima do saldo', message: `O valor (${formatBRL(amount)}) é maior que o saldo (${formatBRL(adjustedRemaining)}). Registrar mesmo assim?`, confirmLabel: 'Registrar' });
    if (!ok) return;
  }

  if (payId) {
      const pay = appState.payments.find(p => p.id === payId);
      if (pay) { Object.assign(pay, { orderId, amount, date, method, notes }); showToast(`Pagamento editado!`, 'success'); }
  } else {
      appState.payments.push({ id: 'pay-' + Date.now(), orderId, amount, date, method, notes }); showToast(`Pagamento registrado!`, 'success');
  }
  
  closeModal('modal-payment');
  if (document.getElementById('modal-order-details').classList.contains('flex')) { openOrderDetailsModal(orderId); }
  renderOrdersTable(); renderPaymentsTable(); renderClientsTable(); renderDashboard(); triggerRealtimeSync();
}

async function deletePayment(payId) {
  const ok = await confirmDialog({ title: 'Excluir pagamento', message: 'Deseja excluir permanentemente este pagamento?', confirmLabel: 'Excluir', danger: true });
  if (!ok) return;
  appState.payments = appState.payments.filter(p => p.id !== payId);
  if (document.getElementById('modal-order-details').classList.contains('flex')) {
      const currentOrderId = document.getElementById('detail-order-code').textContent;
      const order = appState.orders.find(o => o.code === currentOrderId);
      if(order) openOrderDetailsModal(order.id);
  }
  renderPaymentsTable(); renderOrdersTable(); renderClientsTable(); renderDashboard(); showToast('Pagamento removido.', 'success'); triggerRealtimeSync();
}

// ================= DETALHES DO PEDIDO =================

function openOrderDetailsModal(orderId) {
  const order = appState.orders.find(o => o.id === orderId);
  if (!order) return;
  const client = appState.clients.find(c => c.id === order.clientId);
  const { paid, remaining } = calculateOrderFinancials(order.id);
  const dl = calculateOrderDeadline(order.deadline, order.status);

  document.getElementById('detail-order-code').textContent = order.code;
  document.getElementById('detail-client-name').textContent = client ? client.name : 'Não informado';
  document.getElementById('detail-client-phone').textContent = client ? client.phone : '-';
  document.getElementById('detail-category').textContent = order.category;
  document.getElementById('detail-description').textContent = order.description || 'Nenhuma especificação';
  document.getElementById('detail-deadline').textContent = formatDate(order.deadline);
  document.getElementById('detail-status').textContent = order.status;

  const dlBadge = document.getElementById('detail-deadline-badge');
  dlBadge.className = dl.class;
  dlBadge.textContent = dl.label;

  document.getElementById('detail-total-val').textContent = formatBRL(order.totalValue);
  document.getElementById('detail-paid-val').textContent = formatBRL(paid);
  document.getElementById('detail-remaining-val').textContent = formatBRL(remaining);

  const listContainer = document.getElementById('detail-payments-list'); listContainer.innerHTML = '';
  const orderPayments = appState.payments.filter(p => p.orderId === order.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (orderPayments.length === 0) {
    listContainer.innerHTML = '<p class="text-xs text-slate-400 italic">Nenhum pagamento registrado.</p>';
  } else {
    orderPayments.forEach(p => {
      const item = document.createElement('div');
      item.className = "flex justify-between items-center p-3 rounded-xl bg-brand-dark border border-brand-darkBorder text-sm shadow-sm";
      item.innerHTML = `
        <div>
          <span class="font-medium text-slate-200">${formatDate(p.date)}</span> — 
          <span class="inline-flex items-center px-2 py-0.5 rounded bg-brand-darkBorder text-[11px] font-medium text-slate-300">${escapeHtml(p.method)}</span>
          ${p.notes ? `<span class="text-slate-400 block text-[11px] mt-1">${escapeHtml(p.notes)}</span>` : ''}
        </div>
        <div class="flex items-center gap-3">
          <span class="font-bold text-emerald-500">${formatBRL(p.amount)}</span>
          <div class="flex items-center gap-1 border-l border-brand-darkBorder pl-2">
             <button onclick="editPayment('${p.id}')" class="p-1 text-slate-400 hover:text-brand-gold transition"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
             <button onclick="deletePayment('${p.id}')" class="p-1 text-slate-400 hover:text-red-400 transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div>
        </div>`;
      listContainer.appendChild(item);
    });
  }

  document.getElementById('btn-add-payment-to-this-order').onclick = () => { closeModal('modal-order-details'); openNewPaymentModal(order.id); };
  openModal('modal-order-details');
}

// ================= INICIALIZAÇÃO =================

function refreshData() { renderDashboard(); renderOrdersTable(); renderClientsTable(); renderPaymentsTable(); }

window.addEventListener('DOMContentLoaded', () => {
  loadLocalCache();
  refreshData();
  attachCurrencyMask(document.getElementById('order-total'));
  attachCurrencyMask(document.getElementById('payment-amount'));
  attachPhoneMask(document.getElementById('client-phone'));
  document.getElementById('order-search').addEventListener('input', debounce(renderOrdersTable, 250));
  document.getElementById('client-search').addEventListener('input', debounce(renderClientsTable, 250));

  const lastTab = (() => { try { return localStorage.getItem(TAB_STORAGE_KEY); } catch (e) { return null; } })();
  switchTab(['dashboard', 'pedidos', 'clientes', 'pagamentos'].includes(lastTab) ? lastTab : 'dashboard');

  lucide.createIcons();
  fetchFromGoogleSheets(false);
});
