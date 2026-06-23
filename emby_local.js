(function () {
    'use strict';

    const STORAGE_URL   = 'emby_url';
    const STORAGE_TOKEN = 'emby_token';

    const network = new Lampa.Reguest();

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, '') || '').trim();
    }

    function getToken() {
        return (Lampa.Storage.get(STORAGE_TOKEN, '') || '').trim();
    }

    function notify(msg) {
        if (msg) Lampa.Noty.show(msg);
    }

    function editField(title, value, cb) {
        Lampa.Input.edit({
            title: title,
            value: value || '',
            free: true,
            nosave: true
        }, function (val) {
            if (cb) cb(val || '');
        });
    }

    /**
     * Рендер настроек Emby
     * Сначала пытаемся использовать Template.get('settings_input'),
     * если его нет — аккуратный fallback на простой HTML.
     */
    function renderSettings(body) {
        if (!body) return;

        body.empty();

        const url   = getUrl();
        const token = getToken();

        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        // --- URL ---
        let urlItem = Lampa.Template.get('settings_input');
        if (!urlItem || !urlItem.length) {
            urlItem = $('<div class="settings-param selector"><div class="settings-param__name"></div><div class="settings-param__value"></div></div>');
        }

        urlItem.find('.settings-param__name').text('Emby URL');
        urlItem.find('.settings-param__value').text(url || 'Не задано');

        urlItem.on('hover:enter', function () {
            editField('Введите URL Emby (например http://192.168.1.10:8096)', getUrl(), function (val) {
                Lampa.Storage.set(STORAGE_URL, val);
                urlItem.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        // --- TOKEN ---
        let tokenItem = Lampa.Template.get('settings_input');
        if (!tokenItem || !tokenItem.length) {
            tokenItem = $('<div class="settings-param selector"><div class="settings-param__name"></div><div class="settings-param__value"></div></div>');
        }

        tokenItem.find('.settings-param__name').text('Emby API Token');
        tokenItem.find('.settings-param__value').text(token ? '********' : 'Не задано');

        tokenItem.on('hover:enter', function () {
            editField('Введите API Token Emby', getToken(), function (val) {
                Lampa.Storage.set(STORAGE_TOKEN, val);
                tokenItem.find('.settings-param__value').text(val ? '********' : 'Не задано');
            });
        });

        wrap.append(urlItem);
        wrap.append(tokenItem);

        body.append(wrap);
    }

    /**
     * Поиск в Emby
     */
    function searchEmby(title, callback) {
        const base  = getUrl();
        const token = getToken();

        if (!base || !token) {
            notify('Emby: укажите URL и API Token в настройках');
            return callback && callback('no-config');
        }

        if (!title) {
            notify('Emby: не удалось определить название');
            return callback && callback('no-title');
        }

        const url = base.replace(/\/+$/, '') +
            '/emby/Items?SearchTerm=' + encodeURIComponent(title) +
            '&IncludeItemTypes=Movie,Series' +
            '&Limit=20' +
            '&api_key=' + encodeURIComponent(token);

        network.native(url, function (json) {
            if (!json || !Array.isArray(json.Items)) {
                return callback && callback('bad-response');
            }
            callback && callback(null, json.Items);
        }, function () {
            notify('Emby: ошибка сети');
            callback && callback('network-error');
        });
    }

    function getSeasons(showId, callback) {
        const base  = getUrl();
        const token = getToken();

        const url = base.replace(/\/+$/, '') +
            '/emby/Shows/' + encodeURIComponent(showId) +
            '/Seasons?api_key=' + encodeURIComponent(token);

        network.native(url, function (json) {
            if (!json || !Array.isArray(json.Items)) {
                return callback && callback('bad-response');
            }
            callback && callback(null, json.Items);
        }, function () {
            notify('Emby: ошибка загрузки сезонов');
            callback && callback('network-error');
        });
    }

    function getEpisodes(showId, seasonId, callback) {
        const base  = getUrl();
        const token = getToken();

        const url = base.replace(/\/+$/, '') +
            '/emby/Shows/' + encodeURIComponent(showId) +
            '/Episodes?SeasonId=' + encodeURIComponent(seasonId) +
            '&api_key=' + encodeURIComponent(token);

        network.native(url, function (json) {
            if (!json || !Array.isArray(json.Items)) {
                return callback && callback('bad-response');
            }
            callback && callback(null, json.Items);
        }, function () {
            notify('Emby: ошибка загрузки эпизодов');
            callback && callback('network-error');
        });
    }

    function buildStreamUrl(itemId) {
        const base  = getUrl();
        const token = getToken();

        return base.replace(/\/+$/, '') +
            '/emby/Videos/' + encodeURIComponent(itemId) +
            '/stream?static=true&api_key=' + encodeURIComponent(token);
    }

    function playItem(item) {
        if (!item || !item.Id) {
            notify('Emby: не удалось получить данные для воспроизведения');
            return;
        }

        Lampa.Player.play({
            title: item.Name || 'Emby',
            url: buildStreamUrl(item.Id),
            timeline: 0
        });
    }

    function showSeriesFlow(seriesItem) {
        if (!seriesItem || !seriesItem.Id) {
            notify('Emby: некорректные данные сериала');
            return;
        }

        getSeasons(seriesItem.Id, function (err, seasons) {
            if (err || !seasons || !seasons.length) {
                notify('Emby: сезоны не найдены');
                return;
            }

            const seasonItems = seasons.map(function (s) {
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

                    getEpisodes(seriesItem.Id, season.id, function (errEp, episodes) {
                        if (errEp || !episodes || !episodes.length) {
                            notify('Emby: эпизоды не найдены');
                            return;
                        }

                        const episodeItems = episodes.map(function (e) {
                            let epTitle = '';

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
                                showSeriesFlow(seriesItem);
                            }
                        });
                    });
                }
            });
        });
    }

    function handleWatchInEmby(data) {
        if (!data) return;

        const movie = data.movie || data.card || data;
        let title = movie && (movie.name || movie.title || movie.original_title || movie.original_name);

        if (!title && data.card && data.card.data) {
            const d = data.card.data;
            title = d.name || d.title || d.original_title || d.original_name;
        }

        if (!title) {
            notify('Emby: не удалось определить название');
            return;
        }

        searchEmby(title, function (err, items) {
            if (err || !items || !items.length) {
                notify('Emby: ничего не найдено');
                return;
            }

            const movies = [];
            const series = [];

            items.forEach(function (it) {
                if (!it || !it.Type) return;
                if (it.Type === 'Movie') movies.push(it);
                else if (it.Type === 'Series') series.push(it);
            });

            if (movies.length === 1 && !series.length) {
                playItem(movies[0]);
                return;
            }

            if (series.length === 1 && !movies.length) {
                showSeriesFlow(series[0]);
                return;
            }

            const selectItems = [];

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

            if (selectItems.length === 1) {
                const only = selectItems[0];
                if (only.type === 'movie') playItem(only._raw);
                else if (only.type === 'series') showSeriesFlow(only._raw);
                return;
            }

            Lampa.Select.show({
                title: 'Результаты Emby',
                items: selectItems,
                onSelect: function (choice) {
                    if (!choice || !choice._raw) return;
                    if (choice.type === 'movie') playItem(choice._raw);
                    else if (choice.type === 'series') showSeriesFlow(choice._raw);
                }
            });
        });
    }

    /**
     * Кнопка "Смотреть в Emby" — максимально приближено к стилю онлайн‑плагинов (Filmix и т.п.)
     */
    function initFullCardButton() {
        Lampa.Listener.follow('full', function (event) {
            if (!event || event.type !== 'complite') return;

            // Даем Lampa дорисовать карточку (как делают онлайн‑плагины)
            setTimeout(function () {
                let body = event.body;

                if (!body || !body.find) {
                    // fallback — последний .full
                    body = $('.full').last();
                }

                if (!body || !body.length) return;

                // Ищем контейнер с кнопками "Смотреть"
                let container = body.find('.info__buttons').eq(0);
                if (!container.length) container = body.find('.view--buttons').eq(0);
                if (!container.length) container = body.find('.full-start').eq(0);
                if (!container.length) container = body.find('.full-actions').eq(0);
                if (!container.length) container = body.find('.full__buttons').eq(0);

                if (!container || !container.length) return;

                // Проверяем, не добавляли ли уже кнопку
                if (container.find('.emby-btn').length) return;

                let firstButton = container.find('.button').eq(0);
                if (!firstButton.length) firstButton = container;

                const btn = $('<div class="button view--torrent emby-btn"><span>Смотреть в Emby</span></div>');

                btn.on('hover:enter', function () {
                    handleWatchInEmby(event.data || {});
                });

                firstButton.after(btn);
            }, 50);
        });
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'emby',
            name: 'Emby',
            icon: '<svg width="40" height="40"><rect width="40" height="40" rx="6" fill="#0f0"/><text x="50%" y="55%" text-anchor="middle" fill="#000" font-size="22" font-weight="bold">E</text></svg>'
        });

        Lampa.Settings.listener.follow('open', function (e) {
            if (!e || e.name !== 'emby') return;
            renderSettings(e.body);
        });
    }

    function init() {
        initSettings();
        initFullCardButton();
    }

    init();

})();
