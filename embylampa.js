(function () {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '2.4.1';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    let currentSerieId = '';
    let selectedSeasonIndex = 0;
    let selectedEpisodeIndex = 0;

    // ⚙️ Вспомогательные функции
    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL) || '').trim();
    }

    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY) || '').trim();
    }

    function isConfigured() {
        return getUrl().length > 5 && getApiKey().length > 5;
    }

    function notify(message) {
        Lampa.Noty.show(message);
    }

    async function apiRequest(endpoint) {
        if (!isConfigured()) {
            throw new Error('Настройте Emby в параметрах!');
        }
        const base = getUrl().replace(/\/$/, '');
        const url = `${base}/emby${endpoint}?api_key=${getApiKey()}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Ошибка при обращении к серверу Emby.');
            }
            return await response.json();
        } catch (err) {
            throw err;
        }
    }

    // 🔍 Поиск контента в библиотеке Emby
    async function findInEmby(movie) {
        if (!movie) return null;
        const fields = '&Fields=Id,Name,Type,ParentId,PrimaryImageTag&Recursive=true&IncludeItemTypes=Movie,Series,Episode';

        const tmdb = movie.tmdb_id || movie.id;
        if (tmdb) {
            try {
                const result = await apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`);
                return result.Items?.[0];
            } catch (err) {}
        }

        const title = encodeURIComponent(movie.title || movie.name || '');
        if (title) {
            try {
                const result = await apiRequest(`/Items?SearchTerm=${title}&Limit=3${fields}`);
                return result.Items?.[0];
            } catch (err) {}
        }
        return null;
    }

    // ▶️ Воспроизведение видео
    function playVideo(item) {
        const videoId = item.Id;
        const streamingUrl = `${getUrl().replace(/\/$/, '')}/Videos/${videoId}/stream.mp4?static=true&api_key=${getApiKey()}`;

        Lampa.Player.play({
            title: item.Name,
            url: streamingUrl,
            poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(videoId)),
        });
    }

    // 🖥️ Интерфейсные компоненты

    // ✨ Карточки эпизодов
    function EpisodesPage(activity, seriesId, seasonNumber) {
        this.activity = activity;
        this.seriesId = seriesId;
        this.seasonNumber = seasonNumber;
        this.scroll = null;

        this.initialize = async () => {
            this.activity.loader(true);
            this.activity.render().addClass('view--episodes');
            try {
                const episodesData = await apiRequest(`/Items?ParentId=${this.seriesId}&Season=${this.seasonNumber}&IncludeItemTypes=Episode&SortBy=SortName&SortOrder=Ascending`);
                this.episodes = episodesData.Items || [];
                this.buildUI();
            } catch (err) {
                notify(err.message);
                this.activity.loader(false);
            }
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
                card.on('click', () => playVideo(episode));
                container.append(card);
            });

            this.scroll = new Lampa.Scroll({ mask: true });
            this.scroll.body().append(container);
            this.activity.render().empty().append(this.scroll.render());
            this.activity.loader(false);
        };

        this.selectCard = (el, episode) => {
            $('.card.selected').removeClass('selected');
            el.addClass('selected');
            selectedEpisodeIndex = parseInt(el.data('id'));
        };
    }

    // 📅 Список сезонов
    function SeasonsPage(activity, seriesId) {
        this.activity = activity;
        this.seriesId = seriesId;
        this.scroll = null;

        this.initialize = async () => {
            this.activity.loader(true);
            this.activity.render().addClass('view--seasons');
            try {
                const seasonsData = await apiRequest(`/Shows/${this.seriesId}/Seasons`);
                this.seasons = seasonsData.Items || [];
                this.buildUI();
            } catch (err) {
                notify(err.message);
                this.activity.loader(false);
            }
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

            this.scroll = new Lampa.Scroll({ mask: true });
            this.scroll.body().append(container);
            this.activity.render().empty().append(this.scroll.render());
            this.activity.loader(false);
        };

        this.selectCard = (el, season) => {
            $('.card.selected').removeClass('selected');
            el.addClass('selected');
        };
    }

    // 🎬 Запуск воспроизведения
    async function handleEmbyClick(movie) {
        if (!isConfigured()) {
            notify('Настройте Emby в параметрах');
            return;
        }

        const item = await findInEmby(movie);
        if (!item) {
            notify('Контент не найден в библиотеке Emby.');
            return;
        }

        if (item.Type === 'Series') {
            currentSerieId = item.Id;
            Lampa.Activity.push({
                name: 'series',
                view: 'seasons',
                id: item.Id,
                title: item.Name,
                poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            });
        } else {
            playVideo(item);
        }
    }

    // 🛠️ Создание кнопки Emby
    function createEmbyButton(data) {
        if (!data || !data.render || !data.movie) return;
        if (data.render.find('.emby-button').length) return;

        const button = $(`
            <div class="full-start__button selector view--custom emby-button" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
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

    // ☑️ Инициализация плагина
    function startPlugin() {
        if (window.plugin_emby_ready) return;
        window.plugin_emby_ready = true;

        // 🗂️ Настройка параметров
        Lampa.SettingsApi.addParam({
            component: 'emby',
            param: {
                name: 'url',
                type: 'input',
                value: getUrl()
            },
            field: {
                name: 'URL сервера Emby',
                description: 'Введите адрес вашего сервера Emby.'
            },
            onChange: (val) => Lampa.Storage.set(STORAGE_URL, val),
        });

        Lampa.SettingsApi.addParam({
            component: 'emby',
            param: {
                name: 'apikey',
                type: 'input',
                value: getApiKey()
            },
            field: {
                name: 'API Key Emby',
                description: 'Введите ваш API ключ Emby.'
            },
            onChange: (val) => Lampa.Storage.set(STORAGE_API_KEY, val),
        });

        // 🧭 Отслеживаем открытие карточки фильма/сериала
        Lampa.Listener.follow('full', e => {
            if (e.type === 'complete') {
                const data = {
                    render: e.object.activity.render(),
                    movie: e.data.movie || e.data.card
                };
                createEmbyButton(data);
            }
        });

        // 📂 Навигация между экранами
        Lampa.Listener.follow('activity', e => {
            if (e.type === 'push' && e.data.view === 'seasons') {
                new SeasonsPage(e.object, e.data.id).initialize();
            }
        });

        console.log('%c🎬 Плагин Emby подключен!', 'color:#00B0FF;font-weight:bold;');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', e => {
        if (e.type === 'ready') startPlugin();
    });
})();
