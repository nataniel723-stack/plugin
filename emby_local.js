(function () {
    'use strict';

    var plugin_id   = 'emby_local';
    var plugin_name = 'Emby (локальный)';

    var emby_config = {
        url: '',
        api_key: ''
    };

    function load_config() {
        try {
            var saved = Lampa.Storage.get('emby_local_config', '{}');
            var obj   = JSON.parse(saved);
            emby_config.url     = obj.url     || '';
            emby_config.api_key = obj.api_key || '';
        } catch (e) {
            emby_config.url     = '';
            emby_config.api_key = '';
        }
    }

    function save_config() {
        Lampa.Storage.set('emby_local_config', JSON.stringify(emby_config));
    }

    // Простейшие настройки (через общий список плагинов)
    function init_settings() {
        Lampa.Settings.add({
            group: 'plugins',
            type: 'button',
            name: plugin_name,
            description: 'Локальный Emby как источник под «Смотреть»',
            onClick: function () {
                var modal = Lampa.Modal.open({
                    title: plugin_name,
                    html: $('<div class="about"><div class="about__text"></div></div>'),
                    size: 'small',
                    onBack: function () {
                        modal.close();
                    }
                });

                var body = modal.body.find('.about__text');

                var input_url = $('<div class="settings-param selector"><div class="settings-param__name">Адрес Emby</div><div class="settings-param__value"></div></div>');
                var input_key = $('<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value"></div></div>');

                var url_val = $('<div class="settings-param__value">' + (emby_config.url || 'нажми ОК для ввода') + '</div>');
                var key_val = $('<div class="settings-param__value">' + (emby_config.api_key ? '********' : 'нажми ОК для ввода') + '</div>');

                input_url.find('.settings-param__value').remove();
                input_key.find('.settings-param__value').remove();

                input_url.append(url_val);
                input_key.append(key_val);

                body.append(input_url);
                body.append(input_key);

                function ask(field, title, current, cb) {
                    Lampa.Input.edit({
                        title: title,
                        value: current || '',
                        type: 'text',
                        free: true
                    }, cb);
                }

                input_url.on('hover:enter', function () {
                    ask('url', 'Адрес Emby (например http://192.168.1.10:8096)', emby_config.url, function (val) {
                        emby_config.url = (val || '').trim();
                        save_config();
                        url_val.text(emby_config.url || 'не задано');
                    });
                });

                input_key.on('hover:enter', function () {
                    ask('api', 'API Key Emby', emby_config.api_key, function (val) {
                        emby_config.api_key = (val || '').trim();
                        save_config();
                        key_val.text(emby_config.api_key ? '********' : 'не задано');
                    });
                });
            }
        });
    }

    // HTTP-запрос к Emby
    function http_request(path, params, onSuccess, onError) {
        load_config();

        if (!emby_config.url || !emby_config.api_key) {
            onError && onError('Emby не настроен');
            return;
        }

        var base = emby_config.url.replace(/\/+$/, '');
        var url  = base + path;

        params = params || {};
        params.api_key = emby_config.api_key;

        var query = Object.keys(params).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');

        url += '?' + query;

        var network = new Lampa.Reguest();

        network.native(url, function (data) {
            onSuccess && onSuccess(data);
        }, function (err) {
            onError && onError(err || 'Ошибка сети');
        });
    }

    // Поиск фильма/сериала в Emby
    function emby_find_item(meta, onSuccess, onError) {
        var title = meta.title || '';
        if (!title) {
            onError && onError('Нет названия');
            return;
        }

        var includeTypes = meta.type === 'tv' ? 'Series' : 'Movie';

        http_request('/emby/Items', {
            SearchTerm: title,
            IncludeItemTypes: includeTypes,
            Fields: 'Path,MediaSources,ProviderIds,ProductionYear'
        }, function (data) {
            if (!data || !data.Items || !data.Items.length) {
                onError && onError('Не найдено в Emby');
                return;
            }

            var items = data.Items.slice();

            if (meta.year) {
                var filtered = items.filter(function (it) {
                    return it.ProductionYear == meta.year;
                });
                if (filtered.length) items = filtered;
            }

            if (meta.imdb_id) {
                var filteredImdb = items.filter(function (it) {
                    return it.ProviderIds && it.ProviderIds.Imdb && it.ProviderIds.Imdb === meta.imdb_id;
                });
                if (filteredImdb.length) items = filteredImdb;
            }

            var item = items[0];
            if (!item) {
                onError && onError('Подходящий элемент не найден');
                return;
            }

            onSuccess && onSuccess(item);
        }, onError);
    }

    // Получение URL потока
    function emby_get_stream(item, onSuccess, onError) {
        load_config();

        if (!emby_config.url || !emby_config.api_key) {
            onError && onError('Emby не настроен');
            return;
        }

        var base = emby_config.url.replace(/\/+$/, '');
        var url  = base + '/emby/Videos/' + item.Id + '/stream';

        var params = {
            api_key: emby_config.api_key,
            Static: 'true'
        };

        var query = Object.keys(params).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');

        onSuccess && onSuccess(url + '?' + query);
    }

    // Регистрация источника в Online-плагине
    function init_source() {
        // Важно: именно 'online' — это встроенный компонент Lampa
        Lampa.Source.add('online', {
            title: plugin_name,
            // чем выше, тем выше в списке источников
            priority: 1,

            search: function (params, onResult, onError) {
                var card = params.card || {};

                var meta = {
                    title: card.title || card.name || '',
                    year: card.year || card.release_year || '',
                    imdb_id: card.imdb_id || card.imdb || '',
                    type: params.type || (card.type === 'tv' ? 'tv' : 'movie')
                };

                emby_find_item(meta, function (item) {
                    emby_get_stream(item, function (stream_url) {
                        var list = [{
                            title: 'Emby: ' + (item.Name || meta.title),
                            url: stream_url,
                            emby_item: item
                        }];

                        onResult && onResult(list);
                    }, onError);
                }, onError);
            },

            play: function (item, onPlay, onError) {
                if (!item || !item.url) {
                    onError && onError('Нет URL для воспроизведения');
                    return;
                }

                onPlay && onPlay({
                    url: item.url,
                    title: item.title
                });
            }
        });
    }

    function start() {
        load_config();
        init_settings();
        init_source();
        console.log('[' + plugin_id + '] инициализирован');
    }

    // Правильный старт для lampa.mx / bylampa.online
    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') start();
        });
    }
})();
