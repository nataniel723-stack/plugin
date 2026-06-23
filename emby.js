(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '1.5.0';

    let config = {
        server: Lampa.Storage.get('emby_server', 'http://127.0.0.1:8096'),
        apikey: Lampa.Storage.get('emby_apikey', '')
    };

    function saveConfig() {
        Lampa.Storage.set('emby_server', config.server);
        Lampa.Storage.set('emby_apikey', config.apikey);
    }

    function isConfigured() {
        return config.server && config.apikey && config.server.length > 10;
    }

    function apiRequest(url, success, error) {
        if (!isConfigured()) {
            Lampa.Noty.show('Emby: Настройте плагин');
            showSettings();
            return;
        }

        const fullUrl = config.server.replace(/\/$/, '') + '/emby' + url + 
                       (url.includes('?') ? '&' : '?') + 'api_key=' + config.apikey;

        new Lampa.Reguest().silent(fullUrl, success, error || (() => {}));
    }

    function findInEmby(movie, cb) {
        if (!movie) return cb(null);

        const query = '&Recursive=true&IncludeItemTypes=Movie,Series,Episode&Fields=Path,ProviderIds,Name';

        if (movie.imdb_id || movie.imdbid) {
            const id = (movie.imdb_id || movie.imdbid).replace('tt','');
            apiRequest(`/Items?AnyProviderIdEquals=imdb.${id}${query}`, (data) => cb(data?.Items?.[0]));
        } else if (movie.tmdb_id || movie.id) {
            const id = movie.tmdb_id || movie.id;
            apiRequest(`/Items?AnyProviderIdEquals=tmdb.${id}${query}`, (data) => cb(data?.Items?.[0]));
        } else {
            const title = encodeURIComponent(movie.title || movie.name || '');
            apiRequest(`/Items?SearchTerm=${title}&Limit=5${query}`, (data) => cb(data?.Items?.[0]));
        }
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
                Lampa.Noty.show('Сначала настройте Emby');
                showSettings();
                return;
            }

            findInEmby(activity.movie || activity.card, (item) => {
                if (item && item.Id) {
                    window.open(`${config.server}/web/#/details?id=${item.Id}`, '_blank');
                    Lampa.Noty.show(`Открыто: ${item.Name}`);
                } else {
                    Lampa.Noty.show('Не найдено в Emby');
                }
            });
        });

        const playBtn = render.find('.button--play, .view--torrent, [data-action="play"]').first();
        if (playBtn.length) {
            playBtn.after(btn);
        } else {
            render.find('.buttons').append(btn);
        }
    }

    function showSettings() {
        const html = $(`
            <div class="modal__content">
                <div class="settings-param">
                    <div class="settings-param__name">Адрес сервера Emby</div>
                    <input type="text" id="emby_server" class="settings-param__value" value="${config.server}" placeholder="http://192.168.1.100:8096"/>
                </div>
                <div class="settings-param">
                    <div class="settings-param__name">API Key</div>
                    <input type="text" id="emby_apikey" class="settings-param__value" value="${config.apikey}" placeholder="Вставьте ваш API-ключ"/>
                </div>
                <button class="button selector" id="emby_save">Сохранить настройки</button>
            </div>
        `);

        Lampa.Modal.open({
            title: 'Emby',
            html: html,
            size: 'large',
            onBack: () => Lampa.Modal.close()
        });

        html.find('#emby_save').on('hover:enter click', () => {
            config.server = html.find('#emby_server').val().trim();
            config.apikey = html.find('#emby_apikey').val().trim();
            saveConfig();
            Lampa.Noty.show('Настройки Emby сохранены');
            Lampa.Modal.close();
        });
    }

    function start() {
        // Добавляем в основные настройки
        Lampa.SettingsApi.addParam({
            component: 'main',
            param: { type: 'button' },
            field: {
                name: PLUGIN_NAME,
                description: 'Подключение к Emby / Jellyfin'
            },
            onChange: showSettings
        });

        // Добавляем запасной вариант в "Интерфейс"
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: { type: 'button' },
            field: {
                name: PLUGIN_NAME,
                description: 'Emby'
            },
            onChange: showSettings
        });

        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                createEmbyButton(e.object.activity || e.data);
            }
        });

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} — загружен`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) start();
    else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') start(); });

})();
