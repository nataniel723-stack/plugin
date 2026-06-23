(function () {
    'use strict';

    function EmbyPlugin() {
        // Защита от двойного запуска плагина
        if (window.emby_plugin_initialized) return;
        window.emby_plugin_initialized = true;

        // Создаем дефолтные значения в кэше Lampa
        if (!Lampa.Storage.get('emby_url')) Lampa.Storage.set('emby_url', '');
        if (!Lampa.Storage.get('emby_token')) Lampa.Storage.set('emby_token', '');

        // 1. ДОБАВЛЕНИЕ НАСТРОЕК (Вкладка "Сервер")
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'server') { // Вкладка "Сервер" надежнее всего
                var settingsHtml = $(`
                    <div class="settings-param-title"><span>Локальная медиатека Emby</span></div>
                    <div class="settings-param selector" data-type="input" data-name="emby_url" placeholder="http://192.168.1.145:8096">
                        <div class="settings-param__name">Адрес сервера Emby</div>
                        <div class="settings-param__value">${Lampa.Storage.get('emby_url') || 'Не указан'}</div>
                        <div class="settings-param__descr">Пример: http://192.168.1.145:8096 (без слэша на конце)</div>
                    </div>
                    <div class="settings-param selector" data-type="input" data-name="emby_token" placeholder="Ваш API Ключ">
                        <div class="settings-param__name">API Ключ (Токен)</div>
                        <div class="settings-param__value">${Lampa.Storage.get('emby_token') || 'Не указан'}</div>
                        <div class="settings-param__descr">Создается в админке Emby (Настройки -> API-ключи)</div>
                    </div>
                `);

                e.body.append(settingsHtml);
                
                // Оживляем поля для ввода через пульт
                e.body.find('[data-name="emby_url"], [data-name="emby_token"]').each(function() {
                    Lampa.Settings.Builder.html($(this), false, e.body);
                });
            }
        });

        // 2. ДОБАВЛЕНИЕ КНОПКИ (Используем хук 'build')
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'build') { // Срабатывает 100% при сборке карточки
                // Делаем кнопку зеленой, в стиле Emby
                var button = $(`
                    <div class="full-start__button selector button--emby" style="background: #52B54B;">
                        <svg height="24" viewBox="0 0 24 24" width="24" style="fill: #fff; margin-right: 5px; vertical-align: middle;">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                        <span style="color: #fff;">Emby</span>
                    </div>
                `);

                // Вставляем кнопку в список
                e.object.activity.render().find('.full-start__buttons').append(button);

                // Обработчик нажатия на кнопку
                button.on('hover:enter', function () {
                    var movie = e.object.movie;
                    var titleToSearch = movie.title || movie.name || movie.original_title;
                    
                    Lampa.Select.show({
                        title: 'Поиск в Emby',
                        items: [{ title: 'Ищем: ' + titleToSearch, subtitle: 'Подключение к серверу...' }],
                        onSelect: function () {},
                        onBack: function () {}
                    });

                    var server = Lampa.Storage.get('emby_url');
                    var token = Lampa.Storage.get('emby_token');

                    if (!server || !token) {
                        Lampa.Select.close();
                        Lampa.Noty.show('Укажите адрес и токен Emby в настройках Lampa (раздел Сервер).');
                        return;
                    }

                    var query = encodeURIComponent(titleToSearch);
                    var url = server + '/emby/Items?SearchTerm=' + query + '&Recursive=true&Fields=Path&api_key=' + token;

                    var network = new Lampa.Reguest();
                    network.silent(url, function (result) {
                        if (result && result.Items && result.Items.length > 0) {
                            // Ищем точное совпадение имени или берем первое
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
                            Lampa.Noty.show('Контент не найден в локальной медиатеке.');
                        }
                    }, function () {
                        Lampa.Select.close();
                        Lampa.Noty.show('Ошибка соединения с Emby. Проверьте адрес и токен.');
                    });
                });
            }
        });

        // 3. ФУНКЦИИ ВОСПРОИЗВЕДЕНИЯ
        function loadSeasons(seriesId, server, token, title) {
            var url = server + '/emby/Shows/' + seriesId + '/Episodes?Recursive=true&api_key=' + token;
            var network = new Lampa.Reguest();
            
            network.silent(url, function(res) {
                if (res && res.Items && res.Items.length > 0) {
                    var playlist = res.Items.map(function (ep) {
                        return {
                            title: 'Сезон ' + ep.ParentIndexNumber + ' : Эпизод ' + ep.IndexNumber + (ep.Name ? ' — ' + ep.Name : ''),
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
    }

    // Правильный запуск при старте Lampa
    if (window.appready) {
        EmbyPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') EmbyPlugin();
        });
    }

})();
