(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '4.0.0';
    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    // Проверка настроек
    function isConfigured() {
        return (Lampa.Storage.get(STORAGE_URL) || '').trim().length > 5 &&
               (Lampa.Storage.get(STORAGE_API_KEY) || '').trim().length > 5;
    }

    // Создание кнопки Emby
    function createEmbyButton(container, movie) {
        const button = $(
            `<div class="full-start__button selector view--emby" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
                <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
                <span>${PLUGIN_NAME}</span>
            </div>`
        );

        button.on('hover:enter click', () => {
            if (!isConfigured()) {
                Lampa.Noty.show('Настройте Emby в параметрах!');
                return;
            }

            const network = new Lampa.Request();
            const fields = '&Fields=Id,Name,Type,ParentId,PrimaryImageTag&Recursive=true&IncludeItemTypes=Movie,Series,Episode';
            const tmdb = movie.tmdb_id || movie.id;

            if (tmdb) {
                network.silent(`${getUrl()}/emby/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, processResult);
            } else {
                const title = encodeURIComponent(movie.title || movie.name || '');
                if (title) {
                    network.silent(`${getUrl()}/emby/Items?SearchTerm=${title}&Limit=3${fields}`, processResult);
                } else {
                    processResult(null);
                }
            }

            function processResult(data) {
                const item = data?.Items?.[0];
                if (!item) {
                    Lampa.Noty.show('Контент не найден в библиотеке Emby.');
                    return;
                }

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
            }
        });

        container.find('.button--play, .view--torrent').first().after(button);
    }

    // Воспроизведение видео
    function playVideo(item) {
        const base = getUrl().replace(/\/$/, '');
        Lampa.Player.play({
            title: item.Name,
            url: `${base}/Videos/${item.Id}/stream.mp4?static=true&api_key=${getApiKey()}`,
            poster: item.PrimaryImageTag ? `${base}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id + ''))
        });
    }

    // Получение адреса сервера
    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL) || '').trim();
    }

    // Получение API ключа
    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY) || '').trim();
    }

    // Регистрация компонента Emby Series
    function registerEmbySeriesComponent() {
        Lampa.Component.add('emby_series', function(object) {
            let network = new Lampa.Request();
            let scroll = new Lampa.Scroll({ mask: true, over: true });
            let seasons = [], current_season = null;
            let destroyed = false;

            this.create = function() {
                scroll.append($('<div class="emby-loader"><div class="broadcast__spin"></div></div>')[0]);

                network.silent(`${getUrl()}/emby/Shows/${object.id}/Seasons`, (data) => {
                    if (destroyed) return;

                    seasons = data.Items || [];
                    if (seasons.length === 0) {
                        scroll.clear();
                        scroll.append($('<div class="emby-empty">Сезоны не найдены</div>')[0]);
                        this.start();
                    } else {
                        current_season = seasons[0];
                        loadEpisodes();
                    }
                }, () => {
                    if (destroyed) return;
                    scroll.clear();
                    scroll.append($('<div class="emby-empty">Ошибка загрузки сезонов</div>')[0]);
                    this.start();
                });
            };

            function loadEpisodes() {
                if (destroyed) return;
                scroll.clear();
                scroll.append($('<div class="emby-loader"><div class="broadcast__spin"></div></div>')[0]);

                const query = `/Items?ParentId=${object.id}&Season=${current_season.IndexNumber}&IncludeItemTypes=Episode&Fields=RunTimeTicks,PremiereDate,CommunityRating&SortBy=SortName&SortOrder=Ascending`;

                network.silent(`${getUrl()}/emby${query}?api_key=${getApiKey()}`, (data) => {
                    if (destroyed) return;
                    renderEpisodes(data.Items || []);
                }, () => {
                    if (destroyed) return;
                    scroll.clear();
                    scroll.append($('<div class="emby-empty">Ошибка загрузки эпизодов</div>')[0]);
                });
            }

            function renderEpisodes(episodes) {
                if (destroyed) return;
                scroll.clear();

                let filterPanel = $('<div class="emby-filter"></div>');
                let seasonBtn = $(`<div class="emby-filter-btn selector">Сезон ${current_season.IndexNumber || 1}</div>`);

                seasonBtn.on('hover:enter click', () => {
                    let items = seasons.map(s => ({
                        title: s.Name,
                        season: s,
                        selected: s.Id === current_season.Id
                    }));

                    Lampa.Select.show({
                        title: 'Выберите сезон',
                        items: items,
                        onSelect: (a) => {
                            current_season = a.season;
                            loadEpisodes();
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
                    let base = getUrl().replace(/\/$/, '');

                    episodes.forEach(episode => {
                        let runTime = episode.RunTimeTicks ? Math.floor(episode.RunTimeTicks / 600000000) : 0;
                        let timeStr = runTime ? `${Math.floor(runTime / 60)}:${String(runTime % 60).padStart(2, '0')}` : '';
                        let rating = episode.CommunityRating ? episode.CommunityRating.toFixed(1) : '0.0';
                        let img = episode.PrimaryImageTag ? `${base}/Items/${episode.Id}/Images/Primary?maxWidth=400&quality=90` : '';
                        let epNum = String(episode.IndexNumber || 0).padStart(2, '0');

                        let item = $(
                            `<div class="emby-episode-card selector">
                                <div class="emby-ep-img-wrap">
                                    ${img ? `<img src="${img}" class="emby-ep-img" onerror="this.style.display='none'">` : ''}
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
            }

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
                destroyed = true;
                network.clear();
                scroll.destroy();
            };
        });
    }

    // Стартовая функция плагина
    function startPlugin() {
        if (!isConfigured()) {
            console.warn("Emby plugin: Configuration incomplete.");
            return;
        }

        // Добавляем кнопку на страницу фильма/сериала
        Lampa.Listener.follow('full', e => {
            if (e.type === 'complete' && e.data && e.data.movie) {
                createEmbyButton(e.object.activity.render(), e.data.movie);
            }
        });

        // Регистрируем компонент Emby Series
        registerEmbySeriesComponent();

        console.log("%cEmby Plugin v%s loaded.", 'color: #00B0FF;', PLUGIN_VERSION);
    }

    // Начинаем работу плагина
    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', e => {
            if (e.type === 'ready') {
                startPlugin();
            }
        });
    }
})();
