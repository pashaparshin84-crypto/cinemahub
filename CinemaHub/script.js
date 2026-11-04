/* CinemaHub — весь код сайта в одном файле: переводы, доступ к Internet Archive, интерфейс. */

/* ===================== ПЕРЕВОДЫ (L10N) ===================== */
/* Русификация: жанры — по словарю, названия — сначала по словарю известных
   прокатных названий, иначе машинным переводом (Google Translate, CORS: *).
   Результаты перевода кэшируются в localStorage, чтобы не дёргать API повторно. */
const L10N = (() => {

    const GENRES = {
        'action': 'Боевик',
        'adventure': 'Приключения',
        'animation': 'Мультфильм',
        'biography': 'Биография',
        'comedy': 'Комедия',
        'crime': 'Криминал',
        'documentary': 'Документальное',
        'drama': 'Драма',
        'family': 'Семейный',
        'fantasy': 'Фэнтези',
        'film-noir': 'Нуар',
        'film noir': 'Нуар',
        'history': 'История',
        'horror': 'Ужасы',
        'music': 'Музыкальный',
        'musical': 'Мюзикл',
        'mystery': 'Детектив',
        'romance': 'Мелодрама',
        'sci-fi': 'Фантастика',
        'science fiction': 'Фантастика',
        'short': 'Короткометражный',
        'sport': 'Спорт',
        'thriller': 'Триллер',
        'tv movie': 'Телефильм',
        'war': 'Военный',
        'western': 'Вестерн',
        'silent': 'Немое кино',
        'silents': 'Немое кино',
        'cult': 'Культовое',
        'feature film': 'Художественный',
    };

    /* Устоявшиеся прокатные названия — точнее машинного перевода */
    const TITLES = {
        'his_girl_friday': 'Его девушка Пятница',
        'house_on_haunted_hill_ipod': 'Дом ночных призраков',
        'JungleBook': 'Книга джунглей',
        'reefer_madness1938': 'Косяковое безумие',
        'charlie_chaplin_film_fest': 'Фестиваль Чарли Чаплина',
        'HisNewJobCharlesChaplin-1915': 'Его новая работа (Чарли Чаплин)',
        'VoyagetothePlanetofPrehistoricWomen': 'Путешествие на планету доисторических женщин',
        'Sita_Sings_the_Blues': 'Сита поёт блюз',
        'The_Pied_Piper_of_Hamelin': 'Гамельнский крысолов',
        'Escape_From_Sobibor.avi': 'Побег из Собибора',
        'dressed_to_kill': 'Переодетый для убийства',
        'TheFastandtheFuriousJohnIreland1954goofyrip': 'Быстрый и яростный',
        'utopia': 'Утопия',
        'suddenly': 'Внезапно',
        '3stooges': 'Три балбеса',
        'steamboat-willie_1928': 'Пароход Вилли',
        'night_of_the_living_dead': 'Ночь живых мертвецов',
        'Nosferatu': 'Носферату. Симфония ужаса',
        'metropolis': 'Метрополис',
        'The_General': 'Генерал',
        'the_kid': 'Малыш',
        'gold_rush': 'Золотая лихорадка',
        'duck_soup': 'Утиный суп',
        'the_third_man': 'Третий человек',
        'plan_9_from_outer_space': 'План 9 из открытого космоса',
        'big-buck-bunny-2008-4k-60fps': 'Большой кролик',
        'sintel-dvd': 'Синтел',
    };

    // ---------- КЭШ ПЕРЕВОДОВ ----------
    const CACHE_KEY = 'cinemahub.tr.v2';
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { cache = {}; }

    let saveTimer = null;
    function persist() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try {
                const keys = Object.keys(cache);
                // Ограничиваем размер, чтобы не упереться в квоту localStorage
                if (keys.length > 3000) keys.slice(0, keys.length - 3000).forEach(k => delete cache[k]);
                localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
            } catch { /* приватный режим или квота */ }
        }, 400);
    }

    // ---------- МАШИННЫЙ ПЕРЕВОД ----------
    const TR_URL = 'https://translate.googleapis.com/translate_a/single';
    const inflight = new Map();

    const hasCyrillic = s => /[а-яё]/i.test(s);

    async function translate(text) {
        const src = String(text || '').trim();
        if (!src || hasCyrillic(src)) return src;
        if (cache[src]) return cache[src];
        if (inflight.has(src)) return inflight.get(src);

        const job = (async () => {
            try {
                const url = `${TR_URL}?client=gtx&sl=auto&tl=ru&dt=t&q=${encodeURIComponent(src.slice(0, 1500))}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(res.status);
                const data = await res.json();
                let out = (data?.[0] || []).map(part => part?.[0] || '').join('').trim();
                // Переводчик иногда возвращает название со строчной буквы
                if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
                if (out) {
                    cache[src] = out;
                    persist();
                    return out;
                }
            } catch { /* сеть/лимит — показываем оригинал */ }
            return src;
        })();

        inflight.set(src, job);
        try { return await job; } finally { inflight.delete(src); }
    }

    /* Ограничиваем параллельность, чтобы не получить бан по частоте запросов */
    async function translateMany(texts, concurrency = 4) {
        const list = [...texts];
        const result = new Array(list.length);
        let next = 0;
        const worker = async () => {
            while (next < list.length) {
                const i = next++;
                result[i] = await translate(list[i]);
            }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
        return result;
    }

    // ---------- ПУБЛИЧНОЕ API ----------
    const ruGenre = name => GENRES[String(name).toLowerCase().trim()] || String(name);
    const ruGenres = list => [...new Set((list || []).map(ruGenre))];

    /* Синхронно: словарь или уже переведённое из кэша, иначе оригинал */
    const ruTitle = (id, original) => TITLES[id] || cache[String(original || '').trim()] || String(original || '');

    /* Асинхронно: гарантированно русское название (если перевод доступен) */
    async function ruTitleAsync(id, original) {
        if (TITLES[id]) return TITLES[id];
        return translate(original);
    }

    return { ruGenre, ruGenres, ruTitle, ruTitleAsync, translate, translateMany, hasCyrillic };
})();

/* ===================== INTERNET ARCHIVE (IA) ===================== */
/* Слой доступа к Internet Archive (открытый API, CORS: *).
   Основная ставка — fetch; JSONP используется как фолбэк, чтобы сайт
   работал и при открытии двойным кликом (протокол file://). */
const IA = (() => {
    const BASE = 'https://archive.org';
    const COLLECTION = 'feature_films';

    // ---------- УТИЛИТЫ ----------
    const first = v => (Array.isArray(v) ? v[0] : v);

    const cleanText = s =>
        String(s || '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();

    const extractYear = doc => {
        const raw = doc.year || first(doc.date) || '';
        const m = String(raw).match(/(18|19|20)\d{2}/);
        return m ? parseInt(m[0]) : null;
    };

    const toNumber = v => {
        const n = parseInt(first(v));
        return Number.isFinite(n) ? n : 0;
    };

    const humanSize = bytes => {
        if (!bytes) return '';
        const gb = bytes / 1073741824;
        return gb >= 1 ? `${gb.toFixed(1)} ГБ` : `${Math.round(bytes / 1048576)} МБ`;
    };

    const humanDuration = seconds => {
        const s = parseInt(seconds);
        if (!Number.isFinite(s) || s <= 0) return '';
        const h = Math.floor(s / 3600);
        const m = Math.round((s % 3600) / 60);
        return h ? `${h} ч ${m} мин` : `${m} мин`;
    };

    // ---------- ТРАНСПОРТ ----------
    let jsonpSeq = 0;

    function jsonp(url) {
        return new Promise((resolve, reject) => {
            const cb = `__ia_cb_${Date.now()}_${jsonpSeq++}`;
            const script = document.createElement('script');
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('Таймаут запроса к archive.org'));
            }, 20000);

            function cleanup() {
                clearTimeout(timer);
                delete window[cb];
                script.remove();
            }

            window[cb] = data => {
                cleanup();
                resolve(data);
            };

            script.onerror = () => {
                cleanup();
                reject(new Error('Сетевая ошибка'));
            };

            script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cb}`;
            document.head.appendChild(script);
        });
    }

    async function request(path, params) {
        const url = new URL(BASE + path);
        // searchParams.set() схлопнул бы массив в строку через запятую,
        // поэтому значения-массивы добавляем по одному через append
        Object.entries(params).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') return;
            if (Array.isArray(v)) v.forEach(item => url.searchParams.append(k, item));
            else url.searchParams.set(k, v);
        });

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`archive.org: ${res.status}`);
            return await res.json();
        } catch (err) {
            // fetch недоступен (file://, блокировка, обрыв) — уходим в JSONP
            return await jsonp(url.toString().replace(/[?&]$/, ''));
        }
    }

    // ---------- ПОИСК ----------
    const FIELDS = ['identifier', 'title', 'year', 'date', 'downloads', 'description', 'genre', 'creator', 'licenseurl'];

    const SORTS = {
        popular: 'downloads desc',
        newest: 'year desc',
        oldest: 'year asc',
        title: 'titleSorter asc',
        // Новинки: сначала самый свежий год, внутри года — самые популярные
        fresh: ['year desc', 'downloads desc'],
    };

    /* Раздел 18+: фильмы с жестокостью, ужасами и криминальной тематикой.
       Откровенный эротический контент из выдачи исключается. */
    const ADULT_INCLUDE =
        '(genre:(Horror OR Crime OR Thriller) OR gore OR zombie OR zombies OR slasher ' +
        'OR "serial killer" OR massacre OR cannibal OR bloody OR violence)';
    const ADULT_EXCLUDE = 'subject:(porn OR pornography OR xxx OR erotic OR erotica OR hentai OR hardcore)';

    function buildQuery({ query, genre, yearFrom, yearTo, adult, excludeAdult }) {
        const parts = [`collection:(${COLLECTION})`, 'mediatype:(movies)'];

        if (adult) parts.push(ADULT_INCLUDE, `NOT ${ADULT_EXCLUDE}`);
        // Открытые разделы каталога не показывают материалы, отнесённые к 18+
        if (excludeAdult) parts.push(`NOT ${ADULT_INCLUDE}`, `NOT ${ADULT_EXCLUDE}`);

        if (query) parts.push(`(${query})`);
        if (genre) parts.push(`genre:("${genre}")`);
        if (yearFrom) parts.push(`year:[${yearFrom} TO *]`);
        if (yearTo) parts.push(`year:[* TO ${yearTo}]`);

        return parts.join(' AND ');
    }

    // ---------- ПУБЛИЧНОЕ API ----------
    return {
        humanSize,
        humanDuration,
        cleanText,

        /* Каталог: страница фильмов из коллекции feature_films */
        async search({ query = '', genre = '', sort = 'popular', page = 1, rows = 24, adult = false, excludeAdult = false, yearFrom, yearTo } = {}) {
            const data = await request('/advancedsearch.php', {
                q: buildQuery({ query, genre, adult, excludeAdult, yearFrom, yearTo }),
                'fl[]': FIELDS,
                rows,
                page,
                'sort[]': SORTS[sort] || SORTS.popular,
                output: 'json',
            });

            const docs = data?.response?.docs || [];
            return {
                total: data?.response?.numFound || 0,
                items: docs.map(this.normalize),
            };
        },

        /* Метаданные одного элемента: описание, жанры, доступные видеофайлы */
        async details(id) {
            const data = await request(`/metadata/${encodeURIComponent(id)}`, {});
            const meta = data?.metadata || {};

            const videos = (data?.files || [])
                .filter(f => typeof f.name === 'string' && f.name.toLowerCase().endsWith('.mp4'))
                .filter(f => !/(trailer|preview|sample)/i.test(f.name))
                .map(f => {
                    const height = parseInt(f.height) || 0;
                    const size = parseInt(f.size) || 0;
                    // Архив хранит два вида mp4: исходник (сотни МБ) и веб-версию
                    // вроде name_512kb.mp4 — она и нужна для потокового просмотра
                    const web = /_?\d{2,4}\s?(kb|kbps)\b/i.test(f.name) || /\b\d+\s?kb\b/i.test(f.format || '');
                    return {
                        name: f.name,
                        height,
                        size,
                        web,
                        seconds: parseInt(f.length) || 0,
                        label: height ? `${height}p` : null,
                        url: `${BASE}/download/${encodeURIComponent(id)}/${encodeURIComponent(f.name)}`,
                    };
                })
                // Список качеств показываем от лучшего к худшему
                .sort((a, b) => b.height - a.height || b.size - a.size || b.seconds - a.seconds);

            const totalSeconds = videos.reduce((max, v) => Math.max(max, v.seconds), 0);

            // Для автозапуска берём веб-версию: она стартует быстро и не грузит
            // гигабайты трафика; если её нет — самый лёгкий из доступных файлов
            const best = videos.find(v => v.web) || videos.slice().sort((a, b) => a.size - b.size)[0] || null;

            return {
                ...this.normalize({
                    identifier: id,
                    title: meta.title,
                    year: meta.year,
                    date: meta.date,
                    downloads: meta.downloads,
                    description: meta.description,
                    genre: meta.genre,
                    creator: meta.creator,
                    licenseurl: meta.licenseurl,
                }),
                videos,
                best,
                runtime: humanDuration(totalSeconds),
                collection: first(meta.collection) || COLLECTION,
            };
        },

        normalize(doc) {
            const id = doc.identifier;
            const description = cleanText(Array.isArray(doc.description) ? doc.description.join(' ') : doc.description);
            const genres = (Array.isArray(doc.genre) ? doc.genre : [doc.genre])
                .filter(Boolean)
                .map(g => cleanText(g))
                .filter(Boolean);
            const creators = (Array.isArray(doc.creator) ? doc.creator : [doc.creator])
                .filter(Boolean)
                .map(c => cleanText(c))
                .filter(Boolean);

            const originalTitle = cleanText(first(doc.title)) || id;

            return {
                id,
                title: L10N.ruTitle(id, originalTitle),
                originalTitle,
                year: extractYear(doc),
                downloads: toNumber(doc.downloads),
                description: description || 'Описание отсутствует в каталоге.',
                genres: L10N.ruGenres([...new Set(genres)]).slice(0, 6),
                // Оригинальные жанры нужны для запросов к архиву: он ищет по-английски
                rawGenres: [...new Set(genres)].slice(0, 6),
                creators: creators.slice(0, 6),
                license: doc.licenseurl ? cleanText(first(doc.licenseurl)) : '',
                poster: `${BASE}/services/img/${encodeURIComponent(id)}`,
                pageUrl: `${BASE}/details/${encodeURIComponent(id)}`,
                downloadPage: `${BASE}/download/${encodeURIComponent(id)}/`,
            };
        },

        streamUrl(id, fileName) {
            return `${BASE}/download/${encodeURIComponent(id)}/${encodeURIComponent(fileName)}`;
        },
    };
})();

/* =====================================================================
   ПРИЛОЖЕНИЕ: каталог, 18+, новинки, избранное, история и плеер.
   Одностраничный сайт: экраны переключаются по адресу после «#».
     #catalog  #new  #favorites  #history  #adult
     #watch/<id>[?file=<имя файла>&adult=1]
   ===================================================================== */
(() => {
    const PAGE_SIZE = 24;
    const NEW_COUNT = 16;
    const BASE_TITLE = document.title;

    const state = {
        query: '',
        genre: '',
        sort: 'popular',
        page: 1,
        adult: false,
        total: 0,
        items: [],
        loading: false,
    };

    const el = id => document.getElementById(id);
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---------- ХРАНИЛИЩЕ ----------
    const FAV_KEY = 'cinemahub.favorites';
    const HIST_KEY = 'cinemahub.history';
    const AGE_KEY = 'cinemahub.age18';

    const readStore = key => {
        try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
    };
    const writeStore = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
    };

    const isFavorite = id => readStore(FAV_KEY).includes(id);

    function toggleFavorite(id) {
        const list = readStore(FAV_KEY);
        const index = list.indexOf(id);
        index >= 0 ? list.splice(index, 1) : list.unshift(id);
        writeStore(FAV_KEY, list.slice(0, 200));
        return index < 0;
    }

    function addToHistory(id) {
        const list = readStore(HIST_KEY).filter(x => x !== id);
        list.unshift(id);
        writeStore(HIST_KEY, list.slice(0, 200));
    }

    const isAdultConfirmed = () => {
        try { return localStorage.getItem(AGE_KEY) === '1'; } catch { return false; }
    };
    const confirmAdult = () => {
        try { localStorage.setItem(AGE_KEY, '1'); } catch { /* приватный режим */ }
    };

    // ---------- TOAST ----------
    let toastTimer = null;
    function toast(text) {
        const t = el('toast');
        t.textContent = text;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
    }

    // ---------- ПОДТВЕРЖДЕНИЕ ВОЗРАСТА ----------
    function askAge(onYes, onNo) {
        const gate = el('ageGate');
        gate.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        const done = cb => {
            gate.classList.add('hidden');
            document.body.style.overflow = '';
            el('ageYes').onclick = el('ageNo').onclick = null;
            cb();
        };
        el('ageYes').onclick = () => done(() => { confirmAdult(); onYes(); });
        el('ageNo').onclick = () => done(onNo);
    }

    // ---------- ССЫЛКИ ----------
    function watchHref(id, { adult = false, file = '' } = {}) {
        const qs = new URLSearchParams();
        if (file) qs.set('file', file);
        if (adult) qs.set('adult', '1');
        const tail = qs.toString();
        return `#watch/${encodeURIComponent(id)}${tail ? '?' + tail : ''}`;
    }

    // ---------- КАРТОЧКИ ----------
    function cardHtml(movie, index, adult = state.adult) {
        const meta = [movie.year, movie.genres[0]].filter(Boolean).map(esc).join(' · ');
        const original = movie.originalTitle && movie.originalTitle !== movie.title
            ? `<p class="card-orig" title="${esc(movie.originalTitle)}">${esc(movie.originalTitle)}</p>` : '';
        return `
        <article class="card" style="animation-delay:${Math.min(index, 12) * 40}ms">
            <a class="card-poster" href="${esc(watchHref(movie.id, { adult }))}" data-id="${esc(movie.id)}">
                <img src="${esc(movie.poster)}" alt="${esc(movie.title)}" loading="lazy"
                     onerror="this.closest('.card-poster').classList.add('no-img')">
                <span class="card-hover">
                    <span class="play-dot"><svg viewBox="0 0 24 24"><polygon points="6 3 20 12 6 21 6 3"/></svg></span>
                </span>
                ${movie.year ? `<span class="card-year">${esc(movie.year)}</span>` : ''}
                ${adult ? '<span class="card-age">18+</span>' : ''}
                ${isFavorite(movie.id) ? '<span class="card-fav" title="В избранном">★</span>' : ''}
            </a>
            <div class="card-body">
                <h3 class="card-title" title="${esc(movie.title)}">${esc(movie.title)}</h3>
                ${original}
                <p class="card-meta">${meta || '—'}</p>
            </div>
        </article>`;
    }

    /* Скелетоны на время запроса — сетка сразу занимает место */
    function renderSkeletons(count = PAGE_SIZE) {
        el('grid').innerHTML = Array.from({ length: count }, () => `
            <div class="card">
                <div class="card-poster skeleton"></div>
                <div class="card-body">
                    <div class="sk-line skeleton" style="width:85%"></div>
                    <div class="sk-line skeleton" style="width:55%"></div>
                </div>
            </div>`).join('');
    }

    function renderGrid(append = false) {
        const grid = el('grid');
        if (append) {
            grid.insertAdjacentHTML('beforeend', state.items.slice(-PAGE_SIZE).map(m => cardHtml(m, 0)).join(''));
        } else {
            grid.innerHTML = state.items.map((m, i) => cardHtml(m, i)).join('');
        }
        el('empty').classList.toggle('hidden', state.items.length > 0);
        el('loadWrap').classList.toggle('hidden', state.items.length >= state.total);
        el('counter').textContent = state.total ? `Найдено: ${state.total.toLocaleString('ru-RU')}` : '';
    }

    function renderPlaceholder(text) {
        el('grid').innerHTML = `<div class="notice">${esc(text)}</div>`;
        el('empty').classList.add('hidden');
        el('loadWrap').classList.add('hidden');
        el('counter').textContent = '';
    }

    /* Переводит ещё не русские названия и обновляет карточки на месте,
       без полной перерисовки сетки */
    async function localizeTitles(items, container = el('grid')) {
        const pending = items.filter(m => !L10N.hasCyrillic(m.title));
        if (!pending.length) return;

        const translated = await L10N.translateMany(pending.map(m => m.originalTitle || m.title));

        pending.forEach((movie, i) => {
            const ru = translated[i];
            if (!ru || ru === movie.title) return;
            movie.title = ru;

            const link = container.querySelector(`.card-poster[data-id="${CSS.escape(movie.id)}"]`);
            const body = link?.closest('.card')?.querySelector('.card-body');
            if (!body) return;

            const h = body.querySelector('.card-title');
            h.textContent = ru;
            h.title = ru;
            link.querySelector('img')?.setAttribute('alt', ru);

            if (!body.querySelector('.card-orig') && movie.originalTitle && movie.originalTitle !== ru) {
                h.insertAdjacentHTML('afterend',
                    `<p class="card-orig" title="${esc(movie.originalTitle)}">${esc(movie.originalTitle)}</p>`);
            }
        });

        if (heroList.length) showHero(heroIndex);
    }

    // ---------- НОВИНКИ ----------
    let newLoaded = false;

    /* Ряд виден только в обычном каталоге без поиска и жанра */
    function syncNewSection() {
        const visible = activeView === 'catalog' && !state.query && !state.genre
            && el('newRow').children.length > 0;
        el('newSection').classList.toggle('hidden', !visible);
    }

    async function loadNew() {
        if (newLoaded) return;
        newLoaded = true;
        const year = new Date().getFullYear();
        try {
            const { items } = await IA.search({
                sort: 'fresh',
                rows: NEW_COUNT,
                yearFrom: year - 10,
                yearTo: year,
                excludeAdult: true,
            });
            if (!items.length) return;
            el('newRow').innerHTML = items.map((m, i) => cardHtml(m, i, false)).join('');
            syncNewSection();
            localizeTitles(items, el('newRow'));
        } catch {
            newLoaded = false; // повторим при следующем заходе в каталог
        }
    }

    // ---------- ЗАГРУЗКА СПИСКОВ ----------
    let loadSeq = 0; // номер последнего запроса: устаревшие ответы отбрасываются

    async function load({ append = false } = {}) {
        if (append && state.loading) return;
        const seq = ++loadSeq;
        state.loading = true;
        el('status').classList.remove('hidden');
        if (!append) renderSkeletons();

        try {
            const { items, total } = await IA.search({
                query: state.query,
                genre: state.genre,
                sort: state.sort,
                page: state.page,
                rows: PAGE_SIZE,
                adult: state.adult,
            });
            if (seq !== loadSeq) return;

            state.total = total;
            state.items = append ? [...state.items, ...items] : items;
            renderGrid(append);

            if (!append && state.page === 1 && !state.query && !state.genre && !state.adult) updateHero(items);
            localizeTitles(items);
            syncNewSection();
        } catch (err) {
            if (seq !== loadSeq) return;
            el('grid').innerHTML = `<div class="notice">
                Не удалось загрузить каталог: ${esc(err.message)}.
                Проверьте подключение к интернету и попробуйте ещё раз.</div>`;
            el('empty').classList.add('hidden');
        } finally {
            if (seq === loadSeq) {
                state.loading = false;
                el('status').classList.add('hidden');
            }
        }
    }

    /* Избранное и история: список id из localStorage -> карточки */
    async function loadSaved(kind) {
        const seq = ++loadSeq;
        state.loading = false;
        el('status').classList.add('hidden');
        const ids = readStore(kind === 'favorites' ? FAV_KEY : HIST_KEY);
        state.items = [];
        state.total = 0;

        if (!ids.length) {
            renderPlaceholder(kind === 'favorites'
                ? 'В избранном пока пусто. Нажмите ☆ на странице фильма.'
                : 'История просмотров пуста.');
            return;
        }
        renderPlaceholder(kind === 'favorites' ? 'Загрузка избранного…' : 'Загрузка истории…');

        const list = await Promise.all(ids.slice(0, 24).map(id => IA.details(id).catch(() => null)));
        if (seq !== loadSeq) return;
        state.items = list.filter(Boolean);
        state.total = state.items.length;
        renderGrid();
        localizeTitles(state.items);
    }

    // ---------- HERO ----------
    let heroTimer = null;
    let heroList = [];
    let heroIndex = 0;

    function updateHero(items) {
        heroList = (items || []).slice(0, 5);
        heroIndex = 0;
        if (!heroList.length) return;

        el('heroDots').innerHTML = heroList
            .map((_, i) => `<button class="dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Слайд ${i + 1}"></button>`)
            .join('');

        el('heroDots').querySelectorAll('.dot').forEach(dot => {
            dot.addEventListener('click', () => showHero(parseInt(dot.dataset.i)));
        });

        showHero(0);
        clearInterval(heroTimer);
        heroTimer = setInterval(() => showHero((heroIndex + 1) % heroList.length), 9000);
    }

    function showHero(i) {
        const movie = heroList[i];
        if (!movie) return;
        heroIndex = i;

        el('heroBg').style.backgroundImage = `url('${movie.poster}')`;
        el('heroTitle').textContent = movie.title;
        el('heroDesc').textContent = movie.description.slice(0, 320) + (movie.description.length > 320 ? '…' : '');
        el('heroMeta').innerHTML = [
            movie.year ? `<span class="chip">${esc(movie.year)}</span>` : '',
            ...movie.genres.slice(0, 3).map(g => `<span class="chip ghost">${esc(g)}</span>`),
            movie.downloads ? `<span class="chip ghost">⬇ ${movie.downloads.toLocaleString('ru-RU')}</span>` : '',
        ].join('');

        el('heroWatch').href = watchHref(movie.id);
        el('heroInfo').onclick = () => openDetails(movie.id);

        el('heroDots').querySelectorAll('.dot').forEach((d, k) => d.classList.toggle('active', k === i));
    }

    // ---------- МОДАЛКА «О ФИЛЬМЕ» ----------
    async function openDetails(id) {
        const modal = el('modal');
        const body = el('modalBody');
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        body.innerHTML = '<div class="notice">Загрузка данных о фильме…</div>';

        try {
            const m = await IA.details(id);
            [m.title, m.description] = await Promise.all([
                L10N.ruTitleAsync(m.id, m.originalTitle),
                L10N.translate(m.description),
            ]);
            const fav = isFavorite(m.id);
            body.innerHTML = `
                <div class="md-hero" style="background-image:url('${esc(m.poster)}')">
                    <button class="icon-btn md-close" data-close aria-label="Закрыть">✕</button>
                </div>
                <div class="md-body">
                    <h2 class="md-title">${esc(m.title)}</h2>
                    ${m.originalTitle && m.originalTitle !== m.title ? `<p class="orig-title">${esc(m.originalTitle)}</p>` : ''}
                    <div class="md-meta">
                        ${m.year ? `<span class="chip">${esc(m.year)}</span>` : ''}
                        ${m.runtime ? `<span class="chip ghost">${esc(m.runtime)}</span>` : ''}
                        ${m.creators.map(c => `<span class="chip ghost">${esc(c)}</span>`).join('')}
                        ${m.downloads ? `<span class="chip ghost">⬇ ${m.downloads.toLocaleString('ru-RU')}</span>` : ''}
                    </div>
                    <div class="md-genres">${m.genres.map(g => `<span class="chip ghost">${esc(g)}</span>`).join('')}</div>
                    <p class="md-desc">${esc(m.description)}</p>

                    ${m.videos.length ? `
                        <div class="md-quality">
                            <span class="md-label">Доступные версии:</span>
                            ${m.videos.slice(0, 5).map(v => `
                                <button class="chip ghost quality" data-file="${esc(v.name)}">
                                    ${esc(v.label || 'MP4')} · ${esc(IA.humanSize(v.size))}
                                </button>`).join('')}
                        </div>` :
                        '<div class="notice">Видеофайлы в MP4 не найдены — доступен просмотр на сайте архива.</div>'}

                    <div class="md-actions">
                        <a class="btn primary" data-go href="${esc(watchHref(m.id))}">
                            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg> Смотреть
                        </a>
                        <a class="btn ghost" href="${esc(m.downloadPage)}" target="_blank" rel="noopener">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Все файлы
                        </a>
                        <button class="btn ghost" data-fav="${esc(m.id)}">${fav ? '★ В избранном' : '☆ В избранное'}</button>
                        <a class="btn ghost" href="${esc(m.pageUrl)}" target="_blank" rel="noopener">Страница архива</a>
                    </div>
                    ${m.license ? `<p class="md-license">Лицензия: <a href="${esc(m.license)}" target="_blank" rel="noopener">${esc(m.license.replace(/^https?:\/\//, ''))}</a></p>` : ''}
                </div>`;

            body.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
            body.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => {
                const added = toggleFavorite(m.id);
                b.textContent = added ? '★ В избранном' : '☆ В избранное';
                toast(added ? 'Добавлено в избранное' : 'Убрано из избранного');
                if (activeView === 'catalog' || activeView === 'adult') renderGrid();
            }));
            body.querySelectorAll('.quality').forEach(b => b.addEventListener('click', () => {
                closeModal();
                location.hash = watchHref(m.id, { file: b.dataset.file });
            }));
        } catch (err) {
            body.innerHTML = `<div class="notice">Ошибка загрузки: ${esc(err.message)}</div>`;
        }
    }

    function closeModal() {
        el('modal').classList.add('hidden');
        if (el('ageGate').classList.contains('hidden')) document.body.style.overflow = '';
    }

    // ---------- ПЛЕЕР ----------
    let watchSeq = 0;
    let currentMovie = null;

    function stopPlayer() {
        const video = el('player');
        try { video.pause(); } catch { /* ничего */ }
        video.removeAttribute('src');
        video.removeAttribute('poster');
        video.load();
    }

    function resetPlayerUi() {
        stopPlayer();
        currentMovie = null;
        el('infoTitle').textContent = 'Загрузка…';
        el('infoOrig').textContent = '';
        el('infoMeta').innerHTML = '';
        el('infoGenres').innerHTML = '';
        el('infoDesc').textContent = '';
        el('infoStats').innerHTML = '';
        el('qualities').innerHTML = '';
        el('relatedGrid').innerHTML = '';
        el('dlBtn').href = '#';
        el('infoPoster').classList.remove('no-img');
        el('infoPoster').removeAttribute('src');
        el('favBtn').classList.add('hidden');
    }

    function updateFavBtn() {
        if (!currentMovie) return;
        el('favBtn').textContent = isFavorite(currentMovie.id) ? '★ В избранном' : '☆ В избранное';
    }

    async function openWatch(id, params) {
        const seq = ++watchSeq;
        const isAdult = params.get('adult') === '1';
        const fileName = params.get('file');

        if (activeView !== 'watch') listScroll = window.scrollY;
        showShell('watch');
        resetPlayerUi();
        el('backLink').href = `#${returnView}`;
        el('backLink').textContent = returnView === 'adult' ? '← Назад в раздел 18+' : '← Назад в каталог';

        let movie;
        try {
            movie = await IA.details(id);
        } catch (err) {
            if (seq !== watchSeq) return;
            el('infoTitle').textContent = 'Не удалось загрузить фильм';
            el('infoDesc').textContent = err.message;
            return;
        }
        if (seq !== watchSeq) return;

        [movie.title, movie.description] = await Promise.all([
            L10N.ruTitleAsync(movie.id, movie.originalTitle),
            L10N.translate(movie.description),
        ]);
        if (seq !== watchSeq) return;

        currentMovie = movie;
        document.title = `${movie.title} — CinemaHub`;
        addToHistory(movie.id);

        // Видео: параметр file позволяет открыть конкретное качество из карточки
        const video = el('player');
        const best = movie.best || movie.videos[0];
        const initial = (fileName && movie.videos.find(v => v.name === fileName)) || best;

        if (initial) {
            video.poster = movie.poster;
            video.src = IA.streamUrl(id, initial.name);
            video.load();
        }

        el('infoTitle').textContent = movie.title;
        el('infoOrig').textContent =
            (movie.originalTitle && movie.originalTitle !== movie.title) ? movie.originalTitle : '';
        el('infoMeta').innerHTML = [
            isAdult ? '<span class="chip age-chip">18+</span>' : '',
            movie.year ? `<span class="chip">${esc(movie.year)}</span>` : '',
            movie.runtime ? `<span class="chip ghost">${esc(movie.runtime)}</span>` : '',
            ...movie.creators.map(c => `<span class="chip ghost">${esc(c)}</span>`),
        ].join('');
        el('infoGenres').innerHTML = movie.genres.map(g => `<span class="chip ghost">${esc(g)}</span>`).join('');
        el('infoDesc').textContent = movie.description;
        el('infoPoster').src = movie.poster;
        el('infoPoster').alt = movie.title;
        el('infoStats').innerHTML = `
            <p class="stat"><strong>${movie.downloads.toLocaleString('ru-RU')}</strong> загрузок</p>
            ${movie.license ? `<p class="stat"><a href="${esc(movie.license)}" target="_blank" rel="noopener">Лицензия: ${esc(movie.license.replace(/^https?:\/\//, ''))}</a></p>` : ''}
            <p class="stat"><a href="${movie.downloadPage}" target="_blank" rel="noopener">Все файлы на archive.org →</a></p>`;

        el('dlBtn').href = initial ? IA.streamUrl(id, initial.name) : movie.downloadPage;

        el('qualities').innerHTML = movie.videos.slice(0, 6).map(v =>
            `<button class="chip quality-btn${v === initial ? ' active' : ''}" data-f="${esc(v.name)}">
                ${esc(v.label || 'MP4')} · ${esc(IA.humanSize(v.size))}
            </button>`
        ).join('');

        el('favBtn').classList.remove('hidden');
        updateFavBtn();

        // Похожие фильмы
        try {
            const { items } = await IA.search({
                genre: movie.rawGenres[0] || '',
                sort: 'popular',
                rows: 13,
                adult: isAdult,
            });
            const related = items.filter(i => i.id !== movie.id).slice(0, 12);
            if (seq !== watchSeq) return;
            el('relatedGrid').innerHTML = related.map((r, i) => cardHtml(r, i, isAdult)).join('');
            localizeTitles(related, el('relatedGrid'));
        } catch { /* блок «похожие» необязателен */ }
    }

    function bindPlayer() {
        const video = el('player');

        el('qualities').addEventListener('click', e => {
            const btn = e.target.closest('.quality-btn');
            if (!btn || !currentMovie) return;
            el('qualities').querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Переключаем качество, не теряя текущую позицию
            const time = video.currentTime || 0;
            const url = IA.streamUrl(currentMovie.id, btn.dataset.f);
            video.src = url;
            video.addEventListener('loadedmetadata', () => {
                if (time > 0 && time < (video.duration || Infinity)) video.currentTime = time;
            }, { once: true });
            video.load();
            video.play().catch(() => {});
            el('dlBtn').href = url;
        });

        el('pipBtn').addEventListener('click', async () => {
            try {
                if (document.pictureInPictureElement) document.exitPictureInPicture();
                else await video.requestPictureInPicture();
            } catch { toast('PiP недоступен'); }
        });

        el('fsBtn').addEventListener('click', () => {
            if (!document.fullscreenElement) video.requestFullscreen?.();
            else document.exitFullscreen?.();
        });

        el('favBtn').addEventListener('click', () => {
            if (!currentMovie) return;
            const added = toggleFavorite(currentMovie.id);
            updateFavBtn();
            toast(added ? 'Добавлено в избранное' : 'Убрано из избранного');
        });
    }

    // ---------- ЭКРАНЫ И МАРШРУТИЗАЦИЯ ----------
    let activeView = null;      // catalog | adult | favorites | history | watch
    let listView = null;        // какой список сейчас нарисован в сетке
    let listDirty = false;      // фильтры изменились, пока список был скрыт
    let returnView = 'catalog'; // куда ведёт «Назад» из плеера
    let listScroll = 0;

    const LIST_VIEWS = ['catalog', 'adult', 'favorites', 'history'];

    function setNav(name) {
        document.querySelectorAll('[data-nav]').forEach(a =>
            a.classList.toggle('active', a.dataset.nav === name));
    }

    function showShell(view) {
        activeView = view;
        const watching = view === 'watch';
        el('catalogView').classList.toggle('hidden', watching);
        el('playerView').classList.toggle('hidden', !watching);
        if (watching) {
            window.scrollTo({ top: 0, behavior: 'instant' });
        } else {
            document.title = BASE_TITLE;
        }
    }

    function parseHash() {
        const [path, qs = ''] = location.hash.replace(/^#/, '').split('?');
        const [name = '', rawArg = ''] = path.split('/');
        let arg = rawArg;
        try { arg = decodeURIComponent(rawArg); } catch { /* оставляем как есть */ }
        return { name: name || 'catalog', arg, params: new URLSearchParams(qs) };
    }

    function resetFilters() {
        state.query = '';
        state.genre = '';
        el('search').value = '';
        document.querySelectorAll('.chip-btn[data-genre]').forEach(b =>
            b.classList.toggle('active', b.dataset.genre === ''));
    }

    function showList(view, scrollToNew = false) {
        const cameFromWatch = activeView === 'watch';
        stopPlayer();
        if (scrollToNew && (state.query || state.genre)) {
            resetFilters();
            listDirty = true;
        }

        showShell(view);
        state.adult = view === 'adult';
        returnView = view === 'adult' ? 'adult' : 'catalog';

        const isFilterable = view === 'catalog' || view === 'adult';
        el('intro').classList.toggle('hidden', view !== 'catalog');
        el('toolbar').classList.toggle('hidden', !isFilterable);
        el('adultNote').classList.toggle('hidden', view !== 'adult');
        setNav(scrollToNew ? 'new' : view);

        if (view === 'catalog') loadNew();

        // Избранное и история всегда перечитываем; каталог и 18+ — только если сменились
        const needLoad = !isFilterable || listView !== view || listDirty;
        if (needLoad) {
            listView = view;
            listDirty = false;
            state.page = 1;
            if (isFilterable) load(); else loadSaved(view);
            window.scrollTo({ top: 0, behavior: 'instant' });
        } else {
            renderGrid(); // обновит звёздочки «в избранном»
        }
        syncNewSection();

        if (scrollToNew) {
            el('newSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (!needLoad) {
            window.scrollTo({ top: cameFromWatch ? listScroll : 0, behavior: 'instant' });
        }
    }

    function route() {
        closeModal();
        const { name, arg, params } = parseHash();

        const isWatch = name === 'watch' && arg;
        const needsAge = name === 'adult' || (isWatch && params.get('adult') === '1');

        if (needsAge && !isAdultConfirmed()) {
            // Пока возраст не подтверждён, за окном ничего не показываем
            stopPlayer();
            showShell('catalog');
            listView = null;
            el('intro').classList.add('hidden');
            el('toolbar').classList.add('hidden');
            el('newSection').classList.add('hidden');
            el('adultNote').classList.add('hidden');
            renderPlaceholder('Для просмотра раздела нужно подтвердить возраст.');
            askAge(route, () => { location.hash = '#catalog'; });
            return;
        }

        if (isWatch) {
            if (LIST_VIEWS.includes(activeView)) {
                returnView = activeView === 'adult' ? 'adult' : 'catalog';
            }
            openWatch(arg, params);
            return;
        }

        if (name === 'new') return showList('catalog', true);
        showList(LIST_VIEWS.includes(name) ? name : 'catalog');
    }

    // ---------- ФИЛЬТРЫ ----------
    /* Поиск и жанры работают из любого экрана: вне каталога переходят в него */
    function applyFilters() {
        state.page = 1;
        if (activeView === 'catalog' || activeView === 'adult') {
            listDirty = false;
            load();
            syncNewSection();
        } else {
            listDirty = true;
            if (location.hash !== '#catalog') location.hash = '#catalog';
            else route();
        }
    }

    // ---------- СЛУШАТЕЛИ ----------
    function bind() {
        let debounce = null;
        const input = el('search');

        input.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                state.query = input.value.trim();
                applyFilters();
            }, 550);
        });

        el('searchForm').addEventListener('submit', e => {
            e.preventDefault();
            clearTimeout(debounce);
            state.query = input.value.trim();
            applyFilters();
        });

        el('sort').addEventListener('change', e => {
            state.sort = e.target.value;
            applyFilters();
        });

        document.querySelectorAll('.chip-btn[data-genre]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.chip-btn[data-genre]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.genre = btn.dataset.genre;
                applyFilters();
            });
        });

        el('more').addEventListener('click', () => {
            state.page += 1;
            load({ append: true });
        });

        // Клик по постеру без картинки открывает карточку фильма
        ['grid', 'newRow'].forEach(id => {
            el(id).addEventListener('click', e => {
                const link = e.target.closest('.card-poster');
                if (link && link.classList.contains('no-img')) {
                    e.preventDefault();
                    openDetails(link.dataset.id);
                }
            });
        });

        const row = el('newRow');
        const scrollRow = dir => row.scrollBy({ left: dir * row.clientWidth * 0.85, behavior: 'smooth' });
        el('newPrev').addEventListener('click', () => scrollRow(-1));
        el('newNext').addEventListener('click', () => scrollRow(1));

        // «Смотреть» в модалке — обычная ссылка, её нужно закрыть вместе с окном
        el('modalBody').addEventListener('click', e => {
            if (e.target.closest('[data-go]')) closeModal();
        });
        el('modalBackdrop').addEventListener('click', closeModal);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

        bindPlayer();
        window.addEventListener('hashchange', route);
    }

    // ---------- СТАРТ ----------
    function start() {
        bind();
        route();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
