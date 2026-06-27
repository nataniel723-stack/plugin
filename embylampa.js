(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '4.4.14';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // Стили (оставлены как в 4.4.6)
    if (!$('style#emby-plugin-styles').length) {
        $('head').append(`
            <style id="emby-plugin-styles">
                .emby-container { padding: 0; height: 100%; overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth; }
                .emby-episodes-grid { display: flex; flex-wrap: wrap; padding: 1em 1.5em; gap: 1.5em; align-content: flex-start; }
                .emby-episode-card { width: calc(25% - 1.125em); cursor: pointer; transition: transform 0.2s, background 0.2s; border-radius: 0.5em; padding: 0.5em; box-sizing: border-box; position: relative; overflow: hidden; }
                .emby-episode-card.focus { background: rgba(255, 255, 255, 0.1); transform: scale(1.05); }
                .emby-episode-card .emby-progress { position: absolute; bottom: 0; left: 0; height: 3px; background: #00B0FF; z-index: 2; transition: width 0.3s; }
                .emby-ep-img-wrap { width: 100%; aspect-ratio: 16/9; border-radius: 0.4em; overflow: hidden; position: relative; background: #111; margin-bottom: 0.6em; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
                .emby-ep-img { width: 100%; height: 100%; object-fit: cover; }
                .emby-ep-num { position: absolute; top: 0.4em; left: 0.4em; background: rgba(0,0,0,0.7); padding: 0.2em 0.5em; border-radius: 0.3em; font-weight: bold; font-size: 0.9em; color: #fff; }
                .emby-ep-title { font-size: 1.1em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0.2em; text-shadow: 1px 1px 2px rgba(0,0,0,0.8); }
                .emby-ep-info { font-size: 0.85em; color: #aaa; }
                .emby-filter { display: flex; align-items: center; justify-content: flex-start; padding: 1.5em 2em 0 2em; gap: 1em; flex-wrap: wrap; position: sticky; top: 0; z-index: 10; background: rgba(0,0,0,0.9); }
                .emby-filter-btn { background: rgba(255,255,255,0.1); padding: 0.6em 1.5em; border-radius: 5px; cursor: pointer; font-size: 1.1em; font-weight: bold; }
                .emby-filter-btn.focus { background: #fff; color: #000; }
                .emby-loader { display: flex; justify-content: center; align-items: center; height: 50vh; }
                .emby-empty { text-align: center; padding: 3em; font-size: 1.2em; opacity: 0.7; width: 100%; }
                @media (max-width: 1200px) { .emby-episode-card { width: calc(33.333% - 1em); } }
                @media (max-width: 768px) { .emby-episode-card { width: calc(50% - 0.75em); } }
                @media (max-width: 480px) { .emby-episode-card { width: 100%; } }
            </style>
        `);
    }

    function getUrl() { return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim(); }
    function getApiKey() { return (Lampa.Storage.get(STORAGE_API_KEY, '78b3967970814692b20b095e5b13f0eb') || '').trim(); }
    function isConfigured() { return getUrl().length > 5 && getApiKey().length > 5; }
    function notify(msg) { Lampa.Noty.show(msg); }
    function buildApiUrl(endpoint) {
        const base = getUrl().replace(/\/$/, '');
        const sep = endpoint.includes('?') ? '&' : '?';
        return `${base}/emby${endpoint}${sep}api_key=${getApiKey()}`;
    }
    function getDeviceId() {
        let id = Lampa.Storage.get('emby_device_id');
        if (!id) {
            id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
            Lampa.Storage.set('emby_device_id', id);
        }
        return id;
    }

    function extractTmdbId(movie) {
        if (!movie) return null;
        let tmdb = movie.tmdb_id || movie.id;
        if (typeof movie.url === 'string') {
            const m = movie.url.match(/tv\/(\d+)/);
            if (m) tmdb = parseInt(m[1]);
        }
        if (!tmdb && movie.data) tmdb = movie.data.tmdb_id || movie.data.id;
        return tmdb ? parseInt(tmdb) : null;
    }

    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        const tmdb = extractTmdbId(movie);
        const network = new Lampa.Reguest();
        if (tmdb) {
            network.silent(buildApiUrl(`/Items?AnyProviderIdEquals=tmdb.${tmdb}&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name`),
                data => callback(data?.Items?.[0] || null),
                () => callback(null));
        } else {
            const title = movie.title || movie.name || '';
            if (!title) return callback(null);
            network.silent(buildApiUrl(`/Items?SearchTerm=${encodeURIComponent(title)}&Limit=3&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name`),
                data => callback(data?.Items?.[0] || null),
                () => callback(null));
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

    // ТОЧНО КАК В CDN.js: загружаем эпизоды и сразу external_ids для каждого
    function getEpisodesWithImdb(tmdb_id, season_number, callback) {
        let network = new Lampa.Reguest();
        let url = Lampa.TMDB.api('tv/' + tmdb_id + '/season/' + season_number + '?api_key=' + Lampa.TMDB.key() + '&language=' + Lampa.Storage.get('language', 'ru'));
        
        network.silent(url, (data) => {
            if (data && data.episodes) {
                let episodes = data.episodes;
                let pending = episodes.length;
                
                if (pending === 0) return callback([]);
                
                episodes.forEach((ep, i) => {
                    let extUrl = Lampa.TMDB.api('tv/' + tmdb_id + '/season/' + season_number + '/episode/' + ep.episode_number + '/external_ids?api_key=' + Lampa.TMDB.key());
                    let req = new Lampa.Reguest();
                    req.silent(extUrl, (ext) => {
                        episodes[i].imdb_id = ext && ext.imdb_id ? ext.imdb_id : null;
                        console.log('IMDb ID for ' + ep.episode_number + ': ' + episodes[i].imdb_id);
                        pending--;
                        if (pending === 0) callback(episodes);
                    }, () => {
                        episodes[i].imdb_id = null;
                        pending--;
                        if (pending === 0) callback(episodes);
                    });
                });
            } else {
                callback([]);
            }
        }, () => callback([]));
    }

    function playVideo(item, playlist, currentIndex) {
        const base = getUrl().replace(/\/$/, '');
        const apiKey = getApiKey();
        const deviceId = getDeviceId();
        const playSessionId = Date.now().toString();
        let streamUrl = `${base}/emby/Videos/${item.Id}/stream?Static=true&DeviceId=${deviceId}&PlaySessionId=${playSessionId}&api_key=${apiKey}`;
        
        if (playlist && playlist.length > 0) {
            Lampa.Player.play({
                title: item.Name,
                url: streamUrl,
                poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                timeline: playlist[currentIndex].timeline,
                source: { playlist: playlist, current: currentIndex }
            });
        } else {
            let movieKey = 'movie/' + extractTmdbId(window.currentMovie);
            Lampa.Player.play({
                title: item.Name,
                url: streamUrl,
                poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                timeline: Lampa.Timeline.view(Lampa.Utils.hash(movieKey))
            });
        }
    }

    /* --- Компонент EmbySeriesComponent (как в 4.4.6, но с imdb_id) --- */
    function EmbySeriesComponent() {
        let network = new Lampa.Reguest();
        let is_destroyed = false;
        let element = $('<div class="emby-container"></div>')[0];
        let seasons = [], current_season = null, current_episodes = [];
        let emby_series_id = null, tmdb_id = null;

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
                    let savedSeason = window.embyLastSeason;
                    current_season = (savedSeason && savedSeason.seriesId === emby_series_id) ?
                        (seasons.find(s => s.season_number === savedSeason.seasonNumber) || seasons[0]) : seasons[0];
                    loadEpisodes(body);
                }
            });
        };

        function loadEpisodes(body) {
            if (is_destroyed) return;
            body.empty();
            body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
            getEpisodesWithImdb(tmdb_id, current_season.season_number, (episodes) => {
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
                let items = seasons.map(s => ({ title: s.name || `Сезон ${s.season_number}`, season: s, selected: s.season_number === current_season.season_number }));
                Lampa.Select.show({
                    title: 'Выберите сезон', items: items,
                    onSelect: (a) => { current_season = a.season; loadEpisodes(body); },
                    onBack: () => Lampa.Controller.toggle('content')
                });
            });
            filterPanel.append(seasonBtn);
            body.append(filterPanel);
            let grid = $('<div class="emby-episodes-grid"></div>');
            if (current_episodes.length === 0) {
                grid.append('<div class="emby-empty">Эпизоды не найдены</div>');
            } else {
                current_episodes.forEach((episode, index) => {
                    let epNum = String(episode.episode_number).padStart(2, '0');
                    let stillPath = episode.still_path ? 'https://image.tmdb.org/t/p/w400' + episode.still_path : '';
                    let imageHtml = stillPath ? `<img src="${stillPath}" class="emby-ep-img" onerror="this.style.display='none'; this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);color:#00B0FF;font-size:3em;font-weight:bold\\'>${epNum}</div>'">` :
                        `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);color:#00B0FF;font-size:3em;font-weight:bold;text-shadow:2px 2px 4px rgba(0,0,0,0.5)">${epNum}</div>`;
                    let rating = episode.vote_average ? episode.vote_average.toFixed(1) : '0.0';

                    // Таймлайн ТОЧНО как в CDN.js: хеш от imdb_id
                    let timeline = null;
                    if (episode.imdb_id) {
                        timeline = Lampa.Timeline.view(Lampa.Utils.hash(episode.imdb_id));
                    } else {
                        // запасной ключ
                        let fallbackKey = 'tv/' + tmdb_id + '/' + current_season.season_number + '/' + episode.episode_number;
                        timeline = Lampa.Timeline.view(Lampa.Utils.hash(fallbackKey));
                    }
                    let progressPercent = 0;
                    if (timeline && timeline.time && timeline.duration) {
                        progressPercent = Math.min(100, (timeline.time / timeline.duration) * 100);
                    }
                    console.log('Ep ' + epNum + ' imdb: ' + episode.imdb_id + ' progress: ' + progressPercent + '%');

                    let progressBar = progressPercent > 0 ? `<div class="emby-progress" style="width:${progressPercent}%"></div>` : '';
                    let item = $(`<div class="emby-episode-card selector" data-episode="${episode.episode_number}" data-season="${current_season.season_number}" data-index="${index}">
                        <div class="emby-ep-img-wrap">${imageHtml}<div class="emby-ep-num">${epNum} серия</div></div>
                        <div class="emby-ep-title">${episode.name || 'Эпизод ' + epNum}</div>
                        <div class="emby-ep-info">⭐ ${rating}</div>${progressBar}
                    </div>`);

                    item.on('hover:enter click', function() {
                        let epNumber = parseInt($(this).data('episode'));
                        let seasonNumber = parseInt($(this).data('season'));
                        window.embyLastSeason = { seriesId: emby_series_id, seasonNumber: seasonNumber };
                        body.empty(); body.append('<div class="emby-loader"><div class="broadcast__spin"></div></div>');
                        let seasonQuery = `/Items?ParentId=${emby_series_id}&IncludeItemTypes=Season&Fields=Id,IndexNumber`;
                        let net = new Lampa.Reguest();
                        net.silent(buildApiUrl(seasonQuery), (seasonData) => {
                            if (is_destroyed) return;
                            if (seasonData && seasonData.Items) {
                                let season = seasonData.Items.find(s => s.IndexNumber === seasonNumber);
                                if (season) {
                                    let epQuery = `/Items?ParentId=${season.Id}&IncludeItemTypes=Episode&Fields=Id,Name,IndexNumber,PrimaryImageTag&SortBy=SortName&SortOrder=Ascending`;
                                    net.silent(buildApiUrl(epQuery), (epData) => {
                                        if (is_destroyed) return;
                                        if (epData && epData.Items) {
                                            let sorted = epData.Items.sort((a,b) => (a.IndexNumber||0)-(b.IndexNumber||0));
                                            let playlist = sorted.map((ep, i) => {
                                                let psId = Date.now() + i;
                                                let tmdbEp = current_episodes[i];
                                                let key = tmdbEp && tmdbEp.imdb_id ? tmdbEp.imdb_id : ('tv/' + tmdb_id + '/' + seasonNumber + '/' + (tmdbEp ? tmdbEp.episode_number : i+1));
                                                let h = Lampa.Utils.hash(key);
                                                return {
                                                    title: ep.Name,
                                                    url: `${getUrl().replace(/\/$/, '')}/emby/Videos/${ep.Id}/stream?Static=true&DeviceId=${getDeviceId()}&PlaySessionId=${psId}&api_key=${getApiKey()}`,
                                                    poster: ep.PrimaryImageTag ? `${getUrl().replace(/\/$/, '')}/Items/${ep.Id}/Images/Primary?tag=${ep.PrimaryImageTag}` : '',
                                                    timeline: Lampa.Timeline.view(h)
                                                };
                                            });
                                            let currentEp = sorted[epNumber-1];
                                            if (currentEp) playVideo(currentEp, playlist, epNumber-1);
                                        }
                                    }, () => { body.html('<div class="emby-empty">Ошибка</div>'); setupNavigation(); });
                                }
                            }
                        }, () => { body.html('<div class="emby-empty">Ошибка</div>'); setupNavigation(); });
                    });
                    grid.append(item);
                });
            }
            body.append(grid);
            element.scrollTop = 0;
            setupNavigation();
        }

        function scrollToFocused() {
            let focused = $(element).find('.selector.focus');
            if (focused.length) {
                let containerRect = element.getBoundingClientRect();
                let elementRect = focused[0].getBoundingClientRect();
                if (elementRect.bottom > containerRect.bottom - 20) {
                    element.scrollBy({ top: elementRect.bottom - containerRect.bottom + 100, behavior: 'smooth' });
                }
                if (elementRect.top < containerRect.top + 80) {
                    element.scrollBy({ top: elementRect.top - containerRect.top - 100, behavior: 'smooth' });
                }
            }
        }

        function setupNavigation() {
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(element);
                    Lampa.Controller.collectionFocus(false, element);
                    setTimeout(scrollToFocused, 100);
                },
                up: () => {
                    if (window.Navigator && window.Navigator.canmove && window.Navigator.canmove('up')) {
                        window.Navigator.move('up'); setTimeout(scrollToFocused, 50);
                    } else Lampa.Controller.toggle('head');
                },
                down: () => {
                    if (window.Navigator && window.Navigator.canmove && window.Navigator.canmove('down')) {
                        window.Navigator.move('down'); setTimeout(scrollToFocused, 50);
                    }
                },
                left: () => {
                    if (window.Navigator && window.Navigator.canmove && window.Navigator.canmove('left')) {
                        window.Navigator.move('left'); setTimeout(scrollToFocused, 50);
                    } else Lampa.Controller.toggle('menu');
                },
                right: () => {
                    if (window.Navigator && window.Navigator.canmove && window.Navigator.canmove('right')) {
                        window.Navigator.move('right'); setTimeout(scrollToFocused, 50);
                    }
                },
                back: () => Lampa.Activity.backward()
            });
            Lampa.Controller.toggle('content');
        }

        this.render = () => element;
        this.destroy = () => { is_destroyed = true; network.clear(); };
    }

    function handleEmbyClick(movie) {
        if (!isConfigured()) return notify('Настройте Emby в параметрах');
        window.currentMovie = movie;
        findInEmby(movie, (item) => {
            if (!item) return notify('Контент не найден в Emby');
            if (item.Type === 'Series') {
                window.embySeriesData = { emby_id: item.Id, tmdb_id: extractTmdbId(movie), title: item.Name };
                Lampa.Activity.push({ url: '', title: item.Name, component: 'emby_series' });
            } else if (item.Type === 'Movie') {
                playVideo(item, null, 0);
            } else notify('Неизвестный тип контента');
        });
    }

    function addEmbyButton(data) {
        if (!data?.render || !data.movie) return;
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

    function renderSettings(body) { /* без изменений */ }
    function initSettings() { /* без изменений */ }

    function startPlugin() {
        Lampa.Component.add('emby_series', EmbySeriesComponent);
        initSettings();
        Lampa.Listener.follow('full', e => {
            if (e.type === 'complite') addEmbyButton({ render: e.object.activity.render(), movie: e.data.movie || e.data.card });
        });
        console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') startPlugin(); });
})();
