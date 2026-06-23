(function () {
    'use strict';

    function EmbyPlugin() {
        var network = new Lampa.Reguest();

        // 1. Исправленный хук добавления настроек
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'other') { // Реагируем именно на открытие раздела "Остальное"
                var emby_field = $(`
                    <div class="settings-param selector" data-type="input" data-name="emby_server" placeholder="http://192.168.1.X:8096">
                        <div class="settings-param__name">Emby: Адрес сервера</div>
                        <div class="settings-param__value"></div>
                    </div>
                    <div class="settings-param selector" data-type="input" data-name="emby_api_key" placeholder="Ваш API Токен">
                        <div class="settings-param__name">Emby: API Ключ</div>
                        <div class="settings-param__value"></div>
                    </div>
                `);

                // Добавляем элементы в самый конец контейнера "Остальное"
                e.body.append(emby_field);
                
                // Инициализируем элементы через стандартный билдер Lampa, чтобы они стали кликабельными
                Lampa.Settings.Builder.html(emby_field, false, e.body);
            }
        });

        // Вспомогательная функция для запросов
        function embyRequest(endpoint, onsuccess, onerror) {
            var server = Lampa.Storage.get('emby_server');
            var api_key = Lampa.Storage.get('emby_api_key');

            if (!server || !api_key) {
                Lampa.Noty.show("Настройте адрес Emby и API ключ в настройках Lampa (Остальное)!");
                return onerror();
            }

            var url = server + endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + api_key;
            network.silent(url, onsuccess, onerror);
        }

        // 2. Исправленный хук для добавления кнопки в карточку фильма
        Lampa.Listener.follow('full', function (e) {
            // Используем 'complite' — это стандартный статус готовности карточки в Lampa
            if (e.type == 'complite') {
                var movie = e.object.movie;
                var body = e.object.activity.render(); // Получаем DOM-элемент текущей карточки

                // Проверяем, чтобы кнопка случайно не продублировалась
                if (body.find('.button--emby').length == 0) {
                    var embyButton = $(`
                        <div class="full-start__button selector button--emby">
                            <svg height="24" viewBox="0 0 24 24" width="24" style="fill: currentColor; margin-right: 5px; vertical-align: middle;">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                            <span>Emby</span>
                        </div>
                    `);

                    // Находим контейнер с кнопками "Смотреть", "Торренты" и т.д.
                    var buttonsContainer = body.find('.full-start__buttons');
                    if (buttonsContainer.length) {
                        buttonsContainer.append(embyButton);
                    }

                    // Обработчик нажатия на кнопку Emby
                    embyButton.on('hover:enter', function () {
                        Lampa.Select.show({
                            title: 'Поиск в Emby',
                            items: [{ title: 'Ищем файл в медиатеке...', subtitle: 'Пожалуйста, подождите' }],
                            onSelect: function () {},
                            onBack: function () {}
                        });

                        var query = encodeURIComponent(movie.title || movie.name);
                        var isStream = (movie.number_of_seasons || movie.seasons) ? true : false;
                        var searchUrl = '/emby/Items?SearchTerm=' + query + '&IncludeItemTypes=' + (isStream ? 'Series' : 'Movie') + '&Recursive=true';

                        embyRequest(searchUrl, function (result) {
                            if (result && result.Items && result.Items.length > 0) {
                                var item = result.Items[0];
                                
                                if (item.Type === 'Series') {
                                    loadEmbySeasons(item.Id, movie);
                                } else {
                                    playEmbyItem(item);
                                }
                            } else {
                                Lampa.Select.close();
                                Lampa.Noty.show("Фильм не найден в вашей медиатеке Emby.");
                            }
                        }, function () {
                            Lampa.Select.close();
                            Lampa.Noty.show("Ошибка подключения к серверу Emby.");
                        });
                    });
                }
            }
        });

        // Функция загрузки серий для сериала
        function loadEmbySeasons(seriesId, movie) {
            var server = Lampa.Storage.get('emby_server');
            var api_key = Lampa.Storage.get('emby_api_key');
            var episodesUrl = '/emby/Shows/' + seriesId + '/Episodes?Recursive=true';
            
            embyRequest(episodesUrl, function (res) {
                if (res && res.Items && res.Items.length > 0) {
                    var playlist = res.Items.map(function (ep) {
                        return {
                            title: 'С' + ep.ParentIndexNumber + ' : СЕ' + ep.IndexNumber + (ep.Name ? ' — ' + ep.Name : ''),
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

        // Функция запуска фильма
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
