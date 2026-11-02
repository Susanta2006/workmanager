// Data access over Supabase with the same call shapes the app already uses:
//   entities.<Name>.list(opts), .filter(criteria, opts), .get(id), .create(data),
//   .update(id, data), .delete(id), .bulkCreate(rows), .updateMany(criteria, { $set: patch })
// "User" maps to the `profiles` table. Every other entity is a row in `records`
// (entity name + jsonb data), so criteria are matched with jsonb containment on the server.
// Works with either the browser client or the server's service-role client.

type Opts = { limit?: number; offset?: number; sort?: string } | undefined;
type Criteria = Record<string, unknown> | null | undefined;

const SYSTEM_KEYS = ["id", "created_date", "updated_date", "created_by_id", "created_by"];

function clean(data: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (SYSTEM_KEYS.includes(key) || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function mapRecord(row: any) {
  if (!row) return null;
  return {
    ...(row.data || {}),
    id: row.id,
    created_date: row.created_at,
    updated_date: row.updated_at,
    created_by_id: row.created_by ?? null,
  };
}

function mapProfile(row: any) {
  if (!row) return null;
  return { ...row, created_date: row.created_at, updated_date: row.updated_at };
}

function parseSort(sort?: string) {
  if (!sort || typeof sort !== "string") return null;
  const desc = sort.startsWith("-");
  return { field: desc ? sort.slice(1) : sort, desc };
}

function compare(a: any, b: any) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function makeEntity(client: any, name: string, organizationId?: string | null) {
  const isProfile = name === "User";
  const table = isProfile ? "profiles" : "records";
  const mapRow = isProfile ? mapProfile : mapRecord;

  const base = () => {
    const query = client.from(table).select("*");
    if (isProfile) {
      return organizationId ? query.eq("organization_id", organizationId) : query;
    }
    return organizationId ? query.eq("entity", name).eq("organization_id", organizationId) : query.eq("entity", name);
  };
  const withCriteria = (query: any, criteria: Criteria) => {
    if (!criteria || !Object.keys(criteria).length) return query;
    return isProfile ? query.match(criteria) : query.contains("data", criteria);
  };

  async function fetchRows(criteria: Criteria, opts?: Opts) {
    const limit = Math.min(Math.max(Number(opts?.limit) || 500, 1), 1000);
    const offset = Math.max(Number(opts?.offset) || 0, 0);
    const sort = parseSort(opts?.sort);
    // The server orders by creation time, then id, so pages never overlap or skip rows.
    // Any other sort key is applied in memory to the rows that were fetched.
    const createdDesc = sort && sort.field === "created_date" ? sort.desc : true;
    const { data, error } = await withCriteria(base(), criteria)
      .order("created_at", { ascending: !createdDesc })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    const rows = (data || []).map(mapRow);
    if (!sort || sort.field === "created_date") return rows;
    return [...rows].sort((x: any, y: any) => {
      const c = compare(x[sort.field], y[sort.field]);
      return sort.desc ? -c : c;
    });
  }

  async function currentUserId() {
    const { data } = await client.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  const api = {
    list: (opts?: Opts) => fetchRows(null, opts),
    filter: (criteria: Criteria, opts?: Opts) => fetchRows(criteria, opts),

    get: async (id: string) => {
      if (!id) return null;
      const { data, error } = await base().eq("id", id).maybeSingle();
      if (error) throw error;
      return mapRow(data);
    },

    create: async (data: Record<string, unknown>) => {
      if (isProfile) throw new Error("Accounts are created through sign-up, not by the app.");
      const { data: row, error } = await client
        .from("records")
        .insert({
          entity: name,
          data: clean(data),
          created_by: await currentUserId(),
          ...(organizationId ? { organization_id: organizationId } : {}),
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapRecord(row);
    },

    bulkCreate: async (rows: Record<string, unknown>[]) => {
      if (isProfile) throw new Error("Accounts are created through sign-up, not by the app.");
      const uid = await currentUserId();
      const payload = rows.map((data) => ({
        entity: name,
        data: clean(data),
        created_by: uid,
        ...(organizationId ? { organization_id: organizationId } : {}),
      }));
      const { data, error } = await client.from("records").insert(payload).select("*");
      if (error) throw error;
      return (data || []).map(mapRecord);
    },

    update: async (id: string, patch: Record<string, unknown>) => {
      const body = clean(patch);
      if (isProfile) {
        const { data, error } = await client.from("profiles").update(body).eq("id", id).select("*").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("This record is not visible to you or no longer exists.");
        return mapProfile(data);
      }
      const { data, error } = await client.rpc("records_patch", { p_id: id, p_entity: name, p_patch: body });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("This record is not visible to you or no longer exists.");
      return mapRecord(row);
    },

    updateMany: async (criteria: Criteria, change: any) => {
      const patch = clean(change?.$set ?? change);
      const rows = await fetchRows(criteria, { limit: 1000 });
      await Promise.all(rows.map((row: any) => api.update(row.id, patch)));
      return { updated: rows.length };
    },

    delete: async (id: string) => {
      if (isProfile) throw new Error("Accounts are removed through account deletion, not by the app.");
      if (name === "ActivityLog") throw new Error("Activity logs are retained for audit history.");
      if (name === "Notification") {
        const { error } = await client.from("records").delete().eq("id", id).eq("entity", name);
        if (error) throw error;
        return { id };
      }
      const { data, error } = await client.rpc("records_delete_cascade", {
        p_id: id,
        p_entity: name,
      });
      if (error) throw error;
      return { id, deletedRecords: data };
    },
  };
  return api;
}

export function createEntities(client: any, organizationId?: string | null) {
  const cache = new Map<string, ReturnType<typeof makeEntity>>();
  const entities = new Proxy({} as Record<string, ReturnType<typeof makeEntity>>, {
    get(_target, name) {
      if (typeof name !== "string") return undefined;
      if (!cache.has(name)) cache.set(name, makeEntity(client, name, organizationId));
      return cache.get(name);
    },
  });
  return { entities };
}
