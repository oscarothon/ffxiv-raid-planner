// Cliente HTTP centralizado da API do servidor Flask.
// Todas as chamadas usam credenciais (cookies de sessão) e JSON.

const API = (() => {
    async function request(path, opts = {}) {
        const init = {
            credentials: "include",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            method: opts.method || "GET",
        };
        if (opts.extraHeaders) {
            Object.assign(init.headers, opts.extraHeaders);
        }
        if (opts.body !== undefined) {
            init.body = JSON.stringify(opts.body);
        }
        const res = await fetch(path, init);

        // Caminho rápido: 304 Not Modified — usado pelo polling de sincronização.
        if (res.status === 304) {
            return { __notModified: true, status: 304 };
        }

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

    /**
     * GET /api/state com suporte a If-None-Match.
     * Retorna { notModified: true } quando o servidor responde 304.
     * Caso contrário, retorna o payload completo (que já inclui `etag`).
     */
    async function getStateConditional(ifNoneMatch) {
        const opts = {};
        if (ifNoneMatch) opts.extraHeaders = { "If-None-Match": ifNoneMatch };
        const res = await request("/api/state", opts);
        if (res && res.__notModified) return { notModified: true };
        return { notModified: false, payload: res };
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
        getStateConditional,
        putState:      (data)             => request("/api/state",           { method: "PUT", body: data }),
        listMembers:   (staticId)         => request(`/api/statics/${staticId}/members`),
        setMemberRole: (staticId, userId, role) =>
                                             request(`/api/statics/${staticId}/members/${userId}/role`,
                                                     { method: "PUT", body: { role } }),
        removeMember:  (staticId, userId) =>
                                             request(`/api/statics/${staticId}/members/${userId}`,
                                                     { method: "DELETE" }),
        listPending:    ()         => request("/api/pending"),
        approvePending: (id)       => request(`/api/pending/${id}/approve`, { method: "POST" }),
        rejectPending:  (id)       => request(`/api/pending/${id}/reject`,  { method: "POST" }),
        telegramStatus: ()         => request("/api/telegram/status"),
        telegramUnbind: ()         => request("/api/telegram/unbind", { method: "POST" }),
        getCharacter:  ()                 => request("/api/character"),
        putCharacter:  (character)        => request("/api/character",       { method: "PUT", body: character }),
        claimSlot:     (slot_id)          => request("/api/character/claim-slot", { method: "POST", body: { slot_id } }),
    };
})();
