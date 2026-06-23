(function () {
    'use strict';

    var plugin_name = 'Emby Локальный';

    function startPlugin() {
        if (window.emby_plugin_initialized) return;
        window.emby_plugin_initialized = true;

        setTimeout(function() {
            Lampa.Noty.show('✅ ' + plugin_name + ' установлен (Fx-архитектура)');
        }, 1000);

        if (!Lampa.Storage.get('emby_url')) Lampa.Storage.set('emby_url', '');
        if (!Lampa.Storage.get('emby_token')) Lampa.Storage.set('emby_token', '');

        // --- 1. НАСТРОЙКИ (ЧЕРЕЗ НАТИВНЫЕ ШАБЛОНЫ LAMPA) ---
        Lampa.Settings.listener.follow('open', function (e) {
            // Добавляем пункт в главное меню
            if (e.name == 'main') {
                var item = $(`
                    <div class="settings-folder__item selector" data-component="emby_settings">
                        <div class="settings-folder__icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polygon points="10 8 16 12 10 16 10 8"></polygon>
                            </svg>
                        </div>
                        <div class="settings-folder__name">` + plugin_name + `</div>
                    </div>
                `);
                e.body.find('.settings-folder').append(item);
            }

            // Рендерим страницу настроек
            if (e.name == 'emby_settings') {
                // Используем движок Lampa для сборки правильного HTML
                var param_url = Lampa.Template.get('settings_input', {
                    name: 'Адрес сервера Emby',
                    value: Lampa.Storage.get('emby_url') || '',
                    descr: 'Пример: http://192.168.1.145:8096 (без слэша)'
                });
                param_url.attr('data-name', 'emby_url');

                var param_token = Lampa.Template.get('settings_input', {
                    name: 'API Ключ (Токен)',
                    value: Lampa.Storage.get('emby_token') || '',
                    descr: 'Ваш токен доступа из панели Emby'
                });
                param_token.attr('data-name', 'emby_token');

                e.body.append(param_url);
                e.body.append(param_token);

                // Оживляем для мышки и пульта
                Lampa.Settings.Builder.html(param_url, false, e.body);
                Lampa.Settings.Builder.html(param_token, false, e.body);
            }
        });

        // --- 2. ДОБАВЛЕНИЕ КНОПКИ В КАРТОЧКУ ---
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                // Создаем кнопку, мимикрирующую под встроенные плагины (класс view--torrent)
                var btn = $(`
                    <div class="full-start__button selector view--torrent" data-subtitle="Emby">
                        <svg viewBox="0 0 24 24" style="fill: #52B54B; margin-right: 7px; width: 22px; height: 22px; vertical-align: middle;">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                        <span>Смотреть в Emby</span>
                    </div>
                `);

                btn.on('hover:enter', function () {
                    playFromEmby(e.object.movie);
                });

                // Вставляем сразу после первой кнопки карточки
                var buttonsContainer = e.object.activity.render().find('.info__buttons, .view--buttons, .full-start__buttons');
                if (buttonsContainer.length) {
                    var firstBtn = buttonsContainer.find('.selector').first();
                    if (firstBtn.length) {
                        btn.insertAfter(firstBtn);
                    } else {
                        buttonsContainer.append(btn);
                    }
                }
            }
        });

        // --- 3. ПОИСК И ПЛЕЕР ---
        function playFromEmby(movie) {
            var server = Lampa.Storage.get('emby_url');
            var token = Lampa.Storage.get('emby_token');
            
            if (!server || !token) {
                Lampa.Noty.show('Зайдите в Настройки -> Emby Локальный и укажите данные!');
                return;
            }

            var titleToSearch = movie.title || movie.name || movie.original_title;
            
            Lampa.Select.show({
                title: 'Поиск в Emby',
                items: [{title: 'Ищем в медиатеке...', subtitle: titleToSearch}],
                onSelect: function(){}, onBack: function(){}
            });

            var query = encodeURIComponent(titleToSearch);
            var searchUrl = server + '/emby/Items?SearchTerm=' + query + '&Recursive=true&Fields=Path&api_key=' + token;

            var network = new Lampa.Reguest();
            network.silent(searchUrl, function (result) {
                if (result && result.Items && result.Items.length > 0) {
                    var item = result.Items.find(function(i) {
                        return i.Name.toLowerCase() === titleToSearch.toLowerCase();
                    }) || result.Items[0];

                    if (item.Type === 'Series' || item.Type === 'TvChannel') {
                        loadSeasons(item.Id, server, token, titleToSearch);
                    } else {
                        playItem(item, server, token);
                    }
                } else {
                    Lampa.Select.close();
                    Lampa.Noty.show('Файл с таким названием не найден.');
                }
            }, function () {
                Lampa.Select.close();
                Lampa.Noty.show('Нет связи с Emby. Проверьте адрес сервера.');
            });
        }

        function loadSeasons(seriesId, server, token, title) {
            var url = server + '/emby/Shows/' + seriesId + '/Episodes?Recursive=true&api_key=' + token;
            var network = new Lampa.Reguest();
            
            network.silent(url, function(res) {
                if (res && res.Items && res.Items.length > 0) {
                    var playlist = res.Items.map(function (ep) {
                        return {
                            title: 'Сезон ' + ep.ParentIndexNumber + ' • Серия ' + ep.IndexNumber + (ep.Name ? ' — ' + ep.Name : ''),
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
                    Lampa.Noty.show('Эпизоды сериала не найдены.');
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
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') startPlugin();
        });
    }

})();
