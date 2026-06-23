(function () {
    'use strict';

    function EmbyPlugin() {
        var network = new Lampa.Reguest();

        if (!Lampa.Storage.get('emby_server')) Lampa.Storage.set('emby_server', '');
        if (!Lampa.Storage.get('emby_api_key')) Lampa.Storage.set('emby_api_key', '');

        // 1. Встраивание настроек в раздел "Остальное"
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'other') {
                var emby_title = $('<div class="settings-param-title"><span>Локальный сервер Emby</span></div>');

                var emby_server_field = $(`
                    <div class="settings-param selector" data-type="input" data-name="emby_server" placeholder="http://192.168.1.145:8096">
                        <div class="settings-param__name">Адрес сервера Emby</div>
                        <div class="settings-param__value">${Lampa.Storage.get('emby_server') || 'Не указан'}</div>
                        <div class="settings-param__descr">Ваш адрес: http://192.168.1.145:8096 (без / на конце)</div>
                    </div>
                `);

                var emby_key_field = $(`
                    <div class="settings-param selector" data-type="input" data-name="emby_api_key" placeholder="Ваш API Ключ">
                        <div class="settings-param__name">API Ключ (Токен)</div>
                        <div class="settings-param__value">${Lampa.Storage.get('emby_api_key') || 'Не указан'}</div>
                        <div class="settings-param__descr">Создается в панели Emby -> API-ключи</div>
                    </div>
                `);

                e.body.append(emby_title);
                e.body.append(emby_server_field);
                e.body.append(emby_key_field);

                Lampa.Settings.Builder.html(emby_server_field, false, e.body);
                Lampa.Settings.Builder.html(emby_key_field, false, e.body);
            }
        });

        // Функция запросов к API
        function embyRequest(endpoint, onsuccess, onerror) {
            var server = Lampa.Storage.get('emby_server');
            var api_key = Lampa.Storage.get('emby_api_key');

            if (!server || !api_key) {
                Lampa.Noty.show("Зайдите в Настройки -> Остальное и заполните данные Emby!");
                return onerror ? onerror() : null;
            }

            var url = server + endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + api_key;
            network.silent(url, onsuccess, onerror);
        }

        // 2. Добавление кнопки под плашку "Смотреть"
        Lampa.Listener.follow('full', function (e) {
            if (e.type == 'complite') {
                var movie = e.object.movie;
                var body = e.object.activity.render();

                if (body.find('.button--emby').length == 0) {
                    var embyButton = $(`
                        <div class="full-start__button selector button--emby">
                            <svg height="24" viewBox="0 0 24 24" width="24" style="fill: currentColor; margin-right: 5px; vertical-align: middle;">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                            </svg>
                            <span>Смотреть в Emby</span>
                        </div>
                    `);

                    var buttonsContainer = body.find('.full-start__buttons');
                    if (buttonsContainer.length) {
                        buttonsContainer.append(embyButton);
                    }

                    // Клик по кнопке
                    embyButton.on('hover:enter', function () {
                        Lampa.Select.show({
                            title: 'Поиск в Emby',
                            items: [{ title: 'Ищем в вашей медиатеке...', subtitle: 'Пожалуйста, подождите' }],
                            onSelect: function () {},
                            onBack: function () {}
                        });

                        // Ищем по свойству Name (работает точнее для смешанных папок)
                        var titleToSearch = movie.title || movie.name;
                        var query = encodeURIComponent(titleToSearch);
                        
                        // Запрашиваем поиск без жесткой фильтрации типов контента
                        var searchUrl = '/emby/Items?SearchTerm=' + query + '&Recursive=true&Fields=Path';

                        embyRequest(searchUrl, function (result) {
                            if (result && result.Items && result.Items.length > 0) {
                                // Ищем наиболее точное совпадение по имени
                                var item = result.Items.find(function(i) {
                                    return i.Name.toLowerCase() === titleToSearch.toLowerCase();
                                }) || result.Items[0];
                                
                                // Emby сам скажет, Series это или Movie, независимо от настроек библиотеки
                                if (item.Type === 'Series' || item.Type === 'TvChannel') {
                                    loadEmbySeasons(item.Id, movie);
                                } else {
                                    playEmbyItem(item);
                                }
                            } else {
                                Lampa.Select.close();
                                Lampa.Noty.show("Контент не найден в вашей папке Emby.");
                            }
                        }, function () {
                            Lampa.Select.close();
                            Lampa.Noty.show("Ошибка связи с Emby. Проверьте адрес и токен.");
                        });
                    });
                }
            }
        });

        // 3. Работа с плеером
        function loadEmbySeasons(seriesId, movie) {
            var server = Lampa.Storage.get('emby_server');
            var api_key = Lampa.Storage.get('emby_api_key');
            var episodesUrl = '/emby/Shows/' + seriesId + '/Episodes?Recursive=true';
            
            embyRequest(episodesUrl, function (res) {
                if (res && res.Items && res.Items.length > 0) {
                    var playlist = res.Items.map(function (ep) {
                        return {
                            title: 'Сезон ' + ep.ParentIndexNumber + ' • Серия ' + ep.IndexNumber + (ep.Name ? ' — ' + ep.Name : ''),
                            url: server + '/emby/videos/' + ep.Id + '/stream.stream?static=true&api_key=' + api_key
                        };
                    });

                    Lampa.Select.show({
                        title: movie.name || movie.title,
                        items: playlist,
                        onSelect: function (selectedItem) {
                            Lampa.Player.play({
                                title: selectedItem.title,
                                url: selectedItem.url
                            });
                        },
                        onBack: function () {
                            Lampa.Select.close();
                        }
                    });
                } else {
                    Lampa.Select.close();
                    Lampa.Noty.show("Серии сериала в Emby не найдены.");
                }
            }, function () { Lampa.Select.close(); });
        }

        function playEmbyItem(item) {
            Lampa.Select.close();
            var server = Lampa.Storage.get('emby_server');
            var api_key = Lampa.Storage.get('emby_api_key');
            var videoUrl = server + '/emby/videos/' + item.Id + '/stream.stream?static=true&api_key=' + api_key;

            Lampa.Player.play({
                title: item.Name,
                url: videoUrl
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
