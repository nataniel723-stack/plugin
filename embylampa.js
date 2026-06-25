(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '2.4.1'; // Обновлена версия из-за изменения структуры

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    let currentSerieId = '';
    let selectedSeasonIndex = 0;
    let selectedEpisodeIndex = 0;

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

    function apiRequest(endpoint, success, error) {
        if (!isConfigured()) {
            notify('Настройте Emby в параметрах');
            return;
        }
        const base = getUrl().replace(/\/$/, '');
        const url = `${base}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${getApiKey()}`;
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
        const videoId = item.Id;
        const streamingUrl = `${getUrl().replace(/\/$/, '')}/Videos/${videoId}/stream.mp4?static=true&api_key=${getApiKey()}`;

        Lampa.Player.play({
            title: item.Name,
            url: streamingUrl,
            poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(videoId))
        });
    }

    /* --- Компоненты интерфейса --- */

    // Страница списка серий (Сезон)
    function EpisodesPage(activity, seriesId, seasonNumber) {
        this.activity = activity;
        this.seriesId = seriesId;
        this.seasonNumber = seasonNumber;
        this.scroll = null;

        this.initialize = () => {
            this.activity.loader(true);
            this.activity.render().addClass('view--episodes'); // Стандартный класс для страницы серий
            this.fetchEpisodes();
        };

        this.fetchEpisodes = () => {
            const query = `ParentId=${this.seriesId}&Season=${this.seasonNumber}&IncludeItemTypes=Episode&SortBy=SortName&SortOrder=Ascending`;
            apiRequest(`/Items?${query}`, (data) => {
                this.episodes = data.Items || [];
                this.buildUI();
            }, () => {
                this.activity.loader(false);
                notify('Ошибка загрузки эпизодов.');
            });
        };

        this.buildUI = () => {
            const container = $('<div class="list"></div>');
            this.episodes.forEach(episode => {
                const card = $(`
                    <div class="card selector" data-id="${episode.Id}">
                        <div class="card__poster">
                            ${episode.IndexNumber ? `<span class="card__number">${episode.IndexNumber}</span>` : ''}
                            <img src="${getUrl()}/Items/${episode.Id}/Images/Primary?maxHeight=260&quality=90" alt="${episode.Name}" onerror="this.style.display='none'">
                        </div>
                        <div class="card__body">
                            <div class="card__name">${episode.Name}</div>
                        </div>
                    </div>
                `);
                card.on('hover:enter', () => this.selectCard(card, episode));
                container.append(card);
            });

            this.scroll = new Lampa.Scroll({mask: true});
            this.scroll.body().append(container);
            this.activity.render().empty().append(this.scroll.render());
            this.activity.loader(false);
        };

        this.selectCard = (el, episode) => {
            $('.card.selected').removeClass('selected');
            el.addClass('selected');
            selectedEpisodeIndex = parseInt(el.data('id'));
            // При нажатии - играем серию
            el.off('click').on('click', () => playVideo(episode));
        };
    }

    // Страница списка сезонов
    function SeasonsPage(activity, seriesId) {
        this.activity = activity;
        this.seriesId = seriesId;
        this.scroll = null;

        this.initialize = () => {
            this.activity.loader(true);
            this.activity.render().addClass('view--seasons'); // Стандартный класс для страницы сезонов
            this.fetchSeasons();
        };

        this.fetchSeasons = () => {
            apiRequest(`/Shows/${this.seriesId}/Seasons`, (data) => {
                this.seasons = data.Items || [];
                this.buildUI();
            }, () => {
                this.activity.loader(false);
                notify('Ошибка загрузки сезонов.');
            });
        };

        this.buildUI = () => {
            const container = $('<div class="list"></div>');
            this.seasons.forEach(season => {
                const card = $(`
                    <div class="card selector" data-index="${season.IndexNumber}">
                        <div class="card__poster">
                            ${season.IndexNumber ? `<span class="card__number">S${String(season.IndexNumber).padStart(2, '0')}</span>` : ''}
                            <img src="${getUrl()}/Items/${season.Id}/Images/Primary?maxHeight=260&quality=90" alt="${season.Name}" onerror="this.style.display='none'">
                        </div>
                        <div class="card__body">
                            <div class="card__name">${season.Name}</div>
                        </div>
                    </div>
                `);
                card.on('hover:enter', () => this.selectCard(card, season));
                card.on('click', () => {
                    selectedSeasonIndex = season.IndexNumber;
                    new EpisodesPage(this.activity, this.seriesId, season.IndexNumber).initialize();
                });
                container.append(card);
            });

            this.scroll = new Lampa.Scroll({mask: true});
            this.scroll.body().append(container);
            this.activity.render().empty().append(this.scroll.render());
            this.activity.loader(false);
        };

        this.selectCard = (el, season) => {
            $('.card.selected').removeClass('selected');
            el.addClass('selected');
        };
    }

    // Главная логика запуска
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

            if (item.Type === 'Series') {
                currentSerieId = item.Id;
                // Открываем стандартное окно просмотра сериала
                Lampa.Activity.push({
                    name: 'series',
                    view: 'seasons',
                    id: item.Id,
                    title: item.Name,
                    poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : ''
                });
            } else { // Movie
                playVideo(item);
            }
        });
    }

    /* --- Интеграция в систему Lampa --- */

    // Хук для обработки перехода на страницу сезонов
    Lampa.Listener.follow('activity', e => {
        if (e.type === 'push' && e.data.view === 'seasons') {
            new SeasonsPage(e.object, e.data.id).initialize();
        }
    });

    // Добавление кнопки в карточку фильма/сериала
    function addEmbyButton(data) {
        if (!data || !data.render || !data.movie) return;
        if (data.render.find('.emby-button').length) return;

        const button = $(`
            <div class="full-start__button selector view--emby" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
                <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
                <span>${PLUGIN_NAME}</span>
            </div>
        `);

        button.on('hover:enter', () => handleEmbyClick(data.movie));

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

        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${getApiKey() ? '••••••••••' : 'Не задано'}</div></div>`);
        keyRow.on('hover:enter', () => {
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

    /* --- Инициализация --- */
    function startPlugin() {
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
