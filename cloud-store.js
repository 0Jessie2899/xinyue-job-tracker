/* Supabase persistence. Access is enforced by PostgreSQL RLS, not this UI. */
(function (root) {
  "use strict";
  const canonical = value => JSON.stringify(sort(value));
  function sort(value) {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
    return value;
  }
  class TrackerStore {
    constructor(client, ownerId) {
      this.client = client;
      this.ownerId = ownerId;
      this.revision = null;
      this.payload = null;
    }
    async read() {
      const { data, error } = await this.client.from("job_tracker_documents")
        .select("payload,revision,updated_at").eq("owner_id", this.ownerId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("当前账号没有查看权限，请联系台账所有者授权。");
      this.revision = data.revision;
      this.payload = data.payload;
      return data;
    }
    async write(payload, userId) {
      if (userId !== this.ownerId) throw new Error("当前账号只有查看权限。");
      if (this.revision === null) throw new Error("请先成功加载云端台账。");
      const expected = this.revision;
      const { data, error } = await this.client.from("job_tracker_documents")
        .update({ payload, revision: expected + 1, updated_at: new Date().toISOString() })
        .eq("owner_id", this.ownerId).eq("revision", expected)
        .select("payload,revision,updated_at").maybeSingle();
      if (error) throw error;
      if (!data) {
        // A previous request may have committed even if its response was lost.
        // Otherwise preserve the draft and never overwrite another device's work.
        const current = await this.client.from("job_tracker_documents")
          .select("payload,revision,updated_at").eq("owner_id", this.ownerId).maybeSingle();
        if (current.error) throw current.error;
        if (!current.data || canonical(current.data.payload) !== canonical(payload)) {
          const conflict = new Error("另一台设备已经更新台账。请先导出当前未保存内容，再点击“读取云端”查看最新版本。");
          conflict.code = "CONFLICT";
          throw conflict;
        }
        this.revision = current.data.revision;
        this.payload = current.data.payload;
        return current.data;
      }
      this.revision = data.revision;
      this.payload = data.payload;
      return data;
    }
    async viewers() {
      const { data, error } = await this.client.from("job_tracker_viewers")
        .select("viewer_id").eq("owner_id", this.ownerId);
      if (error) throw error;
      return data;
    }
    async grant(viewerId) {
      const { error } = await this.client.from("job_tracker_viewers")
        .insert({ owner_id: this.ownerId, viewer_id: viewerId });
      if (error) throw error;
    }
    async revoke(viewerId) {
      const { error } = await this.client.from("job_tracker_viewers").delete()
        .eq("owner_id", this.ownerId).eq("viewer_id", viewerId);
      if (error) throw error;
    }
  }
  root.TrackerStore = TrackerStore;
  if (typeof module !== "undefined") module.exports = { TrackerStore, canonical };
})(typeof window !== "undefined" ? window : globalThis);
