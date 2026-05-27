// public/admin/js/orders.js
import { api } from "./api.js";
import { catalog } from "./catalog.js";

export const orders = {
  tempItems: [],
  currentDeliveryMode: "PICKUP",
  deliveryFee: 0, // Centavos

  async load() {
    try {
      const data = await api.fetch("/api/pedidos");
      this.render(data);
      this.updateStats(data);
    } catch (e) {
      console.error("❌ Error load orders:", e);
    }
  },

  // --- LÓGICA DEL POS (NUEVA ORDEN) ---

  openModal() {
    document.getElementById("modal-order").classList.remove("hidden");
    document.body.classList.add("modal-active");
    this.tempItems = [];
    this.setDeliveryMode("PICKUP"); // Reiniciar a modo tienda
    this.renderTempOrder();
  },

  closeModal() {
    document.getElementById("modal-order").classList.add("hidden");
    document.body.classList.remove("modal-active");

    this.tempItems = [];
    const form = document.getElementById("direct-order-form");
    if (form) form.reset();

    // Limpieza de campos manual
    [
      "cust-name",
      "cust-phone",
      "cust-address",
      "prod-select",
      "item-notes",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    const modCont = document.getElementById("modifiers-container");
    if (modCont) modCont.innerHTML = "";

    this.renderTempOrder();
  },

  setDeliveryMode(mode) {
    this.currentDeliveryMode = mode;
    const isDelivery = mode === "DELIVERY";

    // UI: Mostrar/Ocultar campos
    const addrField = document.getElementById("cust-address");
    const deliveryRow = document.getElementById("delivery-cost-row");
    if (addrField) addrField.classList.toggle("hidden", !isDelivery);
    if (deliveryRow) deliveryRow.classList.toggle("hidden", !isDelivery);

    // LÓGICA: Obtener costo de envío de la configuración del usuario logueado
    if (isDelivery) {
      const user = JSON.parse(localStorage.getItem("user"));
      // Usamos el costoEnvioCents que Claude sugirió en la configuración global
      this.deliveryFee = user.costoEnvioCents || 3000;
    } else {
      this.deliveryFee = 0;
    }

    // UI: Botones
    document.getElementById("btn-pickup").className =
      `flex-1 py-2 rounded-lg text-[10px] font-black border-2 ${!isDelivery ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-transparent bg-slate-100 text-slate-500"}`;
    document.getElementById("btn-delivery").className =
      `flex-1 py-2 rounded-lg text-[10px] font-black border-2 ${isDelivery ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-transparent bg-slate-100 text-slate-500"}`;

    this.renderTempOrder();
  },

  renderModifiers() {
    const productId = document.getElementById("prod-select").value;
    const item = catalog.items.find((i) => i._id === productId);
    const container = document.getElementById("modifiers-container");
    if (!container) return;
    container.innerHTML = "";

    if (item && item.modificadores) {
      item.modificadores.forEach((grupo) => {
        const title = document.createElement("p");
        title.className = "text-[9px] font-bold text-slate-400 uppercase mt-2";
        title.innerText = grupo.nombre;
        container.appendChild(title);

        grupo.opciones.forEach((opt) => {
          const div = document.createElement("div");
          div.className =
            "flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 mb-1";
          div.innerHTML = `
                        <label class="text-xs font-medium text-slate-600 flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="mod-checkbox w-4 h-4 text-indigo-600" 
                                data-group="${grupo.nombre}" data-name="${opt.nombre}" data-price="${opt.precioAdicional || 0}">
                            ${opt.nombre}
                        </label>
                        <span class="text-[10px] font-bold text-slate-400">+$${((opt.precioAdicional || 0) / 100).toFixed(2)}</span>`;
          container.appendChild(div);
        });
      });
    }
  },

  addItemToTempOrder() {
    const productId = document.getElementById("prod-select").value;
    const item = catalog.items.find((i) => i._id === productId);
    if (!item) return alert("Selecciona un producto");

    const selectedModifiers = [];
    let extrasTotal = 0;

    document.querySelectorAll(".mod-checkbox:checked").forEach((cb) => {
      const price = parseInt(cb.dataset.price);
      selectedModifiers.push({
        grupoNombre: cb.dataset.group,
        opcionNombre: cb.dataset.name,
        precioExtra: price,
      });
      extrasTotal += price;
    });

    // 🌟 CAPTURAR NOTA DEL ÍTEM
    const itemNotes = document.getElementById("item-notes").value;

    this.tempItems.push({
      itemId: item._id,
      nombre: item.nombre,
      precioUnitario: item.precioBase + extrasTotal,
      opcionesSeleccionadas: selectedModifiers,
      notas: itemNotes, // 👈 Guardar nota
      cantidad: 1,
    });

    // Limpiar campos de captura
    document.getElementById("prod-select").value = "";
    document.getElementById("item-notes").value = "";
    document.getElementById("modifiers-container").innerHTML = "";

    this.renderTempOrder();
  },

  renderTempOrder() {
    const list = document.getElementById("temp-items-list");
    const subtotalDisp = document.getElementById("temp-subtotal");
    const deliveryDisp = document.getElementById("temp-delivery-fee");
    const totalDisp = document.getElementById("temp-total");

    let subtotal = 0;

    if (this.tempItems.length === 0) {
      list.innerHTML =
        '<p class="text-center text-slate-400 text-xs py-10 italic">Carrito vacío</p>';
      if (subtotalDisp) subtotalDisp.innerText = "$0.00";
      if (deliveryDisp) deliveryDisp.innerText = "+$0.00";
      totalDisp.innerText = "$0.00";
      return;
    }

    list.innerHTML = this.tempItems
      .map((item, index) => {
        subtotal += item.precioUnitario;
        return `
                <div class="bg-white p-3 rounded-xl border border-slate-200 relative mb-2">
                    <button onclick="window.removeTempItem(${index})" class="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[10px]">×</button>
                    <div class="flex justify-between">
                        <p class="text-xs font-black text-slate-700">${item.nombre}</p>
                        <p class="text-xs font-bold text-indigo-600">$${(item.precioUnitario / 100).toFixed(2)}</p>
                    </div>
                    ${item.notas ? `<p class="text-[9px] text-orange-500 italic mt-1">"${item.notas}"</p>` : ""}
                    ${item.opcionesSeleccionadas.map((opt) => `<p class="text-[9px] text-slate-400">+ ${opt.opcionNombre}</p>`).join("")}
                </div>`;
      })
      .join("");

    if (subtotalDisp)
      subtotalDisp.innerText = `$${(subtotal / 100).toFixed(2)}`;
    if (deliveryDisp)
      deliveryDisp.innerText = `+$${(this.deliveryFee / 100).toFixed(2)}`;

    const totalFinal = subtotal + this.deliveryFee;
    totalDisp.innerText = `$${(totalFinal / 100).toFixed(2)}`;
  },

  async submitFinalOrder() {
    if (this.tempItems.length === 0) return alert("Añade productos al pedido");

    const payload = {
      customerName:
        document.getElementById("cust-name").value || "Cliente Mostrador",
      customerPhone: document.getElementById("cust-phone").value,
      metodoPago: document.getElementById("pay-method").value,
      deliveryMode: this.currentDeliveryMode,
      direccionEntrega:
        this.currentDeliveryMode === "DELIVERY"
          ? document.getElementById("cust-address").value
          : "RECOGIDA EN TIENDA",
      costoEnvio: this.deliveryFee, // 🌟 Enviamos el costo de envío al backend
      items: this.tempItems,
    };

    const res = await api.fetch("/api/pedidos/directo", "POST", payload);
    if (res) {
      this.closeModal();
      this.load();
    }
  },

  // --- RENDERIZADO DE COMANDAS ---

  render(data) {
    const grid = document.getElementById("orders-grid");
    if (!grid) return;
    if (!data || data.length === 0) {
      grid.innerHTML =
        '<div class="col-span-full text-center py-20 text-slate-300 font-bold uppercase">Sin pedidos activos</div>';
      return;
    }
    grid.innerHTML = data.map((p) => this.createCard(p)).join("");
  },

  createCard(p) {
    const statusKey = p.estado.toLowerCase().replace(/\s/g, "");
    return `
            <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden status-${statusKey}">
                <div class="p-6">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                ${p.source === "WHATSAPP" ? '<i class="fab fa-whatsapp text-green-500"></i>' : '<i class="fas fa-store text-blue-400"></i>'}
                                <span class="text-[10px] font-black text-slate-300 uppercase">${p.source}</span>
                            </div>
                            <h3 class="text-lg font-black text-slate-800 tracking-tighter">#${p.numero_pedido} - ${p.nombreCliente}</h3>
                        </div>
                        <span class="text-[9px] font-black px-2 py-1 rounded-lg bg-slate-100 text-slate-500 uppercase">${p.estado}</span>
                    </div>
                    <div class="mb-4">
                        <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${p.entregaMode === "DELIVERY" ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}">
                            ${p.entregaMode === "DELIVERY" ? "🛵 A DOMICILIO" : "🛍️ RECOGER"}
                        </span>
                    </div>
                    <div class="space-y-2 mb-6">
                        ${p.items
                          .map(
                            (i) => `
    <div class="text-sm font-bold text-slate-700 mb-3">
        
        <div>
            ${i.cantidad}x ${i.nombre}
        </div>

        ${
          Array.isArray(i.opcionesSeleccionadas) &&
          i.opcionesSeleccionadas.length > 0
            ? `
            <div class="mt-1 ml-2 space-y-1">
                ${i.opcionesSeleccionadas
                  .map(
                    (opt) => `
                    <p class="text-[10px] text-indigo-500 font-semibold">
                        + ${opt.opcionNombre}
                    </p>
                `,
                  )
                  .join("")}
            </div>
        `
            : ""
        }

        ${
          i.notas
            ? `
            <p class="text-[10px] text-orange-400 italic mt-1">
                "${i.notas}"
            </p>
        `
            : ""
        }

    </div>
`,
                          )
                          .join("")}
                    </div>
                    ${this.getActionButtons(p)}
                </div>
            </div>`;
  },

  getActionButtons(p) {
    const btnBase =
      "w-full text-[10px] font-black py-3 rounded-2xl transition-all uppercase tracking-widest";
    if (p.estado === "Pendiente de Pago")
      return `<button onclick="window.changeStatus('${p._id}', 'Confirmado')" class="${btnBase} bg-amber-500 text-white hover:bg-amber-600">VALIDAR PAGO</button>`;
    if (p.estado === "Pendiente")
      return `<button onclick="window.changeStatus('${p._id}', 'Confirmado')" class="${btnBase} bg-indigo-600 text-white">CONFIRMAR</button>`;
    if (p.estado === "Confirmado" || p.estado === "En Preparación") {
      // 🌟 LÓGICA TOP-TIER: El nombre del botón depende del modo de entrega
      const label =
        p.entregaMode === "PICKUP"
          ? "✅ MARCAR COMO LISTO"
          : "🛵 ENVIAR REPARTIDOR";

      return `<button onclick="window.changeStatus('${p._id}', 'En Camino')" class="${btnBase} bg-emerald-500 text-white hover:bg-emerald-600">${label}</button>`;
    }
    if (p.estado === "En Camino")
      return `<button onclick="window.changeStatus('${p._id}', 'Entregado')" class="${btnBase} bg-slate-800 text-white">FINALIZAR</button>`;
    return "";
  },

  updateStats(pedidos) {
    const pending = pedidos.filter((p) =>
      ["Pendiente", "Pendiente de Pago"].includes(p.estado),
    ).length;
    const kitchen = pedidos.filter((p) =>
      ["Confirmado", "En Preparación"].includes(p.estado),
    ).length;
    const delivery = pedidos.filter((p) => p.estado === "En Camino").length;
    const total = pedidos.reduce((acc, p) => acc + p.total / 100, 0);

    if (document.getElementById("stat-pending"))
      document.getElementById("stat-pending").innerText = pending;
    if (document.getElementById("stat-kitchen"))
      document.getElementById("stat-kitchen").innerText = kitchen;
    if (document.getElementById("stat-delivery"))
      document.getElementById("stat-delivery").innerText = delivery;
    if (document.getElementById("stat-sales"))
      document.getElementById("stat-sales").innerText =
        `$${total.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  },
};

// 🌟 VÍNCULOS GLOBALES
window.openModal = () => orders.openModal();
window.closeModal = () => orders.closeModal();
window.renderModifiers = () => orders.renderModifiers();
window.addItemToTempOrder = () => orders.addItemToTempOrder();
window.removeTempItem = (idx) => {
  orders.tempItems.splice(idx, 1);
  orders.renderTempOrder();
};
window.setDeliveryMode = (mode) => orders.setDeliveryMode(mode);
window.submitFinalOrder = () => orders.submitFinalOrder();
