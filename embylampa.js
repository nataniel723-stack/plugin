(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '2.5.0';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    let currentSerieId = '';
    let currentSeasonId = '';
    let currentEpisodeId = '';

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
    }

    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY, '78b3967970814692b20b095e5b13f0eb') || '').trim();
    }

    function isConfigured() {
        return getUrl().length > 10 && getApiKey().length > 10;
    }

    function notify(msg) {
        Lampa.Noty.show(msg);
    }

    function apiRequest(endpoint, success, error) {
        if (!isConfigured()) {
            notify('Настройте Emby в параметрах');
            if (error) error();
            return;
        }

        const base = getUrl().replace(/\/$/, '');
        const url = `${base}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${getApiKey()}`;

        new Lampa.Reguest().silent(url, success, error || (() => {}));
    }

    // Поиск в Emby
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);

        const fields = '&Fields=Id,Name,IndexNumber,Overview,PrimaryImageTag&Recursive=true&IncludeItemTypes=Movie,Series,Episode';

        // IMDB
        if (movie.imdb_id || movie.imdbid) {
            const imdb = (movie.imdb_id || movie.imdbid).replace('tt', '');
            apiRequest(`/Items?AnyProviderIdEquals=imdb.${imdb}${fields}`, (data) => {
                if (data?.Items?.[0]) return callback(data.Items[0]);
                searchByTMDB(movie, callback);
            });
            return;
        }

        searchByTMDB(movie, callback);
    }

    function searchByTMDB(movie, callback) {
        const tmdb = movie.tmdb_id || movie.id;
        if (!tmdb) return searchByName(movie, callback);

        const fields = '&Fields=Id,Name,IndexNumber,Overview,PrimaryImageTag&Recursive=true';
        apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, (data) => {
            callback(data?.Items?.[0]);
        });
    }

    function searchByName(movie, callback) {
        const title = encodeURIComponent(movie.title || movie.name || '');
        if (!title) return callback(null);

        const fields = '&Fields=Id,Name,IndexNumber,Overview,PrimaryImageTag&Recursive=true&IncludeItemTypes=Movie,Series';
        apiRequest(`/Items?SearchTerm=${title}&Limit=5${fields}`, (data) => {
            callback(data?.Items?.[0]);
        });
    }

    function getSeasons(seriesId, callback) {
        apiRequest(`/Shows/${seriesId}/Seasons?Fields=Id,Name,IndexNumber`, (data) => callback(data.Items || []));
    }

    function getEpisodes(seasonId, callback) {
        apiRequest(`/Items?ParentId=${seasonId}&IncludeItemTypes=Episode&Fields=Id,Name,IndexNumber,Overview,PrimaryImageTag`, (data) => callback(data.Items || []));
    }

    function getStreamingUrl(itemId, callback) {
        const base = getUrl().replace(/\/$/, '');
        const url = `${base}/Videos/${itemId}/stream.mp4?static=true&api_key=${getApiKey()}`;
        callback(url);
    }

    function getPosterUrl(item) {
        if (!item) return '';
        const base = getUrl().replace(/\/$/, '');
        if (item.PrimaryImageTag) {
            return `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}`;
        }
        return `${base}/Items/${item.Id}/Images/Primary`;
    }

    // Основной обработчик (унифицированный)
    function handleEmbyClick(movie) {
        if (!isConfigured()) {
            notify('Настройте Emby в параметрах');
            return;
        }

        Lampa.Activity.loading(true);

        findInEmby(movie, (item) => {
            Lampa.Activity.loading(false);

            if (!item) {
                notify('Контент не найден в библиотеке Emby.');
                return;
            }

            if (item.Type === 'Movie') {
                playMovie(item);
            } else if (item.Type === 'Series') {
                currentSerieId = item.Id;
                showSeriesSelector(item, movie);
            } else {
                notify('Неизвестный тип контента');
            }
        });
    }

    function playMovie(item) {
        getStreamingUrl(item.Id, (streamingUrl) => {
            Lampa.Player.play({
                title: item.Name,
                url: streamingUrl,
                poster: getPosterUrl(item),
                timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id))
            });
        });
    }

    function playEpisode(episode) {
        currentEpisodeId = episode.Id;

        getStreamingUrl(episode.Id, (streamingUrl) => {
            const hash = Lampa.Utils.hash(`${currentSerieId}_${currentSeasonId}_${episode.Id}`);

            Lampa.Player.play({
                title: `${episode.SeriesName || ''} S${String(episode.ParentIndexNumber || '').padStart(2, '0')}E${String(episode.IndexNumber || '').padStart(2, '0')} - ${episode.Name}`,
                url: streamingUrl,
                poster: getPosterUrl(episode),
                timeline: Lampa.Timeline.view(hash)
            });
        });
    }

    // Показ селектора сезонов/эпизодов с использованием Filter (как в популярных плагинах)
    function showSeriesSelector(seriesItem, originalMovie) {
        const filter = new Lampa.Filter(originalMovie || {});
        const scroll = new Lampa.Scroll({ mask: true, over: true });

        let activity = Lampa.Activity.create({
            title: seriesItem.Name,
            header: {
                title: seriesItem.Name,
                subtitle: seriesItem.Overview ? seriesItem.Overview.substring(0, 120) + '...' : ''
            }
        });

        activity.render().append(scroll.render());
        activity.render().append(filter.render());

        // Загружаем сезоны
        getSeasons(seriesItem.Id, (seasons) => {
            if (!seasons.length) {
                notify('Сезоны не найдены');
                Lampa.Activity.destroy(activity);
                return;
            }

            const seasonOptions = seasons.map(s => ({
                title: `Сезон ${s.IndexNumber}`,
                value: s.Id,
                season: s
            }));

            filter.set('season', seasonOptions);
            filter.onSelect('season', (selected) => {
                currentSeasonId = selected.value;

                getEpisodes(selected.value, (episodes) => {
                    if (!episodes.length) {
                        notify('Эпизоды не найдены');
                        return;
                    }

                    const episodeOptions = episodes.map(ep => ({
                        title: `S${String(ep.ParentIndexNumber || '').padStart(2, '0')}E${String(ep.IndexNumber || '').padStart(2, '0')} - ${ep.Name}`,
                        value: ep.Id,
                        episode: ep
                    }));

                    filter.set('episode', episodeOptions);
                    filter.onSelect('episode', (selectedEpisode) => {
                        playEpisode(selectedEpisode.episode);
                    });
                });
            });

            // Автовыбор первого сезона
            if (seasonOptions.length) {
                filter.select('season', 0);
            }
        });

        // Кнопка назад
        activity.onBack = () => Lampa.Activity.destroy(activity);
    }

    // Добавление кнопки
    function addEmbyButton(data) {
        if (!data || !data.render) return;
        if (data.render.find('.view--emby').length) return;

        const button = $(`
            <div class="full-start__button selector view--emby" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
                <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
                <span>${PLUGIN_NAME}</span>
            </div>
        `);

        button.on('hover:enter', () => {
            handleEmbyClick(data.movie || data.card);
        });

        const playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) {
            playButton.after(button);
        } else {
            data.render.find('.buttons, .full-start__buttons, .activity__body').append(button);
        }
    }

    // Настройки
    function renderSettings(body) {
        body.empty();
        const url = getUrl();
        const key = getApiKey();

        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера Emby</div><div class="settings-param__value">${url || 'Не задан'}</div></div>`);
        urlRow.on('hover:enter', () => {
            Lampa.Input.edit({title: 'Emby URL (например http://192.168.1.100:8096)', value: url, free: true}, (val) => {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задан');
            });
        });

        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${key ? '••••••••••' : 'Не задан'}</div></div>`);
        keyRow.on('hover:enter', () => {
            Lampa.Input.edit({title: 'Emby API Key', value: key, free: true}, (val) => {
                Lampa.Storage.set(STORAGE_API_KEY, val);
                keyRow.find('.settings-param__value').text(val ? '••••••••••' : 'Не задан');
            });
        });

        wrap.append(urlRow).append(keyRow);
        body.append(wrap);
    }

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'emby',
            name: 'Emby',
            icon: '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>'
        });

        Lampa.Settings.listener.follow('open', function(e) {
            if (e.name === 'emby') renderSettings(e.body);
        });
    }

    function startPlugin() {
        initSettings();

        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                const data = {
                    render: e.object.activity.render(),
                    movie: e.data.movie || e.data.card
                };
                addEmbyButton(data);
            }
        });

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен успешно`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') startPlugin();
    });
})();
