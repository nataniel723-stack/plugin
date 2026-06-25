(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '3.0.0'; // Обновляем версию до 3.0 (редизайн)

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // Внедряем CSS стили для карточек, чтобы они выглядели точь-в-точь как на скрине №2
    if (!$('style#emby-plugin-styles').length) {
        $('head').append(`
            <style id="emby-plugin-styles">
                .emby-episode { display: flex; align-items: center; padding: 10px; margin: 0 1.5em 1em 1.5em; background: rgba(255,255,255,0.05); border-radius: 10px; cursor: pointer; transition: background 0.3s; }
                .emby-episode.focus { background: #fff; color: #000; }
                .emby-episode .emby-ep-img-wrap { position: relative; width: 150px; height: 85px; border-radius: 5px; overflow: hidden; margin-right: 15px; flex-shrink: 0; background: #222; }
                .emby-episode .emby-ep-img { width: 100%; height: 100%; object-fit: cover; }
                .emby-episode .emby-ep-num { position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; font-size: 2em; color: #fff; font-weight: bold; text-shadow: 1px 1px 3px rgba(0,0,0,0.8); }
                .emby-episode .emby-ep-body { flex-grow: 1; overflow: hidden; }
                .emby-episode .emby-ep-title { font-size: 1.2em; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .emby-episode .emby-ep-info { font-size: 0.9em; opacity: 0.6; }
                .emby-episode .emby-ep-time { padding: 0 15px; font-size: 1.1em; opacity: 0.8; flex-shrink: 0; font-variant-numeric: tabular-nums; }
                
                .emby-filter { display: flex; align-items: center; justify-content: flex-end; padding: 1em 1.5em; gap: 1em; margin-bottom: 1em; border-bottom: 1px solid rgba(255,255,255,0.05); }
                .emby-filter-btn { background: rgba(255,255,255,0.1); padding: 0.5em 1.2em; border-radius: 5px; cursor: pointer; font-size: 1.1em; }
                .emby-filter-btn.focus { background: #fff; color: #000; }
                
                .emby-loader { display: flex; justify-content: center; align-items: center; height: 50vh; }
                .emby-empty { text-align: center; padding: 3em; font-size: 1.2em; opacity: 0.7; }
            </style>
        `);
    }

    function getUrl() { return (Lampa.Storage.get(STORAGE_URL) || '').trim(); }
    function getApiKey() { return (Lampa.Storage.get(STORAGE_API_KEY) || '').trim(); }
    function isConfigured() { return getUrl().length > 5 && getApiKey().length > 5; }
    function notify(msg) { Lampa.Noty.show(msg); }

    function apiRequest(endpoint, success, error) {
        if (!isConfigured()) return notify('Настройте Emby в параметрах');
        const base = getUrl().replace(/\/$/, '');
        const sep = endpoint.includes('?') ? '&' : '?';
        const url = `${base}/emby${endpoint}${sep}api_key=${getApiKey()}`;
        new Lampa.Reguest().silent(url, success, error || (() => {}));
    }

    /* --- Поиск контента --- */
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        const fields = '&Fields=Id,Name,Type,ParentId,PrimaryImageTag&Recursive=true&IncludeItemTypes=Movie,Series,Episode';
        const tmdb = movie.tmdb_id || movie.id;
        
        if (tmdb) {
            apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, data => callback(data?.Items?.[0]));
            return;
        }

        const title = encodeURIComponent(movie.title || movie.name || '');
        if (title) apiRequest(`/Items?SearchTerm=${title}&Limit=3${fields}`, data => callback(data?.Items?.[0]));
        else callback(null);
    }

    /* --- Логика воспроизведения --- */
    function playVideo(item) {
        const base = getUrl().replace(/\/$/, '');
        Lampa.Player.play({
            title: item.Name,
            url: `${base}/Videos/${item.Id}/stream.mp4?static=true&api_key=${getApiKey()}`,
            poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id + ''))
        });
    }

    /* --- Единый компонент Сериала (Сезоны + Серии) --- */
    function EmbySeriesComponent(object) {
        let network = new Lampa.Reguest();
        let scroll = new Lampa.Scroll({mask: true, over: true});
        let html = $('<div></div>');
        
        this.seasons = [];
        this.current_season = null;

        this.create = function() {
            html.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            
            // Сначала загружаем список сезонов
            apiRequest(`/Shows/${object.id}/Seasons`, (data) => {
                this.seasons = data.Items || [];
                
                if (this.seasons.length === 0) {
                    html.empty().append('<div class="emby-empty">Сезоны не найдены</div>');
                    this.start();
                } else {
                    this.current_season = this.seasons[0]; // Выбираем первый по умолчанию
                    this.loadEpisodes();
                }
            }, () => {
                html.empty().append('<div class="emby-empty">Ошибка загрузки сезонов</div>');
                this.start();
            });
        };

        // Метод загрузки серий выбранного сезона
        this.loadEpisodes = function() {
            scroll.clear();
            html.empty().append(scroll.render());
            scroll.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            
            const query = `ParentId=${object.id}&Season=${this.current_season.IndexNumber}&IncludeItemTypes=Episode&Fields=RunTimeTicks,PremiereDate,CommunityRating&SortBy=SortName&SortOrder=Ascending`;
            
            apiRequest(`/Items?${query}`, (data) => {
                this.renderEpisodes(data.Items || []);
            }, () => {
                scroll.clear();
                scroll.append('<div class="emby-empty">Ошибка загрузки эпизодов</div>');
            });
        };

        // Метод отрисовки интерфейса (Фильтр + Список серий)
        this.renderEpisodes = function(episodes) {
            scroll.clear();
            
            // 1. Создаем панель с фильтром сезона (как на скрине №2)
            let filterPanel = $('<div class="emby-filter"></div>');
            let seasonBtn = $(`<div class="emby-filter-btn selector">Сезон: ${this.current_season.IndexNumber} сезон</div>`);
            
            seasonBtn.on('hover:enter click', () => {
                let items = this.seasons.map(s => ({
                    title: s.Name,
                    season: s
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

            // 2. Создаем список эпизодов
            if (episodes.length === 0) {
                scroll.append('<div class="emby-empty">Эпизоды не найдены</div>');
            } else {
                let base = getUrl().replace(/\/$/, '');
                
                episodes.forEach(episode => {
                    // Форматируем время (например, 00:52)
                    let runTime = episode.RunTimeTicks ? Math.floor(episode.RunTimeTicks / 600000000) : 0;
                    let timeStr = runTime ? `${String(Math.floor(runTime/60)).padStart(2,'0')}:${String(runTime%60).padStart(2,'0')}` : '';
                    
                    // Форматируем дату (например, 1 Декабря 2017)
                    let date = episode.PremiereDate ? new Date(episode.PremiereDate).toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'}).replace(' г.', '') : 'Неизвестно';
                    
                    // Рейтинг
                    let rating = episode.CommunityRating ? episode.CommunityRating.toFixed(1) : '0.0';
                    let img = episode.PrimaryImageTag ? `${base}/Items/${episode.Id}/Images/Primary?maxHeight=200&quality=90` : '';
                    let epNum = String(episode.IndexNumber || 0).padStart(2, '0');

                    // Карточка серии (Верстка точно под скриншот №2)
                    let item = $(`
                        <div class="emby-episode selector">
                            <div class="emby-ep-img-wrap">
                                ${img ? `<img src="${img}" class="emby-ep-img" onerror="this.style.display='none'">` : ''}
                                <div class="emby-ep-num">${epNum}</div>
                            </div>
                            <div class="emby-ep-body">
                                <div class="emby-ep-title">${episode.Name}</div>
                                <div class="emby-ep-info">⭐ ${rating} • ${date}</div>
                            </div>
                            <div class="emby-ep-time">${timeStr}</div>
                        </div>
                    `);

                    item.on('hover:enter click', () => playVideo(episode));
                    scroll.append(item);
                });
            }
            
            this.start();
        };

        this.start = function() {
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                left: () => { Lampa.Controller.toggle('menu'); },
                up: () => {}, down: () => {}, right: () => {},
                back: () => { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function() {};
        this.stop = function() {};
        this.render = function() { return html; };
        this.destroy = function() {
            network.clear();
            scroll.destroy();
            html.remove();
        };
    }

    /* --- Главная логика запуска --- */
    function handleEmbyClick(movie) {
        if (!isConfigured()) return notify('Настройте Emby в параметрах');

        findInEmby(movie, (item) => {
            if (!item) return notify('Контент не найден в библиотеке Emby.');

            if (item.Type === 'Series') {
                // Вызываем новый объединенный компонент
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

    /* --- Интеграция в систему Lampa --- */
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

    /* --- Настройки плагина --- */
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

    /* --- Инициализация --- */
    function startPlugin() {
        // Регистрируем наш новый компонент сериалов
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
