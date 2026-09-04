// ============================================================
// O SEU ALFAIATE — CRM & GESTÃO DE ATELIER
// Script Principal (js/admin.js)
// ============================================================

// Substitua pela URL da implantação do seu Google Apps Script Web App
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzV-example-url/exec";

// Estado da Aplicação com Proteção Contra Dados Corrompidos no LocalStorage
let db = { clients: [], orders: [], payments: [] };

try {
  const savedClients = localStorage.getItem('alfaiate_clients');
  const savedOrders = localStorage.getItem('alfaiate_orders');
  const savedPayments = localStorage.getItem('alfaiate_payments');
  
  if (savedClients) db.clients = JSON.parse(savedClients);
  if (savedOrders) db.orders = JSON.parse(savedOrders);
  if (savedPayments) db.payments = JSON.parse(savedPayments);

  if (!Array.isArray(db.clients)) db.clients = [];
  if (!Array.isArray(db.orders)) db.orders = [];
  if (!Array.isArray(db.payments)) db.payments = [];
} catch (e) {
  console.warn("Resetando dados locais devido a formato inválido.", e);
  db = { clients: [], orders: [], payments: [] };
}

// Inicialização imediata ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  try {
    renderAll();
    initDates();
    backgroundSyncFetch();
  } catch (err) {
    console.error("Erro na inicialização:", err);
  }
});

function saveLocal() {
  try {
    localStorage.setItem('alfaiate_clients', JSON.stringify(db.clients));
    localStorage.setItem('alfaiate_orders', JSON.stringify(db.orders));
    localStorage.setItem('alfaiate_payments', JSON.stringify(db.payments));
  } catch (e) {
    console.error("Erro ao salvar no localStorage:", e);
  }
  renderAll();
  scheduleBackgroundSync();
}

let syncTimeout = null;
function scheduleBackgroundSync() {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncToGoogleSheets();
  }, 1000);
}

async function syncToGoogleSheets() {
  if (!WEB_APP_URL || WEB_APP_URL.includes("example-url")) return;
  try {
    await fetch(WEB_APP_URL, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(db)
    });
  } catch (err) {
    console.error("Erro na sincronização em segundo plano:", err);
  }
}

async function manualSync() {
  if (!WEB_APP_URL || WEB_APP_URL.includes("example-url")) {
    alert("Configure a URL do Web App no arquivo js/admin.js");
    return;
  }
  try {
    const response = await fetch(WEB_APP_URL, { method: 'GET', redirect: 'follow' });
    const remoteData = await response.json();
    if (remoteData.status === "success") {
      if (Array.isArray(remoteData.clients)) db.clients = remoteData.clients;
      if (Array.isArray(remoteData.orders)) db.orders = remoteData.orders;
      if (Array.isArray(remoteData.payments)) db.payments = remoteData.payments;
      saveLocal();
      alert("Sincronizado com sucesso com a planilha!");
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao sincronizar com a planilha.");
  }
}

async function backgroundSyncFetch() {
  if (!WEB_APP_URL || WEB_APP_URL.includes("example-url")) return;
  try {
    const response = await fetch(WEB_APP_URL, { method: 'GET', redirect: 'follow' });
    const remoteData = await response.json();
    if (remoteData.status === "success") {
      if (Array.isArray(remoteData.clients) && remoteData.clients.length > 0) db.clients = remoteData.clients;
      if (Array.isArray(remoteData.orders) && remoteData.orders.length > 0) db.orders = remoteData.orders;
      if (Array.isArray(remoteData.payments) && remoteData.payments.length > 0) db.payments = remoteData.payments;
      saveLocal();
    }
  } catch (err) {
    // Falhas silenciosas em segundo plano não afetam a experiência
  }
}

// Navegação por Abas
function switchTab(tabName) {
  const tabs = ['dashboard', 'orders', 'clients', 'payments'];
  tabs.forEach(t => {
    const section = document.getElementById(`view-${t}`);
    const navBtn = document.getElementById(`nav-${t}`);
    if (section) section.classList.add('hidden');
    if (navBtn) {
      navBtn.className = "w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors text-[#F5EEDF]/80 hover:bg-[#DCC9A3]/10 hover:text-[#F5EEDF]";
    }
  });

  const activeSection = document.getElementById(`view-${tabName}`);
  const activeNav = document.getElementById(`nav-${tabName}`);
  if (activeSection) activeSection.classList.remove('hidden');
  if (activeNav) {
    activeNav.className = "w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors bg-[#DCC9A3] text-[#0F1826]";
  }

  const titles = {
    dashboard: "Dashboard Geral",
    orders: "Gestão de Pedidos",
    clients: "Carteira de Clientes",
    payments: "Controle de Pagamentos"
  };
  const titleEl = document.getElementById('page-title');
  const mobileTitleEl = document.getElementById('mobile-page-title');
  if (titleEl) titleEl.innerText = titles[tabName];
  if (mobileTitleEl) mobileTitleEl.innerText = titles[tabName];

  // Fecha menu mobile se estiver aberto
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-sidebar-overlay');
  if (sidebar && overlay) {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  }
}

function toggleMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-sidebar-overlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
  }
}

function initDates() {
  const today = new Date().toISOString().split('T')[0];
  const deadlineEl = document.getElementById('order-deadline');
  const paymentDateEl = document.getElementById('payment-date');
  if (deadlineEl) deadlineEl.value = today;
  if (paymentDateEl) paymentDateEl.value = today;
}

// Renderização Geral
function renderAll() {
  renderDashboard();
  renderOrders();
  renderClients();
  renderPayments();
  populateDropdowns();
}

// Dashboard
function renderDashboard() {
  const totalRevenue = db.orders.reduce((acc, o) => acc + Number(o.totalValue || 0), 0);
  const totalReceived = db.payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const totalPending = Math.max(0, totalRevenue - totalReceived);

  const revEl = document.getElementById('kpi-total-revenue');
  const recEl = document.getElementById('kpi-total-received');
  const penEl = document.getElementById('kpi-total-pending');
  if (revEl) revEl.innerText = formatCurrency(totalRevenue);
  if (recEl) recEl.innerText = formatCurrency(totalReceived);
  if (penEl) penEl.innerText = formatCurrency(totalPending);

  const totOrd = document.getElementById('dash-total-orders');
  const totCli = document.getElementById('dash-total-clients');
  if (totOrd) totOrd.innerText = `${db.orders.length} pedidos`;
  if (totCli) totCli.innerText = `${db.clients.length} clientes`;

  const statuses = [
    "Novo pedido", "Pagamento pendente", "Medidas realizadas", "Tecido escolhido",
    "Em produção", "Aguardando prova", "Ajustes", "Pronto", "Entregue", "Cancelado"
  ];

  const statusListEl = document.getElementById('dash-status-list');
  if (statusListEl) {
    statusListEl.innerHTML = '';
    statuses.forEach(status => {
      const count = db.orders.filter(o => o.status === status).length;
      statusListEl.innerHTML += `
        <div class="flex items-center justify-between p-2 rounded hover:bg-[#F5EEDF]/40">
          <span class="text-neutral-700 font-medium">${status}</span>
          <span class="font-bold text-[#0F1826] bg-[#F5EEDF] px-2 py-0.5 rounded-full text-xs">${count}</span>
        </div>
      `;
    });
  }
}

// Clientes
function renderClients() {
  const tbody = document.getElementById('clients-table-body');
  if (!tbody) return;
  const query = (document.getElementById('search-clients')?.value || '').toLowerCase();
  const filtered = db.clients.filter(c => 
    (c.name || '').toLowerCase().includes(query) ||
    (c.phone || '').toLowerCase().includes(query) ||
    (c.email || '').toLowerCase().includes(query)
  );

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-neutral-400">Nenhum cliente cadastrado.</td></tr>`;
    return;
  }

  filtered.forEach(c => {
    const initials = (c.name || 'Cliente').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    tbody.innerHTML += `
      <tr class="hover:bg-[#F5EEDF]/20">
        <td class="p-3.5 flex items-center space-x-3">
          <div class="client-avatar">${initials}</div>
          <div>
            <div class="font-bold text-[#0F1826]">${c.name}</div>
            <div class="text-xs text-neutral-500">${c.notes || 'Sem observações'}</div>
          </div>
        </td>
        <td class="p-3.5 text-neutral-600">${c.phone || '-'}</td>
        <td class="p-3.5 text-neutral-600">${c.email || '-'}</td>
        <td class="p-3.5 text-neutral-500 text-xs">${c.createdAt || '-'}</td>
        <td class="p-3.5 text-right space-x-2">
          <button onclick="editClient('${c.id}')" class="text-neutral-600 hover:text-[#0F1826] p-1"><i class="fa-solid fa-pen"></i></button>
          <button onclick="deleteClient('${c.id}')" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  });
}

// Pedidos
function renderOrders() {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;
  const query = (document.getElementById('search-orders')?.value || '').toLowerCase();
  const filtered = db.orders.filter(o => {
    const client = db.clients.find(c => c.id === o.clientId);
    const clientName = client ? client.name : '';
    return (o.code || '').toLowerCase().includes(query) ||
           clientName.toLowerCase().includes(query) ||
           (o.description || '').toLowerCase().includes(query);
  });

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-neutral-400">Nenhum pedido encontrado.</td></tr>`;
    return;
  }

  filtered.forEach(o => {
    const client = db.clients.find(c => c.id === o.clientId);
    const clientName = client ? client.name : 'Cliente não encontrado';
    tbody.innerHTML += `
      <tr class="hover:bg-[#F5EEDF]/20">
        <td class="p-3.5 font-bold text-[#0F1826]">${o.code || 'PED'}</td>
        <td class="p-3.5 font-medium text-neutral-800">${clientName}</td>
        <td class="p-3.5 text-neutral-600">${o.category}</td>
        <td class="p-3.5 font-bold text-[#0F1826]">${formatCurrency(o.totalValue)}</td>
        <td class="p-3.5 text-neutral-600 text-xs">${o.deadline || '-'}</td>
        <td class="p-3.5">
          <span class="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F5EEDF] text-[#0F1826] border border-[#DCC9A3]">
            ${o.status}
          </span>
        </td>
        <td class="p-3.5 text-right space-x-2">
          <button onclick="editOrder('${o.id}')" class="text-neutral-600 hover:text-[#0F1826] p-1"><i class="fa-solid fa-pen"></i></button>
          <button onclick="deleteOrder('${o.id}')" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  });
}

// Pagamentos
function renderPayments() {
  const tbody = document.getElementById('payments-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (db.payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-neutral-400">Nenhum pagamento registrado.</td></tr>`;
    return;
  }

  db.payments.forEach(p => {
    const order = db.orders.find(o => o.id === p.orderId);
    const orderCode = order ? order.code : 'PED';
    const client = order ? db.clients.find(c => c.id === order.clientId) : null;
    const clientName = client ? client.name : '-';

    tbody.innerHTML += `
      <tr class="hover:bg-[#F5EEDF]/20">
        <td class="p-3.5 font-bold text-[#0F1826]">${orderCode}</td>
        <td class="p-3.5 text-neutral-800">${clientName}</td>
        <td class="p-3.5 font-bold text-emerald-700">${formatCurrency(p.amount)}</td>
        <td class="p-3.5 text-neutral-600 text-xs">${p.date || '-'}</td>
        <td class="p-3.5 text-neutral-600">${p.method}</td>
        <td class="p-3.5 text-right">
          <button onclick="deletePayment('${p.id}')" class="text-red-500 hover:text-red-700 p-1"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  });
}

function populateDropdowns() {
  const clientSelect = document.getElementById('order-client-id');
  if (clientSelect) {
    clientSelect.innerHTML = db.clients.length === 0 ? '<option value="">Cadastre um cliente primeiro</option>' : '';
    db.clients.forEach(c => {
      clientSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });
  }

  const paymentOrderSelect = document.getElementById('payment-order-id');
  if (paymentOrderSelect) {
    paymentOrderSelect.innerHTML = db.orders.length === 0 ? '<option value="">Cadastre um pedido primeiro</option>' : '';
    db.orders.forEach(o => {
      const client = db.clients.find(c => c.id === o.clientId);
      const cName = client ? client.name : '';
      paymentOrderSelect.innerHTML += `<option value="${o.id}">${o.code} - ${cName} (${o.category})</option>`;
    });
  }
}

// Modals Control
function openNewClientModal() {
  document.getElementById('client-modal-title').innerText = "Novo Cliente";
  document.getElementById('form-client').reset();
  document.getElementById('client-id').value = '';
  document.getElementById('modal-client').classList.remove('hidden');
}
function closeClientModal() {
  document.getElementById('modal-client').classList.add('hidden');
}

function openNewOrderModal() {
  if (db.clients.length === 0) {
    alert("Cadastre pelo menos um cliente antes de criar um pedido.");
    switchTab('clients');
    openNewClientModal();
    return;
  }
  document.getElementById('order-modal-title').innerText = "Novo Pedido";
  document.getElementById('form-order').reset();
  document.getElementById('order-id').value = '';
  initDates();
  document.getElementById('modal-order').classList.remove('hidden');
}
function closeOrderModal() {
  document.getElementById('modal-order').classList.add('hidden');
}

function openNewPaymentModal() {
  if (db.orders.length === 0) {
    alert("Cadastre pelo menos um pedido antes de registrar um pagamento.");
    switchTab('orders');
    openNewOrderModal();
    return;
  }
  document.getElementById('form-payment').reset();
  initDates();
  document.getElementById('modal-payment').classList.remove('hidden');
}
function closePaymentModal() {
  document.getElementById('modal-payment').classList.add('hidden');
}

// Client Handlers
function saveClient(e) {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const name = document.getElementById('client-name').value;
  const phone = document.getElementById('client-phone').value;
  const email = document.getElementById('client-email').value;
  const notes = document.getElementById('client-notes').value;
  const today = new Date().toISOString().split('T')[0];

  if (id) {
    const client = db.clients.find(c => c.id === id);
    if (client) {
      client.name = name;
      client.phone = phone;
      client.email = email;
      client.notes = notes;
    }
  } else {
    const newClient = {
      id: 'cli-' + Date.now(),
      name, phone, email, notes,
      createdAt: today
    };
    db.clients.push(newClient);
  }

  saveLocal();
  closeClientModal();
}

function editClient(id) {
  const client = db.clients.find(c => c.id === id);
  if (!client) return;
  document.getElementById('client-modal-title').innerText = "Editar Cliente";
  document.getElementById('client-id').value = client.id;
  document.getElementById('client-name').value = client.name || '';
  document.getElementById('client-phone').value = client.phone || '';
  document.getElementById('client-email').value = client.email || '';
  document.getElementById('client-notes').value = client.notes || '';
  document.getElementById('modal-client').classList.remove('hidden');
}

function deleteClient(id) {
  if (confirm("Deseja realmente excluir este cliente?")) {
    db.clients = db.clients.filter(c => c.id !== id);
    saveLocal();
  }
}

// Order Handlers
function saveOrder(e) {
  e.preventDefault();
  const id = document.getElementById('order-id').value;
  const clientId = document.getElementById('order-client-id').value;
  const category = document.getElementById('order-category').value;
  const description = document.getElementById('order-description').value;
  const totalValue = Number(document.getElementById('order-total').value);
  const deadline = document.getElementById('order-deadline').value;
  const status = document.getElementById('order-status').value;
  const today = new Date().toISOString().split('T')[0];

  if (id) {
    const order = db.orders.find(o => o.id === id);
    if (order) {
      order.clientId = clientId;
      order.category = category;
      order.description = description;
      order.totalValue = totalValue;
      order.deadline = deadline;
      order.status = status;
    }
  } else {
    const codeNum = 100 + db.orders.length + 1;
    const newOrder = {
      id: 'ord-' + Date.now(),
      code: 'PED-' + codeNum,
      clientId, category, description, totalValue, deadline, status,
      createdAt: today
    };
    db.orders.push(newOrder);
  }

  saveLocal();
  closeOrderModal();
}

function editOrder(id) {
  const order = db.orders.find(o => o.id === id);
  if (!order) return;
  document.getElementById('order-modal-title').innerText = "Editar Pedido";
  document.getElementById('order-id').value = order.id;
  document.getElementById('order-client-id').value = order.clientId || '';
  document.getElementById('order-category').value = order.category || 'Camisa sob medida';
  document.getElementById('order-description').value = order.description || '';
  document.getElementById('order-total').value = order.totalValue || '';
  document.getElementById('order-deadline').value = order.deadline || '';
  document.getElementById('order-status').value = order.status || 'Novo pedido';
  document.getElementById('modal-order').classList.remove('hidden');
}

function deleteOrder(id) {
  if (confirm("Deseja realmente excluir este pedido?")) {
    db.orders = db.orders.filter(o => o.id !== id);
    saveLocal();
  }
}

// Payment Handlers
function savePayment(e) {
  e.preventDefault();
  const orderId = document.getElementById('payment-order-id').value;
  const amount = Number(document.getElementById('payment-amount').value);
  const date = document.getElementById('payment-date').value;
  const method = document.getElementById('payment-method').value;
  const notes = document.getElementById('payment-notes').value;

  const newPayment = {
    id: 'pay-' + Date.now(),
    orderId, amount, date, method, notes
  };
  db.payments.push(newPayment);

  saveLocal();
  closePaymentModal();
}

function deletePayment(id) {
  if (confirm("Deseja realmente excluir este pagamento?")) {
    db.payments = db.payments.filter(p => p.id !== id);
    saveLocal();
  }
}

// Utils
function formatCurrency(val) {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function filterClients() {
  renderClients();
}

function filterOrders() {
  renderOrders();
}
