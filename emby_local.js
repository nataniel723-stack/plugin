(function () {
    'use strict';

    // Названия ключей в Storage
    var STORAGE_URL_KEY   = 'emby_url';
    var STORAGE_TOKEN_KEY = 'emby_token';

    // Безопасно создаём один экземпляр сетевого клиента
    var network = new Lampa.Reguest();

    /**
     * Получить базовый URL Emby из Storage
     * Пример: http://192.168.1.10:8096
     */
    function getBaseUrl() {
        var url = Lampa.Storage.get(STORAGE_URL_KEY, '');
        return (typeof url === 'string') ? url.trim() : '';
    }

    /**
     * Получить API Token Emby из Storage
     */
    function getToken() {
        var token = Lampa.Storage.get(STORAGE_TOKEN_KEY, '');
        return (typeof token === 'string') ? token.trim() : '';
    }

    /**
     * Показать уведомление Lampa
     */
    function notify(text) {
        if (!text) return;
        Lampa.Noty.show(text);
    }

    /**
     * Ввод строки через нативную клавиатуру Lampa
     */
    function editInput(params) {
        // params: { title, value, onSave }
        Lampa.Input.edit({
            title: params.title || '',
            value: params.value || '',
            type: 'text',
            free: true,
            nosave: true
        }, function (newValue) {
            if (typeof params.onSave === 'function') {
                params.onSave(newValue || '');
            }
        });
    }

    /**
     * Регистрация вкладки настроек Emby
     */
    function initSettings() {
        // Добавляем раздел в настройки
        Lampa.Settings.add({
            id: 'emby',
            name: 'Emby',
            icon: 'folder',
            category: 'plugins',
            // Контент будет собираться при открытии
            onRender: function (body) {
                renderSettings(body);
            }
        });

        // Гарантируем корректное отображение при открытии
        Lampa.Settings.listener.follow('open', function (e) {
            if (!e || e.name !== 'emby') return;

            // e.body — контейнер вкладки настроек
            if (e.body) {
                e.body.empty();
                renderSettings(e.body);
            }
        });
    }

    /**
     * Рендер полей настроек Emby
     */
    function renderSettings(body) {
        if (!body) return;

        var baseUrl  = getBaseUrl();
        var apiToken = getToken();

        // Поле: URL сервера Emby
        var urlItem = Lampa.Template.get('settings_input');
        urlItem.find('.settings-param__name').text('Emby URL');
        urlItem.find('.settings-param__value').text(baseUrl || 'Не задано');

        urlItem.on('hover:enter', function () {
            editInput({
                title: 'Emby URL (например: http://192.168.1.10:8096)',
                value: getBaseUrl(),
                onSave: function (val) {
                    Lampa.Storage.set(STORAGE_URL_KEY, val);
                    urlItem.find('.settings-param__value').text(val || 'Не задано');
                }
            });
        });

        // Поле: API Token
        var tokenItem = Lampa.Template.get('settings_input');
        tokenItem.find('.settings-param__name').text('Emby API Token');
        tokenItem.find('.settings-param__value').text(apiToken ? '********' : 'Не задано');

        tokenItem.on('hover:enter', function () {
            editInput({
                title: 'Emby API Token',
                value: getToken(),
                onSave: function (val) {
                    Lampa.Storage.set(STORAGE_TOKEN_KEY, val);
                    tokenItem.find('.settings-param__value').text(val ? '********' : 'Не задано');
                }
            });
        });

        body.append(urlItem);
        body.append(tokenItem);
    }

    /**
     * Поиск в Emby по названию
     * @param {String} title
     * @param {Function} callback (error, items)
     */
    function searchInEmby(title, callback) {
        var baseUrl = getBaseUrl();
        var token   = getToken();

        if (!baseUrl || !token) {
            notify('Emby: укажите URL и API Token в настройках');
            if (callback) callback('no-config');
            return;
        }

        if (!title) {
            notify('Emby: не удалось определить название');
            if (callback) callback('no-title');
            return;
        }

        var url = baseUrl.replace(/\/+$/, '') +
            '/emby/Items?SearchTerm=' + encodeURIComponent(title) +
            '&IncludeItemTypes=Movie,Series' +
            '&Limit=20' +
            '&api_key=' + encodeURIComponent(token);

        network.native(url, function (json) {
            if (!json || !Array.isArray(json.Items)) {
                if (callback) callback('bad-response');
                return;
            }
            callback && callback(null, json.Items);
        }, function () {
            notify('Emby: ошибка сети');
            callback && callback('network-error');
        });
    }

    /**
     * Получить сезоны сериала
     */
    function getSeasons(showId, callback) {
        var baseUrl = getBaseUrl();
        var token   = getToken();

        var url = baseUrl.replace(/\/+$/, '') +
            '/emby/Shows/' + encodeURIComponent(showId) +
            '/Seasons?api_key=' + encodeURIComponent(token);

        network.native(url, function (json) {
            if (!json || !Array.isArray(json.Items)) {
                callback && callback('bad-response');
                return;
            }
            callback && callback(null, json.Items);
        }, function () {
            notify('Emby: ошибка загрузки сезонов');
            callback && callback('network-error');
        });
    }

    /**
     * Получить эпизоды сезона
     */
    function getEpisodes(showId, seasonId, callback) {
        var baseUrl = getBaseUrl();
        var token   = getToken();

        var url = baseUrl.replace(/\/+$/, '') +
            '/emby/Shows/' + encodeURIComponent(showId) +
            '/Episodes?SeasonId=' + encodeURIComponent(seasonId) +
            '&api_key=' + encodeURIComponent(token);

        network.native(url, function (json) {
            if (!json || !Array.isArray(json.Items)) {
                callback && callback('bad-response');
                return;
            }
            callback && callback(null, json.Items);
        }, function () {
            notify('Emby: ошибка загрузки эпизодов');
            callback && callback('network-error');
        });
    }

    /**
     * Построить URL потока для фильма/эпизода
     */
    function buildStreamUrl(itemId) {
        var baseUrl = getBaseUrl();
        var token   = getToken();

        // Простой прямой поток (можно заменить на HLS при необходимости)
        return baseUrl.replace(/\/+$/, '') +
            '/emby/Videos/' + encodeURIComponent(itemId) +
            '/stream?static=true&api_key=' + encodeURIComponent(token);
    }

    /**
     * Запуск воспроизведения в Lampa.Player
     */
    function playItem(item) {
        if (!item || !item.Id) {
            notify('Emby: не удалось получить данные для воспроизведения');
            return;
        }

        var url   = buildStreamUrl(item.Id);
        var title = item.Name || 'Emby';

        Lampa.Player.play({
            title: title,
            url: url,
            timeline: 0
        });
    }

    /**
     * Показать выбор сезонов и эпизодов
     */
    function showSeriesFlow(seriesItem) {
        if (!seriesItem || !seriesItem.Id) {
            notify('Emby: некорректные данные сериала');
            return;
        }

        // 1. Загружаем сезоны
        getSeasons(seriesItem.Id, function (err, seasons) {
            if (err || !seasons || !seasons.length) {
                notify('Emby: сезоны не найдены');
                return;
            }

            var seasonItems = seasons.map(function (s) {
                return {
                    title: s.Name || ('Сезон ' + (s.IndexNumber || '')),
                    id: s.Id,
                    _raw: s
                };
            });

            Lampa.Select.show({
                title: 'Выберите сезон',
                items: seasonItems,
                onSelect: function (season) {
                    if (!season || !season.id) return;

                    // 2. Загружаем эпизоды выбранного сезона
                    getEpisodes(seriesItem.Id, season.id, function (errEp, episodes) {
                        if (errEp || !episodes || !episodes.length) {
                            notify('Emby: эпизоды не найдены');
                            return;
                        }

                        var episodeItems = episodes.map(function (e) {
                            var epTitle = '';
                            if (typeof e.IndexNumber === 'number') {
                                epTitle = 'S' + (e.ParentIndexNumber || 1) +
                                    'E' + e.IndexNumber + ' — ' + (e.Name || '');
                            } else {
                                epTitle = e.Name || 'Эпизод';
                            }

                            return {
                                title: epTitle,
                                id: e.Id,
                                _raw: e
                            };
                        });

                        Lampa.Select.show({
                            title: 'Выберите эпизод',
                            items: episodeItems,
                            onSelect: function (ep) {
                                if (!ep || !ep._raw) return;
                                playItem(ep._raw);
                            },
                            onBack: function () {
                                // Возврат к выбору сезона
                                showSeriesFlow(seriesItem);
                            }
                        });
                    });
                },
                onBack: function () {
                    // Просто закрываем выбор
                }
            });
        });
    }

    /**
     * Обработка нажатия кнопки "Смотреть в Emby"
     */
    function handleWatchInEmby(data) {
        if (!data) return;

        // Пытаемся вытащить название
        var movie = data.movie || data.card || data;
        var title = movie && (movie.name || movie.title || movie.original_title || movie.original_name);

        if (!title && data.card && data.card.data) {
            var d = data.card.data;
            title = d.name || d.title || d.original_title || d.original_name;
        }

        if (!title) {
            notify('Emby: не удалось определить название');
            return;
        }

        searchInEmby(title, function (err, items) {
            if (err || !items || !items.length) {
                notify('Emby: ничего не найдено');
                return;
            }

            // Если найден один элемент и это фильм — сразу играем
            if (items.length === 1 && items[0].Type === 'Movie') {
                playItem(items[0]);
                return;
            }

            // Разделяем фильмы и сериалы
            var movies = [];
            var series = [];

            items.forEach(function (it) {
                if (!it || !it.Type) return;
                if (it.Type === 'Movie') movies.push(it);
                else if (it.Type === 'Series') series.push(it);
            });

            // Если есть и фильмы, и сериалы — даём выбор
            var selectItems = [];

            series.forEach(function (s) {
                selectItems.push({
                    title: '[Сериал] ' + (s.Name || ''),
                    type: 'series',
                    _raw: s
                });
            });

            movies.forEach(function (m) {
                selectItems.push({
                    title: '[Фильм] ' + (m.Name || ''),
                    type: 'movie',
                    _raw: m
                });
            });

            if (!selectItems.length) {
                notify('Emby: подходящих результатов нет');
                return;
            }

            // Если один результат любого типа — обрабатываем напрямую
            if (selectItems.length === 1) {
                var only = selectItems[0];
                if (only.type === 'movie') playItem(only._raw);
                else if (only.type === 'series') showSeriesFlow(only._raw);
                return;
            }

            // Иначе показываем выбор
            Lampa.Select.show({
                title: 'Результаты Emby',
                items: selectItems,
                onSelect: function (choice) {
                    if (!choice || !choice._raw) return;
                    if (choice.type === 'movie') playItem(choice._raw);
                    else if (choice.type === 'series') showSeriesFlow(choice._raw);
                },
                onBack: function () {}
            });
        });
    }

    /**
     * Добавление кнопки "Смотреть в Emby" на карточку фильма
     * через Lampa.Listener.follow('full', ...)
     */
    function initFullCardButton() {
        Lampa.Listener.follow('full', function (event) {
            if (!event || !event.type) return;
            if (event.type !== 'complite') return;

            var body = event.body;
            if (!body) return;

            // Ищем контейнер с кнопками
            var buttonsContainer = body.find('.info__buttons').eq(0);
            if (!buttonsContainer || !buttonsContainer.length) {
                buttonsContainer = body.find('.view--buttons').eq(0);
            }
            if (!buttonsContainer || !buttonsContainer.length) return;

            // Первая существующая кнопка, после которой вставим нашу
            var firstButton = buttonsContainer.find('.button').eq(0);
            if (!firstButton || !firstButton.length) return;

            // Создаём кнопку через шаблон
            var btn = $('<div class="button view--torrent"><span>Смотреть в Emby</span></div>');

            btn.on('hover:enter', function () {
                handleWatchInEmby(event.data || {});
            });

            // Вставляем после первой кнопки
            firstButton.after(btn);
        });
    }

    // Инициализация плагина
    function init() {
        initSettings();
        initFullCardButton();
    }

    // Запускаем сразу
    init();

})();
