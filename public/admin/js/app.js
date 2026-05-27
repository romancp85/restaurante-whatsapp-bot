// public/admin/js/app.js
import { logger } from "./logger.js";
import { api } from "./api.js";
import { orders } from "./orders.js";
import { catalog } from "./catalog.js";

logger.info("[APP]🚀 Módulo App iniciado...");

const init = async () => {
  try {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user"));

    if (!token || !user) {
      window.location.href = "login.html";
      return;
    }

    // --- 1. PINTAR UI INICIAL ---
    document.getElementById("user-name").textContent = user.nombre;
    document.getElementById("store-name").textContent = user.restaurante;
    document.getElementById("user-initial").textContent = user.nombre
      .charAt(0)
      .toUpperCase();

    // --- 2. CONEXIÓN SOCKET.IO ---
    logger.info("[APP]🔌 Conectando Sockets...");
    const socket = io(window.location.origin, {
      auth: { token },
      query: { token },
    });

    socket.on("connect", () => {
      logger.info("[APP]✅ Socket en línea");
      const badge = document.getElementById("socket-status");
      if (badge) {
        badge.innerHTML =
          '<span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> SYSTEM LIVE';
        badge.className =
          "flex items-center gap-2 bg-green-50 text-green-600 px-3 py-1 rounded-full text-[10px] font-black border border-green-200";
      }
    });

    socket.on("NUEVO_PEDIDO", () => {
      orders.load();
      const sound = document.getElementById("notif-sound");
      if (sound) sound.play().catch(() => {});
    });

    // --- 3. NAVEGACIÓN (CAMBIO DE PESTAÑAS) ---
    document.querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const view = btn.getAttribute("data-view");

        document
          .querySelectorAll("section")
          .forEach((s) => s.classList.add("hidden"));
        document.getElementById(`view-${view}`).classList.remove("hidden");
        document
          .querySelectorAll(".nav-item")
          .forEach((i) => i.classList.remove("active-link"));
        btn.classList.add("active-link");

        document.getElementById("view-title").textContent =
          view === "comandas" ? "Comandas Live" : "Gestión de Catálogo";

        if (view === "comandas") orders.load();
        if (view === "catalogo") catalog.load();
      });
    });

    // --- 4. FORMULARIO DE PRODUCTOS (CATÁLOGO) ---
    const productForm = document.getElementById("product-form");
    if (productForm) {
      productForm.onsubmit = async (e) => {
        e.preventDefault();

        const payload = {
          id: document.getElementById("prod-id").value,
          nombre: document.getElementById("prod-name-input").value,
          precioBase: document.getElementById("prod-price-input").value,
          categoria: document.getElementById("prod-cat-input").value,
          descripcion: document.getElementById("prod-desc-input").value,
          disponible: document.getElementById("prod-avail-input").checked,
          cantidad_diaria: document.getElementById("prod-stock-input").value,
          tipoProducto: document.getElementById("prod-type-input").value,
          modificadores: catalog.currentModifiers,
        };

        try {
          await api.fetch("/api/menu", "POST", payload);
          window.closeProductModal();
          catalog.load();
        } catch (err) {
          alert("Error al guardar el producto");
        }
      };
    }

    // --- 5. FUNCIONES GLOBALES ---
    window.logout = () => {
      localStorage.clear();
      window.location.href = "login.html";
    };

    window.changeStatus = async (id, nuevoEstado) => {
      try {
        await api.fetch(`/api/pedidos/${id}/status`, "PUT", { nuevoEstado });
        orders.load();
      } catch (e) {
        alert("Error al actualizar el pedido");
      }
    };

    // --- 6. CARGA INICIAL ---
    await Promise.all([orders.load(), catalog.load()]);

    logger.info("[APP]✅ Inicialización completa.");
  } catch (err) {
    logger.error("[APP]❌ Error en la inicialización:", err);
  }
};

init();
