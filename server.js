const express = require('express');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === НАСТРОЙКИ ===
const BOT_TOKEN = process.env.BOT_TOKEN || '9118809162:AAExWNs6SPKSJExXFWaVhA7paQSi0gY4c5Y';
const ADMIN_IDS = [7275857070];
const PREMIUM_PRICE_STARS = 50;

const premiumUsers = new Map();
const userWallets = new Map();

let marketListings = [
  {
    id: 'lot_1',
    username: 'slipoy',
    priceTon: 5,
    sellerId: 999001,
    sellerName: 'TonTrader',
    createdAt: Date.now() - 3600 * 1000
  }
];

// === ЖИВОЙ ГЕНЕРАТОР И ЧЕКЕР ЮЗЕРНЕЙМОВ ===
const CONSONANTS = ['b', 'c', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'x', 'z'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'y'];

const RARE_ROOTS = [
  'vortex', 'zenith', 'kobra', 'shadow', 'pulse', 'cyber', 'ghost', 'drift',
  'venom', 'frost', 'storm', 'titan', 'blade', 'spark', 'noble', 'prime',
  'apex', 'nova', 'aura', 'echo', 'flux', 'core', 'zero', 'onyx', 'volt',
  'zeal', 'lynx', 'hawk', 'wolf', 'crow', 'viper', 'raven', 'falcon',
  'blaze', 'ember', 'inferno', 'glitch', 'matrix', 'nexus', 'cipher', 'phantom',
  'rogue', 'sniper', 'striker', 'hunter', 'reaper', 'knight', 'baron', 'duke',
  'prince', 'king', 'legend', 'myth', 'oracle', 'prism', 'quartz', 'cobalt',
  'chrome', 'steel', 'iron', 'silver', 'gold', 'amber', 'jade', 'ruby',
  'slayer', 'warden', 'nomad', 'ronin', 'shogun', 'samurai', 'viking', 'spartan',
  'omega', 'alpha', 'sigma', 'delta', 'gamma', 'kappa', 'theta', 'zeta',
  'orbit', 'cosmos', 'astro', 'lunar', 'solar', 'comet', 'meteor', 'nebula',
  'sonic', 'laser', 'plasma', 'atomic', 'quantum', 'vector', 'pixel', 'voxel',
  'turbo', 'nitro', 'hyper', 'ultra', 'mega', 'giga', 'nano', 'micro',
  'slipoy', 'bystro', 'tihiy', 'temniy', 'groza', 'molot', 'klen', 'sokol',
  'volk', 'burs', 'krai', 'sled', 'svet', 'ten', 'zver', 'ogon', 'veter'
];

const RARE_SUFFIXES = ['', 'x', 'z', 'o', 'a', 'er', 'on', 'ix', 'ox', 'ex', 'is', 'os', 'io', 'ai'];

const checkedCache = new Map();
const liveCommonBuffer = [];
const liveRareBuffer = [];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCommonCandidate() {
  const patterns = [
    () => pick(CONSONANTS) + pick(VOWELS) + pick(CONSONANTS) + pick(VOWELS) + pick(CONSONANTS),
    () => pick(CONSONANTS) + pick(VOWELS) + pick(CONSONANTS) + pick(VOWELS) + pick(VOWELS),
    () => pick(VOWELS) + pick(CONSONANTS) + pick(VOWELS) + pick(CONSONANTS) + pick(VOWELS)
  ];
  return pick(patterns)();
}

function generateRareCandidate() {
  if (Math.random() < 0.7) {
    const root = pick(RARE_ROOTS);
    const suffix = pick(RARE_SUFFIXES);
    const word = root + suffix;
    if (word.length >= 5 && word.length <= 9) {
      return {
        username: word,
        tag: suffix === '' ? 'Чистое словарное слово' : 'Словарная основа',
        estPrice: suffix === '' ? '25–70 TON' : '8–25 TON'
      };
    }
  }
  const c1 = pick(CONSONANTS);
  const v1 = pick(VOWELS);
  const c2 = pick(CONSONANTS);
  const v2 = pick(VOWELS);
  return {
    username: `${c1}${v1}${v1}${c2}${v2}`,
    tag: '5-букв с двойной гласной',
    estPrice: '5–15 TON'
  };
}

async function isUsernameAvailable(username) {
  if (checkedCache.has(username)) return checkedCache.get(username);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const tgRes = await fetch(`https://t.me/${username}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await tgRes.text();
    clearTimeout(timeout);

    if (html.includes('tgme_page_title')) {
      checkedCache.set(username, false);
      return false;
    }

    const fragController = new AbortController();
    const fragTimeout = setTimeout(() => fragController.abort(), 3500);
    const fragRes = await fetch(`https://fragment.com/username/${username}`, {
      signal: fragController.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const fragHtml = await fragRes.text();
    clearTimeout(fragTimeout);

    const isTakenOnFragment =
      fragHtml.includes('tm-section-header-status tm-status-taken') ||
      fragHtml.includes('tm-section-header-status tm-status-avail');

    const available = !isTakenOnFragment;
    checkedCache.set(username, available);
    return available;
  } catch {
    return false;
  }
}

let workerBusy = false;
async function refillPools() {
  if (workerBusy) return;
  workerBusy = true;

  try {
    while (liveCommonBuffer.length < 30) {
      const candidate = generateCommonCandidate();
      if (!liveCommonBuffer.includes(candidate) && (await isUsernameAvailable(candidate))) {
        liveCommonBuffer.push(candidate);
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    while (liveRareBuffer.length < 20) {
      const item = generateRareCandidate();
      const exists = liveRareBuffer.some((x) => x.username === item.username);
      if (!exists && (await isUsernameAvailable(item.username))) {
        liveRareBuffer.push(item);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    workerBusy = false;
  }
}

refillPools();
setInterval(refillPools, 15000);

function verifyInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculatedHash !== hash) return null;
  try {
    return JSON.parse(params.get('user'));
  } catch {
    return null;
  }
}

function getWalletState(userId) {
  const id = Number(userId);
  if (!userWallets.has(id)) {
    userWallets.set(id, { address: null, balanceTon: 0 });
  }
  return userWallets.get(id);
}

function hasPremium(userId) {
  if (ADMIN_IDS.includes(Number(userId))) return true;
  const expiresAt = premiumUsers.get(Number(userId));
  return Boolean(expiresAt && expiresAt > Date.now());
}

function isValidTonAddress(addr) {
  return typeof addr === 'string' && /^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(addr.trim());
}

app.post('/api/me', (req, res) => {
  const user = verifyInitData(req.body.initData);
  if (!user) return res.status(401).json({ error: 'Invalid Telegram auth' });

  const isAdmin = ADMIN_IDS.includes(Number(user.id));
  const isPremium = hasPremium(user.id);
  const wallet = getWalletState(user.id);

  res.json({
    id: user.id,
    firstName: user.first_name,
    isAdmin,
    isPremium,
    walletAddress: wallet.address,
    balanceTon: wallet.balanceTon
  });
});

app.post('/api/wallet/bind', (req, res) => {
  const user = verifyInitData(req.body.initData);
  if (!user) return res.status(401).json({ error: 'Invalid Telegram auth' });

  const address = (req.body.address || '').trim();
  if (!isValidTonAddress(address)) {
    return res.status(400).json({ error: 'Укажи корректный TON-адрес (EQ... или UQ..., 48 символов)' });
  }

  const wallet = getWalletState(user.id);
  wallet.address = address;

  res.json({
    ok: true,
    walletAddress: wallet.address,
    balanceTon: wallet.balanceTon
  });
});

app.get('/api/market', (req, res) => {
  res.json({ listings: marketListings });
});

app.post('/api/market/list', (req, res) => {
  const user = verifyInitData(req.body.initData);
  if (!user) return res.status(401).json({ error: 'Invalid Telegram auth' });

  const rawUsername = (req.body.username || '').replace(/^@+/, '').trim().toLowerCase();
  const priceTon = Number(req.body.priceTon);

  if (!/^[a-z0-9_]{5,32}$/.test(rawUsername)) {
    return res.status(400).json({ error: 'Некорректный юзернейм (5–32 символа: латиница, цифры, _)' });
  }
  if (!Number.isFinite(priceTon) || priceTon <= 0) {
    return res.status(400).json({ error: 'Цена в TON должна быть больше 0' });
  }

  const wallet = getWalletState(user.id);
  if (!wallet.address) {
    return res.status(400).json({ error: 'Сначала привяжи TON-кошелёк' });
  }

  const lot = {
    id: `lot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    username: rawUsername,
    priceTon,
    sellerId: Number(user.id),
    sellerName: user.first_name || 'Seller',
    createdAt: Date.now()
  };

  marketListings.unshift(lot);
  res.json({ ok: true, lot });
});

app.post('/api/market/buy', (req, res) => {
  const user = verifyInitData(req.body.initData);
  if (!user) return res.status(401).json({ error: 'Invalid Telegram auth' });

  const buyerWallet = getWalletState(user.id);
  if (!buyerWallet.address) {
    return res.status(400).json({ error: 'Привяжи TON-кошелёк перед покупкой' });
  }

  const idx = marketListings.findIndex((item) => item.id === req.body.lotId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Лот уже продан или снят' });
  }

  const lot = marketListings[idx];
  if (Number(lot.sellerId) === Number(user.id)) {
    return res.status(400).json({ error: 'Нельзя купить собственный лот' });
  }
  if (buyerWallet.balanceTon < lot.priceTon) {
    return res.status(400).json({ error: `Недостаточно TON на счёте (нужно ${lot.priceTon} TON)` });
  }

  buyerWallet.balanceTon = Number((buyerWallet.balanceTon - lot.priceTon).toFixed(4));
  const sellerWallet = getWalletState(lot.sellerId);
  sellerWallet.balanceTon = Number((sellerWallet.balanceTon + lot.priceTon).toFixed(4));

  marketListings.splice(idx, 1);
  res.json({
    ok: true,
    boughtUsername: lot.username,
    balanceTon: buyerWallet.balanceTon
  });
});

app.post('/api/search/common', async (req, res) => {
  const user = verifyInitData(req.body.initData);
  if (!user) return res.status(401).json({ error: 'Invalid Telegram auth' });

  const result = [];
  while (result.length < 5 && liveCommonBuffer.length > 0) {
    result.push(liveCommonBuffer.shift());
  }

  let attempts = 0;
  while (result.length < 5 && attempts < 20) {
    attempts++;
    const cand = generateCommonCandidate();
    if (!result.includes(cand) && (await isUsernameAvailable(cand))) {
      result.push(cand);
    }
  }

  refillPools();
  res.json({ usernames: result });
});

app.post('/api/search/rare', async (req, res) => {
  const user = verifyInitData(req.body.initData);
  if (!user) return res.status(401).json({ error: 'Invalid Telegram auth' });

  if (!hasPremium(user.id)) {
    return res.status(403).json({ error: 'Требуется Premium (50 Stars / мес)' });
  }

  let pick = liveRareBuffer.shift();

  if (!pick) {
    let attempts = 0;
    while (!pick && attempts < 25) {
      attempts++;
      const cand = generateRareCandidate();
      if (await isUsernameAvailable(cand.username)) {
        pick = cand;
      }
    }
  }

  refillPools();

  if (!pick) {
    return res.status(503).json({ error: 'Сканер сейчас ищет новые редкие теги, нажми ещё раз через пару секунд' });
  }

  res.json({ rare: pick });
});

app.post('/api/create-invoice', async (req, res) => {
  const user = verifyInitData(req.body.initData);
  if (!user) return res.status(401).json({ error: 'Invalid Telegram auth' });

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Cap Users Premium',
        description: 'Доступ к поиску редких юзернеймов на 30 дней',
        payload: `premium_${user.id}_${Date.now()}`,
        currency: 'XTR',
        prices: [{ label: 'Premium (30 дней)', amount: PREMIUM_PRICE_STARS }],
        subscription_period: 2592000
      })
    });

    const data = await tgRes.json();
    if (!data.ok) {
      return res.status(400).json({ error: data.description || 'Ошибка создания счёта' });
    }
    res.json({ invoiceLink: data.result });
  } catch {
    res.status(500).json({ error: 'Ошибка соединения с Telegram API' });
  }
});

app.post('/webhook', async (req, res) => {
  const update = req.body;

  if (update.pre_checkout_query) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pre_checkout_query_id: update.pre_checkout_query.id,
        ok: true
      })
    });
  }

  if (update.message && update.message.successful_payment) {
    const userId = update.message.from.id;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    premiumUsers.set(Number(userId), Date.now() + thirtyDaysMs);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Cap Users live scanner running on port ${PORT}`));
  
