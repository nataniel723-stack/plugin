(function () {
    'use strict';

    function EmbyPlugin() {
        if (window.emby_plugin_initialized) return;
        window.emby_plugin_initialized = true;

        // Визуальный отладочный маркер (появится внизу справа)
        var createIndicator = function() {
            if (!$('#emby-indicator').length) {
                $('body').append('<div id="emby-indicator" style="position: fixed; bottom: 15px; right: 15px; background: #52B54B; color: #fff; padding: 5px 10px; z-index: 99999; font-size: 12px; font-weight: bold; border-radius: 4px; opacity: 0.9; pointer-events: none; box-shadow: 0 2px 5px rgba(0,0,0,0.5);">Emby Active v1.2</div>');
            }
        };
        
        if (window.appready) createIndicator();
        else Lampa.Listener.follow('app', function (e) { if (e.type == 'ready') createIndicator(); });

        // 1. НАДЁЖНОЕ ДОБАВЛЕНИЕ НАСТРОЕК (Проверяем все возможные вкладки меню)
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'more' || e.name == 'server' || e.name == 'plugins' || e.name == 'other') {
                
                // Проверяем, чтобы не добавить поля дважды на одном экране
                if (e.body.find('[data-name="emby_url"]').length > 0) return;

                var title = $('<div class="settings-param-title"><span>Локальный сервер Emby</span></div>');
                
                var urlField = $(`
                    <div class="settings-param selector" data-type="input" data-name="emby_url" placeholder="http://192.168.1.145:8096">
                        <div class="settings-param__name">Адрес сервера Emby</div>
                        <div class="settings-param__value"></div>
                        <div class="settings-param__descr">Пример: http://192.168.1.145:8096 (без слэша в конце)</div>
                    </div>
                `);

                var tokenField = $(`
                    <div class="settings-param selector" data-type="input" data-name="emby_token" placeholder="Ваш API Токен">
                        <div class="settings-param__name">API Ключ (Токен)</div>
                        <div class="settings-param__value"></div>
                        <div class="settings-param__descr">Создается в панели Emby -> API-ключи</div>
                    </div>
                `);

                e.body.append(title);
                e.body.append(urlField);
                e.body.append(tokenField);

                // Оживляем элементы для кликов и ввода
                Lampa.Settings.Builder.html(urlField, false, e.body);
                Lampa.Settings.Builder.html(tokenField, false, e.body);
            }
        });

        // 2. ДОБАВЛЕНИЕ КНОПКИ В КАРТОЧКУ (С защитой от гонки рендеринга)
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite' || e.type == 'build') {
                
                // Даем интерфейсу 100мс на завершение отрисовки структуры
                setTimeout(function() {
                    var render = e.object.activity.render();
                    
                    if (render.find('.button--emby').length == 0) {
                        var button = $(`
                            <div class="full-start__button selector button--emby" style="background: #52B54B !important;">
                                <svg height="24" viewBox="0 0 24 24" width="24" style="fill: #fff; margin-right: 5px; vertical-align: middle;">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                                </svg>
                                <span style="color: #fff !important; font-weight: bold;">Смотреть в Emby</span>
                            </div>
                        `);

                        // Ищем блок кнопок по всем известным селекторам Lampa
                        var container = render.find('.full-start__buttons, .info__buttons, .view--buttons').first();
                        
                        if (container.length) {
                            container.append(button);
                            
                            // Обновляем контроллер навигации пульта, чтобы кнопка стала кликабельной
                            if (Lampa.Controller && Lampa.Controller.refresh) {
                                Lampa.Controller.refresh();
                            }
                        }

                        // Логика нажатия
                        button.on('hover:enter', function () {
                            var movie = e.object.movie;
                            var titleToSearch = movie.title || movie.name || movie.original_title;

                            Lampa.Select.show({
                                title: 'Поиск в Emby',
                                items: [{ title: 'Ищем в медиатеке...', subtitle: titleToSearch }],
                                onSelect: function () {},
                                onBack: function () {}
                            });

                            var server = Lampa.Storage.get('emby_url');
                            var token = Lampa.Storage.get('emby_token');

                            if (!server || !token) {
                                Lampa.Select.close();
                                Lampa.Noty.show('Заполните адрес и токен Emby в настройках Lampa!');
                                return;
                            }

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
                                    Lampa.Noty.show('Файл не найден в вашей папке Emby.');
                                }
                            }, function () {
                                Lampa.Select.close();
                                Lampa.Noty.show('Нет связи с Emby. Проверьте сеть и URL.');
                            });
                        });
                    }
                }, 100);
            }
        });

        // 3. ПЛЕЕР И ПЛЕЙЛИСТЫ
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
                    Lampa.Noty.show('Серии в Emby не найдены.');
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
        EmbyPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') EmbyPlugin();
        });
    }
})();
