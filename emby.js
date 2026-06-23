(function () {
    'use strict';

    // Регистрируем наш раздел настроек
    Lampa.Settings.add('emby_settings', {
        name: 'Emby Локальный',
        type: 'html',
        onOpen: function (body) {
            var page = $(`<div></div>`);

            // Поля ввода
            var param_url = Lampa.Template.get('settings_input', {
                name: 'Адрес сервера',
                value: Lampa.Storage.get('emby_url') || ''
            });
            param_url.on('hover:enter', function () {
                Lampa.Input.edit({
                    title: 'Адрес Emby',
                    value: Lampa.Storage.get('emby_url'),
                    free: true
                }, function (new_val) {
                    Lampa.Storage.set('emby_url', new_val);
                    param_url.find('.settings-param__value').text(new_val);
                });
            });

            var param_token = Lampa.Template.get('settings_input', {
                name: 'API Токен',
                value: Lampa.Storage.get('emby_token') || ''
            });
            param_token.on('hover:enter', function () {
                Lampa.Input.edit({
                    title: 'API Токен',
                    value: Lampa.Storage.get('emby_token'),
                    free: true
                }, function (new_val) {
                    Lampa.Storage.set('emby_token', new_val);
                    param_token.find('.settings-param__value').text(new_val);
                });
            });

            page.append(param_url);
            page.append(param_token);
            body.append(page);
        }
    });

    // Добавляем ссылку на этот раздел в главный список настроек
    Lampa.Settings.listener.follow('open', function (e) {
        if (e.name == 'main') {
            var btn = $(`
                <div class="settings-folder__item selector" data-component="emby_settings">
                    <div class="settings-folder__icon"><svg viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg></div>
                    <div class="settings-folder__name">Emby Локальный</div>
                </div>
            `);
            e.body.find('.settings-folder').append(btn);
        }
    });

    // ... (код кнопки в карточке фильма остается таким же, как был ранее)
})();

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
