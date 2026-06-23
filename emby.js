(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '1.2.0';

    let embyConfig = {
        server: Lampa.Storage.get('emby_server', 'http://127.0.0.1:8096'),
        apiKey: Lampa.Storage.get('emby_api_key', '')
    };

    function saveConfig() {
        Lampa.Storage.set('emby_server', embyConfig.server);
        Lampa.Storage.set('emby_api_key', embyConfig.apiKey);
    }

    function isConfigured() {
        return embyConfig.server && embyConfig.apiKey;
    }

    function embyRequest(endpoint, onSuccess, onError) {
        if (!isConfigured()) {
            Lampa.Noty.show('Emby не настроен');
            if (onError) onError();
            return;
        }

        const url = `${embyConfig.server}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${embyConfig.apiKey}`;

        new Lampa.Reguest().silent(url, onSuccess, onError || function(){}, false, {
            headers: { 'Accept': 'application/json' }
        });
    }

    function searchInEmby(movie, callback) {
        if (!movie) return callback(null);

        let query = '&Recursive=true&IncludeItemTypes=Movie,Series,Episode&Fields=Path,ProviderIds,Overview';

        const id = movie.imdb_id || movie.imdbid || movie.tmdb_id || movie.id;

        if (id) {
            const provider = movie.imdb_id || movie.imdbid ? `imdb.${id.replace('tt','')}` : `tmdb.${id}`;
            embyRequest(`/Items?AnyProviderIdEquals=${provider}${query}`, 
                (data) => callback(data && data.Items && data.Items[0]),
                () => searchByName(movie, callback)
            );
        } else {
            searchByName(movie, callback);
        }
    }

    function searchByName(movie, callback) {
        const title = encodeURIComponent(movie.title || movie.name || '');
        embyRequest(`/Items?SearchTerm=${title}&IncludeItemTypes=Movie,Series&Recursive=true&Limit=5`, 
            (data) => callback(data && data.Items && data.Items[0]),
            () => callback(null)
        );
    }

    function addEmbyButton(activity) {
        const render = activity.render();
        if (render.find('.emby-button').length) return;

        const btn = $(`
            <div class="button selector emby-button">
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

            searchInEmby(activity.movie || activity.card, (embyItem) => {
                Lampa.Activity.loader(false);

                if (embyItem && embyItem.Id) {
                    const url = `${embyConfig.server}/web/#/details?id=${embyItem.Id}`;
                    window.open(url, '_blank');
                    Lampa.Noty.show(`Открываем: ${embyItem.Name}`);
                } else {
                    Lampa.Noty.show('Не найдено в Emby');
                }
            });
        });

        // Вставляем после кнопки Play
        const playBtn = render.find('.button--play, .view--torrent, .full__btn').first();
        if (playBtn.length) {
            playBtn.after(btn);
        } else {
            render.find('.activity__body .buttons').append(btn);
        }
    }

    function showSettings() {
        const html = $(`
            <div class="settings-param">
                <div class="settings-param__name">Emby Server URL</div>
                <input type="text" id="emby_server" class="settings-param__value" value="${embyConfig.server}" placeholder="http://192.168.0.100:8096"/>
            </div>
            <div class="settings-param">
                <div class="settings-param__name">API Key</div>
                <input type="text" id="emby_api_key" class="settings-param__value" value="${embyConfig.apiKey}" placeholder="xxxxxxxxxxxx"/>
            </div>
            <div class="settings-param">
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
            embyConfig.server = html.find('#emby_server').val().trim();
            embyConfig.apiKey = html.find('#emby_api_key').val().trim();
            saveConfig();
            Lampa.Noty.show('✅ Настройки Emby сохранены');
            Lampa.Modal.close();
        });
    }

    function startPlugin() {
        // Добавление в настройки (современный способ)
        if (Lampa.SettingsApi && Lampa.SettingsApi.addParam) {
            Lampa.SettingsApi.addParam({
                component: 'interface',
                param: { type: 'button' },
                field: {
                    name: PLUGIN_NAME,
                    description: 'Интеграция с Emby/Jellyfin'
                },
                onChange: showSettings
            });
        } else if (Lampa.Settings && Lampa.Settings.add) {
            // запасной вариант
            Lampa.Settings.add({
                name: PLUGIN_NAME,
                description: 'Интеграция с Emby',
                onSelect: showSettings
            });
        }

        // Слушаем карточку
        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                addEmbyButton(e.object.activity || e.data);
            }
        });

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff00; font-weight: bold');
    }

    // Запуск
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', (e) => {
            if (e.type === 'ready') startPlugin();
        });
    }

})();
