(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '5.0.0';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
    }

    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY, '78b3967970814692b20b095e5b13f0eb') || '').trim();
    }
    
    function isConfigured() { 
        return getUrl().length > 5 && getApiKey().length > 5; 
    }
    
    function notify(msg) { 
        Lampa.Noty.show(msg); 
    }

    function buildApiUrl(endpoint) {
        const base = getUrl().replace(/\/$/, '');
        const sep = endpoint.includes('?') ? '&' : '?';
        return base + '/emby' + endpoint + sep + 'api_key=' + getApiKey();
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
        return tmdb;
    }

    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        let tmdb = extractTmdbId(movie);
        let network = new Lampa.Reguest();
        
        if (tmdb) {
            network.silent(buildApiUrl('/Items?AnyProviderIdEquals=tmdb.' + tmdb + '&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name'), function(data) {
                callback(data && data.Items ? data.Items[0] : null);
            }, function() {
                callback(null);
            });
        } else {
            let title = movie.title || movie.name || '';
            if (!title) return callback(null);
            network.silent(buildApiUrl('/Items?SearchTerm=' + encodeURIComponent(title) + '&Limit=3&Recursive=true&IncludeItemTypes=Movie,Series&Fields=Id,Type,Name'), function(data) {
                callback(data && data.Items ? data.Items[0] : null);
            }, function() {
                callback(null);
            });
        }
    }

    function playVideo(item) {
        let base = getUrl().replace(/\/$/, '');
        Lampa.Player.play({
            title: item.Name,
            url: base + '/Videos/' + item.Id + '/stream?api_key=' + getApiKey() + '&Static=true',
            poster: item.PrimaryImageTag ? base + '/Items/' + item.Id + '/Images/Primary?tag=' + item.PrimaryImageTag : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id + ''))
        });
    }

    function handleEmbyClick(movie) {
        if (!isConfigured()) return notify('Настройте Emby в параметрах');

        findInEmby(movie, function(item) {
            if (!item) return notify('Контент не найден в библиотеке Emby.');

            if (item.Type === 'Series') {
                window.embySeriesData = {
                    emby_id: item.Id,
                    tmdb_id: extractTmdbId(movie),
                    title: item.Name
                };
                
                Lampa.Activity.push({
                    url: '',
                    title: item.Name,
                    component: 'emby_series'
                });
            } else {
                playVideo(item);
            }
        });
    }

    function addEmbyButton(data) {
        if (!data || !data.render || !data.movie) return;
        if (data.render.find('.emby-button').length) return;

        let button = $('<div class="full-start__button selector view--emby emby-button"></div>');
        button.attr('data-subtitle', PLUGIN_NAME + ' v' + PLUGIN_VERSION);
        button.append('<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>');
        button.append('<span>' + PLUGIN_NAME + '</span>');

        button.on('hover:click', function() {
            handleEmbyClick(data.movie);
        });

        let playButton = data.render.find('.button--play, .view--torrent').first();
        if (playButton.length) playButton.after(button);
        else data.render.find('.buttons, .activity__body').append(button);
    }

    function renderSettings(body) {
        body.empty();
        
        let wrap = $('<div class="settings-container"></div>');
        wrap.append('<div class="settings-param-title">Настройки Emby</div>');

        let urlRow = $('<div class="settings-param selector"></div>');
        urlRow.append('<div class="settings-param__name">Адрес сервера</div>');
        urlRow.append('<div class="settings-param__value">' + (getUrl() || 'Не задано') + '</div>');
        urlRow.on('hover:click', function() {
            Lampa.Input.edit({title: 'Emby URL', value: getUrl(), free: true}, function(val) {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });

        let keyRow = $('<div class="settings-param selector"></div>');
        keyRow.append('<div class="settings-param__name">API Key</div>');
        keyRow.append('<div class="settings-param__value">' + (getApiKey() ? '••••••••••' : 'Не задано') + '</div>');
        keyRow.on('hover:click', function() {
            Lampa.Input.edit({title: 'Emby API Key', value: getApiKey(), free: true}, function(val) {
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
                addEmbyButton({
                    render: e.object.activity.render(),
                    movie: e.data.movie || e.data.card
                });
            }
        });
        
        console.log('%c' + PLUGIN_NAME + ' v' + PLUGIN_VERSION + ' loaded', 'color: #00ff88; font-weight: bold');
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') startPlugin();
    });

})();
