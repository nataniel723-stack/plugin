(function () {
    'use strict';

    var plugin_name = 'Emby Локальный';

    function startPlugin() {
        if (window.emby_plugin_initialized) return;
        window.emby_plugin_initialized = true;

        // Показываем уведомление, что новая версия точно загрузилась
        setTimeout(function() {
            Lampa.Noty.show('✅ ' + plugin_name + ' успешно загружен');
        }, 1500);

        if (!Lampa.Storage.get('emby_url')) Lampa.Storage.set('emby_url', '');
        if (!Lampa.Storage.get('emby_token')) Lampa.Storage.set('emby_token', '');

        // --- 1. ДОБАВЛЕНИЕ СВОЕГО РАЗДЕЛА В КОРЕНЬ НАСТРОЕК ---
        Lampa.Settings.listener.follow('open', function (e) {
            // Добавляем пункт в главное меню настроек
            if (e.name == 'main') {
                var my_folder = $(`
                    <div class="settings-folder__item selector" data-component="emby_settings">
                        <div class="settings-folder__icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                                <line x1="7" y1="2" x2="7" y2="22"></line>
                                <line x1="17" y1="2" x2="17" y2="22"></line>
                                <line x1="2" y1="12" x2="22" y2="12"></line>
                                <line x1="2" y1="7" x2="7" y2="7"></line>
                                <line x1="2" y1="17" x2="7" y2="17"></line>
                                <line x1="17" y1="17" x2="22" y2="17"></line>
                                <line x1="17" y1="7" x2="22" y2="7"></line>
                            </svg>
                        </div>
                        <div class="settings-folder__name">` + plugin_name + `</div>
                    </div>
                `);
                
                e.body.find('.settings-folder').append(my_folder);
            }

            // Рендерим саму страницу нашего раздела, когда на неё кликают
            if (e.name == 'emby_settings') {
                var page = $(`<div></div>`);

                var param_url = $(`
                    <div class="settings-param selector" data-type="input" data-name="emby_url" placeholder="http://192.168.1.145:8096">
                        <div class="settings-param__name">Адрес сервера Emby</div>
                        <div class="settings-param__value">${Lampa.Storage.get('emby_url') || ''}</div>
                        <div class="settings-param__descr">Пример: http://192.168.1.145:8096 (без слэша на конце)</div>
                    </div>
                `);

                var param_token = $(`
                    <div class="settings-param selector" data-type="input" data-name="emby_token" placeholder="Ваш API Токен">
                        <div class="settings-param__name">API Ключ (Токен)</div>
                        <div class="settings-param__value">${Lampa.Storage.get('emby_token') || ''}</div>
                        <div class="settings-param__descr">Создается в панели управления Emby</div>
                    </div>
                `);

                page.append(param_url);
                page.append(param_token);

                e.body.append(page);

                // Инициализируем Lampa Builder, чтобы пульт/мышка могли кликать по полям
                Lampa.Settings.Builder.html(param_url, false, e.body);
                Lampa.Settings.Builder.html(param_token, false, e.body);
            }
        });

        // --- 2. ДОБАВЛЕНИЕ КНОПКИ В КАРТОЧКУ "СМОТРЕТЬ" ---
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                // Создаем кнопку в стиле Filmix, но зеленую
                var btn = $(`
                    <div class="button--emby selector full-start__button" style="background-color: #52B54B;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 7px;">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                        <span style="color: white; font-weight: bold;">Смотреть в Emby</span>
                    </div>
                `);

                btn.on('hover:enter', function () {
                    playFromEmby(e.object.movie);
                });

                // Универсальный поиск блока с кнопками для любых версий Lampa
                var wrap = e.object.activity.render().find('.info__buttons, .view--buttons, .full-start__buttons');
                
                if (wrap.length) {
                    wrap.append(btn); // Добавляем кнопку
                } else {
                    console.log('Не удалось найти контейнер для кнопок в карточке фильма');
                }
            }
        });

        // --- 3. ЛОГИКА ПОИСКА И ВОСПРОИЗВЕДЕНИЯ ---
        function playFromEmby(movie) {
            var server = Lampa.Storage.get('emby_url');
            var token = Lampa.Storage.get('emby_token');
            
            if (!server || !token) {
                Lampa.Noty.show('Сначала зайдите в Настройки -> Emby Локальный и укажите данные!');
                return;
            }

            var titleToSearch = movie.title || movie.name || movie.original_title;
            
            Lampa.Select.show({
                title: 'Поиск в Emby',
                items: [{title: 'Ищем в вашей медиатеке...', subtitle: titleToSearch}],
                onSelect: function(){}, onBack: function(){}
            });

            var query = encodeURIComponent(titleToSearch);
            var searchUrl = server + '/emby/Items?SearchTerm=' + query + '&Recursive=true&Fields=Path&api_key=' + token;

            var network = new Lampa.Reguest();
            network.silent(searchUrl, function (result) {
                if (result && result.Items && result.Items.length > 0) {
                    // Ищем точное совпадение имени или берем первый результат
                    var item = result.Items.find(function(i) {
                        return i.Name.toLowerCase() === titleToSearch.toLowerCase();
                    }) || result.Items[0];

                    // Запускаем в зависимости от типа контента
                    if (item.Type === 'Series' || item.Type === 'TvChannel') {
                        loadSeasons(item.Id, server, token, titleToSearch);
                    } else {
                        playItem(item, server, token);
                    }
                } else {
                    Lampa.Select.close();
                    Lampa.Noty.show('Файл с таким названием не найден в Emby.');
                }
            }, function () {
                Lampa.Select.close();
                Lampa.Noty.show('Ошибка соединения. Проверьте адрес сервера и токен.');
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

    // Безопасный запуск плагина
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') startPlugin();
        });
    }

})();
