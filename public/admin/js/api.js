// public/admin/js/api.js
export const api = {
    async fetch(url, method = 'GET', body = null) {
        const token = localStorage.getItem('token');
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };
        if (body) options.body = JSON.stringify(body);

        try {
            const res = await fetch(url, options);
            if (res.status === 401 || res.status === 403) {
                console.warn("⚠️ Sesión expirada");
                localStorage.clear();
                window.location.href = 'login.html';
                return null;
            }
            return await res.json();
        } catch (error) {
            console.error("💥 Error en API Fetch:", error);
            throw error;
        }
    }
};