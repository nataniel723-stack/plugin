(function () {
    'use strict';

    if (window.emby_plugin_initialized) return;
    window.emby_plugin_initialized = true;

    // Инициализация хранилища
    if (!Lampa.Storage.get('emby_url')) Lampa.Storage.set('emby_url', '');
    if (!Lampa.Storage.get('emby_token')) Lampa.Storage.set('emby_token', '');

    // --- 1. НАСТРОЙКИ (Встраиваемся в родную вкладку "Сервер") ---
    Lampa.Settings.listener.follow('open', function (e) {
        if (e.name == 'server') {
            e.body.append('<div class="settings-param-title"><span>Медиатека Emby</span></div>');
            
            // Настройка: Адрес
            var prop_url = Lampa.Template.get('settings_input', {
                name: 'Адрес сервера',
                descr: 'Например: http://192.168.1.145:8096 (без слэша)',
                value: Lampa.Storage.get('emby_url')
            });
            
            // Вызов родной клавиатуры Lampa при клике
            prop_url.on('hover:enter', function () {
                Lampa.Input.edit({
                    title: 'Адрес сервера Emby',
                    value: Lampa.Storage.get('emby_url'),
                    free: true,
                    nosave: false
                }, function (new_val) {
                    Lampa.Storage.set('emby_url', new_val);
                    prop_url.find('.settings-param__value').text(new_val);
                });
            });
            
            // Настройка: Токен
            var prop_token = Lampa.Template.get('settings_input', {
                name: 'API Токен',
                descr: 'Сгенерируйте токен в админке Emby',
                value: Lampa.Storage.get('emby_token')
            });
            
            prop_token.on('hover:enter', function () {
                Lampa.Input.edit({
                    title: 'API Токен Emby',
                    value: Lampa.Storage.get('emby_token'),
                    free: true,
                    nosave: false
                }, function (new_val) {
                    Lampa.Storage.set('emby_token', new_val);
                    prop_token.find('.settings-param__value').text(new_val);
                });
            });

            e.body.append(prop_url);
            e.body.append(prop_token);
        }
    });

    // --- 2. ДОБАВЛЕНИЕ КНОПКИ В КАРТОЧКУ ---
    Lampa.Listener.follow('full', function (e) {
        if (e.type == 'complite') {
            // Стандартный класс кнопки Lampa
            var btn = $(`
                <div class="full-start__button selector view--torrent" data-subtitle="Emby">
                    <svg viewBox="0 0 24 24" style="width: 22px; height: 22px; fill: #52B54B; margin-right: 7px; vertical-align: middle;">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                    </svg>
                    <span>Смотреть в Emby</span>
                </div>
            `);

            btn.on('hover:enter', function () {
                startEmbySearch(e.object.movie);
            });

            // Ищем родной контейнер для кнопок
            var wrap = e.object.activity.render().find('.info__buttons, .view--buttons').first();
            if (wrap.length) {
                wrap.append(btn);
            }
        }
    });

    // --- 3. ЛОГИКА ПОИСКА И ПЛЕЕР ---
    function startEmbySearch(movie) {
        var url = Lampa.Storage.get('emby_url');
        var token = Lampa.Storage.get('emby_token');

        if (!url || !token) {
            Lampa.Noty.show('Сначала укажите IP и Токен Emby в Настройки -> Сервер!');
            return;
        }

        var titleToSearch = movie.title || movie.name || movie.original_title;
        
        Lampa.Select.show({
            title: 'Поиск в Emby',
            items: [{ title: 'Ищем: ' + titleToSearch, subtitle: 'Подключение к серверу...' }],
            onSelect: function(){}, onBack: function(){}
        });

        var searchUrl = url + '/emby/Items?SearchTerm=' + encodeURIComponent(titleToSearch) + '&Recursive=true&Fields=Path&api_key=' + token;

        var network = new Lampa.Reguest();
        network.silent(searchUrl, function (result) {
            if (result && result.Items && result.Items.length > 0) {
                // Пытаемся найти точное совпадение
                var item = result.Items.find(function(i) {
                    return i.Name.toLowerCase() === titleToSearch.toLowerCase();
                }) || result.Items[0];

                if (item.Type === 'Series' || item.Type === 'TvChannel') {
                    loadSeasons(item.Id, url, token, titleToSearch);
                } else {
                    playItem(item, url, token);
                }
            } else {
                Lampa.Select.close();
                Lampa.Noty.show('Контент не найден в вашей папке Emby.');
            }
        }, function () {
            Lampa.Select.close();
            Lampa.Noty.show('Нет связи с сервером Emby. Проверьте IP.');
        });
    }

    function loadSeasons(seriesId, server, token, title) {
        var url = server + '/emby/Shows/' + seriesId + '/Episodes?Recursive=true&api_key=' + token;
        var network = new Lampa.Reguest();
        
        network.silent(url, function(res) {
            if (res && res.Items && res.Items.length > 0) {
                var playlist = res.Items.map(function (ep) {
                    return {
                        title: 'Сезон ' + (ep.ParentIndexNumber || 1) + ' Эпизод ' + (ep.IndexNumber || 1) + (ep.Name ? ' — ' + ep.Name : ''),
                        url: server + '/emby/videos/' + ep.Id + '/stream.stream?static=true&api_key=' + token
                    };
                });

                Lampa.Select.show({
                    title: title,
                    items: playlist,
                    onSelect: function (selected) {
                        Lampa.Player.play(selected);
                    },
                    onBack: function () { Lampa.Select.close(); }
                });
            } else {
                Lampa.Select.close();
                Lampa.Noty.show('Эпизоды не найдены.');
            }
        });
    }

    function playItem(item, server, token) {
        Lampa.Select.close();
        Lampa.Player.play({
            title: item.Name,
            url: server + '/emby/videos/' + item.Id + '/stream.stream?static=true&api_key=' + token
        });
    }

    // Уведомление об успешной загрузке
    setTimeout(function() {
        Lampa.Noty.show('✅ Плагин Emby загружен. Настройки во вкладке "Сервер"');
    }, 2000);

})();
