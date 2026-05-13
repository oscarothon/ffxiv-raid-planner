// Cliente HTTP centralizado da API do servidor Flask.
// Todas as chamadas usam credenciais (cookies de sessão) e JSON.

const API = (() => {
    async function request(path, opts = {}) {
        const init = {
            credentials: "include",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            method: opts.method || "GET",
        };
        if (opts.body !== undefined) {
            init.body = JSON.stringify(opts.body);
        }
        const res = await fetch(path, init);
        let data = null;
        const txt = await res.text();
        if (txt) {
            try { data = JSON.parse(txt); } catch (_) { /* ignore */ }
        }
        if (!res.ok) {
            const err = new Error((data && data.error) || res.statusText || "Erro de rede");
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    return {
        request,
        me:            ()                 => request("/api/me"),
        register:      (username, pwd)    => request("/api/register",        { method: "POST", body: { username, password: pwd } }),
        login:         (username, pwd)    => request("/api/login",           { method: "POST", body: { username, password: pwd } }),
        logout:        ()                 => request("/api/logout",          { method: "POST" }),
        myStatics:     ()                 => request("/api/statics/mine"),
        createStatic:  (name)             => request("/api/statics",         { method: "POST", body: { name } }),
        joinStatic:    (invite_code)      => request("/api/statics/join",    { method: "POST", body: { invite_code } }),
        switchStatic:  (static_id)        => request("/api/statics/switch",  { method: "POST", body: { static_id } }),
        getState:      ()                 => request("/api/state"),
        putState:      (data)             => request("/api/state",           { method: "PUT", body: data }),
    };
})();
