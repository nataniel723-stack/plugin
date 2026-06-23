(function() {
    'use strict';

    // Название плагина
    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '1.0.0';

    // Настройки по умолчанию
    let embyConfig = {
        server: Lampa.Storage.get('emby_server', 'http://127.0.0.1:8096'),
        apiKey: Lampa.Storage.get('emby_api_key', '')
    };

    // Основные функции
    function saveConfig() {
        Lampa.Storage.set('emby_server', embyConfig.server);
        Lampa.Storage.set('emby_api_key', embyConfig.apiKey);
    }

    // Проверка настроек
    function isConfigured() {
        return embyConfig.server && embyConfig.apiKey;
    }

    // API-запрос к Emby
    function embyRequest(endpoint, params = {}, onSuccess, onError) {
        if (!isConfigured()) {
            Lampa.Noty.show('Emby: Не настроен сервер или API-ключ');
            if (onError) onError('not_configured');
            return;
        }

        const url = `${embyConfig.server}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${embyConfig.apiKey}`;
        
        const network = new Lampa.Reguest();
        network.silent(url, onSuccess, onError || function() {}, params, {
            headers: {
                'Accept': 'application/json'
            }
        });
    }

    // Поиск элемента в Emby (по TMDB/IMDB или названию)
    function searchInEmby(movie, callback) {
        if (!movie) {
            callback(null);
            return;
        }

        // Приоритет: внешние ID
        let queryParams = '&Recursive=true&IncludeItemTypes=Movie,Series,Episode&Fields=Path,ProviderIds,Overview';

        if (movie.imdb_id || movie.imdbid) {
            const imdb = (movie.imdb_id || movie.imdbid).replace('tt', '');
            embyRequest(`/Items?AnyProviderIdEquals=imdb.${imdb}${queryParams}`, {}, 
                (data) => callback(data.Items && data.Items[0]), 
                () => searchByName(movie, callback)
            );
        } else if (movie.tmdb_id) {
            embyRequest(`/Items?AnyProviderIdEquals=tmdb.${movie.tmdb_id}${queryParams}`, {}, 
                (data) => callback(data.Items && data.Items[0]), 
                () => searchByName(movie, callback)
            );
        } else {
            searchByName(movie, callback);
        }
    }

    function searchByName(movie, callback) {
        const title = encodeURIComponent(movie.title || movie.name || '');
        const year = movie.release_date ? movie.release_date.substring(0,4) : '';
        
        embyRequest(`/Items?SearchTerm=${title}&IncludeItemTypes=Movie,Series&Recursive=true&Limit=5&Fields=Path,ProviderIds`, {}, 
            (data) => {
                if (data.Items && data.Items.length) {
                    // Пытаемся найти наиболее подходящий
                    const best = data.Items.find(item => 
                        item.Name.toLowerCase() === (movie.title || '').toLowerCase() ||
                        (year && item.ProductionYear == year)
                    ) || data.Items[0];
                    callback(best);
                } else {
                    callback(null);
                }
            }, 
            () => callback(null)
        );
    }

    // Добавление кнопки "Emby" в карточку
    function addEmbyButton(data) {
        if (data.render.find('.emby-button').length) return;

        const btn = $(`
            <div class="button emby-button">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span>Emby</span>
            </div>
        `);

        btn.on('hover:enter', function() {
            if (!isConfigured()) {
                Lampa.Noty.show('Настройте Emby в параметрах плагина');
                showSettings();
                return;
            }

            Lampa.Activity.loader(true);

            searchInEmby(data.movie, (embyItem) => {
                Lampa.Activity.loader(false);

                if (embyItem) {
                    // Прямая ссылка на просмотр в Emby
                    const playUrl = `${embyConfig.server}/web/#/details?id=${embyItem.Id}&serverId=${embyItem.ServerId || 'default'}`;
                    window.open(playUrl, '_blank');
                    
                    Lampa.Noty.show(`Открываем в Emby: ${embyItem.Name}`);
                } else {
                    Lampa.Noty.show('Не найдено в Emby. Проверьте название или ID.');
                }
            });
        });

        // Вставляем после кнопки "Смотреть"
        const watchBtn = data.render.find('.view--torrent, .button--play, .full__btn').first();
        if (watchBtn.length) {
            watchBtn.after(btn);
        } else {
            data.render.append(btn);
        }
    }

    // Настройки плагина
    function showSettings() {
        const html = $(`
            <div class="settings-param">
                <div class="settings-param__name">Emby Server URL</div>
                <input type="text" class="settings-param__value" id="emby_server" value="${embyConfig.server}" placeholder="http://192.168.1.100:8096"/>
            </div>
            <div class="settings-param">
                <div class="settings-param__name">API Key</div>
                <input type="text" class="settings-param__value" id="emby_api_key" value="${embyConfig.apiKey}" placeholder="Вставьте ваш API ключ"/>
            </div>
            <div class="settings-param">
                <button class="button" id="emby_save">Сохранить</button>
            </div>
        `);

        Lampa.Modal.open({
            title: 'Настройки Emby',
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

    // Регистрация плагина
    function startPlugin() {
        // Добавляем в настройки
        Lampa.Settings.addParam({
            component: 'emby',
            title: PLUGIN_NAME,
            subtitle: 'Интеграция с Emby сервером',
            onSelect: showSettings
        });

        // Слушаем открытие карточки
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                addEmbyButton({
                    render: e.object.activity.render(),
                    movie: e.data.movie
                });
            }
        });

        // Для уже открытой карточки
        try {
            if (Lampa.Activity.active().component === 'full') {
                addEmbyButton({
                    render: Lampa.Activity.active().activity.render(),
                    movie: Lampa.Activity.active().card
                });
            }
        } catch (e) {}

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00bfff; font-weight: bold');
    }

    // Автозапуск
    if (!window.emby_plugin_loaded) {
        window.emby_plugin_loaded = true;
        startPlugin();
    }

})();
