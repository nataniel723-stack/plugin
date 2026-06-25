(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '4.0.1'; // Фикс collectionSet для старых версий Lampa

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // Внедряем стили для отображения серий сеткой
    if (!$('style#emby-plugin-styles').length) {
        $('head').append(`
            <style id="emby-plugin-styles">
                .emby-episodes-grid { display: flex; flex-wrap: wrap; padding: 1em 1.5em; gap: 1.5em; }
                
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
                .emby-filter-btn.focus { background: #fff; color: #000; }
                
                .emby-loader { display: flex; justify-content: center; align-items: center; height: 50vh; }
                .emby-empty { text-align: center; padding: 3em; font-size: 1.2em; opacity: 0.7; width: 100%; }

                @media (max-width: 1200px) { .emby-episode-card { width: calc(33.333% - 1em); } } 
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
        const fields = '&Fields=Id,Name,Type,ParentId,PrimaryImageTag&Recursive=true&IncludeItemTypes=Movie,Series,Episode';
        const tmdb = movie.tmdb_id || movie.id;
        
        if (tmdb) {
            network.silent(buildApiUrl(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`), data => callback(data?.Items?.[0]));
            return;
        }

        const title = encodeURIComponent(movie.title || movie.name || '');
        if (title) network.silent(buildApiUrl(`/Items?SearchTerm=${title}&Limit=3${fields}`), data => callback(data?.Items?.[0]));
        else callback(null);
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

    /* --- Нативный компонент Lampa --- */
    function EmbySeriesComponent(object) {
        let network = new Lampa.Reguest();
        let scroll = new Lampa.Scroll({mask: true, over: true});
        let is_destroyed = false; 
        
        scroll.render();

        this.seasons = [];
        this.current_season = null;

        this.create = function() {
            scroll.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            
            network.silent(buildApiUrl(`/Shows/${object.id}/Seasons`), (data) => {
                if (is_destroyed) return; 
                
                this.seasons = data.Items || [];
                if (this.seasons.length === 0) {
                    scroll.clear();
                    scroll.append('<div class="emby-empty">Сезоны не найдены</div>');
                    this.start();
                } else {
                    this.current_season = this.seasons[0];
                    this.loadEpisodes();
                }
            }, () => {
                if (is_destroyed) return;
                scroll.clear();
                scroll.append('<div class="emby-empty">Ошибка загрузки сезонов</div>');
                this.start();
            });
        };

        this.loadEpisodes = function() {
            if (is_destroyed) return;
            scroll.clear();
            scroll.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            
            const query = `/Items?ParentId=${object.id}&Season=${this.current_season.IndexNumber}&IncludeItemTypes=Episode&Fields=RunTimeTicks,PremiereDate,CommunityRating&SortBy=SortName&SortOrder=Ascending`;
            
            network.silent(buildApiUrl(query), (data) => {
                if (is_destroyed) return;
                this.renderEpisodes(data.Items || []);
            }, () => {
                if (is_destroyed) return;
                scroll.clear();
                scroll.append('<div class="emby-empty">Ошибка загрузки эпизодов</div>');
            });
        };

        this.renderEpisodes = function(episodes) {
            if (is_destroyed) return;
            scroll.clear();
            
            // Фильтр выбора сезона
            let filterPanel = $('<div class="emby-filter"></div>');
            let seasonBtn = $(`<div class="emby-filter-btn selector">Сезон ${this.current_season.IndexNumber || 1}</div>`);
            
            seasonBtn.on('hover:enter click', () => {
                let items = this.seasons.map(s => ({
                    title: s.Name,
                    season: s,
                    selected: s.Id === this.current_season.Id
                }));
                
                Lampa.Select.show({
                    title: 'Выберите сезон',
                    items: items,
                    onSelect: (a) => {
                        this.current_season = a.season;
                        this.loadEpisodes();
                    },
                    onBack: () => {
                        Lampa.Controller.toggle('content');
                    }
                });
            });
            
            filterPanel.append(seasonBtn);
            scroll.append(filterPanel);

            // Сетка эпизодов
            let grid = $('<div class="emby-episodes-grid"></div>');

            if (episodes.length === 0) {
                grid.append('<div class="emby-empty">Эпизоды не найдены</div>');
            } else {
                let base = getUrl().replace(/\/$/, '');
                
                episodes.forEach(episode => {
                    let runTime = episode.RunTimeTicks ? Math.floor(episode.RunTimeTicks / 600000000) : 0;
                    let timeStr = runTime ? `${String(Math.floor(runTime/60)).padStart(2,'0')}:${String(runTime%60).padStart(2,'0')}` : '';
                    
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
            
            scroll.append(grid);
            this.start();
        };

        this.start = function() {
            Lampa.Controller.add('content', {
                toggle: () => {
                    // ПРОБЛЕМА БЫЛА ЗДЕСЬ: Безопасный вызов для старых версий
                    if (typeof Lampa.Controller.collectionSet === 'function') {
                        Lampa.Controller.collectionSet(scroll.render());
                    }
                    
                    if (typeof Lampa.Controller.collectionFocus === 'function') {
                        Lampa.Controller.collectionFocus(false, scroll.render());
                    } else {
                        // Ручной фокус для старых ТВ
                        let first = scroll.render().find('.selector').eq(0);
                        if (first.length) Lampa.Navigator.focus(first);
                    }
                },
                left: () => { 
                    if (Lampa.Navigator.canmove('left')) Lampa.Navigator.move('left');
                    else Lampa.Controller.toggle('menu'); 
                },
                right: () => { if (Lampa.Navigator.canmove('right')) Lampa.Navigator.move('right'); },
                up: () => { 
                    if (Lampa.Navigator.canmove('up')) Lampa.Navigator.move('up');
                    else Lampa.Controller.toggle('head'); 
                },
                down: () => { if (Lampa.Navigator.canmove('down')) Lampa.Navigator.move('down'); },
                back: () => { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function() {};
        this.stop = function() {};
        
        this.render = function() { return scroll.render(); };
        
        this.destroy = function() {
            is_destroyed = true;
            network.clear();
            scroll.destroy();
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
                    id: item.Id
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
                <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
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
        Lampa.Settings.listener.follow('open', e => { if (e.name === 'emby') renderSettings(e.body); });
    }

    /* --- Запуск --- */
    function startPlugin() {
        Lampa.Component.add('emby_series', EmbySeriesComponent);

        initSettings();
        Lampa.Listener.follow('full', e => {
            if (e.type === 'complite') {
                addEmbyButton({ render: e.object.activity.render(), movie: e.data.movie || e.data.card });
            }
        });
        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') startPlugin(); });

})();
