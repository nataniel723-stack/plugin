(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '1.9.0';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
    }

    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY, '') || '').trim();
    }

    function isConfigured() {
        return getUrl().length > 10 && getApiKey().length > 10;
    }

    function notify(msg) {
        Lampa.Noty.show(msg);
    }

    function apiRequest(endpoint, success, error) {
        if (!isConfigured()) return;

        const base = getUrl().replace(/\/$/, '');
        const url = `${base}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${getApiKey()}`;

        new Lampa.Reguest().silent(url, success, error || (() => {}));
    }

    // === Поиск в Emby (максимально надёжный) ===
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);

        const fields = '&Fields=Id,Name,ProviderIds&Recursive=true&IncludeItemTypes=Movie,Series,Episode';

        // Попытка 1: IMDB
        if (movie.imdb_id || movie.imdbid) {
            const id = (movie.imdb_id || movie.imdbid).replace('tt', '');
            apiRequest(`/Items?AnyProviderIdEquals=imdb.${id}${fields}`, (data) => {
                if (data?.Items?.[0]) return callback(data.Items[0]);
                attemptTMDB(movie, callback);
            });
            return;
        }

        // Попытка 2: TMDB
        attemptTMDB(movie, callback);
    }

    function attemptTMDB(movie, callback) {
        const tmdb = movie.tmdb_id || movie.id;
        if (tmdb) {
            apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}&Recursive=true`, (data) => {
                if (data?.Items?.[0]) return callback(data.Items[0]);
                searchByName(movie, callback);
            });
        } else {
            searchByName(movie, callback);
        }
    }

    function searchByName(movie, callback) {
        const title = encodeURIComponent((movie.title || movie.name || '').trim());
        if (!title) return callback(null);

        apiRequest(`/Items?SearchTerm=${title}&Limit=5&Recursive=true&IncludeItemTypes=Movie,Series`, (data) => {
            callback(data?.Items?.[0]);
        });
    }

    // === Добавление в "Смотреть" (как "Онлайн" у Filmix) ===
    function addToSources(card) {
        if (!card) return;

        Lampa.Listener.follow('sources', (e) => {
            if (e.type === 'add' && e.card && (e.card.id === card.id || e.card.tmdb_id === card.tmdb_id)) {
                e.sources.unshift({
                    title: 'Emby',
                    subtitle: 'Локальный сервер',
                    icon: '📺',
                    onSelect: () => openEmby(card)
                });
            }
        });
    }

    function openEmby(card) {
        findInEmby(card, (item) => {
            if (item && item.Id) {
                const link = `${getUrl().replace(/\/$/, '')}/web/#/details?id=${item.Id}`;
                window.open(link, '_blank');
                notify(`Открыто в Emby: ${item.Name}`);
            } else {
                notify('Не найдено в Emby. Убедитесь, что у фильма есть IMDB или TMDB ID в метаданных Emby.');
            }
        });
    }

    // Кнопка в карточке (минималистичная, как у Filmix)
    function createButton(activity) {
        const render = activity.render ? activity.render() : $('.activity__body');
        if (render.find('.emby-button').length) return;

        const btn = $(`
            <div class="button selector emby-button">
                <span>Emby</span>
            </div>
        `);

        btn.on('hover:enter', () => openEmby(activity.movie || activity.card));

        const playBtn = render.find('.button--play, .view--torrent, [data-action="play"]').first();
        if (playBtn.length) {
            playBtn.after(btn);
        }
    }

    // === Настройки ===
    function renderSettings(body) {
        body.empty();
        const url = getUrl();
        const key = getApiKey();

        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${url || 'Не задано'}</div></div>`);
        urlRow.on('hover:enter', () => Lampa.Input.edit({title: 'Emby URL', value: url, free: true}, val => {
            Lampa.Storage.set(STORAGE_URL, val);
            urlRow.find('.settings-param__value').text(val || 'Не задано');
        }));

        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${key ? '••••••••••' : 'Не задано'}</div></div>`);
        keyRow.on('hover:enter', () => Lampa.Input.edit({title: 'Emby API Key', value: key, free: true}, val => {
            Lampa.Storage.set(STORAGE_API_KEY, val);
            keyRow.find('.settings-param__value').text(val ? '••••••••••' : 'Не задано');
        }));

        wrap.append(urlRow).append(keyRow);
        body.append(wrap);
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'emby',
            name: 'Emby',
            icon: '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>'
        });

        Lampa.Settings.listener.follow('open', (e) => {
            if (e.name === 'emby') renderSettings(e.body);
        });
    }

    function start() {
        initSettings();

        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                const act = e.object.activity || e.data;
                createButton(act);
                addToSources(act.movie || act.card);
            }
        });

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') start(); });
})();
