(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '4.1.9';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // Внедряем стили
    if (!$('style#emby-plugin-styles').length) {
        $('head').append(`
            <style id="emby-plugin-styles">
                .emby-episodes-grid { 
                    display: flex; 
                    flex-wrap: wrap; 
                    padding: 1em 1.5em; 
                    gap: 1.5em; 
                }
                
                .emby-episode-card { 
                    width: calc(25% - 1.125em); 
                    cursor: pointer; 
                    transition: transform 0.2s, background 0.2s; 
                    border-radius: 0.5em; 
                    padding: 0.5em; 
                    box-sizing: border-box; 
                    position: relative;
                }
                .emby-episode-card.focus { 
                    background: rgba(255, 255, 255, 0.1); 
                    transform: scale(1.05); 
                }
                
                .emby-ep-img-wrap { 
                    width: 100%; 
                    aspect-ratio: 16 / 9; 
                    border-radius: 0.4em; 
                    overflow: hidden; 
                    position: relative; 
                    background: #111; 
                    margin-bottom: 0.6em; 
                    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                }
                .emby-ep-img { 
                    width: 100%; 
                    height: 100%; 
                    object-fit: cover; 
                }
                
                .emby-ep-num { 
                    position: absolute; 
                    top: 0.4em; 
                    left: 0.4em; 
                    background: rgba(0,0,0,0.7); 
                    padding: 0.2em 0.5em; 
                    border-radius: 0.3em; 
                    font-weight: bold; 
                    font-size: 0.9em; 
                    color: #fff;
                }
                
                .emby-ep-title { 
                    font-size: 1.1em; 
                    white-space: nowrap; 
                    overflow: hidden; 
                    text-overflow: ellipsis; 
                    margin-bottom: 0.2em; 
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
                }
                .emby-ep-info { 
                    font-size: 0.85em; 
                    color: #aaa; 
                }

                .emby-filter { 
                    display: flex; 
                    align-items: center; 
                    justify-content: flex-start; 
                    padding: 1.5em 2em 0 2em; 
                    gap: 1em;
                    flex-wrap: wrap;
                }
                .emby-filter-btn { 
                    background: rgba(255,255,255,0.1); 
                    padding: 0.6em 1.5em; 
                    border-radius: 5px; 
                    cursor: pointer; 
                    font-size: 1.1em; 
                    font-weight: bold;
                }
                .emby-filter-btn.focus { 
                    background: #fff; 
                    color: #000; 
                }
                
                .emby-loader { 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    height: 50vh; 
                }
                .emby-empty { 
                    text-align: center; 
                    padding: 3em; 
                    font-size: 1.2em; 
                    opacity: 0.7; 
                    width: 100%; 
                }

                .emby-button {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.5em;
                    padding: 1em;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .emby-button.focus {
                    background: rgba(255,255,255,0.1);
                }

                @media (max-width: 1200px) { 
                    .emby-episode-card { width: calc(33.333% - 1em); } 
                }
                @media (max-width: 768px) { 
                    .emby-episode-card { width: calc(50% - 0.75em); } 
                }
                @media (max-width: 480px) { 
                    .emby-episode-card { width: 100%; } 
                }
            </style>
        `);
    }

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
    }

    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY, '78b3967970814692b20b095e5b13f0eb') || '').trim();
    }
    
    function isConfigured() { 
        return getUrl().length > 5 && getApiKey().length > 5; 
    }
    
    function notify(msg) { 
        Lampa.Noty.show(msg); 
    }

    function buildApiUrl(endpoint) {
        const base = getUrl().replace(/\/$/, '');
        const sep = endpoint.includes('?') ? '&' : '?';
        return `${base}/emby${endpoint}${sep}api_key=${getApiKey()}`;
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
        
        console.log('Emby search - tmdb:', tmdb, 'movie:', movie);
        
        if (tmdb) {
            let url = buildApiUrl(`/Items?AnyProviderIdEquals=tmdb.${tmdb}&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name`);
            console.log('Emby API URL:', url);
            network.silent(url, (data) => {
                console.log('Emby API response:', data);
                callback(data?.Items?.[0] || null);
            }, (error) => {
                console.error('Emby API error:', error);
                callback(null);
            });
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

    function getEpisodeFromEmby(series_id, season_number, episode_number, callback) {
        let network = new Lampa.Reguest();
        const query = `/Items?ParentId=${series_id}&Season=${season_number}&IncludeItemTypes=Episode&Fields=Id,Name,PrimaryImageTag,MediaSources&SortBy=SortName&SortOrder=Ascending`;
        network.silent(buildApiUrl(query), (data) => {
            if (data && data.Items) {
                let episode = data.Items.find(e => e.IndexNumber === episode_number);
                callback(episode || null);
            } else callback(null);
        }, () => callback(null));
    }

    function playVideo(item) {
        const base = getUrl().replace(/\/$/, '');
        let streamUrl = `${base}/Videos/${item.Id}/stream?api_key=${getApiKey()}&Static=true&MediaSourceId=${item.Id}&PlaySessionId=${Date.now()}`;
        if (item.MediaSources && item.MediaSources.length > 0) {
            streamUrl = `${base}/Videos/${item.Id}/stream?api_key=${getApiKey()}&Static=true&MediaSourceId=${item.MediaSources[0].Id}&PlaySessionId=${Date.now()}`;
        }
        console.log('Playing:', streamUrl);
        Lampa.Player.play({
            title: item.Name,
            url: streamUrl,
            poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id + ''))
        });
    }

    /* --- Компонент для сериалов --- */
    function EmbySeriesComponent() {
        let network = new Lampa.Reguest();
        let scroll = new Lampa.Scroll({mask: true, over: true});
        let is_destroyed = false;
        
        let seasons = [];
        let current_season = null;
        let current_episodes = [];
        let emby_series_id = null;
        let tmdb_id = null;

        this.create = function() {
            console.log('EmbySeriesComponent create');
            if (window.embySeriesData) {
                emby_series_id = window.embySeriesData.emby_id;
                tmdb_id = window.embySeriesData.tmdb_id;
                console.log('Loaded from global:', {emby_series_id, tmdb_id});
            }
            scroll.render();
        };

        this.start = function() {
            console.log('EmbySeriesComponent start');
            
            if (!emby_series_id && window.embySeriesData) {
                emby_series_id = window.embySeriesData.emby_id;
                tmdb_id = window.embySeriesData.tmdb_id;
            }
            
            scroll.clear();
            
            if (!tmdb_id) {
                scroll.append('<div class="emby-empty">Не удалось определить TMDB ID сериала</div>');
                setupNavigation();
                return;
            }

            scroll.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            
            getSeasonsFromTMDB(tmdb_id, (result) => {
                if (is_destroyed) return;
                seasons = result;
                console.log('Seasons loaded:', seasons);
                if (seasons.length === 0) {
                    scroll.clear();
                    scroll.append('<div class="emby-empty">Сезоны не найдены</div>');
                    setupNavigation();
                } else {
                    current_season = seasons[0];
                    loadEpisodes();
                }
            });
        };

        function loadEpisodes() {
            if (is_destroyed) return;
            scroll.clear();
            scroll.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            
            getEpisodesFromTMDB(tmdb_id, current_season.season_number, (episodes) => {
                if (is_destroyed) return;
                current_episodes = episodes;
                console.log('Episodes loaded:', episodes);
                renderEpisodes();
            });
        }

        function renderEpisodes() {
            if (is_destroyed) return;
            scroll.clear();
            
            let filterPanel = $('<div class="emby-filter"></div>');
            let seasonBtn = $(`<div class="emby-filter-btn selector">${current_season.name || 'Сезон ' + current_season.season_number}</div>`);
            
            seasonBtn.on('hover:enter', function() {
                console.log('Season button focus');
            });
            
            seasonBtn.on('hover:click', function() {
                console.log('Season button clicked');
                let items = seasons.map(s => ({
                    title: s.name || `Сезон ${s.season_number}`,
                    season: s,
                    selected: s.season_number === current_season.season_number
                }));
                
                Lampa.Select.show({
                    title: 'Выберите сезон',
                    items: items,
                    onSelect: function(a) {
                        current_season = a.season;
                        loadEpisodes();
                    },
                    onBack: function() {
                        Lampa.Controller.toggle('content');
                    }
                });
            });
            
            filterPanel.append(seasonBtn);
            scroll.append(filterPanel);

            let grid = $('<div class="emby-episodes-grid"></div>');

            if (current_episodes.length === 0) {
                grid.append('<div class="emby-empty">Эпизоды не найдены</div>');
            } else {
                current_episodes.forEach((episode) => {
                    let epNum = String(episode.episode_number).padStart(2, '0');
                    let stillPath = episode.still_path ? Lampa.TMDB.image('w400', episode.still_path) : '';
                    let rating = episode.vote_average ? episode.vote_average.toFixed(1) : '0.0';

                    let card = $(`
                        <div class="emby-episode-card selector" data-episode="${episode.episode_number}" data-season="${current_season.season_number}">
                            <div class="emby-ep-img-wrap">
                                ${stillPath ? `<img src="${stillPath}" class="emby-ep-img" onerror="this.style.display='none'">` : ''}
                                <div class="emby-ep-num">${epNum} серия</div>
                            </div>
                            <div class="emby-ep-title">${episode.name || 'Эпизод ' + epNum}</div>
                            <div class="emby-ep-info">⭐ ${rating}</div>
                        </div>
                    `);

                    card.on('hover:click', function() {
                        console.log('Episode clicked:', $(this).data());
                        let epNumber = parseInt($(this).data('episode'));
                        let seasonNumber = parseInt($(this).data('season'));
                        
                        scroll.clear();
                        scroll.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
                        
                        getEpisodeFromEmby(emby_series_id, seasonNumber, epNumber, (embyEpisode) => {
                            if (is_destroyed) return;
                            console.log('Emby episode found:', embyEpisode);
                            if (embyEpisode) {
                                playVideo(embyEpisode);
                            } else {
                                scroll.clear();
                                scroll.append('<div class="emby-empty">Эпизод не найден на Emby сервере</div>');
                                setupNavigation();
                            }
                        });
                    });
                    
                    grid.append(card);
                });
            }
            
            scroll.append(grid);
            setupNavigation();
        }

        function setupNavigation() {
            console.log('Setup navigation');
            Lampa.Controller.add('content', {
                toggle: function() {
                    if (scroll && scroll.render()) {
                        Lampa.Controller.collectionSet(scroll.render());
                        Lampa.Controller.collectionFocus(false, scroll.render());
                    }
                },
                up: function() {
                    if (window.Navigator && window.Navigator.canmove('up')) {
                        window.Navigator.move('up');
                    } else {
                        Lampa.Controller.toggle('head');
                    }
                },
                down: function() {
                    if (window.Navigator && window.Navigator.canmove('down')) {
                        window.Navigator.move('down');
                    }
                },
                left: function() {
                    if (window.Navigator && window.Navigator.canmove('left')) {
                        window.Navigator.move('left');
                    } else {
                        Lampa.Controller.toggle('menu');
                    }
                },
                right: function() {
                    if (window.Navigator && window.Navigator.canmove('right')) {
                        window.Navigator.move('right');
                    }
                },
                back: function() {
                    Lampa.Activity.backward();
                }
            });
            Lampa.Controller.toggle('content');
        }

        this.render = function() {
            return scroll.render();
        };
        
        this.pause = function() {};
        this.stop = function() {};

        this.destroy = function() {
            is_destroyed = true;
            network.clear();
            scroll.destroy();
        };
    }

    /* --- Главная логика запуска --- */
    function handleEmbyClick(movie) {
        console.log('handleEmbyClick called', movie);
        
        if (!isConfigured()) {
            console.log('Emby not configured');
            return notify('Настройте Emby в параметрах');
        }

        findInEmby(movie, (item) => {
            console.log('findInEmby result:', item);
            
            if (!item) return notify('Контент не найден в библиотеке Emby.');

            if (item.Type === 'Series') {
                let tmdbId = extractTmdbId(movie);
                
                window.embySeriesData = {
                    emby_id: item.Id,
                    tmdb_id: tmdbId,
                    title: item.Name
                };
                
                console.log('Pushing series activity', window.embySeriesData);
                
                Lampa.Activity.push({
                    url: '',
                    title: item.Name,
                    component: 'emby_series'
                });
            } else if (item.Type === 'Movie') {
                console.log('Playing movie:', item);
                playVideo(item);
            } else {
                notify('Неизвестный тип контента');
            }
        });
    }

    /* --- Кнопка в интерфейсе --- */
    function addEmbyButton(data) {
        console.log('addEmbyButton called', data);
        
        if (!data || !data.render || !data.movie) {
            console.log('Invalid data for button');
            return;
        }
        
        if (data.render.find('.emby-button').length) {
            console.log('Button already exists');
            return;
        }

        let button = $('<div class="full-start__button selector view--emby emby-button"></div>');
        button.attr('data-subtitle', PLUGIN_NAME + ' v' + PLUGIN_VERSION);
        button.append('<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>');
        button.append('<span>' + PLUGIN_NAME + '</span>');

        console.log('Button created, movie data:', data.movie);

        button.on('hover:click', function() {
            console.log('Emby button clicked!');
            handleEmbyClick(data.movie);
        });

        let playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) {
            playButton.after(button);
            console.log('Button added after play button');
        } else {
            data.render.find('.buttons, .activity__body').append(button);
            console.log('Button added to container');
        }
    }

    /* --- Настройки --- */
    function renderSettings(body) {
        body.empty();
        
        let wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        let urlRow = $('<div class="settings-param selector"></div>');
        urlRow.append('<div class="settings-param__name">Адрес сервера</div>');
        urlRow.append('<div class="settings-param__value">' + (getUrl() || 'Не задано') + '</div>');
        urlRow.on('hover:click', function() {
            Lampa.Input.edit({title: 'Emby URL', value: getUrl(), free: true}, function(val) {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        let keyRow = $('<div class="settings-param selector"></div>');
        keyRow.append('<div class="settings-param__name">API Key</div>');
        keyRow.append('<div class="settings-param__value">' + (getApiKey() ? '••••••••••' : 'Не задано') + '</div>');
        keyRow.on('hover:click', function() {
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

    /* --- Запуск --- */
    function startPlugin() {
        console.log('%c' + PLUGIN_NAME + ' v' + PLUGIN_VERSION + ' starting', 'color: #00ff88; font-weight: bold');
        
        Lampa.Component.add('emby_series', EmbySeriesComponent);

        initSettings();
        
        Lampa.Listener.follow('full', function(e) {
            console.log('Full event:', e.type, e);
            if (e.type === 'complite') {
                console.log('Adding Emby button');
                addEmbyButton({ 
                    render: e.object.activity.render(), 
                    movie: e.data.movie || e.data.card 
                });
            }
        });
        
        console.log('%c' + PLUGIN_NAME + ' v' + PLUGIN_VERSION + ' loaded', 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) {
        console.log('App ready, starting plugin');
        startPlugin();
    } else {
        console.log('Waiting for app ready');
        Lampa.Listener.follow('app', function(e) { 
            if (e.type === 'ready') {
                console.log('App ready event received');
                startPlugin(); 
            }
        });
    }

})();
