const KEY = "portfolio-tracker-v1";
const TYPES = { deposit: "Depósito", withdraw: "Retiro", buy: "Compra", sell: "Venta", dividend: "Cobro" };
const $ = id => document.getElementById(id);
const DEFAULTS = () => ({ txs: [], prices: {}, snapshots: [], currency: "USD" });

let state = load();
let chart;

function load() {
  try { return Object.assign(DEFAULTS(), JSON.parse(localStorage.getItem(KEY))); }
  catch { return DEFAULTS(); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

const today = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = v => (v === "" || v == null ? 0 : parseFloat(v));
const fmt = (n, d = 2) => (n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = n => `${fmt(n)} ${state.currency}`;
const cls = n => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const pct = n => `${n > 0 ? "+" : ""}${fmt(n)}%`;

// Recorre los movimientos en orden y calcula caja, posiciones (precio promedio ponderado) y resultados.
function compute(upTo) {
  const txs = [...state.txs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const r = { cash: 0, deposits: 0, realized: 0, income: 0, fees: 0, pos: {}, series: [] };
  for (const t of txs) {
    if (upTo && t.date > upTo) break;
    const fee = t.fee || 0;
    const p = t.ticker ? (r.pos[t.ticker] ??= { qty: 0, cost: 0, realized: 0, income: 0 }) : null;
    if (t.type === "deposit") { r.cash += t.amount; r.deposits += t.amount; }
    else if (t.type === "withdraw") { r.cash -= t.amount; r.deposits -= t.amount; }
    else if (t.type === "buy") {
      const c = t.qty * t.price + fee;
      r.cash -= c; p.qty += t.qty; p.cost += c; r.fees += fee;
    } else if (t.type === "sell") {
      const avg = p.qty ? p.cost / p.qty : 0;
      const proceeds = t.qty * t.price - fee;
      const gain = proceeds - avg * t.qty;
      r.cash += proceeds; p.cost -= avg * t.qty; p.qty -= t.qty;
      p.realized += gain; r.realized += gain; r.fees += fee;
      if (p.qty < 1e-9) { p.qty = 0; p.cost = 0; }
    } else if (t.type === "dividend") {
      r.cash += t.amount; r.income += t.amount; if (p) p.income += t.amount;
    }
    const invested = Object.values(r.pos).reduce((s, x) => s + x.cost, 0);
    r.series.push({ date: t.date, deposits: r.deposits, invested });
  }
  return r;
}

function marketValue(r) {
  return Object.entries(r.pos).reduce((s, [tk, p]) => s + (p.qty ? p.qty * (state.prices[tk] ?? p.cost / p.qty) : 0), 0);
}

// Guarda el valor total del día para armar la curva de evolución.
function snapshot() {
  const r = compute();
  const s = { date: today(), value: r.cash + marketValue(r), deposits: r.deposits };
  const i = state.snapshots.findIndex(x => x.date === s.date);
  if (i >= 0) state.snapshots[i] = s; else state.snapshots.push(s);
  save();
}

function render() {
  $("currency").value = state.currency;
  const r = compute();
  const mv = marketValue(r);
  const invested = Object.values(r.pos).reduce((s, x) => s + x.cost, 0);
  const total = r.cash + mv;
  const unreal = mv - invested;
  const ret = r.deposits ? ((total - r.deposits) / r.deposits) * 100 : 0;

  const cards = [
    ["Valor total", money(total)],
    ["Caja", money(r.cash)],
    ["Posiciones (mercado)", money(mv)],
    ["Capital depositado", money(r.deposits)],
    ["Resultado no realizado", `<span class="${cls(unreal)}">${money(unreal)}</span>`],
    ["Resultado realizado", `<span class="${cls(r.realized)}">${money(r.realized)}</span>`],
    ["Cobros (div./renta)", money(r.income)],
    ["Retorno s/ depósitos", `<span class="${cls(ret)}">${pct(ret)}</span>`],
  ];
  $("cards").innerHTML = cards.map(([l, v]) => `<div class="card"><div class="l">${l}</div><div class="v">${v}</div></div>`).join("");

  const rows = Object.entries(r.pos).filter(([, p]) => p.qty > 0 || p.realized || p.income);
  $("holdings").innerHTML = `<tr><th>Ticker</th><th>Cantidad</th><th>PPC</th><th>Precio actual</th><th>Costo</th><th>Valor</th><th>P&amp;L</th><th>P&amp;L %</th><th>Peso</th><th>Realizado</th><th>Cobros</th></tr>` +
    (rows.map(([tk, p]) => {
      const ppc = p.qty ? p.cost / p.qty : 0;
      const px = state.prices[tk];
      const val = p.qty ? p.qty * (px ?? ppc) : 0;
      const pl = val - p.cost;
      return `<tr><td>${esc(tk)}</td><td>${fmt(p.qty, 4)}</td><td>${fmt(ppc)}</td>
        <td>${p.qty ? `<input type="number" step="any" data-px="${esc(tk)}" value="${px ?? ""}" placeholder="${fmt(ppc)}">` : "-"}</td>
        <td>${fmt(p.cost)}</td><td>${fmt(val)}</td>
        <td class="${cls(pl)}">${fmt(pl)}</td><td class="${cls(pl)}">${p.cost ? pct((pl / p.cost) * 100) : "-"}</td>
        <td>${mv && p.qty ? fmt((val / mv) * 100, 1) + "%" : "-"}</td>
        <td class="${cls(p.realized)}">${fmt(p.realized)}</td><td>${fmt(p.income)}</td></tr>`;
    }).join("") || `<tr><td colspan="11">Sin posiciones todavía.</td></tr>`);

  const txs = [...state.txs].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  $("txs").innerHTML = `<tr><th>Fecha</th><th>Tipo</th><th>Ticker</th><th>Cantidad</th><th>Precio</th><th>Monto</th><th>Comisión</th><th></th></tr>` +
    (txs.map(t => {
      const amount = t.type === "buy" || t.type === "sell" ? t.qty * t.price : t.amount;
      return `<tr><td>${t.date}</td><td>${TYPES[t.type]}</td><td>${esc(t.ticker || "")}</td>
        <td>${t.qty ? fmt(t.qty, 4) : ""}</td><td>${t.price ? fmt(t.price) : ""}</td>
        <td>${fmt(amount)}</td><td>${t.fee ? fmt(t.fee) : ""}</td>
        <td><button data-del="${t.id}">✕</button></td></tr>`;
    }).join("") || `<tr><td colspan="8">Sin movimientos.</td></tr>`);

  renderChart(r);
}

function renderChart(r) {
  const labels = [...new Set([...r.series.map(s => s.date), ...state.snapshots.map(s => s.date)])].sort();
  const lastBy = (d, key) => { let v = null; for (const s of r.series) if (s.date <= d) v = s[key]; return v; };
  const snaps = Object.fromEntries(state.snapshots.map(s => [s.date, s.value]));
  const ds = (label, data, color, dash) => ({ label, data, borderColor: color, backgroundColor: color, borderDash: dash, tension: 0.2, spanGaps: true, pointRadius: 2 });
  const data = {
    labels,
    datasets: [
      ds("Valor de mercado (total)", labels.map(d => snaps[d] ?? null), "#2563eb"),
      ds("Capital depositado", labels.map(d => lastBy(d, "deposits")), "#16a34a", [5, 4]),
      ds("Costo invertido", labels.map(d => lastBy(d, "invested")), "#f59e0b", [2, 3]),
    ],
  };
  if (chart) { chart.data = data; chart.update(); return; }
  chart = new Chart($("chart"), { type: "line", data, options: { responsive: true, interaction: { mode: "index", intersect: false } } });
}

// Formulario: muestra solo los campos que aplican al tipo de movimiento
function syncForm() {
  const t = $("f-type").value;
  const trade = t === "buy" || t === "sell";
  $("f-ticker").hidden = !(trade || t === "dividend");
  $("f-qty").hidden = $("f-price").hidden = $("f-fee").hidden = !trade;
  $("f-amount").hidden = trade;
  $("form-hint").textContent = trade
    ? "Ticker en formato Yahoo Finance (ej. GGAL, AAPL, GGAL.BA para el local)."
    : t === "dividend" ? "Indicá el ticker que pagó y el monto cobrado." : "";
}

$("f-type").onchange = syncForm;
$("f-date").value = today();
syncForm();

$("form").onsubmit = e => {
  e.preventDefault();
  const type = $("f-type").value;
  const trade = type === "buy" || type === "sell";
  const t = {
    id: Date.now(), type, date: $("f-date").value,
    ticker: $("f-ticker").value.trim().toUpperCase(),
    qty: num($("f-qty").value), price: num($("f-price").value),
    amount: num($("f-amount").value), fee: num($("f-fee").value),
  };
  if (trade && (!t.ticker || t.qty <= 0 || t.price <= 0)) return alert("Completá ticker, cantidad y precio.");
  if (!trade && t.amount <= 0) return alert("Completá el monto.");
  if (type === "dividend" && !t.ticker) return alert("Completá el ticker que pagó.");
  if (type === "sell") {
    const held = compute(t.date).pos[t.ticker]?.qty ?? 0;
    if (t.qty > held + 1e-9) return alert(`No tenés ${t.qty} de ${t.ticker} a esa fecha (tenencia: ${held}).`);
  }
  if (type === "deposit" || type === "withdraw") t.ticker = "";
  state.txs.push(t);
  if (trade) state.prices[t.ticker] ??= t.price;
  save(); snapshot(); render();
  for (const id of ["f-ticker", "f-qty", "f-price", "f-amount", "f-fee"]) $(id).value = "";
};

document.addEventListener("click", e => {
  const id = e.target.dataset.del;
  if (id && confirm("¿Borrar este movimiento?")) {
    state.txs = state.txs.filter(t => t.id !== +id);
    save(); snapshot(); render();
  }
});

document.addEventListener("change", e => {
  const tk = e.target.dataset.px;
  if (!tk) return;
  const v = parseFloat(e.target.value);
  if (v > 0) state.prices[tk] = v; else delete state.prices[tk];
  save(); snapshot(); render();
});

$("currency").onchange = e => { state.currency = e.target.value; save(); render(); };

// Precios: Yahoo Finance vía proxy CORS (puede fallar; siempre se puede cargar a mano en la tabla)
async function fetchPrice(tk) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tk)}?range=1d&interval=1d`;
  const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
  const j = await res.json();
  return j.chart.result[0].meta.regularMarketPrice;
}

$("btn-prices").onclick = async () => {
  const held = Object.entries(compute().pos).filter(([, p]) => p.qty > 0).map(([tk]) => tk);
  if (!held.length) return;
  $("btn-prices").textContent = "Actualizando...";
  const failed = [];
  await Promise.all(held.map(async tk => {
    try { state.prices[tk] = await fetchPrice(tk); } catch { failed.push(tk); }
  }));
  $("btn-prices").textContent = "Actualizar precios";
  save(); snapshot(); render();
  if (failed.length) alert(`No pude traer: ${failed.join(", ")}. Cargá el precio a mano en la tabla de posiciones.`);
};

$("btn-export").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  a.download = `portfolio-${today()}.json`;
  a.click();
};

$("file-import").onchange = async e => {
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(data.txs)) throw new Error("formato");
    if (!confirm("Esto reemplaza los datos actuales. ¿Seguir?")) return;
    state = Object.assign(DEFAULTS(), data);
    save(); render();
  } catch { alert("Archivo inválido."); }
  e.target.value = "";
};

render();
