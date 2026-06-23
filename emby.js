(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '1.6.0';

    const STORAGE_URL = 'emby_url';
    const STORAGE_TOKEN = 'emby_token';

    const network = new Lampa.Reguest();

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://127.0.0.1:8096') || '').trim();
    }

    function getToken() {
        return (Lampa.Storage.get(STORAGE_TOKEN, '') || '').trim();
    }

    function isConfigured() {
        const url = getUrl();
        const token = getToken();
        return url.length > 10 && token.length > 5;
    }

    function notify(msg) {
        Lampa.Noty.show(msg);
    }

    function editField(title, value, callback) {
        Lampa.Input.edit({
            title: title,
            value: value,
            free: true,
            nosave: true
        }, callback);
    }

    function apiRequest(endpoint, success, error) {
        if (!isConfigured()) {
            notify('Сначала настройте Emby');
            return;
        }

        const base = getUrl().replace(/\/$/, '');
        const url = base + '/emby' + endpoint + 
                   (endpoint.includes('?') ? '&' : '?') + 'api_key=' + getToken();

        network.silent(url, success, error || (() => {}), false, {
            headers: { 'Accept': 'application/json' }
        });
    }

    function findInEmby(movie, callback) {
        if (!movie) return callback(null);

        const query = '&Recursive=true&IncludeItemTypes=Movie,Series,Episode&Fields=Path,ProviderIds,Name,Id';

        // Приоритет по ID
        if (movie.imdb_id || movie.imdbid) {
            const id = (movie.imdb_id || movie.imdbid).replace('tt', '');
            apiRequest(`/Items?AnyProviderIdEquals=imdb.${id}${query}`, (data) => {
                callback(data && data.Items && data.Items[0]);
            });
            return;
        }

        if (movie.tmdb_id || movie.id) {
            const id = movie.tmdb_id || movie.id;
            apiRequest(`/Items?AnyProviderIdEquals=tmdb.${id}${query}`, (data) => {
                callback(data && data.Items && data.Items[0]);
            });
            return;
        }

        // Поиск по названию
        const title = encodeURIComponent(movie.title || movie.name || '');
        apiRequest(`/Items?SearchTerm=${title}&Limit=5${query}`, (data) => {
            callback(data && data.Items && data.Items[0]);
        });
    }

    function createEmbyButton(activity) {
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

        btn.on('hover:enter', function() {
            if (!isConfigured()) {
                notify('Настройте Emby в параметрах');
                return;
            }

            findInEmby(activity.movie || activity.card, (item) => {
                if (item && item.Id) {
                    const webUrl = getUrl().replace(/\/$/, '') + `/web/#/details?id=${item.Id}`;
                    window.open(webUrl, '_blank');
                    notify(`Открыто в Emby: ${item.Name}`);
                } else {
                    notify('Не найдено в Emby. Проверьте название/ID в библиотеке.');
                }
            });
        });

        // Вставка после кнопки "Смотреть" (как в fx.js)
        const playBtn = render.find('.button--play, .view--torrent, .full__btn, [data-action="play"]').first();
        if (playBtn.length) {
            playBtn.after(btn);
        } else {
            render.find('.buttons, .activity__body').append(btn);
        }
    }

    function renderSettings(body) {
        body.empty();

        const url = getUrl();
        const token = getToken();

        const wrap = $('<div class="settings-container"></div>');

        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        // URL
        const urlRow = $(`
            <div class="settings-param selector">
                <div class="settings-param__name">Emby Server URL</div>
                <div class="settings-param__value">${url || 'Не задано'}</div>
            </div>
        `);
        urlRow.on('hover:enter', () => {
            editField('Emby Server URL (например: http://192.168.1.100:8096)', url, (val) => {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        // API Key
        const tokenRow = $(`
            <div class="settings-param selector">
                <div class="settings-param__name">API Key</div>
                <div class="settings-param__value">${token ? '********' : 'Не задано'}</div>
            </div>
        `);
        tokenRow.on('hover:enter', () => {
            editField('API Key Emby', token, (val) => {
                Lampa.Storage.set(STORAGE_TOKEN, val);
                tokenRow.find('.settings-param__value').text(val ? '********' : 'Не задано');
            });
        });

        wrap.append(urlRow);
        wrap.append(tokenRow);
        body.append(wrap);
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'emby',
            name: 'Emby',
            icon: '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#3498db"/><text x="50%" y="55%" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>'
        });

        Lampa.Settings.listener.follow('open', function(e) {
            if (e.name !== 'emby') return;
            renderSettings(e.body);
        });
    }

    function startPlugin() {
        initSettings();

        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                createEmbyButton(e.object.activity || e.data);
            }
        });

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', (e) => {
        if (e.type === 'ready') startPlugin();
    });

})();
