(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '2.1.0';

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
        if (!isConfigured()) {
            notify('Сначала настройте Emby');
            return;
        }

        const base = getUrl().replace(/\/$/, '');
        const url = `${base}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${getApiKey()}`;

        new Lampa.Reguest().silent(url, success, error || (() => {}));
    }

    // Поиск в Emby
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);

        const fields = '&Fields=Id,Name&Recursive=true&IncludeItemTypes=Movie,Series,Episode';

        if (movie.imdb_id || movie.imdbid) {
            const imdb = (movie.imdb_id || movie.imdbid).replace('tt', '');
            apiRequest(`/Items?AnyProviderIdEquals=imdb.${imdb}${fields}`, (data) => {
                if (data && data.Items && data.Items.length > 0) {
                    callback(data.Items[0]);
                } else {
                    searchByTMDB(movie, callback);
                }
            });
            return;
        }

        searchByTMDB(movie, callback);
    }

    function searchByTMDB(movie, callback) {
        const tmdb = movie.tmdb_id || movie.id;
        if (tmdb) {
            apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, (data) => {
                callback(data && data.Items && data.Items[0]);
            });
        } else {
            searchByName(movie, callback);
        }
    }

    function searchByName(movie, callback) {
        const title = encodeURIComponent(movie.title || movie.name || '');
        apiRequest(`/Items?SearchTerm=${title}&Limit=3${fields}`, (data) => {
            callback(data && data.Items && data.Items[0]);
        });
    }

    function openInEmby(movie) {
        findInEmby(movie, (item) => {
            if (item && item.Id) {
                const link = `${getUrl().replace(/\/$/, '')}/web/#/details?id=${item.Id}`;
                window.open(link, '_blank');
                notify(`Открыто в Emby: ${item.Name}`);
            } else {
                notify('Не найдено в Emby');
            }
        });
    }

    // ==================== КНОПКА КАК В FX.JS ====================
    function addEmbyButton(data) {
        if (!data || !data.render) return;
        if (data.render.find('.emby-button').length) return;

        const button = $(`
            <div class="button selector emby-button">
                <span>Emby</span>
            </div>
        `);

        button.on('hover:enter', function() {
            openInEmby(data.movie || data.card);
        });

        // Точная вставка как в fx.js
        const playButton = data.render.find('.button--play, .view--torrent, [data-action="play"]').first();

        if (playButton.length) {
            playButton.after(button);
        } else {
            data.render.find('.buttons').append(button);
        }
    }

    // Добавление в меню "Смотреть" (как у Filmix)
    function addToSources(card) {
        Lampa.Listener.follow('sources', function(e) {
            if (e.type === 'add' && e.card && e.card.id === card.id) {
                e.sources.unshift({
                    title: 'Emby',
                    subtitle: 'Локальный сервер',
                    onSelect: function() {
                        openInEmby(card);
                    }
                });
            }
        });
    }

    // ==================== НАСТРОЙКИ ====================
    function renderSettings(body) {
        body.empty();

        const url = getUrl();
        const key = getApiKey();

        const wrap = $('<div class="settings-container"></div>');

        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${url || 'Не задано'}</div></div>`);
        urlRow.on('hover:enter', function() {
            Lampa.Input.edit({
                title: 'Emby Server URL',
                value: url,
                free: true
            }, function(val) {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${key ? '••••••••••' : 'Не задано'}</div></div>`);
        keyRow.on('hover:enter', function() {
            Lampa.Input.edit({
                title: 'Emby API Key',
                value: key,
                free: true
            }, function(val) {
                Lampa.Storage.set(STORAGE_API_KEY, val);
                keyRow.find('.settings-param__value').text(val ? '••••••••••' : 'Не задано');
            });
        });

        wrap.append(urlRow).append(keyRow);
        body.append(wrap);
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'emby',
            name: 'Emby',
            icon: '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>'
        });

        Lampa.Settings.listener.follow('open', function(e) {
            if (e.name === 'emby') renderSettings(e.body);
        });
    }

    // ==================== ЗАПУСК ====================
    function startPlugin() {
        initSettings();

        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                const data = {
                    render: e.object.activity.render(),
                    movie: e.data.movie || e.data.card
                };
                addEmbyButton(data);
                addToSources(data.movie);
            }
        });

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') startPlugin();
    });

})();
