(function() {
    'use strict';

    const PLUGIN_NAME = 'Emby';
    const PLUGIN_VERSION = '5.0.1';

    const STORAGE_URL = 'emby_url';
    const STORAGE_API_KEY = 'emby_api_key';

    function getUrl() {
        return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
    }

    function getApiKey() {
        return (Lampa.Storage.get(STORAGE_API_KEY, '78b3967970814692b20b095e5b13f0eb') || '').trim();
    }
    
    function notify(msg) { 
        Lampa.Noty.show(msg); 
    }

    function buildApiUrl(endpoint) {
        var base = getUrl().replace(/\/$/, '');
        return base + '/emby' + endpoint + '&api_key=' + getApiKey();
    }

    function extractTmdbId(movie) {
        if (!movie) return null;
        return movie.tmdb_id || movie.id || (movie.data && movie.data.tmdb_id) || (movie.data && movie.data.id) || null;
    }

    function findInEmby(movie, callback) {
        if (!movie) return callback(null);
        var tmdb = extractTmdbId(movie);
        var network = new Lampa.Reguest();
        
        if (tmdb) {
            network.silent(buildApiUrl('/Items?AnyProviderIdEquals=tmdb.' + tmdb + '&Recursive=true&IncludeItemTypes=Movie,Series'), function(data) {
                callback(data && data.Items ? data.Items[0] : null);
            }, function() {
                callback(null);
            });
        } else {
            callback(null);
        }
    }

    function playVideo(item) {
        var base = getUrl().replace(/\/$/, '');
        Lampa.Player.play({
            title: item.Name,
            url: base + '/Videos/' + item.Id + '/stream.mp4?api_key=' + getApiKey() + '&Static=true',
            poster: item.ImageTags && item.ImageTags.Primary ? base + '/Items/' + item.Id + '/Images/Primary?api_key=' + getApiKey() : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id + ''))
        });
    }

    function handleEmbyClick(movie) {
        if (!getUrl() || !getApiKey()) return notify('Настройте Emby в параметрах');

        findInEmby(movie, function(item) {
            if (!item) return notify('Контент не найден в библиотеке Emby.');

            if (item.Type === 'Series') {
                notify('Сериалы пока не поддерживаются');
            } else {
                playVideo(item);
            }
        });
    }

    function addEmbyButton(data) {
        if (!data || !data.render || !data.movie) return;
        if (data.render.find('.view--emby').length) return;

        var button = $('<div class="full-start__button selector view--emby"><svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg><span>Emby</span></div>');
        
        button.on('hover:click', function() {
            handleEmbyClick(data.movie);
        });

        data.render.find('.full-start__buttons').append(button);
    }

    function renderSettings(body) {
        body.empty();
        
        body.append('<div class="settings-param-title">Настройки Emby</div>');

        var urlRow = $('<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">' + (getUrl() || 'Не задано') + '</div></div>');
        urlRow.on('hover:click', function() {
            Lampa.Input.edit({title: 'Emby URL', value: getUrl(), free: true}, function(val) {
                Lampa.Storage.set(STORAGE_URL, val);
                urlRow.find('.settings-param__value').text(val || 'Не задано');
            });
        });
        body.append(urlRow);

        var keyRow = $('<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">' + (getApiKey() ? '••••••••••' : 'Не задано') + '</div></div>');
        keyRow.on('hover:click', function() {
            Lampa.Input.edit({title: 'Emby API Key', value: getApiKey(), free: true}, function(val) {
                Lampa.Storage.set(STORAGE_API_KEY, val);
                keyRow.find('.settings-param__value').text(val ? '••••••••••' : 'Не задано');
            });
        });
        body.append(keyRow);
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
