(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '4.4.17';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // ---- Добавляем стандартный шаблон online_prestige_full (если отсутствует) ----
    // В Lampa 3.1.9 нет Lampa.Template.has, поэтому просто добавляем (перезаписываем, если есть)
    Lampa.Template.add('online_prestige_full', `
        <div class="online-prestige online-prestige--full selector">
            <div class="online-prestige__img">
                <img alt="">
                <div class="online-prestige__loader"></div>
            </div>
            <div class="online-prestige__body">
                <div class="online-prestige__head">
                    <div class="online-prestige__title">{title}</div>
                    <div class="online-prestige__time">{time}</div>
                </div>
                <div class="online-prestige__timeline"></div>
                <div class="online-prestige__footer">
                    <div class="online-prestige__info">{info}</div>
                    <div class="online-prestige__quality">{quality}</div>
                </div>
            </div>
        </div>
    `);

    // ---- Добавляем стили для online-prestige (если ещё не добавлены) ----
    if (!$('style#online-prestige-styles').length) {
        $('head').append(`
            <style id="online-prestige-styles">
                @charset 'UTF-8';.online-prestige{position:relative;-webkit-border-radius:.3em;-moz-border-radius:.3em;border-radius:.3em;background-color:rgba(0,0,0,0.3);display:-webkit-box;display:-webkit-flex;display:-moz-box;display:-ms-flexbox;display:flex;will-change:transform}.online-prestige__body{padding:1.2em;line-height:1.3;-webkit-box-flex:1;-webkit-flex-grow:1;-moz-box-flex:1;-ms-flex-positive:1;flex-grow:1;position:relative}@media screen and (max-width:480px){.online-prestige__body{padding:.8em 1.2em}}.online-prestige__img{position:relative;width:13em;-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0;min-height:8.2em}.online-prestige__img>img{position:absolute;top:0;left:0;width:100%;height:100%;-o-object-fit:cover;object-fit:cover;-webkit-border-radius:.3em;-moz-border-radius:.3em;border-radius:.3em;opacity:0;-webkit-transition:opacity .3s;-o-transition:opacity .3s;-moz-transition:opacity .3s;transition:opacity .3s}.online-prestige__img--loaded>img{opacity:1}@media screen and (max-width:480px){.online-prestige__img{width:7em;min-height:6em}}.online-prestige__folder{padding:1em;-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0}.online-prestige__folder>svg{width:4.4em !important;height:4.4em !important}.online-prestige__viewed{position:absolute;top:1em;left:1em;background:rgba(0,0,0,0.45);-webkit-border-radius:100%;-moz-border-radius:100%;border-radius:100%;padding:.25em;font-size:.76em}.online-prestige__viewed>svg{width:1.5em !important;height:1.5em !important}.online-prestige__episode-number{position:absolute;top:0;left:0;right:0;bottom:0;display:-webkit-box;display:-webkit-flex;display:-moz-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-webkit-align-items:center;-moz-box-align:center;-ms-flex-align:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;-moz-box-pack:center;-ms-flex-pack:center;justify-content:center;font-size:2em}.online-prestige__loader{position:absolute;top:50%;left:50%;width:2em;height:2em;margin-left:-1em;margin-top:-1em;background:url(./img/loader.svg) no-repeat center center;-webkit-background-size:contain;-moz-background-size:contain;-o-background-size:contain;background-size:contain}.online-prestige__head,.online-prestige__footer{display:-webkit-box;display:-webkit-flex;display:-moz-box;display:-ms-flexbox;display:flex;-webkit-box-pack:justify;-webkit-justify-content:space-between;-moz-box-pack:justify;-ms-flex-pack:justify;justify-content:space-between;-webkit-box-align:center;-webkit-align-items:center;-moz-box-align:center;-ms-flex-align:center;align-items:center}.online-prestige__timeline{margin:.8em 0}.online-prestige__timeline>.time-line{display:block !important}.online-prestige__title{font-size:1.7em;overflow:hidden;-o-text-overflow:ellipsis;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;line-clamp:1;-webkit-box-orient:vertical}@media screen and (max-width:480px){.online-prestige__title{font-size:1.4em}}.online-prestige__time{padding-left:2em}.online-prestige__info{display:-webkit-box;display:-webkit-flex;display:-moz-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-webkit-align-items:center;-moz-box-align:center;-ms-flex-align:center;align-items:center}.online-prestige__info>*{overflow:hidden;-o-text-overflow:ellipsis;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;line-clamp:1;-webkit-box-orient:vertical}.online-prestige__quality{padding-left:1em;white-space:nowrap}.online-prestige__scan-file{position:absolute;bottom:0;left:0;right:0}.online-prestige__scan-file .broadcast__scan{margin:0}.online-prestige .online-prestige-split{font-size:.8em;margin:0 1em;-webkit-flex-shrink:0;-ms-flex-negative:0;flex-shrink:0}.online-prestige.focus::after{content:'';position:absolute;top:-0.6em;left:-0.6em;right:-0.6em;bottom:-0.6em;-webkit-border-radius:.7em;-moz-border-radius:.7em;border-radius:.7em;border:solid .3em #fff;z-index:-1;pointer-events:none}.online-prestige+.online-prestige{margin-top:1.5em}.online-prestige--folder .online-prestige__footer{margin-top:.8em}
            </style>
        `);
    }

    // ---- Дополнительный минимальный стиль для контейнера ----
    if (!$('style#emby-plugin-styles').length) {
        $('head').append(`
            <style id="emby-plugin-styles">
                .emby-container { padding: 0; height: 100%; overflow-y: auto; }
                .emby-filter { display: flex; align-items: center; padding: 1.5em 2em 0.5em 2em; gap: 1em; flex-wrap: wrap; position: sticky; top: 0; z-index: 10; background: rgba(0,0,0,0.9); }
                .emby-filter-btn { background: rgba(255,255,255,0.1); padding: 0.6em 1.5em; border-radius: 5px; cursor: pointer; font-size: 1.1em; font-weight: bold; }
                .emby-filter-btn.focus { background: #fff; color: #000; }
                .emby-loader { display: flex; justify-content: center; align-items: center; height: 50vh; }
                .emby-empty { text-align: center; padding: 3em; font-size: 1.2em; opacity: 0.7; width: 100%; }
            </style>
        `);
    }

    // ---- Базовые функции ----
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
        const sep = endpoint.includes('?') ? '&' : '?';
        return `${base}/emby${endpoint}${sep}api_key=${getApiKey()}`;
    }

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
        if (tmdb) {
            network.silent(buildApiUrl(`/Items?AnyProviderIdEquals=tmdb.${tmdb}&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name`), (data) => {
                callback(data?.Items?.[0] || null);
            }, () => callback(null));
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

    // ---- Воспроизведение с плейлистом и таймлайнами ----
    function playVideo(item, tmdbId, seasonNumber, episodeNumber, playlist, currentIndex) {
        const base = getUrl().replace(/\/$/, '');
        const apiKey = getApiKey();
        const deviceId = getDeviceId();
        const playSessionId = Date.now().toString();
        
        let streamUrl = `${base}/emby/Videos/${item.Id}/stream?Static=true&DeviceId=${deviceId}&PlaySessionId=${playSessionId}&api_key=${apiKey}`;
        
        let timeline = null;
        let source = {};

        if (playlist && playlist.length > 0) {
            timeline = playlist[currentIndex].timeline;
            source = {
                playlist: playlist,
                current: currentIndex,
                type: 'tv',
                id: tmdbId,
                season: seasonNumber,
                episode: episodeNumber
            };
            Lampa.Player.play({
                title: item.Name,
                url: streamUrl,
                poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                timeline: timeline,
                source: source
            });
        } else {
            let timelineKey = 'movie/' + (tmdbId || item.Id);
            timeline = Lampa.Timeline.view(timelineKey);
            source = { id: tmdbId || item.Id, type: 'movie' };
            Lampa.Player.play({
                title: item.Name,
                url: streamUrl,
                poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                timeline: timeline,
                source: source
            });
        }
    }

    /* --- Компонент для сериалов (использует стандартный шаблон Lampa) --- */
    function EmbySeriesComponent() {
        let network = new Lampa.Reguest();
        let is_destroyed = false;
        let element = $('<div class="emby-container"></div>')[0];
        let seasons = [];
        let current_season = null;
        let current_episodes = [];
        let emby_series_id = null;
        let tmdb_id = null;

        // Компоненты Lampa
        let explorer = null;
        let scroll = null;
        let filter = null;

        this.create = function() {
            if (window.embySeriesData) {
                emby_series_id = window.embySeriesData.emby_id;
                tmdb_id = window.embySeriesData.tmdb_id;
            }
            explorer = new Lampa.Explorer();
            scroll = new Lampa.Scroll({ mask: true, over: true });
            filter = new Lampa.Filter();
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

            // Инициализация фильтра
            filter.render().find('.filter--sort').remove(); // убираем сортировку
            filter.onSelect = function(type, a, b) {
                if (type === 'filter' && a.season) {
                    current_season = a.season;
                    loadEpisodes(body);
                }
            };
            filter.onBack = function() {
                Lampa.Activity.backward();
            };

            // Добавляем фильтр в начало
            let filterHtml = filter.render();
            body.append(filterHtml);

            // Настройка explorer
            explorer.appendFiles(scroll.render());

            // Загрузка сезонов
            body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            getSeasonsFromTMDB(tmdb_id, (result) => {
                if (is_destroyed) return;
                seasons = result;
                if (seasons.length === 0) {
                    body.html('<div class="emby-empty">Сезоны не найдены</div>');
                    setupNavigation();
                } else {
                    let savedSeason = window.embyLastSeason;
                    if (savedSeason && savedSeason.seriesId === emby_series_id) {
                        let found = seasons.find(s => s.season_number === savedSeason.seasonNumber);
                        current_season = found || seasons[0];
                    } else {
                        current_season = seasons[0];
                    }
                    // Обновляем фильтр
                    updateFilter();
                    loadEpisodes(body);
                }
            });
        };

        function updateFilter() {
            let items = seasons.map(s => ({
                title: s.name || `Сезон ${s.season_number}`,
                season: s,
                selected: s.season_number === current_season.season_number
            }));
            filter.set('filter', [{
                title: Lampa.Lang.translate('torrent_serial_season'),
                items: items,
                stype: 'season'
            }]);
            filter.chosen('filter', [Lampa.Lang.translate('torrent_serial_season') + ': ' + (current_season.name || 'Сезон ' + current_season.season_number)]);
        }

        function loadEpisodes(body) {
            if (is_destroyed) return;
            body.find('.emby-loader').remove();
            body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            getEpisodesFromTMDB(tmdb_id, current_season.season_number, (episodes) => {
                if (is_destroyed) return;
                current_episodes = episodes;
                renderEpisodes(body);
            });
        }

        function renderEpisodes(body) {
            if (is_destroyed) return;
            body.find('.emby-loader').remove();

            scroll.clear();
            let items = [];

            if (current_episodes.length === 0) {
                let empty = $('<div class="emby-empty">Эпизоды не найдены</div>');
                scroll.append(empty);
            } else {
                current_episodes.forEach((episode, index) => {
                    let epNum = String(episode.episode_number).padStart(2, '0');
                    let stillPath = episode.still_path ? 'https://image.tmdb.org/t/p/w300' + episode.still_path : '';
                    
                    // Данные для шаблона
                    let title = episode.name || 'Эпизод ' + epNum;
                    let rating = episode.vote_average ? episode.vote_average.toFixed(1) : '0.0';
                    let airDate = episode.air_date ? Lampa.Utils.parseTime(episode.air_date).full : '';
                    
                    // Таймлайн
                    let timelineKey = 'tv/' + tmdb_id + '/' + current_season.season_number + '/' + episode.episode_number;
                    let timeline = Lampa.Timeline.view(timelineKey);
                    
                    // Формируем info (рейтинг + дата)
                    let infoParts = [];
                    if (rating !== '0.0') infoParts.push(`⭐ ${rating}`);
                    if (airDate) infoParts.push(airDate);
                    let info = infoParts.join(' ● ');
                    
                    // Время (длительность) - у нас нет, оставляем пустым
                    let time = '';
                    let quality = '';

                    // Создаём HTML через шаблон
                    let html = Lampa.Template.get('online_prestige_full', {
                        title: title,
                        time: time,
                        info: info,
                        quality: quality
                    });

                    // Вставляем таймлайн
                    let timelineContainer = html.find('.online-prestige__timeline');
                    let timelineElement = Lampa.Timeline.render(timeline);
                    if (timelineElement) {
                        timelineContainer.append(timelineElement);
                    }

                    // Загружаем картинку
                    let img = html.find('img')[0];
                    if (stillPath) {
                        img.onload = function() {
                            html.find('.online-prestige__img').addClass('online-prestige__img--loaded');
                            html.find('.online-prestige__loader').remove();
                        };
                        img.onerror = function() {
                            img.src = './img/img_broken.svg';
                        };
                        img.src = stillPath;
                    } else {
                        img.src = './img/img_broken.svg';
                        html.find('.online-prestige__loader').remove();
                    }

                    // Сохраняем данные в элемент
                    let item = $(html);
                    item.data('episode', episode.episode_number);
                    item.data('season', current_season.season_number);
                    item.data('index', index);

                    // Обработчик клика
                    item.on('hover:enter click', function() {
                        let epNumber = parseInt($(this).data('episode'));
                        let seasonNumber = parseInt($(this).data('season'));
                        window.embyLastSeason = { seriesId: emby_series_id, seasonNumber: seasonNumber };

                        // Показываем лоадер
                        body.empty();
                        body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');

                        let net = new Lampa.Reguest();
                        let seasonQuery = `/Items?ParentId=${emby_series_id}&IncludeItemTypes=Season&Fields=Id,IndexNumber`;
                        net.silent(buildApiUrl(seasonQuery), (seasonData) => {
                            if (is_destroyed) return;
                            if (seasonData && seasonData.Items) {
                                let season = seasonData.Items.find(s => s.IndexNumber === seasonNumber);
                                if (season) {
                                    let episodeQuery = `/Items?ParentId=${season.Id}&IncludeItemTypes=Episode&Fields=Id,Name,IndexNumber,PrimaryImageTag&SortBy=SortName&SortOrder=Ascending`;
                                    net.silent(buildApiUrl(episodeQuery), (episodeData) => {
                                        if (is_destroyed) return;
                                        if (episodeData && episodeData.Items) {
                                            let sortedEpisodes = episodeData.Items.sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));
                                            let playlist = sortedEpisodes.map((ep, i) => {
                                                let psId = Date.now() + i;
                                                let tmdbEp = current_episodes[i];
                                                let epNumForTimeline = tmdbEp ? tmdbEp.episode_number : (i + 1);
                                                let key = 'tv/' + tmdb_id + '/' + seasonNumber + '/' + epNumForTimeline;
                                                return {
                                                    title: ep.Name,
                                                    url: `${getUrl().replace(/\/$/, '')}/emby/Videos/${ep.Id}/stream?Static=true&DeviceId=${getDeviceId()}&PlaySessionId=${psId}&api_key=${getApiKey()}`,
                                                    poster: ep.PrimaryImageTag ? `${getUrl().replace(/\/$/, '')}/Items/${ep.Id}/Images/Primary?tag=${ep.PrimaryImageTag}` : '',
                                                    timeline: Lampa.Timeline.view(key)
                                                };
                                            });
                                            let currentEp = sortedEpisodes[epNumber - 1];
                                            if (currentEp) {
                                                playVideo(currentEp, tmdb_id, seasonNumber, epNumber, playlist, epNumber - 1);
                                            }
                                        }
                                    }, () => {
                                        if (is_destroyed) return;
                                        body.html('<div class="emby-empty">Ошибка загрузки</div>');
                                        setupNavigation();
                                    });
                                }
                            }
                        }, () => {
                            if (is_destroyed) return;
                            body.html('<div class="emby-empty">Ошибка загрузки</div>');
                            setupNavigation();
                        });
                    });

                    // Добавляем в скролл
                    scroll.append(item);
                    items.push(item);
                });
            }

            // Обновляем explorer
            explorer.appendFiles(scroll.render());
            // Скрываем стандартный заголовок explorer (он нам не нужен)
            explorer.render().find('.explorer__files-head').remove();

            // Обновляем фильтр
            updateFilter();

            // Навигация
            setupNavigation();
            // Устанавливаем фокус
            Lampa.Controller.collectionSet(scroll.render(), explorer.render());
            setTimeout(() => {
                Lampa.Controller.collectionFocus(false, scroll.render());
            }, 100);
        }

        function setupNavigation() {
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(scroll.render(), explorer.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                up: () => {
                    if (Navigator.canmove('up')) {
                        Navigator.move('up');
                    } else {
                        Lampa.Controller.toggle('head');
                    }
                },
                down: () => {
                    Navigator.move('down');
                },
                right: () => {
                    if (filter && filter.render) {
                        filter.show(Lampa.Lang.translate('title_filter'), 'filter');
                    }
                },
                left: () => {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: () => {
                    Lampa.Activity.backward();
                }
            });
            Lampa.Controller.toggle('content');
        }

        this.render = function() {
            return element;
        };

        this.destroy = function() {
            is_destroyed = true;
            network.clear();
            if (explorer) explorer.destroy();
            if (scroll) scroll.destroy();
            if (filter) filter.destroy();
        };
    }

    /* --- Остальная часть плагина (кнопка, настройки, запуск) --- */
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
                let tmdbId = extractTmdbId(movie);
                playVideo(item, tmdbId);
            } else {
                notify('Неизвестный тип контента');
            }
        });
    }

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
