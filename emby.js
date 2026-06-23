(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '2.3.0';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
    }

    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY, '') || '').trim();
    }

    function isConfigured() {
        return getUrl().length > 10 && getApiKey().length > 10;
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

    // Поиск в Emby
    function findInEmby(movie, callback) {
        if (!movie) return callback(null);

        const fields = '&Fields=Id,Name&Recursive=true&IncludeItemTypes=Movie,Series,Episode';

        // IMDB
        if (movie.imdb_id || movie.imdbid) {
            const imdb = (movie.imdb_id || movie.imdbid).replace('tt', '');
            apiRequest(`/Items?AnyProviderIdEquals=imdb.${imdb}${fields}`, (data) => {
                if (data?.Items?.[0]) return callback(data.Items[0]);
                searchByTMDB(movie, callback);
            });
            return;
        }

        searchByTMDB(movie, callback);
    }

    function searchByTMDB(movie, callback) {
        const tmdb = movie.tmdb_id || movie.id;
        if (!tmdb) return searchByName(movie, callback);

        const fields = '&Fields=Id,Name&Recursive=true';
        apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, (data) => {
            callback(data?.Items?.[0]);
        });
    }

    function searchByName(movie, callback) {
        const title = encodeURIComponent(movie.title || movie.name || '');
        if (!title) return callback(null);

        const fields = '&Fields=Id,Name&Recursive=true&IncludeItemTypes=Movie,Series';
        apiRequest(`/Items?SearchTerm=${title}&Limit=3${fields}`, (data) => {
            callback(data?.Items?.[0]);
        });
    }

    // Получаем прямую ссылку на потоковое видео
    function getStreamingUrl(itemId, callback) {
        if (!isConfigured()) {
            notify('Настройте Emby в параметрах');
            return callback(null);
        }

        const url = `${getUrl().replace(/\/$/, '')}/Videos/${itemId}/stream.mp4?static=true&api_key=${getApiKey()}`;
        callback(url);
    }

    // Компонент для воспроизведения видео из Emby
    function embyPlayer(component, object) {
        let network = new Lampa.Reguest();
        let scroll = new Lampa.Scroll({mask: true, over: true});
        let files = new Lampa.Explorer(object);
        
        this.initialize = function() {
            files.appendFiles(scroll.render());
            files.appendHead($('<div/>'));
            scroll.body().addClass('torrent-list');
            this.search();
        };

        this.search = function() {
            this.activity.loader(true);
            this.find();
        };

        this.find = function() {
            let movie = object.movie;
            if (!movie) return this.doesNotAnswer();

            findInEmby(movie, (item) => {
                if (!item) return this.doesNotAnswer();
                
                getStreamingUrl(item.Id, (streamUrl) => {
                    if (!streamUrl) return this.doesNotAnswer();
                    
                    Lampa.Player.play({
                        title: item.Name,
                        url: streamUrl,
                        poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
                        timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id))
                    });
                    
                    this.activity.loader(false);
                    this.activity.toggle();
                });
            });
        };

        this.doesNotAnswer = function() {
            this.activity.loader(false);
            this.activity.toggle();
            notify('Фильм не найден в библиотеке Emby.');
        };
    }

    // Обработчик нажатия на кнопку Emby
    function handleEmbyClick(movie) {
        if (!isConfigured()) {
            notify('Настройте Emby в параметрах');
            return;
        }

        Lampa.Component.add('emby_player', embyPlayer);
        Lampa.Activity.push({
            url: '',
            title: 'Воспроизведение из Emby',
            component: 'emby_player',
            movie: movie
        });
    }

    // Добавление кнопки Emby
    function addEmbyButton(data) {
        if (!data || !data.render) return;
        if (data.render.find('.emby-button').length) return;

        const button = $(`
            <div class="full-start__button selector view--emby" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
                <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
                <span>${PLUGIN_NAME}</span>
            </div>
        `);

        button.on('hover:enter', function() {
            handleEmbyClick(data.movie || data.card);
        });

        const playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) {
            playButton.after(button);
        } else {
            data.render.find('.buttons, .activity__body').append(button);
        }
    }

    // Настройки
    function renderSettings(body) {
        body.empty();
        const url = getUrl();
        const key = getApiKey();

        const wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${url || 'Не задано'}</div></div>`);
        urlRow.on('hover:enter', () => {
            Lampa.Input.edit({title: 'Emby URL', value: url, free: true}, (val) => {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${key ? '••••••••••' : 'Не задано'}</div></div>`);
        keyRow.on('hover:enter', () => {
            Lampa.Input.edit({title: 'Emby API Key', value: key, free: true}, (val) => {
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

        Lampa.Settings.listener.follow('open', function(e) {
            if (e.name === 'emby') renderSettings(e.body);
        });
    }

    function startPlugin() {
        initSettings();

        Lampa.Listener.follow('full', function(e) {
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
    else Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') startPlugin();
    });
})();
