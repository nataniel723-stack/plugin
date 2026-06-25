(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '4.0.0';
    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // Проверка наличия настроек
    function isConfigured() {
        return Boolean(Lampa.Storage.get(STORAGE_URL)) && Boolean(Lampa.Storage.get(STORAGE_API_KEY));
    }

    // Получение URL сервера Emby
    function getServerURL() {
        return Lampa.Storage.get(STORAGE_URL);
    }

    // Получение API ключа Emby
    function getAPIToken() {
        return Lampa.Storage.get(STORAGE_API_KEY);
    }

    // Формирование конечного URL для запросов к API Emby
    function buildAPIURL(endpoint) {
        const baseURL = getServerURL().replace(/\/$/, '');
        const apiKeyParam = `api_key=${encodeURIComponent(getAPIToken())}`;
        return `${baseURL}/emby${endpoint}?${apiKeyParam}`;
    }

    // Вспомогательная функция для уведомления пользователя
    function notify(message) {
        Lampa.Noty.show(message);
    }

    // Основной класс компонента Emby Series
    function EmbySeriesComponent(object) {
        let network = new Lampa.Request();
        let scroll = new Lampa.Scroll({ mask: true, over: true });
        let isDestroyed = false;
        let seasons = [];
        let currentSeason = null;

        this.create = function() {
            scroll.append($('<div class="emby-loader"><div class="broadcast__spin"></div></div>')[0]);

            network.silent(buildAPIURL(`/Shows/${object.id}/Seasons`), (response) => {
                if (isDestroyed) return;

                seasons = response.Items || [];
                if (seasons.length === 0) {
                    scroll.clear();
                    scroll.append($('<div class="emby-empty">Сезоны не найдены</div>')[0]);
                    this.start();
                } else {
                    currentSeason = seasons[0];
                    this.loadEpisodes();
                }
            }, () => {
                if (isDestroyed) return;
                scroll.clear();
                scroll.append($('<div class="emby-empty">Ошибка загрузки сезонов</div>')[0]);
                this.start();
            });
        };

        this.loadEpisodes = function() {
            if (isDestroyed) return;
            scroll.clear();
            scroll.append($('<div class="emby-loader"><div class="broadcast__spin"></div></div>')[0]);

            const query = `/Items?ParentId=${object.id}&Season=${currentSeason.IndexNumber}&IncludeItemTypes=Episode&Fields=RunTimeTicks,PremiereDate,CommunityRating&SortBy=SortName&SortOrder=Ascending`;

            network.silent(buildAPIURL(query), (response) => {
                if (isDestroyed) return;
                this.renderEpisodes(response.Items || []);
            }, () => {
                if (isDestroyed) return;
                scroll.clear();
                scroll.append($('<div class="emby-empty">Ошибка загрузки эпизодов</div>')[0]);
            });
        };

        this.renderEpisodes = function(episodes) {
            if (isDestroyed) return;
            scroll.clear();

            let filterPanel = $('<div class="emby-filter"></div>');
            let seasonBtn = $(`<div class="emby-filter-btn selector">Сезон ${currentSeason.IndexNumber || 1}</div>`);

            seasonBtn.on('hover:enter click', () => {
                let items = seasons.map(s => ({
                    title: s.Name,
                    season: s,
                    selected: s.Id === currentSeason.Id
                }));

                Lampa.Select.show({
                    title: 'Выберите сезон',
                    items: items,
                    onSelect: (a) => {
                        currentSeason = a.season;
                        this.loadEpisodes();
                    },
                    onBack: () => {
                        Lampa.Controller.toggle('content');
                    }
                });
            });

            filterPanel.append(seasonBtn);
            scroll.append(filterPanel[0]);

            let grid = $('<div class="emby-episodes-grid"></div>');

            if (episodes.length === 0) {
                grid.append($('<div class="emby-empty">Эпизоды не найдены</div>')[0]);
            } else {
                let baseURL = getServerURL().replace(/\/$/, '');

                episodes.forEach(episode => {
                    let runtime = episode.RunTimeTicks ? Math.floor(episode.RunTimeTicks / 600000000) : 0;
                    let timeStr = runtime ? `${Math.floor(runtime / 60)}:${String(runtime % 60).padStart(2, '0')}` : '';
                    let rating = episode.CommunityRating ? episode.CommunityRating.toFixed(1) : '0.0';
                    let imgSrc = episode.PrimaryImageTag ? `${baseURL}/Items/${episode.Id}/Images/Primary?maxWidth=400&quality=90` : '';
                    let epNum = String(episode.IndexNumber || 0).padStart(2, '0');

                    let item = $(
                        `<div class="emby-episode-card selector">
                            <div class="emby-ep-img-wrap">
                                ${imgSrc ? `<img src="${imgSrc}" class="emby-ep-img" onerror="this.style.display='none'">` : ''}
                                <div class="emby-ep-num">${epNum} серия</div>
                                ${timeStr ? `<div class="emby-ep-time">${timeStr}</div>` : ''}
                            </div>
                            <div class="emby-ep-title">${episode.Name || 'Эпизод ' + epNum}</div>
                            <div class="emby-ep-info">⭐ ${rating}</div>
                        </div>`
                    );

                    item.on('hover:enter click', () => playVideo(episode));
                    grid.append(item[0]);
                });
            }

            scroll.append(grid[0]);
            this.start();
        };

        this.start = function() {
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(scroll.render());
                    if (typeof Lampa.Controller.collectionFocus === 'function') {
                        Lampa.Controller.collectionFocus(false, scroll.render());
                    } else {
                        let first = scroll.render().find('.selector').eq(0);
                        if (first.length) Lampa.Navigator.focus(first);
                    }
                },
                left: () => {
                    if (Lampa.Navigator.canmove('left')) Lampa.Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: () => {
                    if (Lampa.Navigator.canmove('right')) Lampa.Navigator.move('right');
                },
                up: () => {
                    if (Lampa.Navigator.canmove('up')) Lampa.Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: () => {
                    if (Lampa.Navigator.canmove('down')) Lampa.Navigator.move('down');
                },
                back: () => {
                    Lampa.Activity.backward();
                }
            });
            Lampa.Controller.toggle('content');
        };

        this.pause = function() {};
        this.stop = function() {};

        this.render = function() {
            return scroll.render();
        };

        this.destroy = function() {
            isDestroyed = true;
            network.clear();
            scroll.destroy();
        };
    }

    // Функция воспроизведения видео
    function playVideo(item) {
        const baseURL = getServerURL().replace(/\/$/, '');
        Lampa.Player.play({
            title: item.Name,
            url: `${baseURL}/Videos/${item.Id}/stream.mp4?static=true&api_key=${getAPIToken()}`,
            poster: item.PrimaryImageTag ? `${baseURL}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id + ''))
        });
    }

    // Функция поиска контента в библиотеке Emby
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        let network = new Lampa.Request();
        const fields = '&Fields=Id,Name,Type,ParentId,PrimaryImageTag&Recursive=true&IncludeItemTypes=Movie,Series,Episode';
        const tmdb = movie.tmdb_id || movie.id;

        if (tmdb) {
            network.silent(buildAPIURL(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`), data => callback(data?.Items?.[0]));
            return;
        }

        const title = encodeURIComponent(movie.title || movie.name || '');
        if (title) network.silent(buildAPIURL(`/Items?SearchTerm=${title}&Limit=3${fields}`), data => callback(data?.Items?.[0]));
        else callback(null);
    }

    // Функция обработки клика по кнопке Emby
    function handleEmbyClick(movie) {
        if (!isConfigured()) return notify('Настройте Emby в параметрах!');

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

    // Функция добавления кнопки Emby на карточку фильма/сериала
    function addEmbyButton(data) {
        if (!data || !data.render || !data.movie) return;
        if (data.render.find('.emby-button').length) return;

        const button = $(
            `<div class="full-start__button selector view--emby emby-button" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
                <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
                <span>${PLUGIN_NAME}</span>
            </div>`
        );

        button.on('hover:enter click', () => handleEmbyClick(data.movie));

        const playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) playButton.after(button);
        else data.render.find('.buttons, .activity__body').append(button);
    }

    // Функция рендера настроек плагина
    function renderSettings(body) {
        body.empty();
        const settingsWrap = $('<div class="settings-container"></div>');
        settingsWrap.append('<div class="settings-param-title">Настройки Emby</div>');

        const urlInput = $('<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value"></div></div>');
        urlInput.find('.settings-param__value').text(getServerURL() || 'Не указан');
        urlInput.on('hover:enter click', () => {
            Lampa.Input.edit({ title: 'Адрес сервера Emby', value: getServerURL(), free: true }, val => {
                Lampa.Storage.set(STORAGE_URL, val.trim());
                urlInput.find('.settings-param__value').text(val.trim() || 'Не указан');
            });
        });

        const apikeyInput = $('<div class="settings-param selector"><div class="settings-param__name">API ключ</div><div class="settings-param__value"></div></div>');
        apikeyInput.find('.settings-param__value').text(getAPIToken() ? 'Скрытый' : 'Не указан');
        apikeyInput.on('hover:enter click', () => {
            Lampa.Input.edit({ title: 'API ключ Emby', value: getAPIToken(), free: true }, val => {
                Lampa.Storage.set(STORAGE_API_KEY, val.trim());
                apikeyInput.find('.settings-param__value').text(val.trim() ? 'Скрытый' : 'Не указан');
            });
        });

        settingsWrap.append(urlInput).append(apikeyInput);
        body.append(settingsWrap[0]);
    }

    // Функция начальной инициализации плагина
    function initializePlugin() {
        Lampa.Component.add('emby_series', EmbySeriesComponent);

        Lampa.SettingsApi.addComponent({
            component: 'emby',
            name: 'Emby',
            icon: '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>'
        });

        Lampa.Settings.listener.follow('open', event => {
            if (event.name === 'emby') renderSettings(event.body);
        });

        Lampa.Listener.follow('full', event => {
            if (event.type === 'complete') {
                addEmbyButton({ render: event.object.activity.render(), movie: event.data.movie || event.data.card });
            }
        });

        console.log(`%cEmby Plugin v${PLUGIN_VERSION} загружен`, 'color: #00B0FF;');
    }

    // Запуск плагина
    if (window.appready) {
        initializePlugin();
    } else {
        Lampa.Listener.follow('app', event => {
            if (event.type === 'ready') initializePlugin();
        });
    }
})();
