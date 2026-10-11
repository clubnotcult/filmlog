// Minimal in-memory stand-in for Supabase Auth + PostgREST, enough to run the
// real Next app against and drive it with a browser.
const http = require("http");
const { randomUUID } = require("crypto");
const USER = { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", role: "authenticated", email: "t@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const ROLL = "aaaaaaaa-0000-0000-0000-00000000000a";
const mk = () => randomUUID();
const nums = [1,2,3,4,6,7,8,10,11,12,13,14]; // 5 and 9 missing on purpose
const frames = nums.map((n, i) => ({
  id: mk(), user_id: USER.id, roll_id: ROLL, frame_number: n, shutter_speed: "1/125", aperture: 8,
  lens_id: "L1", notes: null, drive_file_id: "d"+n, drive_filename: `0000${n}.jpg`, drive_thumbnail_url: null, drive_view_url: null,
  metadata_logged: true, meter_type: null, push_pull: 0, exposure_evaluation: null, selection: null, location_id: null,
  created_at: `2026-10-01T00:00:${String(i).padStart(2,"0")}Z`, updated_at: "2026-10-01T00:00:00Z",
}));
const ROLL2 = "bbbbbbbb-0000-0000-0000-00000000000b";
const frames2 = [1,2,3].map((n, i) => ({ ...frames[0], id: mk(), roll_id: ROLL2, frame_number: n, drive_file_id: "e"+n, drive_filename: `b${n}.jpg`, created_at: `2026-10-02T00:00:0${i}Z` }));
frames.push(...frames2);
const db = {
  rolls: [{ ...{ id: ROLL2, user_id: USER.id, film_stock_id: "S1", film_inventory_item_id: "I1", camera_id: "C1", default_lens_id: "L1", start_date: "2026-09-20", end_date: "2026-09-21", custom_title: null, status: "completed", current_frame: 4, drive_folder_id: "F2", drive_folder_name: "JPG", notes: null, created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", drive_parent_folder_id: null, drive_jpeg_folder_id: null, drive_raw_folder_id: null, drive_selects_folder_id: null } }, { id: ROLL, user_id: USER.id, film_stock_id: "S1", film_inventory_item_id: "I1", camera_id: "C1", default_lens_id: "L1", start_date: "2026-09-10", end_date: "2026-09-12", custom_title: null, status: "completed", current_frame: 15, drive_folder_id: "FOLDER", drive_folder_name: "JPG", notes: null, created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z", drive_parent_folder_id: null, drive_jpeg_folder_id: null, drive_raw_folder_id: null, drive_selects_folder_id: null }],
  frames,
  film_stocks: [{ id: "S1", name: "Portra 400", iso: 400, format: "35mm", film_type: "color_negative", active: true }],
  cameras: [{ id: "C1", name: "Canon A-1", format: "35mm", shutter_speeds: ["1/60","1/125"] }],
  lenses: [{ id: "L1", name: "FD 50", focal_length: "50mm", aperture_stops: [2.8,8] }],
  tags: [], locations: [], frame_tags: [], roll_sync_history: [], user_settings: [],
};
const log = [];
function match(row, key, val) {
  const [op, ...rest] = val.split("."); const v = rest.join(".");
  const x = row[key];
  if (op === "eq") return String(x) === v;
  if (op === "neq") return String(x) !== v;
  if (op === "in") return v.slice(1,-1).split(",").map((s)=>s.replace(/^"|"$/g,"")).includes(String(x));
  if (op === "is") return v === "null" ? x === null : x !== null;
  if (op === "gte") return String(x) >= v; if (op === "lte") return String(x) <= v;
  if (op === "not") { const [o2, ...r2] = rest; const v2 = r2.join("."); return !(o2 === "is" ? (v2 === "null" ? x === null : x !== null) : o2 === "eq" ? String(x) === v2 : false); }
  return true;
}
const LAT = Number(process.env.LAT || 0);
http.createServer((req, res) => { setTimeout(() => handle(req, res), LAT); }).listen(54321, "127.0.0.1", () => console.log("mock up"));
function handle(req, res) {
  const u = new URL(req.url, "http://x");
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    const send = (code, obj, headers = {}) => { res.writeHead(code, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(obj)); };
    if (u.pathname === "/__log") return send(200, log);
    if (u.pathname.startsWith("/auth/v1/user")) return send(200, USER);
    if (u.pathname.startsWith("/auth/v1/")) return send(200, {});
    const m = u.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (!m) return send(404, {});
    const table = m[1]; const rows = db[table];
    if (!rows) return send(404, { message: "no table "+table });
    let out = rows.filter((r) => { for (const [k, v] of u.searchParams) { if (["select","order","limit","offset","columns","on_conflict"].includes(k)) continue; if (!match(r, k, v)) return false; } return true; });
    if (req.method === "PATCH") { const patch = JSON.parse(body || "{}"); out.forEach((r) => Object.assign(r, patch)); log.push(`PATCH ${table} ${JSON.stringify(patch)}`); return send(200, out); }
    if (req.method === "POST") { return send(201, []); }
    const order = u.searchParams.get("order");
    if (order) for (const spec of order.split(",").reverse()) { const [c, d] = spec.split("."); out.sort((a,b)=> (a[c]<b[c]?-1:a[c]>b[c]?1:0) * (d==="desc"?-1:1)); }
    if (u.searchParams.get("limit")) out = out.slice(0, Number(u.searchParams.get("limit")));
    const accept = req.headers["accept"] || "";
    if (accept.includes("vnd.pgrst.object")) { if (out.length !== 1) return send(406, { code: "PGRST116", details: `The result contains ${out.length} rows`, message: "Cannot coerce the result to a single JSON object" }); return send(200, out[0]); }
    return send(200, out, { "content-range": `0-${Math.max(out.length-1,0)}/${out.length}` });
  });
}

