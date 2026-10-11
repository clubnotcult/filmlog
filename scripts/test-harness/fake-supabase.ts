// Tiny in-memory Supabase used by the unit tests: only the query methods the code under test uses.
export type Row = Record<string, unknown>;
export function fakeSupabase(tables: Record<string, Row[]>) {
  class Q {
    rows: Row[];
    constructor(public t: string) { this.rows = [...(tables[t] ?? [])]; }
    select() { return this; }
    eq(c: string, v: unknown) { this.rows = this.rows.filter((r) => r[c] === v); return this; }
    in(c: string, vs: unknown[]) { this.rows = this.rows.filter((r) => vs.includes(r[c])); return this; }
    gte(c: string, v: string) { this.rows = this.rows.filter((r) => String(r[c]) >= v); return this; }
    lte(c: string, v: string) { this.rows = this.rows.filter((r) => String(r[c]) <= v); return this; }
    not(c: string, _op: string, v: unknown) { this.rows = this.rows.filter((r) => r[c] !== v); return this; }
    order(c: string, o: { ascending: boolean }) {
      this.rows.sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (o.ascending ? 1 : -1));
      return this;
    }
    single() { this.rows = this.rows.slice(0, 1); return this; }
    limit(n: number) { this.rows = this.rows.slice(0, n); return this; }
    range(a: number, b: number) { this.total = this.rows.length; this.rows = this.rows.slice(a, b + 1); return this; }
    total: number | null = null;
    then(res: (v: { data: Row[]; count: number }) => unknown) {
      return Promise.resolve({ data: this.rows, count: this.total ?? this.rows.length }).then(res);
    }
  }
  return { from: (t: string) => new Q(t) } as never;
}

