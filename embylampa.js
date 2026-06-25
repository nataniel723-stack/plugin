(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '2.5.0';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // Базовые утилиты
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

    // Поиск контента
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);

        const fields = '&Fields=Id,Name,Type,PrimaryImageTag,Genres,Overview,PremiereDate&Recursive=true&IncludeItemTypes=Movie,Series,Episode';

        // Поиск по TMDB-ID
        const tmdb = movie.tmdb_id || movie.id;
        if (tmdb) {
            apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, data => {
                const item = data?.Items?.[0];
                if (item) {
                    // Дополнительная проверка по году
                    const yearDiff = Math.abs(new Date(item.PremiereDate).getFullYear() - movie.year);
                    if (yearDiff <= 1) return callback(item);
                }
                searchByName(movie, callback);
            });
            return;
        }

        // Поиск по названию
        searchByName(movie, callback);
    }

    function searchByName(movie, callback) {
        const title = encodeURIComponent(movie.title || movie.name || '');
        if (!title) return callback(null);

        apiRequest(`/Items?SearchTerm=${title}&Limit=3${fields}`, data => {
            const item = data?.Items?.[0];
            if (item) {
                // Проверка по году
                const yearDiff = Math.abs(new Date(item.PremiereDate).getFullYear() - movie.year);
                if (yearDiff <= 1) return callback(item);
            }
            callback(null);
        });
    }

    // Оптимизированный запрос всех эпизодов
    function fetchAllEpisodes(seriesId, callback) {
        const params = `ParentId=${seriesId}&IsFolder=false&IncludeItemTypes=Episode&SortBy=ProductionYear,IndexNumber,ParentIndexNumber&SortOrder=Ascending`;
        apiRequest(`/Items?${params}`, data => {
            const episodes = data.Items || [];
            const grouped = {};

            episodes.forEach(ep => {
                const seasonNum = ep.ParentIndexNumber || 1;
                if (!grouped[seasonNum]) grouped[seasonNum] = [];
                grouped[seasonNum].push(ep);
            });

            // Преобразуем в массив [{season: 1, episodes: [...]}, {...}]
            const seasons = Object.keys(grouped).map(seasonNum => ({
                season: parseInt(seasonNum),
                episodes: grouped[seasonNum]
            }));

            callback(seasons);
        });
    }

    // Рендеринг страницы сериала
    function renderSeasonsPage(activity, serieData) {
        activity.loader(true);
        activity.render().addClass('view--seasons');

        // Создаем контейнер
        const container = $('<div class="content"></div>');

        // Верхняя панель
        const topPanel = $(
            `<div class="top-panel">
                <div class="poster">
                    <img src="${serieData.poster}" />
                </div>
                <div class="meta">
                    <h1>${serieData.name}</h1>
                    <p>${serieData.year} • ${serieData.genres} • ${serieData.rating} ★</p>
                    <p>${serieData.description}</p>
                </div>
             </div>`
        );

        // Блок с сезонами
        const seasonsBlock = $('<div class="season-block"></div>');

        // Запрашиваем все эпизоды
        fetchAllEpisodes(serieData.id, (seasons) => {
            seasons.forEach(({season, episodes}) => {
                const seasonEl = $(
                    `<div class="season">
                        <h2>Сезон ${season}</h2>
                        <ul class="episode-list"></ul>
                     </div>`
                );

                const ul = seasonEl.find('.episode-list');
                episodes.forEach(ep => {
                    const thumb = ep.ImageTags.Primary ?
                        `${getUrl()}/Items/${ep.Id}/Images/Primary?tag=${ep.ImageTags.Primary}` :
                        serieData.poster;

                    const li = $(
                        `<li class="selector">
                            <div class="thumb"><img id="019efcbf-1f63-7097-ad33-50cddcb643c5"/></div>
                            <div class="info">
                                <strong>${ep.IndexNumber.padStart(2,'0')}. ${ep.Name}</strong>
                                <small>${ep.RunTimeTicks ? msToTime(ep.RunTimeTicks / 10000) : '-:-'}</small>
                            </div>
                         </li>`
                    ).on('hover:enter', () => playEpisode(ep.Id));

                    ul.append(li);
                });

                seasonsBlock.append(seasonEl);
            });

            container.append(topPanel).append(seasonsBlock);
            activity.render().empty().append(container);
            activity.loader(false);
        });
    }

    // Вспомогательная функция для перевода RunTimeTicks в формат hh:mm:ss
    function msToTime(ms) {
        const sec = Math.floor(ms / 1000);
        const hours = String(Math.floor(sec / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
        const seconds = String(sec % 60).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    // Воспроизведение
    function playEpisode(episodeId) {
        const streamUrl = `${getUrl().replace(/\/$/, '')}/Videos/${episodeId}/stream.mp4?static=true&api_key=${getApiKey()}`;
        apiRequest(`/Items/${episodeId}`, data => {
            const episode = data;
            Lampa.Player.play({
                title: `[S${episode.ParentIndexNumber}E${episode.IndexNumber}] ${episode.SeriesName} — ${episode.Name}`,
                url: streamUrl,
                poster: episode.ImageTags.Primary ? `${getUrl()}/Items/${episode.Id}/Images/Primary?tag=${episode.ImageTags.Primary}` : '',
                timeline: Lampa.Timeline.view(Lampa.Utils.hash(episode.Id))
            });
        });
    }

    // Основной обработчик
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
                // Дополним сериал нужными полями
                const serieData = {
                    id: item.Id,
                    name: item.Name,
                    poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                    genres: item.Genres.join(', '),
                    rating: item.CommunityRating,
                    description: item.Overview,
                    year: new Date(item.PremiereDate).getFullYear()
                };

                // Открываем стандартную активность
                Lampa.Activity.push({
                    name: 'series',
                    view: 'seasons',
                    id: item.Id,
                    title: item.Name,
                    poster: serieData.poster,
                    data: serieData // Передаем полный объект
                });
            } else {
                // Фильм
                const streamUrl = `${getUrl().replace(/\/$/, '')}/Videos/${item.Id}/stream.mp4?static=true&api_key=${getApiKey()}`;
                Lampa.Player.play({
                    title: item.Name,
                    url: streamUrl,
                    poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                    timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id))
                });
            }
        });
    }

    // Создание кнопки
    function addEmbyButton(data) {
        if (!data || !data.render || !data.movie) return;
        if (data.render.find('.emby-button').length) return;

        const button = $(`
            <div class="full-start__button selector view--emby" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
                <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
                <span>${PLUGIN_NAME}</span>
            </div>
        `).on('hover:enter', () => handleEmbyClick(data.movie));

        const playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) {
            playButton.after(button);
        } else {
            data.render.find('.buttons, .activity__body').append(button);
        }
    }

    // Хуки Lampa
    Lampa.Listener.follow('activity', e => {
        if (e.type !== 'push' || e.data.view !== 'seasons') return;

        // Проверяем, переданы ли все нужные поля
        const serieData = e.data.data;
        if (!serieData.poster || !serieData.genres) {
            // Если нет — делаем дополнительный запрос
            apiRequest(`/Items/${e.data.id}?Fields=Genres,Overview,PremiereDate`, data => {
                serieData.poster = data.ImageTags.Primary ?
                    `${getUrl()}/Items/${e.data.id}/Images/Primary?tag=${data.ImageTags.Primary}` :
                    '';
                serieData.genres = data.Genres.join(', ');
                serieData.rating = data.CommunityRating;
                serieData.description = data.Overview;
                serieData.year = new Date(data.PremiereDate).getFullYear();

                renderSeasonsPage(e.object, serieData);
            });
        } else {
            renderSeasonsPage(e.object, serieData);
        }
    });

    // Настройки
    function renderSettings(body) {
        body.empty();
        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${getUrl() || 'Не задано'}</div></div>`)
            .on('hover:enter', () => editInput('URL', STORAGE_URL));

        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${getApiKey() ? '••••••••••' : 'Не задано'}</div></div>`)
            .on('hover:enter', () => editInput('API Key', STORAGE_API_KEY));

        wrap.append(urlRow).append(keyRow);
        body.append(wrap);
    }

    function editInput(title, storageKey) {
        Lampa.Input.edit({title: `Emby ${title}`, value: Lampa.Storage.get(storageKey), free: true}, val => {
            Lampa.Storage.set(storageKey, val.trim());
            window.location.reload(); // Перезагрузка для обновления состояния
        });
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
