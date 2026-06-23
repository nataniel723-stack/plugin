(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '1.1.0';

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

    function embyRequest(endpoint, params = {}, onSuccess, onError) {
        if (!isConfigured()) {
            Lampa.Noty.show('Emby: Не настроен сервер или API-ключ');
            if (onError) onError('not_configured');
            return;
        }

        const url = `${embyConfig.server}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${embyConfig.apiKey}`;

        const network = new Lampa.Reguest();
        network.silent(url, onSuccess, onError || function(){}, params, {
            headers: { 'Accept': 'application/json' }
        });
    }

    function searchInEmby(movie, callback) {
        if (!movie) return callback(null);

        let query = '&Recursive=true&IncludeItemTypes=Movie,Series,Episode&Fields=Path,ProviderIds,Overview';

        if (movie.imdb_id || movie.imdbid) {
            const imdb = (movie.imdb_id || movie.imdbid).replace('tt', '');
            embyRequest(`/Items?AnyProviderIdEquals=imdb.${imdb}${query}`, {}, 
                (data) => callback(data.Items && data.Items[0]), 
                () => searchByName(movie, callback)
            );
        } else if (movie.tmdb_id || movie.id) {
            const tmdb = movie.tmdb_id || movie.id;
            embyRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${query}`, {}, 
                (data) => callback(data.Items && data.Items[0]), 
                () => searchByName(movie, callback)
            );
        } else {
            searchByName(movie, callback);
        }
    }

    function searchByName(movie, callback) {
        const title = encodeURIComponent(movie.title || movie.name || '');
        embyRequest(`/Items?SearchTerm=${title}&IncludeItemTypes=Movie,Series&Recursive=true&Limit=5&Fields=Path,ProviderIds`, {}, 
            (data) => {
                if (data.Items && data.Items.length) {
                    callback(data.Items[0]);
                } else {
                    callback(null);
                }
            }, 
            () => callback(null)
        );
    }

    function addEmbyButton(data) {
        if (!data || !data.render || data.render.find('.emby-button').length) return;

        const btn = $(`
            <div class="button emby-button" style="margin-left: 10px;">
                <span>Emby</span>
            </div>
        `);

        btn.on('hover:enter', () => {
            if (!isConfigured()) {
                Lampa.Noty.show('Настройте Emby в параметрах');
                showSettings();
                return;
            }

            Lampa.Activity.loader(true);

            searchInEmby(data.movie || data.card, (embyItem) => {
                Lampa.Activity.loader(false);

                if (embyItem && embyItem.Id) {
                    const playUrl = `${embyConfig.server}/web/#/details?id=${embyItem.Id}`;
                    window.open(playUrl, '_blank');
                    Lampa.Noty.show(`Открыто в Emby: ${embyItem.Name}`);
                } else {
                    Lampa.Noty.show('Не найдено в вашей библиотеке Emby');
                }
            });
        });

        // Вставляем кнопку рядом с "Смотреть"
        const watchBtn = data.render.find('.button--play, .view--torrent, .full__btn, .button').first();
        if (watchBtn.length) {
            watchBtn.after(btn);
        } else {
            data.render.find('.activity__body').append(btn);
        }
    }

    function showSettings() {
        const html = $(`
            <div>
                <div class="settings-param">
                    <div class="settings-param__name">Emby Server URL</div>
                    <input type="text" id="emby_server" class="settings-param__value" value="${embyConfig.server}" placeholder="http://192.168.1.100:8096"/>
                </div>
                <div class="settings-param">
                    <div class="settings-param__name">API Key</div>
                    <input type="text" id="emby_api_key" class="settings-param__value" value="${embyConfig.apiKey}" placeholder="Ваш API ключ"/>
                </div>
                <button class="button" id="emby_save">Сохранить настройки</button>
            </div>
        `);

        Lampa.Modal.open({
            title: 'Emby — Настройки',
            html: html,
            size: 'large',
            onBack: () => Lampa.Modal.close()
        });

        html.find('#emby_save').on('click', () => {
            embyConfig.server = html.find('#emby_server').val().trim();
            embyConfig.apiKey = html.find('#emby_api_key').val().trim();
            saveConfig();
            Lampa.Noty.show('Настройки Emby сохранены');
            Lampa.Modal.close();
        });
    }

    function startPlugin() {
        // Регистрация в настройках
        Lampa.SettingsApi.addParam({
            component: 'interface',
            param: { type: 'button' },
            field: {
                name: PLUGIN_NAME,
                description: 'Интеграция с локальным сервером Emby'
            },
            onChange: showSettings
        });

        // Слушаем открытие полной карточки
        Lampa.Listener.follow('full', (e) => {
            if (e.type === 'complite') {
                addEmbyButton({
                    render: e.object.activity.render(),
                    movie: e.data.movie || e.data.card
                });
            }
        });

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} успешно загружен`, 'color: #00bfff; font-weight: bold');
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
