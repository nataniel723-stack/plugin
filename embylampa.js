(function () {
    'use strict';

    const PLUGIN_ID = 'emby_local';

    let state = {
        url: Lampa.Storage.get('emby_url', ''),
        token: Lampa.Storage.get('emby_token', '')
    };

    function save() {
        Lampa.Storage.set('emby_url', state.url);
        Lampa.Storage.set('emby_token', state.token);
    }

    // -----------------------------
    // РЕНДЕР НАСТРОЕК (как Filmix FX)
    // -----------------------------
    function renderSettings(body) {
        body.empty();

        let url = $('<div class="settings-param selector"><div class="settings-param__name">Emby URL</div><div class="settings-param__value">' + (state.url || 'Не задано') + '</div></div>');
        url.on('hover:enter', function () {
            Lampa.Input.edit({
                title: 'Emby URL',
                value: state.url,
                free: true
            }, function (v) {
                state.url = v.trim();
                url.find('.settings-param__value').text(state.url || 'Не задано');
                save();
            });
        });

        let token = $('<div class="settings-param selector"><div class="settings-param__name">API Token</div><div class="settings-param__value">' + (state.token ? '********' : 'Не задано') + '</div></div>');
        token.on('hover:enter', function () {
            Lampa.Input.edit({
                title: 'API Token',
                value: state.token,
                free: true
            }, function (v) {
                state.token = v.trim();
                token.find('.settings-param__value').text(state.token ? '********' : 'Не задано');
                save();
            });
        });

        body.append(url);
        body.append(token);
    }

    Lampa.Settings.add({
        id: PLUGIN_ID,
        name: 'Emby (локальный)',
        category: 'plugins',
        icon: 'E'
    });

    Lampa.Settings.listener.follow('open', function (e) {
        if (e.name === PLUGIN_ID) renderSettings(e.body);
    });

    // -----------------------------
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // -----------------------------
    function api(path, params = {}) {
        if (!state.url) return '';
        let base = state.url.replace(/\/+$/, '');
        params.api_key = state.token;

        let q = Object.keys(params)
            .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
            .join('&');

        return base + path + '?' + q;
    }

    function request(url, ok, err) {
        let req = new Lampa.Reguest();
        req.native(url, ok, err);
    }

    // -----------------------------
    // ПОИСК В EMBY
    // -----------------------------
    function search(card, cb) {
        if (!state.url || !state.token) {
            Lampa.Noty.show('Укажите Emby URL и Token');
            return;
        }

        let title = card.name || card.title || card.original_title;
        if (!title) return Lampa.Noty.show('Нет названия');

        let year = null;
        if (card.release_date) year = card.release_date.slice(0, 4);
        if (card.first_air_date) year = card.first_air_date.slice(0, 4);

        let url = api('/emby/Items', {
            SearchTerm: title,
            IncludeItemTypes: 'Movie,Series',
            Recursive: true,
            Fields: 'ProductionYear'
        });

        Lampa.Loading.start();

        request(url, function (json) {
            Lampa.Loading.stop();

            if (!json.Items || !json.Items.length) {
                Lampa.Noty.show('Не найдено в Emby');
                return;
            }

            let items = json.Items;

            if (year) {
                let y = items.filter(i => String(i.ProductionYear) === String(year));
                if (y.length) items = y;
            }

            if (items.length > 1) {
                Lampa.Select.show({
                    title: 'Выберите',
                    items: items.map(i => ({
                        title: i.Name + ' (' + (i.ProductionYear || '?') + ')',
                        item: i
                    })),
                    onSelect: sel => cb(sel.item)
                });
            } else cb(items[0]);

        }, () => {
            Lampa.Loading.stop();
            Lampa.Noty.show('Ошибка Emby');
        });
    }

    // -----------------------------
    // ВОСПРОИЗВЕДЕНИЕ
    // -----------------------------
    function play(item) {
        let infoUrl = api('/emby/Items/' + item.Id, { Fields: 'MediaStreams' });

        request(infoUrl, function (json) {
            let media = json.MediaSources?.[0];
            let audios = media?.MediaStreams?.filter(s => s.Type === 'Audio') || [];

            function start(index) {
                let url = api('/emby/Videos/' + item.Id + '/stream', {
                    static: true,
                    AudioStreamIndex: index
                });

                Lampa.Player.play({
                    title: item.Name,
                    url: url
                });

                Lampa.Player.playlist([{ title: item.Name, url: url }]);
            }

            if (audios.length > 1) {
                Lampa.Select.show({
                    title: 'Аудиодорожка',
                    items: audios.map(a => ({
                        title: a.DisplayTitle || a.Language || 'Дорожка',
                        index: a.Index
                    })),
                    onSelect: sel => start(sel.index)
                });
            } else start(audios[0]?.Index);

        });
    }

    // -----------------------------
    // СЕРИАЛЫ
    // -----------------------------
    function openSeries(item) {
        let url = api('/emby/Shows/' + item.Id + '/Seasons');

        request(url, function (json) {
            let seasons = json.Items || [];
            if (!seasons.length) return Lampa.Noty.show('Нет сезонов');

            Lampa.Select.show({
                title: 'Сезоны',
                items: seasons.map(s => ({
                    title: s.Name,
                    season: s
                })),
                onSelect: sel => openEpisodes(item, sel.season)
            });
        });
    }

    function openEpisodes(series, season) {
        let url = api('/emby/Shows/' + series.Id + '/Episodes', {
            SeasonId: season.Id
        });

        request(url, function (json) {
            let eps = json.Items || [];
            if (!eps.length) return Lampa.Noty.show('Нет серий');

            Lampa.Select.show({
                title: season.Name,
                items: eps.map(e => ({
                    title: (e.IndexNumber || '') + '. ' + e.Name,
                    episode: e
                })),
                onSelect: sel => play(sel.episode)
            });
        });
    }

    // -----------------------------
    // КНОПКА В КАРТОЧКЕ (bylampa FIX)
    // -----------------------------
    Lampa.Listener.follow('full', function (e) {
        setTimeout(() => {
            try {
                if (!state.url || !state.token) return;

                let body = e.body;
                if (!body || !body.length) return;

                if (body.find('.emby-btn').length) return;

                let container =
                    body.find('.info__buttons').eq(0) ||
                    body.find('.view--buttons').eq(0) ||
                    body.find('.full-start').eq(0) ||
                    body.find('.full-actions').eq(0);

                if (!container || !container.length) return;

                let first = container.find('.button').eq(0);
                if (!first.length) first = container;

                let btn = $('<div class="button view--torrent emby-btn"><span>Смотреть в Emby</span></div>');

                btn.on('hover:enter', function () {
                    search(e.data, function (item) {
                        if (item.Type === 'Series') openSeries(item);
                        else play(item);
                    });
                });

                first.after(btn);

            } catch (err) {
                console.log('Emby plugin error:', err);
            }
        }, 120); // критично для bylampa.online
    });

    console.log('Emby plugin for bylampa.online loaded');
})();
