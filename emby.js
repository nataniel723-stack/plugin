(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '1.0';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // ---- Регистрируем стандартный шаблон для серий ----
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
                .emby-filter-btn { background: rgba(255,255,255,0.1); padding: 0.6em 1.5em; border-radius: 5px; cursor: pointer; font-size: 1.1em; font-weight: bold; transition: background 0.3s; }
                .emby-filter-btn.focus { background: #fff; color: #000; }
                .emby-loader { display: flex; justify-content: center; align-items: center; height: 10em; flex-grow: 1; }
                .emby-loader-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 100; display: flex; justify-content: center; align-items: center; border-radius: 10px; } 
                .emby-empty { text-align: center; padding: 3em; font-size: 1.2em; opacity: 0.7; width: 100%; }
                .online-prestige { margin: 0.5em 1em; }
                .online-prestige.focus::after { top: -0.3em; left: -0.3em; right: -0.3em; bottom: -0.3em; }
            </style>
        `);
    }

    // ---- Базовые функции ----
    function getUrl() { return (Lampa.Storage.get(STORAGE_URL, '') || '').trim(); }
    function getApiKey() { return (Lampa.Storage.get(STORAGE_API_KEY, '') || '').trim(); }
    function isConfigured() { return getUrl().length > 5 && getApiKey().length > 5; }
    function notify(msg) { Lampa.Noty.show(msg); }

    // Проверка на устройства Apple
    const isApple = (typeof Lampa !== 'undefined' && Lampa.Platform.is('apple')) || 
                    /Mac|iPhone|iPod|iPad|AppleTV/i.test(navigator.userAgent);

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

    function markHistoryAndWatch(movie, season, episode) {
        if (!movie) return;

        Lampa.Favorite.add('history', movie, 100);

        if (season && episode) {
            var titleForHash = movie.number_of_seasons ? (movie.original_name || movie.name) : (movie.original_title || movie.title);
            if (!titleForHash) titleForHash = movie.title || '';
            
            var file_id = Lampa.Utils.hash(titleForHash);
            var watched = Lampa.Storage.cache('online_watched_last', 5000, {});
            
            if (!watched[file_id]) {
                watched[file_id] = {};
            }
            
            Lampa.Arrays.extend(watched[file_id], {
                balanser: 'emby',
                balanser_name: 'Emby',
                season: parseInt(season),
                episode: parseInt(episode)
            }, true);
            
            Lampa.Storage.set('online_watched_last', watched);
        }
    }

    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        let tmdb = extractTmdbId(movie);
        let network = new (Lampa.Request || Lampa.Reguest)();
        if (tmdb) {
            network.silent(buildApiUrl(`/Items?AnyProviderIdEquals=tmdb.${tmdb}&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name,Container`), (data) => {
                callback((data && data.Items && data.Items[0]) || null);
            }, () => callback(null));
        } else {
            const title = movie.title || movie.name || movie.original_title || movie.original_name || '';
            if (!title) return callback(null);
            network.silent(buildApiUrl(`/Items?SearchTerm=${encodeURIComponent(title)}&Limit=3&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name,Container`), (data) => {
                callback((data && data.Items && data.Items[0]) || null);
            }, () => callback(null));
        }
    }

    function getSeasonsFromTMDB(tmdb_id, callback) {
        if (!tmdb_id) { callback([]); return; }
        let network = new (Lampa.Request || Lampa.Reguest)();
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
        let network = new (Lampa.Request || Lampa.Reguest)();
        let url = Lampa.TMDB.api('tv/' + tmdb_id + '/season/' + season_number + '?api_key=' + Lampa.TMDB.key() + '&language=' + Lampa.Storage.get('language', 'ru'));
        network.silent(url, (data) => {
            if (data && data.episodes) {
                callback(data.episodes);
            } else {
                callback([]);
            }
        }, () => callback([]));
    }

    function buildStreamUrl(itemId, container = 'mp4') {
        const base = getUrl().replace(/\/$/, '');
        return `${base}/emby/Videos/${itemId}/stream.${container}?Static=true&DeviceId=${getDeviceId()}&PlaySessionId=${Date.now()}&api_key=${getApiKey()}`;
    }

    function playMovie(item, movie) {
        const base = getUrl().replace(/\/$/, '');
        
        // Генерация хеша
        const titleForHash = movie ? (movie.original_title || movie.original_name || movie.title || movie.name) : item.Name;
        const timelineKey = Lampa.Utils.hash(titleForHash);
        
        let container = item.Container ? item.Container.split(',')[0] : 'mp4';
        
        // Формируем красивое название
        const movieTitle = movie ? (movie.title || movie.name || item.Name) : item.Name;
        
        let playObj = {
            title: movieTitle,
            url: buildStreamUrl(item.Id, container),
            poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(timelineKey),
            movie: movie
        };
        
        // Создаем массив плейлиста
        let playlist = [playObj];
        
        // Костыль для tvOS
        if (isApple) {
            playObj.playlist = playlist;
        }

        markHistoryAndWatch(movie, null, null);

        // Сначала регистрируем плейлист в ядре
        Lampa.Player.playlist(playlist);

        // И только потом запускаем
        Lampa.Player.play(playObj);
    }
    
    /* --- КОМПОНЕНТ СЕРИАЛОВ --- */
    function EmbySeriesComponent(object) {
        var network = new (Lampa.Request || Lampa.Reguest)();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var explorer = new Lampa.Explorer(object); 
        var is_destroyed = false;
        
        var filterPanel = $('<div class="explorer__files-head" style="padding: 1.5em; display: flex; align-items: center; gap: 1em;"></div>');
        var seasonBtn = $('<div class="emby-filter-btn selector">Сезон</div>');
        
        var seasons = [];
        var current_season = null;
        var current_episodes = [];
        var emby_series_id = null;
        var tmdb_id = null;
        var last_focused = false; 

        this.create = function() {
            if (object && object.emby_id) emby_series_id = object.emby_id;
            if (object && object.tmdb_id) tmdb_id = object.tmdb_id;
            if (!emby_series_id || !tmdb_id) {
                if (window.embySeriesData) {
                    emby_series_id = window.embySeriesData.emby_id;
                    tmdb_id = window.embySeriesData.tmdb_id;
                }
            }
            if (!tmdb_id && object && object.movie) {
                tmdb_id = extractTmdbId(object.movie);
            }

            seasonBtn.on('hover:enter click', function() {
                showSeasonSelector();
            });
            filterPanel.append(seasonBtn);

            explorer.appendFiles(scroll.render());
            explorer.appendHead(filterPanel);
            
            scroll.body().addClass('torrent-list'); 
            scroll.minus(filterPanel);
        };

        this.start = function() {
            scroll.clear();
            if (!tmdb_id) {
                scroll.append($('<div class="emby-empty">Не удалось определить TMDB ID сериала</div>'));
                setupNavigation();
                return;
            }

            scroll.append($('<div class="emby-loader"><div class="broadcast__spin"></div></div>'));
            
            getSeasonsFromTMDB(tmdb_id, function(result) {
                if (is_destroyed) return;
                seasons = result;
                if (seasons.length === 0) {
                    scroll.clear();
                    scroll.append($('<div class="emby-empty">Сезоны не найдены</div>'));
                    setupNavigation();
                } else {
                    var savedSeason = window.embyLastSeason;
                    if (savedSeason && savedSeason.seriesId === emby_series_id) {
                        var found = seasons.find(function(s) { return s.season_number === savedSeason.seasonNumber; });
                        current_season = found || seasons[0];
                    } else {
                        current_season = seasons[0];
                    }
                    updateSeasonBtn();
                    loadEpisodes();
                }
            });
        };

        function updateSeasonBtn() {
            if (seasonBtn) {
                seasonBtn.text(current_season.name || 'Сезон ' + current_season.season_number);
            }
        }

        function showSeasonSelector() {
            if (!seasons.length) return;
            var items = seasons.map(function(s) {
                return {
                    title: s.name || 'Сезон ' + s.season_number,
                    season: s,
                    selected: s.season_number === current_season.season_number
                };
            });
            Lampa.Select.show({
                title: Lampa.Lang.translate('torrent_serial_season'),
                items: items,
                onSelect: function(a) {
                    current_season = a.season;
                    updateSeasonBtn();
                    window.embyLastSeason = { seriesId: emby_series_id, seasonNumber: current_season.season_number };
                    loadEpisodes();
                },
                onBack: function() {
                    Lampa.Controller.toggle('content');
                }
            });
        }

        function loadEpisodes() {
            if (is_destroyed) return;
            scroll.clear();
            scroll.append($('<div class="emby-loader"><div class="broadcast__spin"></div></div>'));
            
            getEpisodesFromTMDB(tmdb_id, current_season.season_number, function(episodes) {
                if (is_destroyed) return;
                current_episodes = episodes;
                renderEpisodes();
            });
        }

        function renderEpisodes() {
            if (is_destroyed) return;
            scroll.clear();

            if (current_episodes.length === 0) {
                scroll.append($('<div class="emby-empty">Эпизоды не найдены</div>'));
            } else {
                current_episodes.forEach(function(episode, index) {
                    var epNum = String(episode.episode_number).padStart(2, '0');
                    var stillPath = episode.still_path ? 'https://image.tmdb.org/t/p/w300' + episode.still_path : '';
                    
                    var title = episode.name || 'Эпизод ' + epNum;
                    var rating = episode.vote_average ? episode.vote_average.toFixed(1) : '0.0';
                    var airDate = episode.air_date ? Lampa.Utils.parseTime(episode.air_date).full : '';
                    
                    var infoParts = [];
                    if (rating !== '0.0') infoParts.push('⭐ ' + rating);
                    if (airDate) infoParts.push(airDate);
                    var info = infoParts.join(' ● ');

                    var orig_title = object.movie.original_name || object.movie.original_title || '';
                    var hash_timeline = Lampa.Utils.hash([current_season.season_number, episode.episode_number, orig_title].join(''));
                    
                    episode.timeline = Lampa.Timeline.view(hash_timeline);
                    
                    var html = Lampa.Template.get('online_prestige_full', {
                        title: title,
                        time: '',
                        info: info,
                        quality: ''
                    });

                    html.find('.online-prestige__timeline').append(Lampa.Timeline.render(episode.timeline));

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

                    item.on('hover:focus', function(e) {
                        last_focused = e.target;
                        scroll.update($(this), true);
                    });

                    item.on('hover:enter click', function() {
                        var epNumber = parseInt($(this).data('episode'));
                        var seasonNumber = parseInt($(this).data('season'));
                        window.embyLastSeason = { seriesId: emby_series_id, seasonNumber: seasonNumber };

                        var overlayLoader = $('<div class="emby-loader-overlay"><div class="broadcast__spin"></div></div>');
                        explorer.render().append(overlayLoader);

                        var net = new (Lampa.Request || Lampa.Reguest)();
                        var seasonQuery = '/Items?ParentId=' + emby_series_id + '&IncludeItemTypes=Season&Fields=Id,IndexNumber';
                        
                        net.silent(buildApiUrl(seasonQuery), function(seasonData) {
                            if (is_destroyed) { overlayLoader.remove(); return; }
                            
                            if (seasonData && seasonData.Items) {
                                var season = seasonData.Items.find(function(s) { return s.IndexNumber === seasonNumber; });
                                if (season) {
                                    var episodeQuery = '/Items?ParentId=' + season.Id + '&IncludeItemTypes=Episode&Fields=Id,Name,IndexNumber,PrimaryImageTag,Container&SortBy=SortName&SortOrder=Ascending';
                                    net.silent(buildApiUrl(episodeQuery), function(episodeData) {
                                        overlayLoader.remove();
                                        if (is_destroyed) return;
                                        
                                        if (episodeData && episodeData.Items) {
                                            var sortedEpisodes = episodeData.Items.sort(function(a, b) { return (a.IndexNumber || 0) - (b.IndexNumber || 0); });
                                            
                                            var playlist = sortedEpisodes.map(function(ep, i) {
                                                var tmdbEp = current_episodes[i];
                                                var epTimeline = tmdbEp ? tmdbEp.timeline : null;
                                                var epNumForTimeline = tmdbEp ? tmdbEp.episode_number : (i + 1);
                                                
                                                if(!epTimeline) {
                                                    var key = Lampa.Utils.hash([seasonNumber, epNumForTimeline, orig_title].join(''));
                                                    epTimeline = Lampa.Timeline.view(key);
                                                }
                                                
                                                let container = ep.Container ? ep.Container.split(',')[0] : 'mp4';
                                                
                                                return {
                                                    title: ep.Name,
                                                    url: buildStreamUrl(ep.Id, container),
                                                    poster: ep.PrimaryImageTag ? `${getUrl().replace(/\/$/, '')}/Items/${ep.Id}/Images/Primary?tag=${ep.PrimaryImageTag}` : '',
                                                    timeline: epTimeline,
                                                    movie: object.movie,
                                                    season: seasonNumber,
                                                    episode: epNumForTimeline
                                                };
                                            });

                                            var currentEp = playlist[epNumber - 1];
                                            if (currentEp) {
                                                // Костыль исключительно для Apple TV
                                                if (isApple && playlist.length > 1) {
                                                    currentEp.playlist = playlist;
                                                }

                                                markHistoryAndWatch(object.movie, seasonNumber, epNumber);

                                                Lampa.Player.play(currentEp);
                                                Lampa.Player.playlist(playlist);
                                            }
                                        }
                                    }, function() {
                                        overlayLoader.remove();
                                        notify('Ошибка загрузки серий из Emby');
                                    });
                                } else {
                                    overlayLoader.remove();
                                    notify('Сезон не найден в Emby');
                                }
                            } else {
                                overlayLoader.remove();
                                notify('Пустой ответ серверов Emby');
                            }
                        }, function() {
                            overlayLoader.remove();
                            notify('Ошибка соединения с сервером Emby');
                        });
                    });

                    scroll.append(item);
                });
            }

            setupNavigation();
            Lampa.Controller.enable('content');
        }

        function setupNavigation() {
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(scroll.render(), explorer.render());
                    Lampa.Controller.collectionFocus(last_focused || false, scroll.render());
                },
                up: function() {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function() {
                    if (Navigator.canmove('down')) Navigator.move('down');
                },
                right: function() {
                    if (Navigator.canmove('right')) Navigator.move('right');
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
            return explorer.render(); 
        };

        this.destroy = function() {
            is_destroyed = true;
            network.clear();
            if (scroll) scroll.destroy();
            if (explorer) explorer.destroy();
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
                    movie: movie,
                    object: params
                });
            } else if (item.Type === 'Movie') {
                playMovie(item, movie);
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

    function initSettings() {
        Lampa.SettingsApi.addComponent({
            component: 'emby',
            name: 'Emby',
            icon: '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'emby',
            param: {
                name: STORAGE_URL,
                type: 'input',
                values: '',
                default: ''
            },
            field: {
                name: 'Адрес сервера',
                description: 'Нажмите для ввода'
            },
            onChange: function(value) {
                Lampa.Storage.set(STORAGE_URL, (value || '').trim());
            }
        });
        
        Lampa.SettingsApi.addParam({
            component: 'emby',
            param: {
                name: STORAGE_API_KEY,
                type: 'input',
                values: '',
                default: ''
            },
            field: {
                name: 'API Key',
                description: 'Нажмите для ввода'
            },
            onChange: function(value) {
                Lampa.Storage.set(STORAGE_API_KEY, (value || '').trim());
            }
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
