(function () {
    'use strict';

    function EmbyPlugin() {
        var network = new Lampa.Reguest(); // Используем встроенный сетевой класс Lampa
        
        // 1. Инициализация настроек
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name == 'component') {
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

                e.body.find('[data-component="other"]').after(emby_field);
                Lampa.Settings.Builder.html(emby_field, e.body);
            }
        });

        // Вспомогательная функция для запросов к Emby API
        function embyRequest(endpoint, params, onsuccess, onerror) {
            var server = Lampa.Storage.get('emby_server');
            var api_key = Lampa.Storage.get('emby_api_key');

            if (!server || !api_key) {
                Lampa.Noty.show("Настройте адрес Emby и API ключ в настройках Lampa!");
                return onerror();
            }

            var url = server + endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + api_key;
            
            network.silent(url, onsuccess, onerror, params);
        }

        // 2. Слушаем открытие карточки фильма
        Lampa.Listener.follow('activity', function (e) {
            if (e.type == 'open' && e.component == 'full') {
                var movie = e.object.movie; // Данные о текущем фильме/сериале
                var card = e.meta.container; // Контейнер карточки

                // Создаем кнопку для добавления под плашку "Смотреть"
                var embyButton = $(`<div class="full-start__button selector button--emby">
                    <svg height="24" viewBox="0 0 24 24" width="24" style="fill: currentColor; margin-right: 5px; vertical-align: middle;"><path d="M8 5v14l11-7z"/></svg>
                    <span>Emby</span>
                </div>`);

                // Внедряем кнопку в панель управления Lampa
                var buttonsContainer = card.find('.full-start__buttons');
                if (buttonsContainer.length) {
                    buttonsContainer.append(embyButton);
                }

                // Клик по кнопке Emby
                embyButton.on('hover:enter', function () {
                    Lampa.Select.show({
                        title: 'Поиск в Emby',
                        items: [{ title: 'Ищем файл...', subtitle: 'Пожалуйста, подождите' }],
                        onSelect: function () {},
                        onBack: function () {}
                    });

                    // Ищем контент по названию (или по ID, если Emby проиндексировал TMDB)
                    var query = encodeURIComponent(movie.title || movie.name);
                    var searchUrl = '/emby/Items?SearchTerm=' + query + '&IncludeItemTypes=' + (movie.number_of_seasons ? 'Series' : 'Movie') + '&Recursive=true&Fields=Path,MediaSources';

                    embyRequest(searchUrl, {}, function (result) {
                        if (result && result.Items && result.Items.length > 0) {
                            var item = result.Items[0]; // Берем первое совпадение
                            
                            // Если это сериал, нужно найти эпизоды
                            if (item.Type === 'Series') {
                                loadEmbySeasons(item.Id, movie);
                            } else {
                                // Если фильм — запускаем воспроизведение напрямую
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
        });

        // Получение сезонов/серий для сериала
        function loadEmbySeasons(seriesId, movie) {
            var server = Lampa.Storage.get('emby_server');
            var api_key = Lampa.Storage.get('emby_api_key');
            
            // Запрашиваем эпизоды сериала
            var episodesUrl = '/emby/Shows/' + seriesId + '/Episodes?Recursive=true&Fields=Path,MediaSources';
            
            embyRequest(episodesUrl, {}, function (res) {
                if (res && res.Items && res.Items.length > 0) {
                    // Формируем список серий для интерфейса Lampa
                    var playlist = res.Items.map(function (ep) {
                        var streamUrl = server + '/emby/videos/' + ep.Id + '/stream.stream?static=true&api_key=' + api_key;
                        return {
                            title: 'Сезон ' + ep.ParentIndexNumber + ' • Серия ' + ep.IndexNumber + (ep.Name ? ' — ' + ep.Name : ''),
                            url: streamUrl
                        };
                    });

                    // Выводим список серий пользователю
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
                    Lampa.Noty.show("Эпизоды сериала в Emby не найдены.");
                }
            }, function () { Lampa.Select.close(); });
        }

        // Запуск прямого проигрывания фильма
        function playEmbyItem(item) {
            Lampa.Select.close();
            var server = Lampa.Storage.get('emby_server');
            var api_key = Lampa.Storage.get('emby_api_key');
            
            // Формируем прямую ссылку на поток без транскодирования (static=true)
            var videoUrl = server + '/emby/videos/' + item.Id + '/stream.stream?static=true&api_key=' + api_key;

            Lampa.Player.play({
                title: item.Name,
                url: videoUrl,
                video: item
            });
        }
    }

    // Регистрация плагина в системе Lampa
    if (window.appready) {
        EmbyPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') EmbyPlugin();
        });
    }
})();
