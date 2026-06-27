(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '4.4.29';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // ---- Регистрируем стандартный шаблон online_prestige_full ----
    Lampa.Template.add('online_prestige_full', `
        <div class="online-prestige online-prestige--full selector">
            <div class="online-prestige__img">
                <img alt="">
                <div class="online-prestige__loader"></div>
            </div>
            <div class="online-prestige__body">
                <div class="online-prestige__head">
                    <div class="online-prestige__title">{title}</div>
                    <div class="online-prestige__time">{time}</div>
                </div>
                <div class="online-prestige__timeline"></div>
                <div class="online-prestige__footer">
                    <div class="online-prestige__info">{info}</div>
                    <div class="online-prestige__quality">{quality}</div>
                </div>
            </div>
        </div>
    `);

    // ---- Стили (минимальные, остальные загружаются из ядра) ----
    if (!$('style#emby-plugin-styles').length) {
        $('head').append(`
            <style id="emby-plugin-styles">
                .emby-container { padding: 0; height: 100%; overflow-y: auto; }
                .emby-loader { display: flex; justify-content: center; align-items: center; height: 50vh; }
                .emby-empty { text-align: center; padding: 3em; font-size: 1.2em; opacity: 0.7; width: 100%; }
                .emby-filter { display: flex; align-items: center; padding: 1.5em 2em 0.5em 2em; gap: 1em; flex-wrap: wrap; position: sticky; top: 0; z-index: 10; background: rgba(0,0,0,0.9); }
                .emby-filter-btn { background: rgba(255,255,255,0.1); padding: 0.6em 1.5em; border-radius: 5px; cursor: pointer; font-size: 1.1em; font-weight: bold; }
                .emby-filter-btn.focus { background: #fff; color: #000; }
            </style>
        `);
    }

    // ---- Базовые функции ----
    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
    }
    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY, '78b3967970814692b20b095e5b13f0eb') || '').trim();
    }
    function isConfigured() { return getUrl().length > 5 && getApiKey().length > 5; }
    function notify(msg) { Lampa.Noty.show(msg); }

    function buildApiUrl(endpoint) {
        const base = getUrl().replace(/\/$/, '');
        const sep = endpoint.includes('?') ? '&' : '?';
        return `${base}/emby${endpoint}${sep}api_key=${getApiKey()}`;
    }

    function getDeviceId() {
        let deviceId = Lampa.Storage.get('emby_device_id');
        if (!deviceId) {
            deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            Lampa.Storage.set('emby_device_id', deviceId);
        }
        return deviceId;
    }

    function extractTmdbId(movie) {
        if (!movie) return null;
        let tmdb = movie.tmdb_id || movie.id;
        if (typeof movie.url === 'string') {
            let match = movie.url.match(/tv\/(\d+)/);
            if (match) tmdb = parseInt(match[1]);
        }
        if (!tmdb && movie.data) {
            tmdb = movie.data.tmdb_id || movie.data.id;
        }
        if (typeof tmdb === 'string' && !isNaN(tmdb)) {
            tmdb = parseInt(tmdb);
        }
        return tmdb;
    }

    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        let tmdb = extractTmdbId(movie);
        let network = new Lampa.Reguest();
        if (tmdb) {
            network.silent(buildApiUrl(`/Items?AnyProviderIdEquals=tmdb.${tmdb}&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name`), (data) => {
                callback(data?.Items?.[0] || null);
            }, () => callback(null));
        } else {
            const title = movie.title || movie.name || movie.original_title || movie.original_name || '';
            if (!title) return callback(null);
            network.silent(buildApiUrl(`/Items?SearchTerm=${encodeURIComponent(title)}&Limit=3&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name`), (data) => {
                callback(data?.Items?.[0] || null);
            }, () => callback(null));
        }
    }

    function getSeasonsFromTMDB(tmdb_id, callback) {
        if (!tmdb_id) { callback([]); return; }
        let network = new Lampa.Reguest();
        let url = Lampa.TMDB.api('tv/' + tmdb_id + '?api_key=' + Lampa.TMDB.key() + '&language=' + Lampa.Storage.get('language', 'ru'));
        network.silent(url, (data) => {
            if (data && data.seasons) {
                callback(data.seasons.filter(s => s.season_number > 0));
            } else {
                callback([]);
            }
        }, () => callback([]));
    }

    function getEpisodesFromTMDB(tmdb_id, season_number, callback) {
        if (!tmdb_id) { callback([]); return; }
        let network = new Lampa.Reguest();
        let url = Lampa.TMDB.api('tv/' + tmdb_id + '/season/' + season_number + '?api_key=' + Lampa.TMDB.key() + '&language=' + Lampa.Storage.get('language', 'ru'));
        network.silent(url, (data) => {
            if (data && data.episodes) {
                callback(data.episodes);
            } else {
                callback([]);
            }
        }, () => callback([]));
    }

    // ---- Воспроизведение ----
    function playVideo(item, tmdbId, seasonNumber, episodeNumber, playlist, currentIndex) {
        const base = getUrl().replace(/\/$/, '');
        const apiKey = getApiKey();
        const deviceId = getDeviceId();
        const playSessionId = Date.now().toString();
        
        let streamUrl = `${base}/emby/Videos/${item.Id}/stream?Static=true&DeviceId=${deviceId}&PlaySessionId=${playSessionId}&api_key=${apiKey}`;
        
        let timeline = null;
        let source = {};

        if (playlist && playlist.length > 0) {
            timeline = playlist[currentIndex].timeline;
            source = {
                playlist: playlist,
                current: currentIndex,
                type: 'tv',
                id: tmdbId,
                season: seasonNumber,
                episode: episodeNumber
            };
            Lampa.Player.play({
                title: item.Name,
                url: streamUrl,
                poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                timeline: timeline,
                source: source
            });
        } else {
            let timelineKey = 'movie/' + (tmdbId || item.Id);
            timeline = Lampa.Timeline.view(timelineKey);
            source = { id: tmdbId || item.Id, type: 'movie' };
            Lampa.Player.play({
                title: item.Name,
                url: streamUrl,
                poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                timeline: timeline,
                source: source
            });
        }
    }

    /* --- Компонент для сериалов --- */
    function EmbySeriesComponent(object) {
        let network = new Lampa.Reguest();
        let is_destroyed = false;
        let element = $('<div class="emby-container"></div>')[0];
        let seasons = [];
        let current_season = null;
        let current_episodes = [];
        let emby_series_id = null;
        let tmdb_id = null;

        this.create = function() {
            // Получаем данные из object или глобальной переменной
            if (object && object.emby_id) emby_series_id = object.emby_id;
            if (object && object.tmdb_id) tmdb_id = object.tmdb_id;
            if (!emby_series_id || !tmdb_id) {
                if (window.embySeriesData) {
                    emby_series_id = window.embySeriesData.emby_id;
                    tmdb_id = window.embySeriesData.tmdb_id;
                }
            }
            // Если всё ещё нет, пытаемся извлечь из object.movie
            if (!tmdb_id && object && object.movie) {
                tmdb_id = extractTmdbId(object.movie);
            }
        };

        this.start = function() {
            let body = $(element);
            body.empty();
            if (!tmdb_id) {
                body.html('<div class="emby-empty">Не удалось определить TMDB ID сериала</div>');
                setupNavigation();
                return;
            }

            body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            getSeasonsFromTMDB(tmdb_id, (result) => {
                if (is_destroyed) return;
                seasons = result;
                if (seasons.length === 0) {
                    body.html('<div class="emby-empty">Сезоны не найдены</div>');
                    setupNavigation();
                } else {
                    let savedSeason = window.embyLastSeason;
                    if (savedSeason && savedSeason.seriesId === emby_series_id) {
                        let found = seasons.find(s => s.season_number === savedSeason.seasonNumber);
                        current_season = found || seasons[0];
                    } else {
                        current_season = seasons[0];
                    }
                    loadEpisodes(body);
                }
            });
        };

        function loadEpisodes(body) {
            if (is_destroyed) return;
            body.empty();
            body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            getEpisodesFromTMDB(tmdb_id, current_season.season_number, (episodes) => {
                if (is_destroyed) return;
                current_episodes = episodes;
                renderEpisodes(body);
            });
        }

        function renderEpisodes(body) {
            if (is_destroyed) return;
            body.empty();

            // Фильтр сезона
            let filterPanel = $('<div class="emby-filter"></div>');
            let seasonBtn = $(`<div class="emby-filter-btn selector">${current_season.name || 'Сезон ' + current_season.season_number}</div>`);
            seasonBtn.on('hover:enter click', () => {
                let items = seasons.map(s => ({
                    title: s.name || `Сезон ${s.season_number}`,
                    season: s,
                    selected: s.season_number === current_season.season_number
                }));
                Lampa.Select.show({
                    title: 'Выберите сезон',
                    items: items,
                    onSelect: (a) => {
                        current_season = a.season;
                        loadEpisodes(body);
                    },
                    onBack: () => {
                        Lampa.Controller.toggle('content');
                    }
                });
            });
            filterPanel.append(seasonBtn);
            body.append(filterPanel);

            // Список серий
            let list = $('<div class="emby-episodes-list"></div>');

            if (current_episodes.length === 0) {
                list.append('<div class="emby-empty">Эпизоды не найдены</div>');
            } else {
                current_episodes.forEach((episode, index) => {
                    let epNum = String(episode.episode_number).padStart(2, '0');
                    let stillPath = episode.still_path ? 'https://image.tmdb.org/t/p/w300' + episode.still_path : '';
                    
                    let title = episode.name || 'Эпизод ' + epNum;
                    let rating = episode.vote_average ? episode.vote_average.toFixed(1) : '0.0';
                    let airDate = episode.air_date ? Lampa.Utils.parseTime(episode.air_date).full : '';
                    
                    let timelineKey = 'tv/' + tmdb_id + '/' + current_season.season_number + '/' + episode.episode_number;
                    let timeline = Lampa.Timeline.view(timelineKey);
                    
                    let infoParts = [];
                    if (rating !== '0.0') infoParts.push('⭐ ' + rating);
                    if (airDate) infoParts.push(airDate);
                    let info = infoParts.join(' ● ');
                    
                    // Получаем HTML из шаблона
                    let html = Lampa.Template.get('online_prestige_full', {
                        title: title,
                        time: '',
                        info: info,
                        quality: ''
                    });

                    // Вставляем таймлайн
                    let timelineContainer = html.find('.online-prestige__timeline');
                    let timelineElement = Lampa.Timeline.render(timeline);
                    if (timelineElement) {
                        timelineContainer.append(timelineElement);
                    }

                    // Загружаем картинку
                    let img = html.find('img')[0];
                    if (stillPath) {
                        img.onload = function() {
                            html.find('.online-prestige__img').addClass('online-prestige__img--loaded');
                            html.find('.online-prestige__loader').remove();
                        };
                        img.onerror = function() {
                            img.src = './img/img_broken.svg';
                        };
                        img.src = stillPath;
                    } else {
                        img.src = './img/img_broken.svg';
                        html.find('.online-prestige__loader').remove();
                    }

                    let item = $(html);
                    item.data('episode', episode.episode_number);
                    item.data('season', current_season.season_number);
                    item.data('index', index);
                    item.addClass('selector');

                    // Клик по серии
                    item.on('hover:enter click', function() {
                        let epNumber = parseInt($(this).data('episode'));
                        let seasonNumber = parseInt($(this).data('season'));
                        window.embyLastSeason = { seriesId: emby_series_id, seasonNumber: seasonNumber };

                        body.empty();
                        body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');

                        let net = new Lampa.Reguest();
                        let seasonQuery = '/Items?ParentId=' + emby_series_id + '&IncludeItemTypes=Season&Fields=Id,IndexNumber';
                        net.silent(buildApiUrl(seasonQuery), function(seasonData) {
                            if (is_destroyed) return;
                            if (seasonData && seasonData.Items) {
                                let season = seasonData.Items.find(s => s.IndexNumber === seasonNumber);
                                if (season) {
                                    let episodeQuery = '/Items?ParentId=' + season.Id + '&IncludeItemTypes=Episode&Fields=Id,Name,IndexNumber,PrimaryImageTag&SortBy=SortName&SortOrder=Ascending';
                                    net.silent(buildApiUrl(episodeQuery), function(episodeData) {
                                        if (is_destroyed) return;
                                        if (episodeData && episodeData.Items) {
                                            let sortedEpisodes = episodeData.Items.sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));
                                            let playlist = sortedEpisodes.map(function(ep, i) {
                                                let psId = Date.now() + i;
                                                let tmdbEp = current_episodes[i];
                                                let epNumForTimeline = tmdbEp ? tmdbEp.episode_number : (i + 1);
                                                let key = 'tv/' + tmdb_id + '/' + seasonNumber + '/' + epNumForTimeline;
                                                return {
                                                    title: ep.Name,
                                                    url: getUrl().replace(/\/$/, '') + '/emby/Videos/' + ep.Id + '/stream?Static=true&DeviceId=' + getDeviceId() + '&PlaySessionId=' + psId + '&api_key=' + getApiKey(),
                                                    poster: ep.PrimaryImageTag ? getUrl().replace(/\/$/, '') + '/Items/' + ep.Id + '/Images/Primary?tag=' + ep.PrimaryImageTag : '',
                                                    timeline: Lampa.Timeline.view(key)
                                                };
                                            });
                                            let currentEp = sortedEpisodes[epNumber - 1];
                                            if (currentEp) {
                                                playVideo(currentEp, tmdb_id, seasonNumber, epNumber, playlist, epNumber - 1);
                                            }
                                        }
                                    }, function() {
                                        if (is_destroyed) return;
                                        body.html('<div class="emby-empty">Ошибка загрузки</div>');
                                        setupNavigation();
                                    });
                                }
                            }
                        }, function() {
                            if (is_destroyed) return;
                            body.html('<div class="emby-empty">Ошибка загрузки</div>');
                            setupNavigation();
                        });
                    });

                    list.append(item);
                });
            }

            body.append(list);
            element.scrollTop = 0;
            setupNavigation();

            // Устанавливаем начальный фокус
            setTimeout(() => {
                let first = $(list).find('.selector').first();
                if (first.length) {
                    first.addClass('focus');
                }
                Lampa.Controller.collectionSet(element);
                Lampa.Controller.collectionFocus(false, element);
            }, 100);
        }

        function scrollToFocused() {
            let focused = $(element).find('.selector.focus');
            if (focused.length) {
                let containerRect = element.getBoundingClientRect();
                let elementRect = focused[0].getBoundingClientRect();
                if (elementRect.bottom > containerRect.bottom - 20) {
                    element.scrollBy({ top: elementRect.bottom - containerRect.bottom + 100, behavior: 'smooth' });
                }
                if (elementRect.top < containerRect.top + 80) {
                    element.scrollBy({ top: elementRect.top - containerRect.top - 100, behavior: 'smooth' });
                }
            }
        }

        function setupNavigation() {
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(element);
                    Lampa.Controller.collectionFocus(false, element);
                    setTimeout(scrollToFocused, 100);
                },
                up: () => {
                    if (window.Navigator && window.Navigator.canmove && window.Navigator.canmove('up')) {
                        window.Navigator.move('up');
                        setTimeout(scrollToFocused, 50);
                    } else {
                        Lampa.Controller.toggle('head');
                    }
                },
                down: () => {
                    if (window.Navigator && window.Navigator.canmove && window.Navigator.canmove('down')) {
                        window.Navigator.move('down');
                        setTimeout(scrollToFocused, 50);
                    }
                },
                left: () => {
                    if (window.Navigator && window.Navigator.canmove && window.Navigator.canmove('left')) {
                        window.Navigator.move('left');
                        setTimeout(scrollToFocused, 50);
                    } else {
                        Lampa.Controller.toggle('menu');
                    }
                },
                right: () => {
                    if (window.Navigator && window.Navigator.canmove && window.Navigator.canmove('right')) {
                        window.Navigator.move('right');
                        setTimeout(scrollToFocused, 50);
                    }
                },
                back: () => {
                    Lampa.Activity.backward();
                }
            });
            Lampa.Controller.toggle('content');
        }

        this.render = function() {
            return element;
        };

        this.destroy = function() {
            is_destroyed = true;
            network.clear();
        };
    }

    /* --- Остальная часть плагина --- */
    function handleEmbyClick(movie) {
        if (!isConfigured()) return notify('Настройте Emby в параметрах');

        findInEmby(movie, function(item) {
            if (!item) return notify('Контент не найден в библиотеке Emby.');

            if (item.Type === 'Series') {
                let tmdbId = extractTmdbId(movie);
                // Сохраняем в глобальную переменную
                window.embySeriesData = {
                    emby_id: item.Id,
                    tmdb_id: tmdbId,
                    title: item.Name
                };
                // Передаём movie для отображения информации, и object для компонента
                Lampa.Activity.push({
                    url: '',
                    title: item.Name,
                    component: 'emby_series',
                    movie: movie,
                    object: {
                        emby_id: item.Id,
                        tmdb_id: tmdbId,
                        movie: movie
                    }
                });
            } else if (item.Type === 'Movie') {
                let tmdbId = extractTmdbId(movie);
                playVideo(item, tmdbId);
            } else {
                notify('Неизвестный тип контента');
            }
        });
    }

    function addEmbyButton(data) {
        if (!data || !data.render || !data.movie) return;
        if (data.render.find('.emby-button').length) return;

        let button = $('<div class="full-start__button selector view--emby emby-button" data-subtitle="' + PLUGIN_NAME + ' v' + PLUGIN_VERSION + '">' +
            '<svg width="40" height="40" viewBox="0 0 40 40">' +
            '<rect width="40" height="40" rx="8" fill="#00B0FF"/>' +
            '<text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text>' +
            '</svg>' +
            '<span>' + PLUGIN_NAME + '</span>' +
            '</div>');

        button.on('hover:enter click', function() { handleEmbyClick(data.movie); });

        let playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) playButton.after(button);
        else data.render.find('.buttons, .activity__body').append(button);
    }

    function renderSettings(body) {
        body.empty();
        let wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        let urlRow = $('<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">' + (getUrl() || 'Не задано') + '</div></div>');
        urlRow.on('hover:enter click', function() {
            Lampa.Input.edit({title: 'Emby URL', value: getUrl(), free: true}, function(val) {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        let keyRow = $('<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">' + (getApiKey() ? '••••••••••' : 'Не задано') + '</div></div>');
        keyRow.on('hover:enter click', function() {
            Lampa.Input.edit({title: 'Emby API Key', value: getApiKey(), free: true}, function(val) {
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
        Lampa.Component.add('emby_series', EmbySeriesComponent);

        initSettings();
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                addEmbyButton({
                    render: e.object.activity.render(),
                    movie: e.data.movie || e.data.card
                });
            }
        });
        console.log('%c' + PLUGIN_NAME + ' v' + PLUGIN_VERSION + ' загружен', 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') startPlugin();
    });

})();
