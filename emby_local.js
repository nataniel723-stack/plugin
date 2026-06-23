(function () {
    'use strict';

    const STORAGE_URL = 'emby_url';
    const STORAGE_TOKEN = 'emby_token';

    const network = new Lampa.Reguest();

    /**
     * Получение настроек
     */
    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, '') || '').trim();
    }

    function getToken() {
        return (Lampa.Storage.get(STORAGE_TOKEN, '') || '').trim();
    }

    /**
     * Уведомление
     */
    function notify(msg) {
        Lampa.Noty.show(msg);
    }

    /**
     * Ввод строки
     */
    function editField(title, value, callback) {
        Lampa.Input.edit({
            title: title,
            value: value,
            free: true,
            nosave: true
        }, callback);
    }

    /**
     * Рендер настроек
     */
    function renderSettings(body) {
        body.empty();

        const url = getUrl();
        const token = getToken();

        const wrap = $('<div class="settings-container"></div>');

        // Заголовок
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        // Поле URL
        const urlRow = $('<div class="settings-param selector"><div class="settings-param__name">Emby URL</div><div class="settings-param__value">' + (url || 'Не задано') + '</div></div>');
        urlRow.on('hover:enter', function () {
            editField('Введите URL Emby (например http://192.168.1.10:8096)', getUrl(), function (val) {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        // Поле Token
        const tokenRow = $('<div class="settings-param selector"><div class="settings-param__name">API Token</div><div class="settings-param__value">' + (token ? '********' : 'Не задано') + '</div></div>');
        tokenRow.on('hover:enter', function () {
            editField('Введите API Token Emby', getToken(), function (val) {
                Lampa.Storage.set(STORAGE_TOKEN, val);
                tokenRow.find('.settings-param__value').text(val ? '********' : 'Не задано');
            });
        });

        wrap.append(urlRow);
        wrap.append(tokenRow);

        body.append(wrap);
    }

    /**
     * Поиск в Emby
     */
    function searchEmby(title, callback) {
        const base = getUrl();
        const token = getToken();

        if (!base || !token) {
            notify('Emby: укажите URL и Token в настройках');
            return callback('no-config');
        }

        const url = base.replace(/\/+$/, '') +
            '/emby/Items?SearchTerm=' + encodeURIComponent(title) +
            '&IncludeItemTypes=Movie,Series&Limit=20&api_key=' + token;

        network.native(url, function (json) {
            if (!json || !json.Items) return callback('bad-response');
            callback(null, json.Items);
        }, function () {
            callback('network-error');
        });
    }

    /**
     * Получение сезонов
     */
    function getSeasons(id, callback) {
        const base = getUrl();
        const token = getToken();

        const url = base.replace(/\/+$/, '') +
            '/emby/Shows/' + id + '/Seasons?api_key=' + token;

        network.native(url, function (json) {
            if (!json || !json.Items) return callback('bad-response');
            callback(null, json.Items);
        }, function () {
            callback('network-error');
        });
    }

    /**
     * Получение эпизодов
     */
    function getEpisodes(showId, seasonId, callback) {
        const base = getUrl();
        const token = getToken();

        const url = base.replace(/\/+$/, '') +
            '/emby/Shows/' + showId + '/Episodes?SeasonId=' + seasonId +
            '&api_key=' + token;

        network.native(url, function (json) {
            if (!json || !json.Items) return callback('bad-response');
            callback(null, json.Items);
        }, function () {
            callback('network-error');
        });
    }

    /**
     * Построение URL потока
     */
    function buildStream(id) {
        return getUrl().replace(/\/+$/, '') +
            '/emby/Videos/' + id + '/stream?static=true&api_key=' + getToken();
    }

    /**
     * Воспроизведение
     */
    function play(item) {
        if (!item || !item.Id) return notify('Ошибка Emby: нет ID');

        Lampa.Player.play({
            title: item.Name || 'Emby',
            url: buildStream(item.Id),
            timeline: 0
        });
    }

    /**
     * Сериал → сезоны → эпизоды
     */
    function openSeries(item) {
        getSeasons(item.Id, function (err, seasons) {
            if (err || !seasons.length) return notify('Сезоны не найдены');

            const seasonItems = seasons.map(s => ({
                title: s.Name,
                id: s.Id,
                _raw: s
            }));

            Lampa.Select.show({
                title: 'Выберите сезон',
                items: seasonItems,
                onSelect: function (season) {
                    getEpisodes(item.Id, season.id, function (err2, eps) {
                        if (err2 || !eps.length) return notify('Эпизоды не найдены');

                        const epItems = eps.map(e => ({
                            title: 'S' + e.ParentIndexNumber + 'E' + e.IndexNumber + ' — ' + e.Name,
                            id: e.Id,
                            _raw: e
                        }));

                        Lampa.Select.show({
                            title: 'Выберите эпизод',
                            items: epItems,
                            onSelect: ep => play(ep._raw)
                        });
                    });
                }
            });
        });
    }

    /**
     * Обработка кнопки "Смотреть в Emby"
     */
    function handlePlay(data) {
        const card = data.card || data.movie || data;
        const title = card.name || card.title || card.original_title || card.original_name;

        if (!title) return notify('Не удалось определить название');

        searchEmby(title, function (err, items) {
            if (err || !items.length) return notify('Ничего не найдено');

            const movies = items.filter(i => i.Type === 'Movie');
            const series = items.filter(i => i.Type === 'Series');

            if (movies.length === 1 && !series.length) return play(movies[0]);
            if (series.length === 1 && !movies.length) return openSeries(series[0]);

            const list = [];

            series.forEach(s => list.push({ title: '[Сериал] ' + s.Name, type: 'series', _raw: s }));
            movies.forEach(m => list.push({ title: '[Фильм] ' + m.Name, type: 'movie', _raw: m }));

            Lampa.Select.show({
                title: 'Результаты Emby',
                items: list,
                onSelect: function (it) {
                    if (it.type === 'movie') play(it._raw);
                    else openSeries(it._raw);
                }
            });
        });
    }

    /**
     * Кнопка на карточке
     */
    function initButton() {
    Lampa.Listener.follow('full', function (event) {
        if (!event || event.type !== 'complite') return;

        // Ждём, пока Lampa дорисует DOM
        setTimeout(function () {
            const body = event.body;
            if (!body) return;

            // Ищем ВСЕ возможные контейнеры кнопок
            let container =
                body.find('.info__buttons').eq(0) ||
                body.find('.view--buttons').eq(0) ||
                body.find('.full-start').eq(0) ||
                body.find('.full-actions').eq(0);

            if (!container || !container.length) return;

            // Первая кнопка
            let first = container.find('.button').eq(0);
            if (!first.length) first = container;

            // Проверяем, нет ли уже кнопки
            if (container.find('.emby-btn').length) return;

            // Создаём кнопку
            const btn = $('<div class="button view--torrent emby-btn"><span>Смотреть в Emby</span></div>');

            btn.on('hover:enter', function () {
                handlePlay(event.data);
            });

            first.after(btn);

        }, 50); // задержка 50 мс — критично для lampa.mx
    });
}


    /**
     * Регистрация настроек
     */
    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'emby',
            name: 'Emby',
            icon: '<svg width="40" height="40"><rect width="40" height="40" rx="6" fill="#0f0"/><text x="50%" y="55%" text-anchor="middle" fill="#000" font-size="22" font-weight="bold">E</text></svg>'
        });

        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name !== 'emby') return;
            renderSettings(e.body);
        });
    }

    /**
     * Инициализация
     */
    function init() {
        initSettings();
        initButton();
    }

    init();

})();
