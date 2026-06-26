(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '4.2.5';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // Внедряем стили
    if (!$('style#emby-plugin-styles').length) {
        $('head').append(`
            <style id="emby-plugin-styles">
                .emby-container { padding: 0; height: 100%; }
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
    
    function isConfigured() { return getUrl().length > 5 && getApiKey().length > 5; }
    function notify(msg) { Lampa.Noty.show(msg); }

    function buildApiUrl(endpoint) {
        const base = getUrl().replace(/\/$/, '');
        return `${base}/emby${endpoint}&api_key=${getApiKey()}`;
    }

    // Генерация DeviceId как в Emby
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

    /* --- Извлечение TMDB ID --- */
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

    /* --- Поиск ID в Emby --- */
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        let tmdb = extractTmdbId(movie);
        let network = new Lampa.Reguest();
        
        if (tmdb) {
            network.silent(buildApiUrl(`/Items?AnyProviderIdEquals=tmdb.${tmdb}&Recursive=true&IncludeItemTypes=Movie,Series`), (data) => {
                callback(data?.Items?.[0] || null);
            }, () => callback(null));
        } else {
            const title = movie.title || movie.name || movie.original_title || movie.original_name || '';
            if (!title) return callback(null);
            network.silent(buildApiUrl(`/Items?SearchTerm=${encodeURIComponent(title)}&Limit=3&Recursive=true&IncludeItemTypes=Movie,Series`), (data) => {
                callback(data?.Items?.[0] || null);
            }, () => callback(null));
        }
    }

    /* --- Получение сезонов из TMDB --- */
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

    /* --- Получение эпизодов из TMDB --- */
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

    /* --- Воспроизведение --- */
    function playVideo(item) {
        const base = getUrl().replace(/\/$/, '');
        const apiKey = getApiKey();
        const deviceId = getDeviceId();
        const playSessionId = Date.now().toString();
        
        // Формируем URL точно как в оригинальном Emby
        // Для эпизодов Emby использует формат: /emby/videos/{Id}/original.mkv?DeviceId=...&MediaSourceId=mediasource_{Id}&PlaySessionId=...&api_key=...
        let streamUrl = `${base}/emby/videos/${item.Id}/original.mkv?DeviceId=${deviceId}&MediaSourceId=mediasource_${item.Id}&PlaySessionId=${playSessionId}&api_key=${apiKey}`;
        
        console.log('Stream URL:', streamUrl);
        
        Lampa.Player.play({
            title: item.Name,
            url: streamUrl,
            poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id + ''))
        });
    }

    /* --- Компонент для сериалов --- */
    function EmbySeriesComponent() {
        let is_destroyed = false;
        let element = $('<div class="emby-container"></div>')[0];
        
        let seasons = [];
        let current_season = null;
        let current_episodes = [];
        let emby_series_id = null;
        let tmdb_id = null;

        this.create = function() {
            if (window.embySeriesData) {
                emby_series_id = window.embySeriesData.emby_id;
                tmdb_id = window.embySeriesData.tmdb_id;
            }
        };

        this.start = function() {
            if (!emby_series_id && window.embySeriesData) {
                emby_series_id = window.embySeriesData.emby_id;
                tmdb_id = window.embySeriesData.tmdb_id;
            }
            
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
                    current_season = seasons[0];
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

            let grid = $('<div class="emby-episodes-grid"></div>');

            if (current_episodes.length === 0) {
                grid.append('<div class="emby-empty">Эпизоды не найдены</div>');
            } else {
                current_episodes.forEach((episode) => {
                    let epNum = String(episode.episode_number).padStart(2, '0');
                    let stillPath = episode.still_path ? Lampa.TMDB.image('w400', episode.still_path) : '';
                    let rating = episode.vote_average ? episode.vote_average.toFixed(1) : '0.0';

                    let item = $(`
                        <div class="emby-episode-card selector" data-episode="${episode.episode_number}" data-season="${current_season.season_number}">
                            <div class="emby-ep-img-wrap">
                                ${stillPath ? `<img src="${stillPath}" class="emby-ep-img" onerror="this.style.display='none'">` : ''}
                                <div class="emby-ep-num">${epNum} серия</div>
                            </div>
                            <div class="emby-ep-title">${episode.name || 'Эпизод ' + epNum}</div>
                            <div class="emby-ep-info">⭐ ${rating}</div>
                        </div>
                    `);

                    item.on('hover:enter click', function() {
                        let epNumber = parseInt($(this).data('episode'));
                        let seasonNumber = parseInt($(this).data('season'));
                        
                        body.empty();
                        body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
                        
                        // Получаем ID эпизода из Emby
                        let query = `/Items?ParentId=${emby_series_id}&Season=${seasonNumber}&IncludeItemTypes=Episode&Fields=Id,Name,IndexNumber&SortBy=SortName&SortOrder=Ascending`;
                        
                        let net = new Lampa.Reguest();
                        net.silent(buildApiUrl(query), (data) => {
                            if (is_destroyed) return;
                            if (data && data.Items) {
                                let embyEpisode = data.Items.find(e => e.IndexNumber === epNumber);
                                
                                if (embyEpisode) {
                                    console.log('Found episode ID:', embyEpisode.Id, 'for episode number:', epNumber);
                                    console.log('Expected video ID should be 86, actual ID:', embyEpisode.Id);
                                    playVideo(embyEpisode);
                                } else {
                                    body.html('<div class="emby-empty">Эпизод не найден на Emby сервере</div>');
                                    setupNavigation();
                                }
                            } else {
                                body.html('<div class="emby-empty">Эпизоды не найдены</div>');
                                setupNavigation();
                            }
                        }, () => {
                            if (is_destroyed) return;
                            body.html('<div class="emby-empty">Ошибка загрузки</div>');
                            setupNavigation();
                        });
                    });
                    
                    grid.append(item);
                });
            }
            
            body.append(grid);
            setupNavigation();
        }

        function setupNavigation() {
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(element);
                    Lampa.Controller.collectionFocus(false, element);
                },
                up: () => Lampa.Controller.toggle('head'),
                down: () => {},
                left: () => Lampa.Controller.toggle('menu'),
                right: () => {},
                back: () => Lampa.Activity.backward()
            });
            Lampa.Controller.toggle('content');
        }

        this.render = function() {
            return element;
        };

        this.destroy = function() {
            is_destroyed = true;
        };
    }

    /* --- Главная логика запуска --- */
    function handleEmbyClick(movie) {
        if (!isConfigured()) return notify('Настройте Emby в параметрах');

        findInEmby(movie, (item) => {
            if (!item) return notify('Контент не найден в библиотеке Emby.');

            if (item.Type === 'Series') {
                let tmdbId = extractTmdbId(movie);
                
                window.embySeriesData = {
                    emby_id: item.Id,
                    tmdb_id: tmdbId,
                    title: item.Name
                };
                
                Lampa.Activity.push({
                    url: '',
                    title: item.Name,
                    component: 'emby_series'
                });
            } else if (item.Type === 'Movie') {
                playVideo(item);
            } else {
                notify('Неизвестный тип контента');
            }
        });
    }

    /* --- Кнопка в интерфейсе --- */
    function addEmbyButton(data) {
        if (!data || !data.render || !data.movie) return;
        if (data.render.find('.emby-button').length) return;

        const button = $(`
            <div class="full-start__button selector view--emby emby-button" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
                <svg width="40" height="40" viewBox="0 0 40 40">
                    <rect width="40" height="40" rx="8" fill="#00B0FF"/>
                    <text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text>
                </svg>
                <span>${PLUGIN_NAME}</span>
            </div>
        `);

        button.on('hover:enter click', () => handleEmbyClick(data.movie));

        const playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) playButton.after(button);
        else data.render.find('.buttons, .activity__body').append(button);
    }

    /* --- Настройки --- */
    function renderSettings(body) {
        body.empty();
        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${getUrl() || 'Не задано'}</div></div>`);
        urlRow.on('hover:enter click', () => {
            Lampa.Input.edit({title: 'Emby URL', value: getUrl(), free: true}, val => {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${getApiKey() ? '••••••••••' : 'Не задано'}</div></div>`);
        keyRow.on('hover:enter click', () => {
            Lampa.Input.edit({title: 'Emby API Key', value: getApiKey(), free: true}, val => {
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
        Lampa.Settings.listener.follow('open', e => { 
            if (e.name === 'emby') renderSettings(e.body); 
        });
    }

    /* --- Запуск --- */
    function startPlugin() {
        Lampa.Component.add('emby_series', EmbySeriesComponent);

        initSettings();
        Lampa.Listener.follow('full', e => {
            if (e.type === 'complite') {
                addEmbyButton({ 
                    render: e.object.activity.render(), 
                    movie: e.data.movie || e.data.card 
                });
            }
        });
        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', e => { 
        if (e.type === 'ready') startPlugin(); 
    });

})();
