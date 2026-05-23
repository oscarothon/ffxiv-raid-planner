import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadScripts, installFetchMock, fetchResponse } from "./setup.js";

describe("API", () => {
  let fetchMock;

  beforeEach(() => {
    loadScripts("js/api.js");
    fetchMock = installFetchMock();
  });

  // ─── request() base behaviour ───────────────────────────────────────────

  describe("request() base behaviour", () => {
    it("sends credentials: include on every call", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.me();
      expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
    });

    it("sends Content-Type: application/json header", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.me();
      expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
    });

    it("sends Accept: application/json header", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.me();
      expect(fetchMock.mock.calls[0][1].headers["Accept"]).toBe("application/json");
    });

    it("returns parsed JSON on 200 with JSON body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: { hello: "world" } }));
      const result = await window.API.me();
      expect(result).toEqual({ hello: "world" });
    });

    it("returns null on 200 with empty body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: "" }));
      const result = await window.API.me();
      expect(result).toBeNull();
    });

    it("returns null on 200 with non-JSON text body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: "plain text response" }));
      const result = await window.API.me();
      expect(result).toBeNull();
    });

    it("returns {__notModified: true, status: 304} on 304 response", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ status: 304, body: "" }));
      const result = await window.API.getState();
      expect(result).toEqual({ __notModified: true, status: 304 });
    });

    it("throws Error with .message from JSON error payload on 4xx", async () => {
      fetchMock.mockResolvedValueOnce(
        fetchResponse({ status: 401, body: { error: "Not logged in" } })
      );
      await expect(window.API.me()).rejects.toMatchObject({ message: "Not logged in" });
    });

    it("throws Error with .status matching response status on 4xx", async () => {
      fetchMock.mockResolvedValueOnce(
        fetchResponse({ status: 403, body: { error: "Forbidden" } })
      );
      await expect(window.API.me()).rejects.toMatchObject({ status: 403 });
    });

    it("throws Error with .data matching the full JSON payload on 4xx", async () => {
      const payload = { error: "Forbidden", detail: "extra" };
      fetchMock.mockResolvedValueOnce(fetchResponse({ status: 403, body: payload }));
      await expect(window.API.me()).rejects.toMatchObject({ data: payload });
    });

    it("throws with statusText when 4xx has no body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ status: 500, body: "" }));
      await expect(window.API.me()).rejects.toMatchObject({ message: "500" });
    });

    it("throws with statusText when 4xx has non-JSON body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ status: 500, body: "Internal Server Error" }));
      await expect(window.API.me()).rejects.toMatchObject({ message: "500" });
    });

    it("merges opts.extraHeaders into the fetch headers", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.request("/api/me", { extraHeaders: { "X-Custom": "test" } });
      expect(fetchMock.mock.calls[0][1].headers["X-Custom"]).toBe("test");
    });
  });

  // ─── Individual API methods ──────────────────────────────────────────────

  describe("me()", () => {
    it("calls GET /api/me", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.me();
      expect(fetchMock).toHaveBeenCalledWith("/api/me", expect.objectContaining({ method: "GET" }));
    });
  });

  describe("register()", () => {
    it("calls POST /api/register with username + password body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.register("alice", "s3cr3t");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/register",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ username: "alice", password: "s3cr3t" }),
        })
      );
    });
  });

  describe("login()", () => {
    it("calls POST /api/login with username + password body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.login("alice", "s3cr3t");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/login",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ username: "alice", password: "s3cr3t" }),
        })
      );
    });
  });

  describe("logout()", () => {
    it("calls POST /api/logout with no body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.logout();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/logout");
      expect(init.method).toBe("POST");
      expect(init.body).toBeUndefined();
    });
  });

  describe("myStatics()", () => {
    it("calls GET /api/statics/mine", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: [] }));
      await window.API.myStatics();
      expect(fetchMock).toHaveBeenCalledWith("/api/statics/mine", expect.objectContaining({ method: "GET" }));
    });
  });

  describe("createStatic()", () => {
    it("calls POST /api/statics with name body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.createStatic("My Static");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/statics",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "My Static" }),
        })
      );
    });
  });

  describe("joinStatic()", () => {
    it("calls POST /api/statics/join with invite_code body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.joinStatic("ABC123");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/statics/join",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ invite_code: "ABC123" }),
        })
      );
    });
  });

  describe("switchStatic()", () => {
    it("calls POST /api/statics/switch with static_id body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.switchStatic(42);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/statics/switch",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ static_id: 42 }),
        })
      );
    });
  });

  describe("getState()", () => {
    it("calls GET /api/state", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.getState();
      expect(fetchMock).toHaveBeenCalledWith("/api/state", expect.objectContaining({ method: "GET" }));
    });
  });

  describe("getStateConditional()", () => {
    it("sends no If-None-Match header when called without argument", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: { data: 1 } }));
      await window.API.getStateConditional();
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers["If-None-Match"]).toBeUndefined();
    });

    it("returns {notModified: false, payload: ...} when called without argument", async () => {
      const payload = { data: 1 };
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: payload }));
      const result = await window.API.getStateConditional();
      expect(result).toEqual({ notModified: false, payload });
    });

    it("sends If-None-Match header when etag is provided", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.getStateConditional("etag-value-1");
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers["If-None-Match"]).toBe("etag-value-1");
    });

    it("returns {notModified: true} when server responds 304", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ status: 304, body: "" }));
      const result = await window.API.getStateConditional("etag-value-1");
      expect(result).toEqual({ notModified: true });
    });

    it("returns {notModified: false, payload: ...} on 200 with etag", async () => {
      const payload = { etag: "new-etag", data: 2 };
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: payload }));
      const result = await window.API.getStateConditional("etag-value-1");
      expect(result).toEqual({ notModified: false, payload });
    });
  });

  describe("putState()", () => {
    it("calls PUT /api/state with data as body", async () => {
      const stateData = { slots: [] };
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.putState(stateData);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/state",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(stateData),
        })
      );
    });
  });

  describe("listMembers()", () => {
    it("calls GET /api/statics/:id/members", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: [] }));
      await window.API.listMembers(7);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/statics/7/members",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("setMemberRole()", () => {
    it("calls PUT /api/statics/:staticId/members/:userId/role with role body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.setMemberRole(7, 3, "officer");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/statics/7/members/3/role",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ role: "officer" }),
        })
      );
    });
  });

  describe("removeMember()", () => {
    it("calls DELETE /api/statics/:staticId/members/:userId", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.removeMember(7, 3);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/statics/7/members/3",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("sends no body on DELETE", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.removeMember(7, 3);
      expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });
  });

  describe("listPending()", () => {
    it("calls GET /api/pending", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: [] }));
      await window.API.listPending();
      expect(fetchMock).toHaveBeenCalledWith("/api/pending", expect.objectContaining({ method: "GET" }));
    });
  });

  describe("approvePending()", () => {
    it("calls POST /api/pending/:id/approve", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.approvePending(5);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pending/5/approve",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("rejectPending()", () => {
    it("calls POST /api/pending/:id/reject", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.rejectPending(5);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/pending/5/reject",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("telegramStatus()", () => {
    it("calls GET /api/telegram/status", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.telegramStatus();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/telegram/status",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("telegramUnbind()", () => {
    it("calls POST /api/telegram/unbind", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.telegramUnbind();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/telegram/unbind",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  describe("getCharacter()", () => {
    it("calls GET /api/character", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.getCharacter();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/character",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("putCharacter()", () => {
    it("calls PUT /api/character with character as body", async () => {
      const char = { name: "Warrior of Light", server: "Bahamut" };
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.putCharacter(char);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/character",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(char),
        })
      );
    });
  });

  describe("claimSlot()", () => {
    it("calls POST /api/character/claim-slot with slot_id body", async () => {
      fetchMock.mockResolvedValueOnce(fetchResponse({ body: {} }));
      await window.API.claimSlot(3);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/character/claim-slot",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ slot_id: 3 }),
        })
      );
    });
  });
});
