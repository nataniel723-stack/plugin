(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '0.2.6';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    let currentSerieId = ''; // Глобальная переменная для хранения ID сериала

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
    }

    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY, '') || '').trim();
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
            return;
        }

        const base = getUrl().replace(/\/$/, '');
        const url = `${base}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${getApiKey()}`;

        new Lampa.Reguest().silent(url, success, error || (() => {}));
    }

    // Поиск в Emby
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);

        const fields = '&Fields=Id,Name&Recursive=true&IncludeItemTypes=Movie,Series,Episode';

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

        const fields = '&Fields=Id,Name&Recursive=true';
        apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, (data) => {
            callback(data?.Items?.[0]);
        });
    }

    function searchByName(movie, callback) {
        const title = encodeURIComponent(movie.title || movie.name || '');
        if (!title) return callback(null);

        const fields = '&Fields=Id,Name&Recursive=true&IncludeItemTypes=Movie,Series';
        apiRequest(`/Items?SearchTerm=${title}&Limit=3${fields}`, (data) => {
            callback(data?.Items?.[0]);
        });
    }

    // Вспомогательные функции для работы с сериалами
    function getSeasons(seriesId, callback) {
        const url = `${getUrl().replace(/\/$/, '')}/Shows/${seriesId}/Seasons?api_key=${getApiKey()}`;
        apiRequest(url, callback);
    }

    function getEpisodes(seriesId, seasonNumber, callback) {
        const url = `${getUrl().replace(/\/$/, '')}/Shows/${seriesId}/Seasons/${seasonNumber}/Episodes?api_key=${getApiKey()}`;
        apiRequest(url, callback);
    }

    function getAudioStreams(episodeId, callback) {
        const url = `${getUrl().replace(/\/$/, '')}/Videos/${episodeId}/MediaSources?api_key=${getApiKey()}`;
        apiRequest(url, callback);
    }

    function getSubtitleStreams(episodeId, callback) {
        const url = `${getUrl().replace(/\/$/, '')}/Videos/${episodeId}/Subtitles?api_key=${getApiKey()}`;
        apiRequest(url, callback);
    }

    function getStreamingUrl(episodeId, callback) {
        const url = `${getUrl().replace(/\/$/, '')}/Videos/${episodeId}/stream.mp4?static=true&api_key=${getApiKey()}`;
        callback(url);
    }

    // Компонент для воспроизведения видео из Emby
    function embyPlayer(component, object) {
        let network = new Lampa.Reguest();
        let scroll = new Lampa.Scroll({mask: true, over: true});
        let files = new Lampa.Explorer(object);
        
        this.initialize = function() {
            files.appendFiles(scroll.render());
            files.appendHead($('<div/>'));
            scroll.body().addClass('torrent-list');
            this.search();
        };

        this.search = function() {
            this.activity.loader(true);
            this.find();
        };

        this.find = function() {
            let movie = object.movie;
            if (!movie) return this.doesNotAnswer();

            findInEmby(movie, (item) => {
                if (!item) return this.doesNotAnswer();
                
                if (item.Type === 'Series') {
                    // Обработка сериала
                    currentSerieId = item.Id;
                    getSeasons(item.Id, (seasons) => {
                        chooseSeason(seasons, Lampa.Storage.get('emby_selected_season', seasons[0]?.IndexNumber));
                    });
                } else {
                    // Обработка фильма
                    const streamingUrl = `${getUrl().replace(/\/$/, '')}/Videos/${item.Id}/stream.mp4?static=true&api_key=${getApiKey()}`;

                    Lampa.Player.play({
                        title: item.Name,
                        url: streamingUrl,
                        poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                        timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id))
                    });
                }
            });
        };

        this.doesNotAnswer = function() {
            this.activity.loader(false);
            this.activity.toggle();
            notify('Контент не найден в библиотеке Emby.');
        };
    }

    // Выбор сезона
    function chooseSeason(seasons, currentSeason) {
        const options = seasons.map(s => ({label: `Сезон ${s.IndexNumber}`, value: s.IndexNumber}));
        Lampa.Select.show({
            title: 'Выбор сезона',
            options: options,
            defaultValue: currentSeason,
            onChange: (newSeason) => {
                Lampa.Storage.set('emby_selected_season', newSeason);
                getEpisodes(currentSerieId, newSeason, (episodes) => {
                    chooseEpisode(episodes);
                });
            }
        });
    }

    // Выбор эпизода
    function chooseEpisode(episodes, currentEpisode) {
        const options = episodes.map(e => ({label: `Эпизод ${e.IndexNumber}: ${e.Name}`, value: e.IndexNumber}));
        Lampa.Select.show({
            title: 'Выбор эпизода',
            options: options,
            defaultValue: currentEpisode,
            onChange: (newEpisode) => {
                Lampa.Storage.set('emby_selected_episode', newEpisode);
                getAudioStreams(currentEpisodeId, (audioStreams) => {
                    chooseAudio(audioStreams);
                });
            }
        });
    }

    // Выбор аудиопотока (озвучки)
    function chooseAudio(audioStreams, currentAudio) {
        const options = audioStreams.map(stream => ({label: stream.DisplayTitle, value: stream.Index}));
        Lampa.Select.show({
            title: 'Выбор аудио дорожки',
            options: options,
            defaultValue: currentAudio,
            onChange: (newAudio) => {
                Lampa.Storage.set('emby_selected_audio', newAudio);
                getSubtitleStreams(currentEpisodeId, (subtitleStreams) => {
                    chooseSubtitle(subtitleStreams);
                });
            }
        });
    }

    // Выбор субтитров
    function chooseSubtitle(subtitleStreams, currentSubtitle) {
        const options = subtitleStreams.map(stream => ({label: stream.Language, value: stream.Index}));
        Lampa.Select.show({
            title: 'Выбор субтитров',
            options: options,
            defaultValue: currentSubtitle,
            onChange: (newSubtitle) => {
                Lampa.Storage.set('emby_selected_subtitle', newSubtitle);
                playEpisode(currentEpisodeId);
            }
        });
    }

    // Воспроизведение эпизода
    function playEpisode(episodeId) {
        getStreamingUrl(episodeId, (streamingUrl) => {
            if (!streamingUrl) {
                notify('Ссылка на эпизод не найдена.');
                return;
            }

            Lampa.Player.play({
                title: `Эпизод ${Lampa.Storage.get('emby_selected_episode')}`,
                url: streamingUrl,
                poster: `${getUrl()}/Shows/${currentSerieId}/Images/Primary`,
                timeline: Lampa.Timeline.view(Lampa.Utils.hash(`${currentSerieId}_${Lampa.Storage.get('emby_selected_season')}_${Lampa.Storage.get('emby_selected_episode')}`))
            });
        });
    }

    // Обработчик нажатия на кнопку Emby
    function handleEmbyClick(movie) {
        if (!isConfigured()) {
            notify('Настройте Emby в параметрах');
            return;
        }

        findInEmby(movie, (item) => {
            if (!item) {
                notify('Контент не найден в библиотеке Emby.');
                return;
            }

            if (item.Type === 'Series') {
                // Обработка сериала
                currentSerieId = item.Id;
                getSeasons(item.Id, (seasons) => {
                    chooseSeason(seasons, Lampa.Storage.get('emby_selected_season', seasons[0]?.IndexNumber));
                });
            } else {
                // Обработка фильма
                const streamingUrl = `${getUrl().replace(/\/$/, '')}/Videos/${item.Id}/stream.mp4?static=true&api_key=${getApiKey()}`;

                Lampa.Player.play({
                    title: item.Name,
                    url: streamingUrl,
                    poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                    timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id))
                });
            }
        });
    }

    // Добавление кнопки Emby
    function addEmbyButton(data) {
        if (!data || !data.render) return;
        if (data.render.find('.emby-button').length) return;

        const button = $(`
            <div class="full-start__button selector view--emby" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
                <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
                <span>${PLUGIN_NAME}</span>
            </div>
        `);

        button.on('hover:enter', function() {
            handleEmbyClick(data.movie || data.card);
        });

        const playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) {
            playButton.after(button);
        } else {
            data.render.find('.buttons, .activity__body').append(button);
        }
    }

    // Настройки
    function renderSettings(body) {
        body.empty();
        const url = getUrl();
        const key = getApiKey();

        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${url || 'Не задано'}</div></div>`);
        urlRow.on('hover:enter', () => {
            Lampa.Input.edit({title: 'Emby URL', value: url, free: true}, (val) => {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${key ? '••••••••••' : 'Не задано'}</div></div>`);
        keyRow.on('hover:enter', () => {
            Lampa.Input.edit({title: 'Emby API Key', value: key, free: true}, (val) => {
                Lampa.Storage.set(STORAGE_API_KEY, val);
                keyRow.find('.settings-param__value').text(val ? '••••••••••' : 'Не задано');
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

        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') startPlugin();
    });
})();
