(function () {
    'use strict';

    function EmbyPlugin() {
        var network = new Lampa.Reguest();

        // 1. ПРАВИЛЬНАЯ ИНИЦИАЛИЗАЦИЯ НАСТРОЕК (как в fx.js)
        // Добавляем новый пункт меню в настройки Lampa
        Lampa.Settings.add({
            title: 'Emby Локальный',
            type: 'open',
            Source: 'emby_settings', // Ключ компонента настроек
            icon: `<svg height="24" viewBox="0 0 24 24" width="24" style="fill: currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`
        });

        // Создаем сам компонент настроек при его открытии
        Lampa.Component.add('emby_settings', function (object) {
            var comp = new Lampa.Interaction();

            comp.create = function () {
                var server = Lampa.Storage.get('emby_server', '');
                var api_key = Lampa.Storage.get('emby_api_key', '');

                var html = $(`
                    <div class="settings-list">
                        <div class="settings-param selector" data-type="input" data-name="emby_server" placeholder="http://192.168.1.X:8096">
                            <div class="settings-param__name">Адрес сервера Emby</div>
                            <div class="settings-param__value">${server || 'Не указан'}</div>
                            <div class="settings-param__descr">Пример: http://192.168.1.50:8096</div>
                        </div>
                        <div class="settings-param selector" data-type="input" data-name="emby_api_key" placeholder="Ваш API Ключ">
                            <div class="settings-param__name">API Ключ (Токен)</div>
                            <div class="settings-param__value">${api_key || 'Не указан'}</div>
                            <div class="settings-param__descr">Создается в панели управления Emby -> API-ключи</div>
                        </div>
                    </div>
                `);

                // Билдим элементы, чтобы они стали кликабельными и открывали клавиатуру ввода
                Lampa.Settings.Builder.html(html, false, html);
                return html;
            };

            return comp;
        });


        // Вспомогательная функция запросов к Emby
        function embyRequest(endpoint, onsuccess, onerror) {
            var server = Lampa.Storage.get('emby_server');
            var api_key = Lampa.Storage.get('emby_api_key');

            if (!server || !api_key) {
                Lampa.Noty.show("Зайдите в Настройки -> Emby Локальный и заполните данные!");
                return onerror ? onerror() : null;
            }

            var url = server + endpoint + (endpoint.indexOf('?') >= 0 ? '&' : '?') + 'api_key=' + api_key;
            network.silent(url, onsuccess, onerror);
        }


        // 2. ДОБАВЛЕНИЕ КНОПКИ "EMBY" В КАРТОЧКУ (Под плашку смотреть)
        Lampa.Listener.follow('full', function (e) {
            // Ждем пока карточка полностью отрендерится ('complite')
            if (e.type == 'complite') {
                var movie = e.object.movie;
                var body = e.object.activity.render();

                // Исключаем дублирование кнопки
                if (body.find('.button--emby').length == 0) {
                    var embyButton = $(`
                        <div class="full-start__button selector button--emby">
                            <svg height="24" viewBox="0 0 24 24" width="24" style="fill: currentColor; margin-right: 5px; vertical-align: middle;">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                            </svg>
                            <span>Смотреть в Emby</span>
                        </div>
                    `);

                    // Находим блок кнопок (Смотреть, Торренты, Трейлер)
                    var buttonsContainer = body.find('.full-start__buttons');
                    if (buttonsContainer.length) {
                        buttonsContainer.append(embyButton);
                    }

                    // Обработчик клика пульта / мыши
                    embyButton.on('hover:enter', function () {
                        Lampa.Select.show({
                            title: 'Поиск в Emby',
                            items: [{ title: 'Ищем в вашей медиатеке...', subtitle: 'Пожалуйста, подождите' }],
                            onSelect: function () {},
                            onBack: function () {}
                        });

                        var query = encodeURIComponent(movie.title || movie.name);
                        var isSerial = (movie.number_of_seasons || movie.seasons || movie.first_air_date) ? true : false;
                        var searchUrl = '/emby/Items?SearchTerm=' + query + '&IncludeItemTypes=' + (isSerial ? 'Series' : 'Movie') + '&Recursive=true';

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
                                Lampa.Noty.show("Контент не найден на вашем сервере Emby.");
                            }
                        }, function () {
                            Lampa.Select.close();
                            Lampa.Noty.show("Ошибка связи с Emby. Проверьте адрес и API ключ.");
                        });
                    });
                }
            }
        });


        // 3. ЛОГИКА СЕРИАЛОВ И ФИЛЬМОВ
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

                    // Открываем встроенное модальное окно выбора серий Lampa
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

    // Регистрация запуска плагина
    if (window.appready) {
        EmbyPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type == 'ready') EmbyPlugin();
        });
    }
})();
