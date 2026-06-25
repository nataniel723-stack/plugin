(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '2.5.0'; // Обновлено под Lampa Component API

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL) || '').trim();
    }

    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY) || '').trim();
    }

    function isConfigured() {
        return getUrl().length > 5 && getApiKey().length > 5;
    }

    function notify(msg) {
        Lampa.Noty.show(msg);
    }

    // Исправлено формирование URL 
    function apiRequest(endpoint, success, error) {
        if (!isConfigured()) {
            notify('Настройте Emby в параметрах');
            return;
        }
        const base = getUrl().replace(/\/$/, '');
        const sep = endpoint.includes('?') ? '&' : '?';
        const url = `${base}/emby${endpoint}${sep}api_key=${getApiKey()}`;
        
        new Lampa.Reguest().silent(url, success, error || (() => {}));
    }

    /* --- Поиск контента --- */
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        const fields = '&Fields=Id,Name,Type,ParentId,PrimaryImageTag&Recursive=true&IncludeItemTypes=Movie,Series,Episode';

        // Поиск по TMDB ID (основной приоритет)
        const tmdb = movie.tmdb_id || movie.id;
        if (tmdb) {
            apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, data => {
                callback(data?.Items?.[0]);
            });
            return;
        }

        // Фолбэк: поиск по названию
        const title = encodeURIComponent(movie.title || movie.name || '');
        if (title) {
            apiRequest(`/Items?SearchTerm=${title}&Limit=3${fields}`, data => {
                callback(data?.Items?.[0]);
            });
        } else {
            callback(null);
        }
    }

    /* --- Логика воспроизведения --- */
    function playVideo(item) {
        const base = getUrl().replace(/\/$/, '');
        const streamingUrl = `${base}/Videos/${item.Id}/stream.mp4?static=true&api_key=${getApiKey()}`;
        const posterUrl = item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '';

        Lampa.Player.play({
            title: item.Name,
            url: streamingUrl,
            poster: posterUrl,
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id + ''))
        });
    }

    /* --- Компоненты интерфейса (Lampa Components) --- */

    // Страница списка сезонов
    function EmbySeasonsComponent(activity) {
        let network = new Lampa.Reguest();
        let scroll = new Lampa.Scroll({mask: true, over: true});
        let html = $('<div></div>');
        // Сетка для вывода постеров как в Lampa
        let body = $('<div class="emby-grid" style="padding: 1.5em; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 1.5em;"></div>');

        this.create = function() {
            activity.loader(true);
            apiRequest(`/Shows/${activity.data.id}/Seasons`, (data) => {
                let seasons = data.Items || [];
                if (seasons.length === 0) {
                    html.append('<div class="empty">Сезоны не найдены</div>');
                } else {
                    let base = getUrl().replace(/\/$/, '');
                    seasons.forEach(season => {
                        let img = season.PrimaryImageTag ? `${base}/Items/${season.Id}/Images/Primary?maxHeight=300&quality=90` : '';
                        let card = $(`
                            <div class="card selector" data-id="${season.Id}" style="text-align: center;">
                                <div class="card__view" style="border-radius: 10px; overflow: hidden; aspect-ratio: 2/3; position: relative; background: #222; margin-bottom: 0.5em;">
                                    ${season.IndexNumber ? `<span style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.8); color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; z-index: 2;">S${String(season.IndexNumber).padStart(2, '0')}</span>` : ''}
                                    ${img ? `<img src="${img}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">` : ''}
                                </div>
                                <div class="card__title" style="font-size: 1.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${season.Name}</div>
                            </div>
                        `);

                        card.on('hover:enter', () => {
                            Lampa.Activity.push({
                                title: season.Name,
                                component: 'emby_episodes',
                                seriesId: activity.data.id,
                                seasonNumber: season.IndexNumber
                            });
                        });
                        body.append(card);
                    });
                    scroll.append(body);
                    html.append(scroll.render());
                }
                activity.loader(false);
                this.start();
            }, () => {
                activity.loader(false);
                notify('Ошибка загрузки сезонов.');
            });
        };

        this.start = function() {
            // Регистрация контроллера для навигации с пульта
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                left: () => { Lampa.Controller.toggle('menu'); },
                up: () => {},
                down: () => {},
                right: () => {},
                back: () => { activity.backward(); }
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
            body.remove();
        };
    }

    // Страница списка серий
    function EmbyEpisodesComponent(activity) {
        let network = new Lampa.Reguest();
        let scroll = new Lampa.Scroll({mask: true, over: true});
        let html = $('<div></div>');
        // Серии обычно имеют широкий формат постера (16:9)
        let body = $('<div class="emby-grid" style="padding: 1.5em; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5em;"></div>');

        this.create = function() {
            activity.loader(true);
            const query = `ParentId=${activity.data.seriesId}&Season=${activity.data.seasonNumber}&IncludeItemTypes=Episode&SortBy=SortName&SortOrder=Ascending`;
            
            apiRequest(`/Items?${query}`, (data) => {
                let episodes = data.Items || [];
                if (episodes.length === 0) {
                    html.append('<div class="empty">Эпизоды не найдены</div>');
                } else {
                    let base = getUrl().replace(/\/$/, '');
                    episodes.forEach(episode => {
                        let img = episode.PrimaryImageTag ? `${base}/Items/${episode.Id}/Images/Primary?maxHeight=200&quality=90` : '';
                        let card = $(`
                            <div class="card selector" data-id="${episode.Id}" style="text-align: center;">
                                <div class="card__view" style="border-radius: 10px; overflow: hidden; aspect-ratio: 16/9; position: relative; background: #222; margin-bottom: 0.5em;">
                                    ${episode.IndexNumber ? `<span style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.8); color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; z-index: 2;">E${episode.IndexNumber}</span>` : ''}
                                    ${img ? `<img src="${img}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">` : ''}
                                </div>
                                <div class="card__title" style="font-size: 1.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${episode.Name}</div>
                            </div>
                        `);

                        card.on('hover:enter', () => playVideo(episode));
                        card.on('click', () => playVideo(episode)); // Для мышки
                        body.append(card);
                    });
                    scroll.append(body);
                    html.append(scroll.render());
                }
                activity.loader(false);
                this.start();
            }, () => {
                activity.loader(false);
                notify('Ошибка загрузки эпизодов.');
            });
        };

        this.start = function() {
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                left: () => { Lampa.Controller.toggle('menu'); },
                up: () => {},
                down: () => {},
                right: () => {},
                back: () => { activity.backward(); }
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
            body.remove();
        };
    }

    /* --- Главная логика запуска --- */
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

            let base = getUrl().replace(/\/$/, '');
            let posterUrl = item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '';

            if (item.Type === 'Series') {
                // Открываем кастомный компонент сезонов
                Lampa.Activity.push({
                    url: '',
                    title: item.Name,
                    component: 'emby_seasons',
                    id: item.Id,
                    poster: posterUrl
                });
            } else {
                playVideo(item);
            }
        });
    }

    /* --- Интеграция в систему Lampa --- */
    function addEmbyButton(data) {
        if (!data || !data.render || !data.movie) return;
        // Защита от дублей
        if (data.render.find('.emby-button').length) return;

        const button = $(`
            <div class="full-start__button selector view--emby emby-button" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
                <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
                <span>${PLUGIN_NAME}</span>
            </div>
        `);

        button.on('hover:enter', () => handleEmbyClick(data.movie));
        button.on('click', () => handleEmbyClick(data.movie)); // Поддержка мыши

        const playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) {
            playButton.after(button);
        } else {
            data.render.find('.buttons, .activity__body').append(button);
        }
    }

    /* --- Настройки плагина --- */
    function renderSettings(body) {
        body.empty();
        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${getUrl() || 'Не задано'}</div></div>`);
        urlRow.on('hover:enter', () => {
            Lampa.Input.edit({title: 'Emby URL', value: getUrl(), free: true}, val => {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });
        urlRow.on('click', () => urlRow.trigger('hover:enter'));

        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${getApiKey() ? '••••••••••' : 'Не задано'}</div></div>`);
        keyRow.on('hover:enter', () => {
            Lampa.Input.edit({title: 'Emby API Key', value: getApiKey(), free: true}, val => {
                Lampa.Storage.set(STORAGE_API_KEY, val);
                keyRow.find('.settings-param__value').text(val ? '••••••••••' : 'Не задано');
            });
        });
        keyRow.on('click', () => keyRow.trigger('hover:enter'));

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

    /* --- Инициализация --- */
    function startPlugin() {
        // Регистрируем новые компоненты в роутере Lampa
        Lampa.Component.add('emby_seasons', EmbySeasonsComponent);
        Lampa.Component.add('emby_episodes', EmbyEpisodesComponent);

        initSettings();
        Lampa.Listener.follow('full', e => {
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
    else Lampa.Listener.follow('app', e => {
        if (e.type === 'ready') startPlugin();
    });

})();
