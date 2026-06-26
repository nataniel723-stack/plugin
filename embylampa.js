(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '4.0.5';

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
                .emby-ep-time { 
                    position: absolute; 
                    bottom: 0.4em; 
                    right: 0.4em; 
                    background: rgba(0,0,0,0.7); 
                    padding: 0.2em 0.5em; 
                    border-radius: 0.3em; 
                    font-size: 0.85em; 
                    color: #ddd;
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

                .emby-movie-info {
                    display: flex;
                    gap: 2em;
                    padding: 2em;
                    align-items: flex-start;
                }
                .emby-movie-poster {
                    width: 300px;
                    border-radius: 10px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                }
                .emby-movie-details {
                    flex: 1;
                }
                .emby-movie-details h2 {
                    font-size: 2em;
                    margin-bottom: 0.5em;
                }
                .emby-movie-details .meta {
                    color: #aaa;
                    margin-bottom: 1em;
                }
                .emby-movie-details .overview {
                    color: #ddd;
                    line-height: 1.6;
                    margin-bottom: 1.5em;
                }
                .emby-play-btn {
                    background: #00B0FF;
                    color: #fff;
                    padding: 1em 2em;
                    border-radius: 8px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5em;
                    font-size: 1.2em;
                    font-weight: bold;
                }
                .emby-play-btn.focus {
                    transform: scale(1.05);
                    box-shadow: 0 0 20px rgba(0,176,255,0.5);
                }

                @media (max-width: 1200px) { 
                    .emby-episode-card { width: calc(33.333% - 1em); }
                    .emby-movie-info { flex-direction: column; }
                    .emby-movie-poster { width: 100%; max-width: 300px; }
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

    function getUrl() { return (Lampa.Storage.get(STORAGE_URL) || '').trim(); }
    function getApiKey() { return (Lampa.Storage.get(STORAGE_API_KEY) || '').trim(); }
    function isConfigured() { return getUrl().length > 5 && getApiKey().length > 5; }
    function notify(msg) { Lampa.Noty.show(msg); }

    function buildApiUrl(endpoint) {
        const base = getUrl().replace(/\/$/, '');
        const sep = endpoint.includes('?') ? '&' : '?';
        return `${base}/emby${endpoint}${sep}api_key=${getApiKey()}`;
    }

    /* --- Поиск контента --- */
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        let network = new Lampa.Reguest();
        const fields = '&Fields=Id,Name,Type,ParentId,PrimaryImageTag,Overview,RunTimeTicks,CommunityRating,Genres,ProductionYear&Recursive=true&IncludeItemTypes=Movie,Series,Episode';
        const tmdb = movie.tmdb_id || movie.id;
        
        if (tmdb) {
            network.silent(buildApiUrl(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`), data => {
                callback(data?.Items?.[0] || null);
            });
            return;
        }

        const title = encodeURIComponent(movie.title || movie.name || '');
        if (title) {
            network.silent(buildApiUrl(`/Items?SearchTerm=${title}&Limit=3${fields}`), data => {
                callback(data?.Items?.[0] || null);
            });
        } else {
            callback(null);
        }
    }

    /* --- Воспроизведение --- */
    function playVideo(item) {
        const base = getUrl().replace(/\/$/, '');
        Lampa.Player.play({
            title: item.Name,
            url: `${base}/Videos/${item.Id}/stream.mp4?static=true&api_key=${getApiKey()}`,
            poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id + ''))
        });
    }

    /* --- Компонент для фильмов --- */
    function EmbyMovieComponent() {
        let network = new Lampa.Reguest();
        let is_destroyed = false;
        let component = this;
        
        // Создаем DOM элемент
        let element = $('<div class="emby-container"></div>')[0];

        this.create = function() {
            // Вызывается при создании активности
        };

        this.start = function() {
            let object = component.object || {};
            let body = $(element);
            body.empty();
            body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');

            network.silent(buildApiUrl(`/Items?Ids=${object.id}&Fields=Overview,RunTimeTicks,CommunityRating,Genres,ProductionYear,PrimaryImageTag`), (data) => {
                if (is_destroyed || !data?.Items?.length) {
                    if (!is_destroyed) body.html('<div class="emby-empty">Фильм не найден</div>');
                    return;
                }
                
                let item = data.Items[0];
                let base = getUrl().replace(/\/$/, '');
                let poster = item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?maxWidth=400&quality=90` : '';
                let year = item.ProductionYear || '';
                let genres = (item.Genres || []).join(', ');
                let rating = item.CommunityRating ? item.CommunityRating.toFixed(1) : '0.0';
                let runtime = item.RunTimeTicks ? Math.floor(item.RunTimeTicks / 600000000) : 0;
                let hours = Math.floor(runtime / 60);
                let minutes = runtime % 60;
                let timeStr = hours > 0 ? `${hours}ч ${minutes}м` : `${minutes}м`;

                body.html(`
                    <div class="emby-movie-info">
                        ${poster ? `<img src="${poster}" class="emby-movie-poster" onerror="this.style.display='none'">` : ''}
                        <div class="emby-movie-details">
                            <h2>${item.Name || 'Без названия'}</h2>
                            <div class="meta">
                                ${year ? `<span>${year}</span>` : ''}
                                ${genres ? `<span> • ${genres}</span>` : ''}
                                ${timeStr ? `<span> • ${timeStr}</span>` : ''}
                                <span> • ⭐ ${rating}</span>
                            </div>
                            ${item.Overview ? `<div class="overview">${item.Overview}</div>` : ''}
                            <div class="emby-play-btn selector">
                                <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>
                                Смотреть
                            </div>
                        </div>
                    </div>
                `);

                body.find('.emby-play-btn').on('hover:enter click', () => playVideo(item));

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
            }, () => {
                if (!is_destroyed) body.html('<div class="emby-empty">Ошибка загрузки</div>');
            });
        };

        this.render = function() {
            return element;
        };

        this.destroy = function() {
            is_destroyed = true;
            network.clear();
        };
    }

    /* --- Компонент для сериалов --- */
    function EmbySeriesComponent() {
        let network = new Lampa.Reguest();
        let is_destroyed = false;
        let component = this;
        
        // Создаем DOM элемент
        let element = $('<div class="emby-container"></div>')[0];
        
        this.seasons = [];
        this.current_season = null;

        this.create = function() {
            // Вызывается при создании активности
        };

        this.start = function() {
            let object = component.object || {};
            let body = $(element);
            body.empty();
            body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            
            network.silent(buildApiUrl(`/Shows/${object.id}/Seasons`), (data) => {
                if (is_destroyed) return;
                
                component.seasons = data.Items || [];
                if (component.seasons.length === 0) {
                    body.html('<div class="emby-empty">Сезоны не найдены</div>');
                    setupNavigation();
                } else {
                    component.current_season = component.seasons[0];
                    loadEpisodes(body, object);
                }
            }, () => {
                if (is_destroyed) return;
                body.html('<div class="emby-empty">Ошибка загрузки сезонов</div>');
                setupNavigation();
            });
        };

        function loadEpisodes(body, object) {
            if (is_destroyed) return;
            body.empty();
            body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            
            const query = `/Items?ParentId=${object.id}&Season=${component.current_season.IndexNumber}&IncludeItemTypes=Episode&Fields=RunTimeTicks,PremiereDate,CommunityRating,PrimaryImageTag&SortBy=SortName&SortOrder=Ascending`;
            
            network.silent(buildApiUrl(query), (data) => {
                if (is_destroyed) return;
                renderEpisodes(body, object, data.Items || []);
            }, () => {
                if (is_destroyed) return;
                body.html('<div class="emby-empty">Ошибка загрузки эпизодов</div>');
                setupNavigation();
            });
        }

        function renderEpisodes(body, object, episodes) {
            if (is_destroyed) return;
            body.empty();
            
            let filterPanel = $('<div class="emby-filter"></div>');
            let seasonBtn = $(`<div class="emby-filter-btn selector">Сезон ${component.current_season.IndexNumber || 1}</div>`);
            
            seasonBtn.on('hover:enter click', () => {
                let items = component.seasons.map(s => ({
                    title: s.Name || `Сезон ${s.IndexNumber}`,
                    season: s,
                    selected: s.Id === component.current_season.Id
                }));
                
                Lampa.Select.show({
                    title: 'Выберите сезон',
                    items: items,
                    onSelect: (a) => {
                        component.current_season = a.season;
                        loadEpisodes(body, object);
                    },
                    onBack: () => {
                        Lampa.Controller.toggle('content');
                    }
                });
            });
            
            filterPanel.append(seasonBtn);
            body.append(filterPanel);

            let grid = $('<div class="emby-episodes-grid"></div>');

            if (episodes.length === 0) {
                grid.append('<div class="emby-empty">Эпизоды не найдены</div>');
            } else {
                let base = getUrl().replace(/\/$/, '');
                
                episodes.forEach(episode => {
                    let runTime = episode.RunTimeTicks ? Math.floor(episode.RunTimeTicks / 600000000) : 0;
                    let hours = Math.floor(runTime / 60);
                    let minutes = runTime % 60;
                    let timeStr = runTime ? `${hours}:${String(minutes).padStart(2,'0')}` : '';
                    
                    let rating = episode.CommunityRating ? episode.CommunityRating.toFixed(1) : '0.0';
                    let img = episode.PrimaryImageTag ? `${base}/Items/${episode.Id}/Images/Primary?maxWidth=400&quality=90` : '';
                    let epNum = String(episode.IndexNumber || 0).padStart(2, '0');

                    let item = $(`
                        <div class="emby-episode-card selector">
                            <div class="emby-ep-img-wrap">
                                ${img ? `<img src="${img}" class="emby-ep-img" onerror="this.style.display='none'">` : ''}
                                <div class="emby-ep-num">${epNum} серия</div>
                                ${timeStr ? `<div class="emby-ep-time">${timeStr}</div>` : ''}
                            </div>
                            <div class="emby-ep-title">${episode.Name || 'Эпизод ' + epNum}</div>
                            <div class="emby-ep-info">⭐ ${rating}</div>
                        </div>
                    `);

                    item.on('hover:enter click', () => playVideo(episode));
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
            network.clear();
        };
    }

    /* --- Главная логика запуска --- */
    function handleEmbyClick(movie) {
        if (!isConfigured()) return notify('Настройте Emby в параметрах');

        findInEmby(movie, (item) => {
            if (!item) return notify('Контент не найден в библиотеке Emby.');

            if (item.Type === 'Series') {
                Lampa.Activity.push({
                    url: '',
                    title: item.Name,
                    component: 'emby_series', 
                    id: item.Id,
                    name: item.Name
                });
            } else if (item.Type === 'Movie') {
                Lampa.Activity.push({
                    url: '',
                    title: item.Name,
                    component: 'emby_movie',
                    id: item.Id,
                    name: item.Name
                });
            } else {
                playVideo(item);
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
        Lampa.Component.add('emby_movie', EmbyMovieComponent);

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
