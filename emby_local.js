(function () {
    'use strict';

    // =========================
    //  Emby Local (в стиле Filmix FX)
    // =========================

    var STORAGE_URL   = 'emby_local_url';
    var STORAGE_TOKEN = 'emby_local_token';

    var network = new Lampa.Reguest();
    window.emby_local = {};

    // ---------- Хелперы хранения ----------

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, '') || '').trim();
    }

    function setUrl(val) {
        Lampa.Storage.set(STORAGE_URL, (val || '').trim());
    }

    function getToken() {
        return (Lampa.Storage.get(STORAGE_TOKEN, '') || '').trim();
    }

    function setToken(val) {
        Lampa.Storage.set(STORAGE_TOKEN, (val || '').trim());
    }

    function noty(msg) {
        if (msg) Lampa.Noty.show(msg);
    }

    function edit(title, value, cb) {
        Lampa.Input.edit({
            title: title,
            value: value || '',
            free: true,
            nosave: true
        }, function (val) {
            if (cb) cb(val || '');
        });
    }

    // ---------- Настройки (как у Filmix FX) ----------

    function renderSettings() {
        var body = $('.settings-container').last();
        if (!body.length) return;

        body.empty();

        var wrap = $('<div class="settings-container"></div>');

        wrap.append('<div class="settings-param-title">Emby Local</div>');

        var url = getUrl();
        var token = getToken();

        // URL Emby
        var urlRow = $(
            '<div class="settings-param selector" data-name="emby_local_url">' +
                '<div class="settings-param__name">Emby URL</div>' +
                '<div class="settings-param__value">' + (url || 'Не задано') + '</div>' +
            '</div>'
        );

        urlRow.on('hover:enter', function () {
            edit('Введите URL Emby (например http://192.168.1.10:8096)', getUrl(), function (val) {
                setUrl(val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        // API Token
        var tokenRow = $(
            '<div class="settings-param selector" data-name="emby_local_token">' +
                '<div class="settings-param__name">Emby API Token</div>' +
                '<div class="settings-param__value">' + (token ? '********' : 'Не задано') + '</div>' +
            '</div>'
        );

        tokenRow.on('hover:enter', function () {
            edit('Введите API Token Emby', getToken(), function (val) {
                setToken(val);
                tokenRow.find('.settings-param__value').text(val ? '********' : 'Не задано');
            });
        });

        wrap.append(urlRow);
        wrap.append(tokenRow);

        body.append(wrap);
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'emby_local',
            name: 'Emby Local',
            icon: '<svg width="40" height="40"><rect width="40" height="40" rx="6" fill="#0f0"/><text x="50%" y="55%" text-anchor="middle" fill="#000" font-size="20" font-weight="bold">E</text></svg>'
        });

        Lampa.Settings.listener.follow('open', function (e) {
            if (!e || e.name !== 'emby_local') return;
            renderSettings();
        });
    }

    // ---------- Emby API ----------

    function searchEmby(title, cb) {
        var base  = getUrl();
        var token = getToken();

        if (!base || !token) {
            noty('Emby: укажите URL и API Token в настройках');
            return cb && cb('no-config');
        }

        if (!title) {
            noty('Emby: не удалось определить название');
            return cb && cb('no-title');
        }

        var url = base.replace(/\/+$/, '') +
            '/emby/Items?SearchTerm=' + encodeURIComponent(title) +
            '&IncludeItemTypes=Movie,Series' +
            '&Limit=20' +
            '&api_key=' + encodeURIComponent(token);

        network.native(url, function (json) {
            if (!json || !Array.isArray(json.Items)) {
                return cb && cb('bad-response');
            }
            cb && cb(null, json.Items);
        }, function () {
            noty('Emby: ошибка сети');
            cb && cb('network-error');
        });
    }

    function getSeasons(showId, cb) {
        var base  = getUrl();
        var token = getToken();

        var url = base.replace(/\/+$/, '') +
            '/emby/Shows/' + encodeURIComponent(showId) +
            '/Seasons?api_key=' + encodeURIComponent(token);

        network.native(url, function (json) {
            if (!json || !Array.isArray(json.Items)) {
                return cb && cb('bad-response');
            }
            cb && cb(null, json.Items);
        }, function () {
            noty('Emby: ошибка загрузки сезонов');
            cb && cb('network-error');
        });
    }

    function getEpisodes(showId, seasonId, cb) {
        var base  = getUrl();
        var token = getToken();

        var url = base.replace(/\/+$/, '') +
            '/emby/Shows/' + encodeURIComponent(showId) +
            '/Episodes?SeasonId=' + encodeURIComponent(seasonId) +
            '&api_key=' + encodeURIComponent(token);

        network.native(url, function (json) {
            if (!json || !Array.isArray(json.Items)) {
                return cb && cb('bad-response');
            }
            cb && cb(null, json.Items);
        }, function () {
            noty('Emby: ошибка загрузки эпизодов');
            cb && cb('network-error');
        });
    }

    function buildStreamUrl(id) {
        var base  = getUrl();
        var token = getToken();

        return base.replace(/\/+$/, '') +
            '/emby/Videos/' + encodeURIComponent(id) +
            '/stream?static=true&api_key=' + encodeURIComponent(token);
    }

    function playItem(item) {
        if (!item || !item.Id) {
            noty('Emby: нет ID для воспроизведения');
            return;
        }

        Lampa.Player.play({
            title: item.Name || 'Emby',
            url: buildStreamUrl(item.Id),
            timeline: 0
        });
    }

    function openSeriesFlow(seriesItem) {
        if (!seriesItem || !seriesItem.Id) {
            noty('Emby: некорректный сериал');
            return;
        }

        getSeasons(seriesItem.Id, function (err, seasons) {
            if (err || !seasons || !seasons.length) {
                noty('Emby: сезоны не найдены');
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

                    getEpisodes(seriesItem.Id, season.id, function (errEp, episodes) {
                        if (errEp || !episodes || !episodes.length) {
                            noty('Emby: эпизоды не найдены');
                            return;
                        }

                        var epItems = episodes.map(function (e) {
                            var t = '';
                            if (typeof e.IndexNumber === 'number') {
                                t = 'S' + (e.ParentIndexNumber || 1) +
                                    'E' + e.IndexNumber + ' — ' + (e.Name || '');
                            } else {
                                t = e.Name || 'Эпизод';
                            }

                            return {
                                title: t,
                                id: e.Id,
                                _raw: e
                            };
                        });

                        Lampa.Select.show({
                            title: 'Выберите эпизод',
                            items: epItems,
                            onSelect: function (ep) {
                                if (!ep || !ep._raw) return;
                                playItem(ep._raw);
                            },
                            onBack: function () {
                                openSeriesFlow(seriesItem);
                            }
                        });
                    });
                }
            });
        });
    }

    function handleWatchInEmby(data) {
        if (!data) return;

        var movie = data.movie || data.card || data;
        var title = movie && (movie.name || movie.title || movie.original_title || movie.original_name);

        if (!title && data.card && data.card.data) {
            var d = data.card.data;
            title = d.name || d.title || d.original_title || d.original_name;
        }

        if (!title) {
            noty('Emby: не удалось определить название');
            return;
        }

        searchEmby(title, function (err, items) {
            if (err || !items || !items.length) {
                noty('Emby: ничего не найдено');
                return;
            }

            var movies = [];
            var series = [];

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
                openSeriesFlow(series[0]);
                return;
            }

            var list = [];

            series.forEach(function (s) {
                list.push({
                    title: '[Сериал] ' + (s.Name || ''),
                    type: 'series',
                    _raw: s
                });
            });

            movies.forEach(function (m) {
                list.push({
                    title: '[Фильм] ' + (m.Name || ''),
                    type: 'movie',
                    _raw: m
                });
            });

            if (!list.length) {
                noty('Emby: подходящих результатов нет');
                return;
            }

            if (list.length === 1) {
                var only = list[0];
                if (only.type === 'movie') playItem(only._raw);
                else openSeriesFlow(only._raw);
                return;
            }

            Lampa.Select.show({
                title: 'Результаты Emby',
                items: list,
                onSelect: function (choice) {
                    if (!choice || !choice._raw) return;
                    if (choice.type === 'movie') playItem(choice._raw);
                    else openSeriesFlow(choice._raw);
                }
            });
        });
    }

    // ---------- Кнопка "Смотреть в Emby" (как в fx.js) ----------

    function initFullButton() {
        Lampa.Listener.follow('full', function (event) {
            if (!event || event.type !== 'complite') return;

            // ждём дорисовку карточки, как делает Filmix FX
            setTimeout(function () {
                var body = $('.full').last();
                if (!body.length) return;

                // основные контейнеры кнопок в lampa.mx / bylampa.online
                var buttons = body.find('.full-start').eq(0);
                if (!buttons.length) buttons = body.find('.full-actions').eq(0);
                if (!buttons.length) return;

                if (buttons.find('.emby-local-btn').length) return;

                var btn = $('<div class="button selector emby-local-btn"><span>Смотреть в Emby</span></div>');

                btn.on('hover:enter', function () {
                    handleWatchInEmby(event.data || {});
                });

                buttons.append(btn);
            }, 150);
        });
    }

    // ---------- Инициализация ----------

    function init() {
        initSettings();
        initFullButton();
    }

    init();

})();
