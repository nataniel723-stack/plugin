(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '5.0.2';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
    }
    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY, '78b3967970814692b20b095e5b13f0eb') || '').trim();
    }
    function isConfigured() { return getUrl().length > 5 && getApiKey().length > 5; }
    function notify(msg) { Lampa.Noty.show(msg); }
    function buildApiUrl(endpoint) {
        const base = getUrl().replace(/\/$/, '');
        const sep = endpoint.includes('?') ? '&' : '?';
        return `${base}/emby${endpoint}${sep}api_key=${getApiKey()}`;
    }
    function getDeviceId() {
        let id = Lampa.Storage.get('emby_device_id');
        if (!id) {
            id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
            Lampa.Storage.set('emby_device_id', id);
        }
        return id;
    }

    function extractTmdbId(movie) {
        if (!movie) return null;
        let tmdb = movie.tmdb_id || movie.id;
        if (typeof movie.url === 'string') {
            const m = movie.url.match(/tv\/(\d+)/);
            if (m) tmdb = parseInt(m[1]);
        }
        if (!tmdb && movie.data) tmdb = movie.data.tmdb_id || movie.data.id;
        return tmdb ? parseInt(tmdb) : null;
    }

    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        const tmdb = extractTmdbId(movie);
        const network = new Lampa.Reguest();
        if (tmdb) {
            network.silent(buildApiUrl(`/Items?AnyProviderIdEquals=tmdb.${tmdb}&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name`),
                data => callback(data?.Items?.[0] || null),
                () => callback(null)
            );
        } else {
            const title = movie.title || movie.name || '';
            if (!title) return callback(null);
            network.silent(buildApiUrl(`/Items?SearchTerm=${encodeURIComponent(title)}&Limit=3&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name`),
                data => callback(data?.Items?.[0] || null),
                () => callback(null)
            );
        }
    }

    function playMovie(item) {
        const base = getUrl().replace(/\/$/, '');
        const apiKey = getApiKey();
        const deviceId = getDeviceId();
        const playSessionId = Date.now().toString();
        const streamUrl = `${base}/emby/Videos/${item.Id}/stream?Static=true&DeviceId=${deviceId}&PlaySessionId=${playSessionId}&api_key=${apiKey}`;
        Lampa.Player.play({
            title: item.Name,
            url: streamUrl,
            poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash('movie/' + extractTmdbId(window.currentMovie)))
        });
    }

    function openSeries(item) {
        window.embySeriesId = item.Id;
        const movie = window.currentMovie;
        // Гарантируем наличие tmdb_id
        if (!movie.tmdb_id) movie.tmdb_id = extractTmdbId(movie);
        if (!movie.tmdb_id) {
            notify('Не удалось определить TMDB ID');
            return;
        }
        // Передаём оригинальный movie в стандартный компонент
        Lampa.Activity.push({
            url: '',
            title: movie.title || movie.name,
            component: 'tmdb_series',
            movie: movie
        });
    }

    function hookPlayer() {
        const origPlay = Lampa.Player.play;
        Lampa.Player.play = function(config) {
            if (window.embySeriesId && config.season && config.episode) {
                const season = config.season;
                const episode = config.episode;
                const network = new Lampa.Reguest();

                const seasonQuery = `/Items?ParentId=${window.embySeriesId}&IncludeItemTypes=Season&Fields=Id,IndexNumber`;
                network.silent(buildApiUrl(seasonQuery), sData => {
                    if (sData?.Items) {
                        const s = sData.Items.find(x => x.IndexNumber === season);
                        if (s) {
                            const epQuery = `/Items?ParentId=${s.Id}&IncludeItemTypes=Episode&Fields=Id,Name,IndexNumber,PrimaryImageTag&SortBy=SortName&SortOrder=Ascending`;
                            network.silent(buildApiUrl(epQuery), eData => {
                                if (eData?.Items) {
                                    const sorted = eData.Items.sort((a,b) => (a.IndexNumber||0)-(b.IndexNumber||0));
                                    const ep = sorted[episode-1];
                                    if (ep) {
                                        const base = getUrl().replace(/\/$/, '');
                                        config.url = `${base}/emby/Videos/${ep.Id}/stream?Static=true&DeviceId=${getDeviceId()}&PlaySessionId=${Date.now()}&api_key=${getApiKey()}`;
                                        config.poster = ep.PrimaryImageTag ? `${base}/Items/${ep.Id}/Images/Primary?tag=${ep.PrimaryImageTag}` : config.poster;
                                        config.title = ep.Name || config.title;
                                    }
                                }
                                origPlay.call(this, config);
                            }, () => origPlay.call(this, config));
                        } else origPlay.call(this, config);
                    } else origPlay.call(this, config);
                }, () => origPlay.call(this, config));
                return;
            }
            origPlay.call(this, config);
        };
    }

    function handleEmbyClick(movie) {
        if (!isConfigured()) return notify('Настройте Emby в параметрах');
        window.currentMovie = movie;

        findInEmby(movie, (item) => {
            if (!item) return notify('Контент не найден в Emby');
            if (item.Type === 'Series') {
                openSeries(item);
            } else if (item.Type === 'Movie') {
                playMovie(item);
            } else {
                notify('Неизвестный тип контента');
            }
        });
    }

    function addEmbyButton(data) {
        if (!data?.render || !data.movie) return;
        if (data.render.find('.emby-button').length) return;

        const button = $(`
            <div class="full-start__button selector view--emby emby-button" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
                <svg width="40" height="40" viewBox="0 0 40 40">
                    <rect width="40" height="40" rx="8" fill="#00B0FF"/>
                    <text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text>
                </svg>
                <span>${PLUGIN_NAME}</span>
            </div>
        `);
        button.on('hover:enter click', () => handleEmbyClick(data.movie));
        const playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) playButton.after(button);
        else data.render.find('.buttons, .activity__body').append(button);
    }

    function renderSettings(body) {
        body.empty();
        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');
        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${getUrl() || 'Не задано'}</div></div>`);
        urlRow.on('hover:enter click', () => {
            Lampa.Input.edit({title: 'Emby URL', value: getUrl(), free: true}, val => {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });
        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${getApiKey() ? '••••••••••' : 'Не задано'}</div></div>`);
        keyRow.on('hover:enter click', () => {
            Lampa.Input.edit({title: 'Emby API Key', value: getApiKey(), free: true}, val => {
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
        Lampa.Settings.listener.follow('open', e => {
            if (e.name === 'emby') renderSettings(e.body);
        });
    }

    function startPlugin() {
        hookPlayer();
        initSettings();
        Lampa.Listener.follow('full', e => {
            if (e.type === 'complite') {
                addEmbyButton({
                    render: e.object.activity.render(),
                    movie: e.data.movie || e.data.card
                });
            }
        });
        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') startPlugin(); });
})();
