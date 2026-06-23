(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '1.7.0';

    const STORAGE_URL = 'emby_url';
    const STORAGE_TOKEN = 'emby_token';

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://127.0.0.1:8096') || '').trim();
    }

    function getToken() {
        return (Lampa.Storage.get(STORAGE_TOKEN, '') || '').trim();
    }

    function isConfigured() {
        return getUrl().length > 10 && getToken().length > 5;
    }

    function notify(msg) {
        Lampa.Noty.show(msg);
    }

    function apiRequest(endpoint, success, error) {
        if (!isConfigured()) {
            notify('Настройте Emby в параметрах');
            return;
        }

        const base = getUrl().replace(/\/$/, '');
        const url = `${base}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${getToken()}`;

        new Lampa.Reguest().silent(url, success, error || (() => {}), false, {
            headers: { 'Accept': 'application/json' }
        });
    }

    // === ИСПРАВЛЕННЫЙ ПОИСК ===
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);

        const query = '&Recursive=true&IncludeItemTypes=Movie,Series,Episode&Fields=Id,Name,Path,ProviderIds';

        // 1. По IMDB (самый надёжный)
        if (movie.imdb_id || movie.imdbid) {
            const id = (movie.imdb_id || movie.imdbid).replace('tt', '');
            apiRequest(`/Items?AnyProviderIdEquals=imdb.${id}${query}`, (data) => {
                if (data && data.Items && data.Items.length) return callback(data.Items[0]);
                fallbackSearch(movie, callback);
            });
            return;
        }

        // 2. По TMDB
        if (movie.tmdb_id || movie.id) {
            const id = movie.tmdb_id || movie.id;
            apiRequest(`/Items?AnyProviderIdEquals=tmdb.${id}${query}`, (data) => {
                if (data && data.Items && data.Items.length) return callback(data.Items[0]);
                fallbackSearch(movie, callback);
            });
            return;
        }

        fallbackSearch(movie, callback);
    }

    function fallbackSearch(movie, callback) {
        const title = encodeURIComponent(movie.title || movie.name || '');
        apiRequest(`/Items?SearchTerm=${title}&Limit=5${'&Recursive=true&IncludeItemTypes=Movie,Series'}`, (data) => {
            callback(data && data.Items && data.Items[0]);
        });
    }

    // === Добавление как источник (как Filmix) ===
    function addAsSource(card) {
        if (!card || !isConfigured()) return;

        Lampa.Listener.follow('sources', (e) => {
            if (e.type === 'add' && e.card && e.card.id === card.id) {
                e.sources.push({
                    title: 'Emby',
                    icon: '📺',
                    onSelect: () => {
                        findInEmby(card, (item) => {
                            if (item && item.Id) {
                                const webUrl = `${getUrl().replace(/\/$/, '')}/web/#/details?id=${item.Id}`;
                                window.open(webUrl, '_blank');
                                notify(`Открыто в Emby: ${item.Name}`);
                            } else {
                                notify('Не найдено в Emby. Убедитесь, что фильм имеет IMDB/TMDB ID в метаданных.');
                            }
                        });
                    }
                });
            }
        });
    }

    function createButton(activity) {
        const render = activity.render ? activity.render() : $('.activity__body');
        if (render.find('.emby-button').length) return;

        const btn = $(`
            <div class="button selector emby-button">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span>Emby</span>
            </div>
        `);

        btn.on('hover:enter', () => {
            if (!isConfigured()) {
                notify('Настройте Emby');
                return;
            }
            findInEmby(activity.movie || activity.card, (item) => {
                if (item && item.Id) {
                    window.open(`${getUrl().replace(/\/$/, '')}/web/#/details?id=${item.Id}`, '_blank');
                } else {
                    notify('Не найдено в Emby');
                }
            });
        });

        const playBtn = render.find('.button--play, .view--torrent').first();
        if (playBtn.length) playBtn.after(btn);
    }

    // === Настройки как в fx.js ===
    function renderSettings(body) {
        body.empty();
        const url = getUrl();
        const token = getToken();

        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Emby URL</div><div class="settings-param__value">${url || 'Не задано'}</div></div>`);
        urlRow.on('hover:enter', () => {
            Lampa.Input.edit({ title: 'Emby Server URL', value: url, free: true }, (val) => {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        const tokenRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${token ? '********' : 'Не задано'}</div></div>`);
        tokenRow.on('hover:enter', () => {
            Lampa.Input.edit({ title: 'API Key', value: token, free: true }, (val) => {
                Lampa.Storage.set(STORAGE_TOKEN, val);
                tokenRow.find('.settings-param__value').text(val ? '********' : 'Не задано');
            });
        });

        wrap.append(urlRow).append(tokenRow);
        body.append(wrap);
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'emby',
            name: 'Emby',
            icon: '<svg width="40" height="40"><rect width="40" height="40" rx="8" fill="#3498db"/><text x="50%" y="55%" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>'
        });

        Lampa.Settings.listener.follow('open', (e) => {
            if (e.name === 'emby') renderSettings(e.body);
        });
    }

    function startPlugin() {
        initSettings();

        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                const activity = e.object.activity || e.data;
                createButton(activity);
                addAsSource(activity.movie || activity.card);   // Добавляем в источники
            }
        });

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') startPlugin(); });

})();
