(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '4.4.26';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // ---- Регистрируем стандартный шаблон (без проверки has) ----
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

    // ---- Стили ----
    if (!$('style#emby-plugin-styles').length) {
        $('head').append(`
            <style id="emby-plugin-styles">
                .emby-container { padding: 0; height: 100%; overflow-y: auto; }
                .emby-loader { display: flex; justify-content: center; align-items: center; height: 50vh; }
                .emby-empty { text-align: center; padding: 3em; font-size: 1.2em; opacity: 0.7; width: 100%; }
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

    /* --- Компонент для сериалов (полностью как в fx.js) --- */
    function EmbySeriesComponent(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var explorer = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var is_destroyed = false;
        var element = $('<div class="emby-container"></div>')[0];
        var seasons = [];
        var current_season = null;
        var current_episodes = [];
        var emby_series_id = null;
        var tmdb_id = null;

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
            // Если tmdb_id всё ещё нет, пытаемся извлечь из movie
            if (!tmdb_id && object && object.movie) {
                tmdb_id = extractTmdbId(object.movie);
            }

            // Настройка фильтра
            filter.render().find('.filter--sort').remove();
            filter.onSelect = function(type, a, b) {
                if (type === 'filter' && a.reset) {
                    // сброс (не используем)
                } else if (type === 'filter' && a.season) {
                    current_season = a.season;
                    loadEpisodes();
                }
            };
            filter.onBack = function() {
                Lampa.Activity.backward();
            };

            // Добавляем фильтр в начало
            var filterHtml = filter.render();
            $(element).append(filterHtml);

            // Добавляем explorer
            explorer.appendFiles(scroll.render());
            // Убираем заголовок explorer (он нам не нужен)
            explorer.render().find('.explorer__files-head').remove();
        };

        this.start = function() {
            var body = $(element);
            body.find('.emby-loader').remove();
            if (!tmdb_id) {
                body.html('<div class="emby-empty">Не удалось определить TMDB ID сериала</div>');
                setupNavigation();
                return;
            }

            body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            getSeasonsFromTMDB(tmdb_id, function(result) {
                if (is_destroyed) return;
                seasons = result;
                if (seasons.length === 0) {
                    body.html('<div class="emby-empty">Сезоны не найдены</div>');
                    setupNavigation();
                } else {
                    var savedSeason = window.embyLastSeason;
                    if (savedSeason && savedSeason.seriesId === emby_series_id) {
                        var found = seasons.find(function(s) { return s.season_number === savedSeason.seasonNumber; });
                        current_season = found || seasons[0];
                    } else {
                        current_season = seasons[0];
                    }
                    updateFilter();
                    loadEpisodes();
                }
            });
        };

        function updateFilter() {
            var items = seasons.map(function(s) {
                return {
                    title: s.name || 'Сезон ' + s.season_number,
                    season: s,
                    selected: s.season_number === current_season.season_number
                };
            });
            filter.set('filter', [{
                title: Lampa.Lang.translate('torrent_serial_season'),
                items: items,
                stype: 'season'
            }]);
            filter.chosen('filter', [Lampa.Lang.translate('torrent_serial_season') + ': ' + (current_season.name || 'Сезон ' + current_season.season_number)]);
        }

        function loadEpisodes() {
            if (is_destroyed) return;
            var body = $(element);
            body.find('.emby-loader').remove();
            body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            getEpisodesFromTMDB(tmdb_id, current_season.season_number, function(episodes) {
                if (is_destroyed) return;
                current_episodes = episodes;
                renderEpisodes();
            });
        }

        function renderEpisodes() {
            if (is_destroyed) return;
            var body = $(element);
            body.find('.emby-loader').remove();

            scroll.clear();

            if (current_episodes.length === 0) {
                var empty = $('<div class="emby-empty">Эпизоды не найдены</div>');
                scroll.append(empty);
            } else {
                current_episodes.forEach(function(episode, index) {
                    var epNum = String(episode.episode_number).padStart(2, '0');
                    var stillPath = episode.still_path ? 'https://image.tmdb.org/t/p/w300' + episode.still_path : '';
                    
                    var title = episode.name || 'Эпизод ' + epNum;
                    var rating = episode.vote_average ? episode.vote_average.toFixed(1) : '0.0';
                    var airDate = episode.air_date ? Lampa.Utils.parseTime(episode.air_date).full : '';
                    
                    var timelineKey = 'tv/' + tmdb_id + '/' + current_season.season_number + '/' + episode.episode_number;
                    var timeline = Lampa.Timeline.view(timelineKey);
                    
                    var infoParts = [];
                    if (rating !== '0.0') infoParts.push('⭐ ' + rating);
                    if (airDate) infoParts.push(airDate);
                    var info = infoParts.join(' ● ');
                    
                    var html = Lampa.Template.get('online_prestige_full', {
                        title: title,
                        time: '',
                        info: info,
                        quality: ''
                    });

                    var timelineContainer = html.find('.online-prestige__timeline');
                    var timelineElement = Lampa.Timeline.render(timeline);
                    if (timelineElement) {
                        timelineContainer.append(timelineElement);
                    }

                    var img = html.find('img')[0];
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

                    var item = $(html);
                    item.data('episode', episode.episode_number);
                    item.data('season', current_season.season_number);
                    item.data('index', index);

                    item.on('hover:enter click', function() {
                        var epNumber = parseInt($(this).data('episode'));
                        var seasonNumber = parseInt($(this).data('season'));
                        window.embyLastSeason = { seriesId: emby_series_id, seasonNumber: seasonNumber };

                        body.empty();
                        body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');

                        var net = new Lampa.Reguest();
                        var seasonQuery = '/Items?ParentId=' + emby_series_id + '&IncludeItemTypes=Season&Fields=Id,IndexNumber';
                        net.silent(buildApiUrl(seasonQuery), function(seasonData) {
                            if (is_destroyed) return;
                            if (seasonData && seasonData.Items) {
                                var season = seasonData.Items.find(function(s) { return s.IndexNumber === seasonNumber; });
                                if (season) {
                                    var episodeQuery = '/Items?ParentId=' + season.Id + '&IncludeItemTypes=Episode&Fields=Id,Name,IndexNumber,PrimaryImageTag&SortBy=SortName&SortOrder=Ascending';
                                    net.silent(buildApiUrl(episodeQuery), function(episodeData) {
                                        if (is_destroyed) return;
                                        if (episodeData && episodeData.Items) {
                                            var sortedEpisodes = episodeData.Items.sort(function(a, b) { return (a.IndexNumber || 0) - (b.IndexNumber || 0); });
                                            var playlist = sortedEpisodes.map(function(ep, i) {
                                                var psId = Date.now() + i;
                                                var tmdbEp = current_episodes[i];
                                                var epNumForTimeline = tmdbEp ? tmdbEp.episode_number : (i + 1);
                                                var key = 'tv/' + tmdb_id + '/' + seasonNumber + '/' + epNumForTimeline;
                                                return {
                                                    title: ep.Name,
                                                    url: getUrl().replace(/\/$/, '') + '/emby/Videos/' + ep.Id + '/stream?Static=true&DeviceId=' + getDeviceId() + '&PlaySessionId=' + psId + '&api_key=' + getApiKey(),
                                                    poster: ep.PrimaryImageTag ? getUrl().replace(/\/$/, '') + '/Items/' + ep.Id + '/Images/Primary?tag=' + ep.PrimaryImageTag : '',
                                                    timeline: Lampa.Timeline.view(key)
                                                };
                                            });
                                            var currentEp = sortedEpisodes[epNumber - 1];
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

                    scroll.append(item);
                });
            }

            explorer.appendFiles(scroll.render());
            explorer.render().find('.explorer__files-head').remove();

            updateFilter();
            setupNavigation();
            Lampa.Controller.collectionSet(scroll.render(), explorer.render());
            setTimeout(function() {
                Lampa.Controller.collectionFocus(false, scroll.render());
            }, 100);
        }

        function setupNavigation() {
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(scroll.render(), explorer.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                up: function() {
                    if (Navigator.canmove('up')) {
                        Navigator.move('up');
                    } else {
                        Lampa.Controller.toggle('head');
                    }
                },
                down: function() {
                    Navigator.move('down');
                },
                right: function() {
                    filter.show(Lampa.Lang.translate('title_filter'), 'filter');
                },
                left: function() {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: function() {
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
            if (explorer) explorer.destroy();
            if (scroll) scroll.destroy();
            if (filter) filter.destroy();
        };
    }

    /* --- Остальная часть плагина --- */
    function handleEmbyClick(movie) {
        if (!isConfigured()) return notify('Настройте Emby в параметрах');

        findInEmby(movie, function(item) {
            if (!item) return notify('Контент не найден в библиотеке Emby.');

            if (item.Type === 'Series') {
                var tmdbId = extractTmdbId(movie);
                window.embySeriesData = {
                    emby_id: item.Id,
                    tmdb_id: tmdbId,
                    title: item.Name
                };
                var params = {
                    emby_id: item.Id,
                    tmdb_id: tmdbId,
                    movie: movie,
                    title: item.Name
                };
                Lampa.Activity.push({
                    url: '',
                    title: item.Name,
                    component: 'emby_series',
                    object: params
                });
            } else if (item.Type === 'Movie') {
                var tmdbId = extractTmdbId(movie);
                playVideo(item, tmdbId);
            } else {
                notify('Неизвестный тип контента');
            }
        });
    }

    function addEmbyButton(data) {
        if (!data || !data.render || !data.movie) return;
        if (data.render.find('.emby-button').length) return;

        var button = $('<div class="full-start__button selector view--emby emby-button" data-subtitle="' + PLUGIN_NAME + ' v' + PLUGIN_VERSION + '">' +
            '<svg width="40" height="40" viewBox="0 0 40 40">' +
            '<rect width="40" height="40" rx="8" fill="#00B0FF"/>' +
            '<text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text>' +
            '</svg>' +
            '<span>' + PLUGIN_NAME + '</span>' +
            '</div>');

        button.on('hover:enter click', function() { handleEmbyClick(data.movie); });

        var playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) playButton.after(button);
        else data.render.find('.buttons, .activity__body').append(button);
    }

    function renderSettings(body) {
        body.empty();
        var wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        var urlRow = $('<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">' + (getUrl() || 'Не задано') + '</div></div>');
        urlRow.on('hover:enter click', function() {
            Lampa.Input.edit({title: 'Emby URL', value: getUrl(), free: true}, function(val) {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        var keyRow = $('<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">' + (getApiKey() ? '••••••••••' : 'Не задано') + '</div></div>');
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
