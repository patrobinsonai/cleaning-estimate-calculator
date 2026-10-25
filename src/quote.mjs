function invalid(field, message) {
  const error = new Error(message);
  error.field = field;
  throw error;
}

export function validateConfig(c) {
  if (c.version !== 1 || !['USD', 'GBP', 'EUR'].includes(c.currency)) throw new Error('Check the calculator configuration.');
  for (const key of ['name', 'taxNote', 'headline', 'tagline', 'intro']) if (typeof c[key] !== 'string' || !c[key].trim() || c[key].length > 400) throw new Error(`Check ${key}.`);
  if (!['sq ft', 'm²'].includes(c.areaUnit) || !/^#[0-9a-f]{6}$/i.test(c.accent)) throw new Error('Check area units and brand colour.');
  if (c.logoDataUrl && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(c.logoDataUrl)) throw new Error('Use a PNG, JPEG or WebP logo.');
  if (!c.demo) {
    let url; try { url = new URL(c.enquiryUrl); } catch { throw new Error('Supply a valid enquiry URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS enquiry URL without credentials.');
  }
  for (const key of ['extraBedroomCents', 'extraBathroomCents', 'extraFloorCents', 'minimumCents', 'roundingCents', 'rangePercent']) {
    if (!Number.isSafeInteger(c[key]) || c[key] < 0) throw new Error(`Check ${key}.`);
  }
  if (c.roundingCents < 1 || c.rangePercent > 50) throw new Error('Check estimate rounding.');
  if (!c.area || !Number.isInteger(c.area.min) || !Number.isInteger(c.area.max) || !Number.isInteger(c.area.step) || c.area.min < 1 || c.area.max < c.area.min || c.area.max > (c.areaUnit === 'm²' ? 465 : 5000) || c.area.step < 1) throw new Error('Check floor area limits.');
  if (!Number.isInteger(c.area.sliderStep) || c.area.sliderStep < c.area.step || c.area.sliderStep % c.area.step || (c.area.max - c.area.min) % c.area.sliderStep) throw new Error('Check the floor area slider.');
  for (const key of ['floors', 'bedrooms', 'bathrooms']) {
    const range = c.limits?.[key];
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger) || range[0] < (key === 'bedrooms' ? 0 : 1) || range[1] < range[0] || range[1] > ({ floors: 3, bedrooms: 6, bathrooms: 4 })[key]) throw new Error(`Check ${key} limits.`);
  }
  if (!Array.isArray(c.services) || c.services.length < 1 || c.services.length > 3) throw new Error('Check cleaning services.');
  const ids = new Set();
  for (const s of c.services) {
    if (!/^[a-z][a-z0-9-]*$/.test(s.id) || ids.has(s.id) || typeof s.label !== 'string' || !s.label.trim() || typeof s.detail !== 'string' || !Number.isSafeInteger(s.centsPerArea) || s.centsPerArea < 0 || s.centsPerArea > 100000) throw new Error('Check cleaning service rates.');
    ids.add(s.id);
  }
  if (typeof c.demo !== 'boolean') throw new Error('Set the demonstration status.');
  if (!c.demo && (c.pricingApproved !== true || !c.priceOwner?.trim() || !/^https:\/\//.test(c.enquiryUrl))) throw new Error('Approve rates and the enquiry destination before a client build.');
  calculate(c, c.defaults);
  return c;
}

export function calculate(c, input) {
  if (!input || typeof input !== 'object') invalid('area', 'Enter the home details.');
  const state = {};
  for (const key of ['area', 'floors', 'bedrooms', 'bathrooms']) {
    const raw = input[key];
    if (!['string', 'number'].includes(typeof raw) || String(raw).trim() === '') invalid(key, `Enter ${key === 'area' ? 'the total floor area' : key}.`);
    const n = Number(raw);
    const [min, max] = key === 'area' ? [c.area.min, c.area.max] : c.limits[key];
    if (!Number.isSafeInteger(n) || n < min || n > max) invalid(key, `Use ${min} to ${max.toLocaleString(c.locale)} ${key === 'area' ? c.areaUnit + ' of total floor area' : key}.`);
    if (key === 'area' && (n - min) % c.area.step) invalid(key, `Use floor area in steps of ${c.area.step} ${c.areaUnit}.`);
    state[key] = n;
  }
  const service = c.services.find(s => s.id === input.service);
  if (!service) invalid('service', 'Choose a cleaning service.');
  state.service = service.id;
  const lines = [
    { label: `${state.area.toLocaleString(c.locale)} ${c.areaUnit} × ${new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.currency }).format(service.centsPerArea / 100)}`, cents: state.area * service.centsPerArea },
    { label: `${Math.max(0, state.bedrooms - 1)} additional bedroom${state.bedrooms === 2 ? '' : 's'}`, cents: Math.max(0, state.bedrooms - 1) * c.extraBedroomCents },
    { label: `${state.bathrooms - 1} additional bathroom${state.bathrooms === 2 ? '' : 's'}`, cents: (state.bathrooms - 1) * c.extraBathroomCents },
    { label: `${state.floors - 1} additional floor${state.floors === 2 ? '' : 's'}`, cents: (state.floors - 1) * c.extraFloorCents }
  ];
  const subtotal = lines.reduce((sum, line) => sum + line.cents, 0);
  const totalCents = Math.max(c.minimumCents, subtotal);
  if (!Number.isSafeInteger(totalCents)) invalid('area', 'This home needs an individual quote.');
  if (totalCents > subtotal) lines.push({ label: 'Minimum visit adjustment', cents: totalCents - subtotal });
  const lowCents = Math.max(c.minimumCents, Math.floor(totalCents * (100 - c.rangePercent) / (100 * c.roundingCents)) * c.roundingCents);
  const highCents = Math.max(lowCents, Math.ceil(totalCents * (100 + c.rangePercent) / (100 * c.roundingCents)) * c.roundingCents);
  return { state, service, lines, totalCents, lowCents, highCents };
}

export function formatMoney(c, cents) {
  return new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.currency, minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export function summary(c, q) {
  return `${c.name} cleaning enquiry${c.demo ? ' (demonstration)' : ''}\n${q.service.label}\nTotal floor area: ${q.state.area.toLocaleString(c.locale)} ${c.areaUnit}\nFloors: ${q.state.floors}\nBedrooms: ${q.state.bedrooms}\nBathrooms: ${q.state.bathrooms}\nIndicative estimate: ${formatMoney(c, q.lowCents)} to ${formatMoney(c, q.highCents)} ${c.currency}\n${c.taxNote.replace(/\.+$/, '')}.\n${c.demo ? 'Fictional business. Sample prices before sales tax. No booking has been made.' : 'Subject to the business confirming scope, condition and availability. No booking has been made.'}`;
}
