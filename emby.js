(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '1.3.0';

    let config = {
        server: Lampa.Storage.get('emby_server', 'http://127.0.0.1:8096'),
        apikey: Lampa.Storage.get('emby_apikey', '')
    };

    function saveConfig() {
        Lampa.Storage.set('emby_server', config.server);
        Lampa.Storage.set('emby_apikey', config.apikey);
    }

    function isConfigured() {
        return config.server && config.apikey;
    }

    function apiRequest(url, success, error) {
        if (!isConfigured()) {
            Lampa.Noty.show('Emby: укажите адрес и API-ключ');
            return;
        }

        const fullUrl = config.server + '/emby' + url + (url.includes('?') ? '&' : '?') + 'api_key=' + config.apikey;

        new Lampa.Reguest().silent(fullUrl, success, error || (() => {}), false, {
            headers: { 'Accept': 'application/json' }
        });
    }

    function findInEmby(movie, cb) {
        if (!movie) return cb(null);

        let query = '&Recursive=true&IncludeItemTypes=Movie,Series,Episode&Fields=Path,ProviderIds';

        // По ID (лучший способ)
        if (movie.imdb_id || movie.imdbid) {
            const id = (movie.imdb_id || movie.imdbid).replace('tt', '');
            apiRequest(`/Items?AnyProviderIdEquals=imdb.${id}${query}`, (data) => {
                cb(data.Items && data.Items[0]);
            }, () => cb(null));
        } 
        else if (movie.tmdb_id || movie.id) {
            const id = movie.tmdb_id || movie.id;
            apiRequest(`/Items?AnyProviderIdEquals=tmdb.${id}${query}`, (data) => {
                cb(data.Items && data.Items[0]);
            }, () => cb(null));
        } 
        else {
            // По названию
            const title = encodeURIComponent(movie.title || movie.name || '');
            apiRequest(`/Items?SearchTerm=${title}&Limit=3${query}`, (data) => {
                cb(data.Items && data.Items[0]);
            }, () => cb(null));
        }
    }

    function createEmbyButton(activity) {
        const render = activity.render ? activity.render() : $('.activity__body');
        if (render.find('.emby-button').length) return;

        const btn = $(`
            <div class="button selector emby-button">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                <span>Emby</span>
            </div>
        `);

        btn.on('hover:enter', function() {
            if (!isConfigured()) {
                Lampa.Noty.show('Настройте Emby');
                showSettings();
                return;
            }

            Lampa.Activity.loader(true);

            findInEmby(activity.movie || activity.card, (item) => {
                Lampa.Activity.loader(false);

                if (item && item.Id) {
                    window.open(`${config.server}/web/#/details?id=${item.Id}`, '_blank');
                    Lampa.Noty.show(`Открыто в Emby: ${item.Name}`);
                } else {
                    Lampa.Noty.show('Не найдено в Emby');
                }
            });
        });

        const playBtn = render.find('.button--play, .view--torrent, .full__btn').first();
        if (playBtn.length) {
            playBtn.after(btn);
        } else {
            render.find('.buttons, .activity__body').append(btn);
        }
    }

    function showSettings() {
        const html = $(`
            <div>
                <div class="settings-param">
                    <div class="settings-param__name">Emby Server URL</div>
                    <input type="text" id="emby_server" class="settings-param__value" value="${config.server}" placeholder="http://192.168.1.100:8096"/>
                </div>
                <div class="settings-param">
                    <div class="settings-param__name">API Key</div>
                    <input type="text" id="emby_apikey" class="settings-param__value" value="${config.apikey}" placeholder="Вставьте API ключ"/>
                </div>
                <button class="button selector" id="emby_save">Сохранить</button>
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
        // Добавление в Настройки → Расширения / Интерфейс
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: { type: 'button' },
            field: {
                name: PLUGIN_NAME,
                description: 'Локальный сервер Emby / Jellyfin'
            },
            onChange: showSettings
        });

        // Кнопка в карточке
        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                createEmbyButton(e.object.activity || e.data);
            }
        });

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} — загружен`, 'color: #00ff88; font-weight: bold');
    }

    // Автозапуск
    if (window.appready) start();
    else Lampa.Listener.follow('app', (e) => { if (e.type === 'ready') start(); });

})();
