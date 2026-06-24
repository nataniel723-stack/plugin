(function () {
    'use strict';

    var PLUGIN_ID = 'emby_local';

    var state = {
        url: Lampa.Storage.get('emby_url', ''),
        token: Lampa.Storage.get('emby_token', '')
    };

    /**
     * Сохранение настроек
     */
    function saveSettings() {
        Lampa.Storage.set('emby_url', state.url || '');
        Lampa.Storage.set('emby_token', state.token || '');
    }

    /**
     * Рендер настроек плагина
     */
    function renderSettings(body) {
        body.empty();

        var url_item = Lampa.Template.get('settings_input');
        url_item.find('.settings-param__name').text('Emby URL');
        url_item.find('.settings-param__hint').text('Например: http://192.168.1.10:8096');
        url_item.find('.settings-param__value').text(state.url || 'Не задано');

        url_item.on('hover:enter', function () {
            Lampa.Input.edit({
                title: 'Адрес сервера Emby',
                value: state.url,
                type: 'string',
                free: true
            }, function (value) {
                state.url = (value || '').trim();
                url_item.find('.settings-param__value').text(state.url || 'Не задано');
                saveSettings();
            });
        });

        var token_item = Lampa.Template.get('settings_input');
        token_item.find('.settings-param__name').text('Emby API Token');
        token_item.find('.settings-param__hint').text('Скопируйте токен из настроек Emby');
        token_item.find('.settings-param__value').text(state.token ? '********' : 'Не задано');

        token_item.on('hover:enter', function () {
            Lampa.Input.edit({
                title: 'API Token',
                value: state.token,
                type: 'string',
                free: true
            }, function (value) {
                state.token = (value || '').trim();
                token_item.find('.settings-param__value').text(state.token ? '********' : 'Не задано');
                saveSettings();
            });
        });

        body.append(url_item);
        body.append(token_item);
    }

    /**
     * Регистрация вкладки настроек
     */
    Lampa.Settings.add({
        id: PLUGIN_ID,
        name: 'Emby (локальный)',
        icon: 'E',
        category: 'plugins',
        onRender: function (body) {
            // для старых версий, но основная логика через listener ниже
            renderSettings(body);
        }
    });

    Lampa.Settings.listener.follow('open', function (e) {
        if (e.name === PLUGIN_ID) {
            renderSettings(e.body);
        }
    });

    /**
     * Безопасная сборка URL
     */
    function buildUrl(path, params) {
        if (!state.url) return '';
        var base = state.url.replace(/\/+$/, '');
        var url = base + path;
        var query = params || {};
        if (state.token) query.api_key = state.token;

        var parts = [];
        for (var k in query) {
            if (!Object.prototype.hasOwnProperty.call(query, k)) continue;
            if (query[k] === undefined || query[k] === null) continue;
            parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(query[k])));
        }

        if (parts.length) url += (url.indexOf('?') === -1 ? '?' : '&') + parts.join('&');

        return url;
    }

    /**
     * Поиск элемента в Emby по названию
     */
    function searchInEmby(card_data, callback) {
        if (!state.url || !state.token) {
            Lampa.Noty.show('Emby: укажите URL и API Token в настройках');
            return;
        }

        var title = card_data.name || card_data.title || card_data.original_title || '';
        if (!title) {
            Lampa.Noty.show('Emby: не удалось определить название');
            return;
        }

        var year = null;
        if (card_data.release_date) year = String(card_data.release_date).slice(0, 4);
        else if (card_data.first_air_date) year = String(card_data.first_air_date).slice(0, 4);
        else if (card_data.year) year = String(card_data.year);

        var is_tv = !!card_data.first_air_date || card_data.media_type === 'tv';

        var req = new Lampa.Reguest();
        var url = buildUrl('/emby/Items', {
            SearchTerm: title,
            IncludeItemTypes: 'Movie,Series',
            Recursive: true,
            Fields: 'ProductionYear,SeriesInfo'
        });

        if (!url) {
            Lampa.Noty.show('Emby: некорректный URL сервера');
            return;
        }

        Lampa.Loading.start();

        req.native(url, function (json) {
            Lampa.Loading.stop();

            if (!json || !json.Items || !json.Items.length) {
                Lampa.Noty.show('Emby: ничего не найдено');
                return;
            }

            var items = json.Items;

            // сначала фильтруем по типу (фильм/сериал)
            var filtered = items.filter(function (it) {
                if (is_tv) return it.Type === 'Series';
                return it.Type === 'Movie';
            });

            if (!filtered.length) filtered = items;

            // затем по году, если есть
            if (year) {
                var by_year = filtered.filter(function (it) {
                    return String(it.ProductionYear || '') === String(year);
                });
                if (by_year.length) filtered = by_year;
            }

            var best = filtered[0];

            // если несколько — даём выбрать
            if (filtered.length > 1) {
                var list = filtered.map(function (it) {
                    var t = it.Name || title;
                    if (it.ProductionYear) t += ' (' + it.ProductionYear + ')';
                    if (it.Type === 'Series') t += ' [Сериал]';
                    else if (it.Type === 'Movie') t += ' [Фильм]';
                    return {
                        title: t,
                        item: it
                    };
                });

                Lampa.Select.show({
                    title: 'Выберите из Emby',
                    items: list,
                    onSelect: function (sel) {
                        callback(sel.item, is_tv);
                    },
                    onBack: function () {
                        Lampa.Controller.toggle('content');
                    }
                });
            } else {
                callback(best, is_tv);
            }
        }, function () {
            Lampa.Loading.stop();
            Lampa.Noty.show('Emby: ошибка запроса');
        });
    }

    /**
     * Получение аудиодорожек и запуск плеера
     */
    function playEmbyItem(item, card_data) {
        var req = new Lampa.Reguest();
        var url_info = buildUrl('/emby/Items/' + item.Id, {
            Fields: 'MediaStreams'
        });

        if (!url_info) {
            Lampa.Noty.show('Emby: некорректный URL сервера');
            return;
        }

        Lampa.Loading.start();

        req.native(url_info, function (info) {
            Lampa.Loading.stop();

            var media = info && info.MediaSources && info.MediaSources[0];
            var streams = media && media.MediaStreams ? media.MediaStreams : [];
            var audios = streams.filter(function (s) {
                return s.Type === 'Audio';
            });

            function startPlay(audioIndex) {
                var play_url = buildUrl('/emby/Videos/' + item.Id + '/stream', {
                    static: true,
                    AudioStreamIndex: typeof audioIndex === 'number' ? audioIndex : undefined
                });

                if (!play_url) {
                    Lampa.Noty.show('Emby: некорректный URL сервера');
                    return;
                }

                var title = item.Name || (card_data && (card_data.name || card_data.title)) || 'Emby';

                Lampa.Player.play({
                    title: title,
                    url: play_url
                });

                Lampa.Player.playlist([{
                    title: title,
                    url: play_url
                }]);
            }

            if (audios.length > 1) {
                var list = audios.map(function (a, i) {
                    var name = a.DisplayTitle || a.Language || ('Дорожка ' + (i + 1));
                    return {
                        title: name,
                        index: a.Index
                    };
                });

                Lampa.Select.show({
                    title: 'Аудиодорожка',
                    items: list,
                    onSelect: function (sel) {
                        startPlay(sel.index);
                    },
                    onBack: function () {
                        Lampa.Controller.toggle('content');
                    }
                });
            } else if (audios.length === 1) {
                startPlay(audios[0].Index);
            } else {
                startPlay(undefined);
            }
        }, function () {
            Lampa.Loading.stop();
            Lampa.Noty.show('Emby: ошибка получения медиаинформации');
        });
    }

    /**
     * Открытие списка сезонов и серий
     */
    function openSeries(item, card_data) {
        var req = new Lampa.Reguest();
        var url_seasons = buildUrl('/emby/Shows/' + item.Id + '/Seasons', {});

        if (!url_seasons) {
            Lampa.Noty.show('Emby: некорректный URL сервера');
            return;
        }

        Lampa.Loading.start();

        req.native(url_seasons, function (json) {
            Lampa.Loading.stop();

            var seasons = (json && json.Items) || [];
            if (!seasons.length) {
                Lampa.Noty.show('Emby: сезоны не найдены');
                return;
            }

            var season_items = seasons.map(function (s) {
                var title = s.Name || ('Сезон ' + (s.IndexNumber || ''));
                return {
                    title: title,
                    season: s
                };
            });

            function selectSeason() {
                Lampa.Select.show({
                    title: 'Сезон',
                    items: season_items,
                    onSelect: function (sel) {
                        openEpisodes(item, sel.season, card_data, selectSeason);
                    },
                    onBack: function () {
                        Lampa.Controller.toggle('content');
                    }
                });
            }

            selectSeason();
        }, function () {
            Lampa.Loading.stop();
            Lampa.Noty.show('Emby: ошибка получения сезонов');
        });
    }

    /**
     * Открытие списка серий выбранного сезона
     */
    function openEpisodes(series_item, season, card_data, backToSeasons) {
        var req = new Lampa.Reguest();
        var url_eps = buildUrl('/emby/Shows/' + series_item.Id + '/Episodes', {
            SeasonId: season.Id
        });

        if (!url_eps) {
            Lampa.Noty.show('Emby: некорректный URL сервера');
            return;
        }

        Lampa.Loading.start();

        req.native(url_eps, function (json) {
            Lampa.Loading.stop();

            var eps = (json && json.Items) || [];
            if (!eps.length) {
                Lampa.Noty.show('Emby: серии не найдены');
                return;
            }

            var ep_items = eps.map(function (e) {
                var num = e.IndexNumber || '';
                var title = (num ? num + '. ' : '') + (e.Name || 'Серия');
                return {
                    title: title,
                    episode: e
                };
            });

            function selectEpisode() {
                Lampa.Select.show({
                    title: 'Серии: ' + (season.Name || ''),
                    items: ep_items,
                    onSelect: function (sel) {
                        playEmbyItem(sel.episode, card_data);
                    },
                    onBack: function () {
                        backToSeasons();
                    }
                });
            }

            selectEpisode();
        }, function () {
            Lampa.Loading.stop();
            Lampa.Noty.show('Emby: ошибка получения серий');
        });
    }

    /**
     * Обработка найденного элемента Emby
     */
    function handleFoundItem(item, is_tv, card_data) {
        if (item.Type === 'Series' || is_tv) {
            openSeries(item, card_data);
        } else {
            playEmbyItem(item, card_data);
        }
    }

    /**
     * Добавление кнопки "Смотреть в Emby" на карточку
     */
    Lampa.Listener.follow('full', function (e) {
        try {
            if (!state.url || !state.token) return;

            var body = e.body;
            var data = e.data || {};
            if (!body || !body.length) return;

            if (body.find('.emby-watch-btn').length) return;

            var buttons_container = body.find('.info__buttons, .view--buttons').eq(0);
            if (!buttons_container.length) return;

            var first_btn = buttons_container.find('.button').eq(0);
            if (!first_btn.length) return;

            var btn = $('<div class="button view--torrent emby-watch-btn"><span>Смотреть в Emby</span></div>');

            btn.on('hover:enter', function () {
                searchInEmby(data, function (item, is_tv) {
                    handleFoundItem(item, is_tv, data);
                });
            });

            btn.insertAfter(first_btn);
        } catch (err) {
            // глушим, чтобы не ломать Lampa
            console.log('Emby plugin error:', err && err.message ? err.message : err);
        }
    });

    console.log('Lampa Emby local plugin: loaded');
})();
