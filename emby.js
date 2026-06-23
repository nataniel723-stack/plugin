(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '1.8.0';

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
            notify('Настройте Emby');
            return;
        }

        const base = getUrl().replace(/\/$/, '');
        const url = `${base}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${getApiKey()}`;

        new Lampa.Reguest().silent(url, success, error || (() => {}));
    }

    // Улучшенный поиск
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);

        const fields = '&Fields=Id,Name,ProviderIds,Path&Recursive=true&IncludeItemTypes=Movie,Series,Episode';

        // По IMDB
        if (movie.imdb_id || movie.imdbid) {
            const imdb = (movie.imdb_id || movie.imdbid).replace('tt', '');
            apiRequest(`/Items?AnyProviderIdEquals=imdb.${imdb}${fields}`, (data) => {
                if (data?.Items?.length) return callback(data.Items[0]);
                searchByTMDB(movie, callback);
            });
            return;
        }

        // По TMDB
        if (movie.tmdb_id || movie.id) {
            const tmdb = movie.tmdb_id || movie.id;
            apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, (data) => {
                if (data?.Items?.length) return callback(data.Items[0]);
                searchByName(movie, callback);
            });
            return;
        }

        searchByName(movie, callback);
    }

    function searchByTMDB(movie, callback) {
        if (!movie.tmdb_id && !movie.id) return searchByName(movie, callback);
        const tmdb = movie.tmdb_id || movie.id;
        apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}&Recursive=true`, (data) => callback(data?.Items?.[0]));
    }

    function searchByName(movie, callback) {
        const title = encodeURIComponent(movie.title || movie.name || '');
        apiRequest(`/Items?SearchTerm=${title}&Limit=3&Recursive=true&IncludeItemTypes=Movie,Series`, (data) => {
            callback(data?.Items?.[0]);
        });
    }

    // Добавление в источники (как Filmix)
    function addToSources(card) {
        Lampa.Listener.follow('sources', function(e) {
            if (e.type === 'add' && e.card && e.card.id === card.id) {
                e.sources.push({
                    title: 'Emby',
                    subtitle: 'Локальный сервер',
                    onSelect: function() {
                        findInEmby(card, function(item) {
                            if (item && item.Id) {
                                const link = `${getUrl().replace(/\/$/, '')}/web/#/details?id=${item.Id}`;
                                window.open(link, '_blank');
                                notify(`Открыто: ${item.Name}`);
                            } else {
                                notify('Не найдено в Emby');
                            }
                        });
                    }
                });
            }
        });
    }

    // Кнопка в карточке
    function createEmbyButton(activity) {
        const render = activity.render ? activity.render() : $('.activity__body');
        if (render.find('.emby-button').length) return;

        const btn = $(`
            <div class="button selector emby-button">
                <span>Emby</span>
            </div>
        `);

        btn.on('hover:enter', function() {
            if (!isConfigured()) {
                notify('Настройте Emby');
                return;
            }
            findInEmby(activity.movie || activity.card, function(item) {
                if (item && item.Id) {
                    window.open(`${getUrl().replace(/\/$/, '')}/web/#/details?id=${item.Id}`, '_blank');
                } else {
                    notify('Не найдено в Emby');
                }
            });
        });

        const container = render.find('.buttons, .activity__body');
        const playBtn = render.find('.button--play, .view--torrent, [data-action="play"]').first();

        if (playBtn.length) {
            playBtn.after(btn);
        } else if (container.length) {
            container.append(btn);
        }
    }

    // Настройки
    function renderSettings(body) {
        body.empty();
        const url = getUrl();
        const key = getApiKey();

        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Emby</div>');

        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${url || 'Не задано'}</div></div>`);
        urlRow.on('hover:enter', () => {
            Lampa.Input.edit({title: 'Emby Server URL', value: url, free: true}, (val) => {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${key ? '●●●●●●●●' : 'Не задано'}</div></div>`);
        keyRow.on('hover:enter', () => {
            Lampa.Input.edit({title: 'Emby API Key', value: key, free: true}, (val) => {
                Lampa.Storage.set(STORAGE_API_KEY, val);
                keyRow.find('.settings-param__value').text(val ? '●●●●●●●●' : 'Не задано');
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

        Lampa.Settings.listener.follow('open', (e) => {
            if (e.name === 'emby') renderSettings(e.body);
        });
    }

    function start() {
        initSettings();

        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                const act = e.object.activity || e.data;
                createEmbyButton(act);
                addToSources(act.movie || act.card);
            }
        });

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: lime; font-weight: bold');
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') start(); });
})();
