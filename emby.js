// emby_local.js
(function () {
    'use strict';

    var plugin_id   = 'emby_local';
    var plugin_name = 'Emby (локальный)';
    var emby_config = {
        url: '',
        api_key: ''
    };

    /**
     * Загрузка настроек из Lampa
     */
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

    /**
     * Сохранение настроек
     */
    function save_config() {
        Lampa.Storage.set('emby_local_config', JSON.stringify(emby_config));
    }

    /**
     * Регистрация пункта настроек
     * (логика максимально похожа на Filmix-плагин)
     */
    function init_settings() {
        Lampa.Settings.add({
            group: 'plugins',
            key: plugin_id,
            name: plugin_name,
            icon: 'folder',
            description: 'Просмотр из локального Emby, если есть в медиатеке',
            onRender: function (body) {
                var input_url = Lampa.Template.get('settings_input', {
                    value: emby_config.url,
                    placeholder: 'http://192.168.1.10:8096'
                });

                var input_key = Lampa.Template.get('settings_input', {
                    value: emby_config.api_key,
                    placeholder: 'API Key'
                });

                body.append(Lampa.Template.get('settings_item', {
                    title: 'Адрес Emby',
                    subtitle: 'Например: http://192.168.1.10:8096',
                    component: input_url
                }));

                body.append(Lampa.Template.get('settings_item', {
                    title: 'API Key',
                    subtitle: 'Ключ доступа Emby',
                    component: input_key
                }));

                input_url.on('change', function () {
                    emby_config.url = this.value.trim();
                    save_config();
                });

                input_key.on('change', function () {
                    emby_config.api_key = this.value.trim();
                    save_config();
                });
            }
        });
    }

    /**
     * Простой HTTP-запрос (как в Filmix-плагине)
     */
    function http_request(path, params, callback, error) {
        if (!emby_config.url || !emby_config.api_key) {
            error && error('Emby не настроен');
            return;
        }

        var url = emby_config.url.replace(/\/+$/, '') + path;

        params = params || {};
        params.api_key = emby_config.api_key;

        var query = Object.keys(params)
            .map(function (k) {
                return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
            })
            .join('&');

        url += '?' + query;

        Lampa.Network.native(url, function (data) {
            callback && callback(data);
        }, function (err) {
            error && error(err);
        });
    }

    /**
     * Поиск фильма/сериала в Emby
     * params: { title, year, imdb_id, type }
     */
    function emby_find_item(params, callback, error) {
        var searchTerm = params.title || '';
        if (!searchTerm) {
            error && error('Нет названия');
            return;
        }

        var includeTypes = params.type === 'tv' ? 'Series' : 'Movie';

        http_request('/emby/Items', {
            SearchTerm: searchTerm,
            IncludeItemTypes: includeTypes,
            Fields: 'Path,MediaSources,ProviderIds,ProductionYear'
        }, function (data) {
            if (!data || !data.Items || !data.Items.length) {
                error && error('Не найдено в Emby');
                return;
            }

            var items = data.Items;

            // Пытаемся сузить по году
            if (params.year) {
                items = items.filter(function (it) {
                    return it.ProductionYear == params.year;
                }) || data.Items;
            }

            // Пытаемся сузить по IMDb ID, если есть
            if (params.imdb_id) {
                items = items.filter(function (it) {
                    return it.ProviderIds && it.ProviderIds.Imdb && it.ProviderIds.Imdb === params.imdb_id;
                }) || items;
            }

            var item = items[0];
            if (!item) {
                error && error('Не найдено подходящего элемента');
                return;
            }

            callback && callback(item);
        }, error);
    }

    /**
     * Получение URL для воспроизведения
     * (упрощённо: основной видеопоток)
     */
    function emby_get_stream(item, callback, error) {
        // Вариант 1: прямой стрим по Id
        var url = emby_config.url.replace(/\/+$/, '') +
            '/emby/Videos/' + item.Id + '/stream';

        var params = {
            api_key: emby_config.api_key,
            Static: 'true'
        };

        var query = Object.keys(params)
            .map(function (k) {
                return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
            })
            .join('&');

        callback && callback(url + '?' + query);
    }

    /**
     * Регистрация источника под плашкой "Смотреть"
     * Логика аналогична Filmix: добавляем свой Source
     */
    function init_source() {
        /**
         * Lampa.Source.add(name, descriptor)
         * descriptor: { title, priority, search, play }
         * (схема максимально повторяет Filmix-плагин)
         */
        Lampa.Source.add(plugin_id, {
            title: plugin_name,
            priority: 1, // чем выше, тем выше в списке
            /**
             * search(params, callback, error)
             * params: { movie, type, card, ... }
             * callback(list) — list: массив вариантов воспроизведения
             */
            search: function (params, callback, error) {
                load_config();

                if (!emby_config.url || !emby_config.api_key) {
                    error && error('Emby не настроен');
                    return;
                }

                var card = params.card || {};
                var meta = {
                    title: card.title || card.name || '',
                    year: card.year || card.release_year || '',
                    imdb_id: card.imdb_id || card.imdb || '',
                    type: params.type || (card.type === 'tv' ? 'tv' : 'movie')
                };

                emby_find_item(meta, function (item) {
                    emby_get_stream(item, function (stream_url) {
                        var result = [{
                            title: 'Emby: ' + (item.Name || meta.title),
                            url: stream_url,
                            // для сериалов можно добавить season/episode при желании
                            emby_item: item
                        }];

                        callback && callback(result);
                    }, error);
                }, error);
            },

            /**
             * play(item, callback, error)
             * item — объект из search()
             */
            play: function (item, callback, error) {
                if (!item || !item.url) {
                    error && error('Нет URL для воспроизведения');
                    return;
                }

                callback && callback({
                    url: item.url,
                    title: item.title,
                    // тип потока: 'mp4', 'hls' и т.п. — при необходимости
                    // здесь оставим автоопределение
                });
            }
        });
    }

    /**
     * Регистрация плагина
     */
    function init_plugin() {
        load_config();
        init_settings();
        init_source();
    }

    Lampa.Plugin.register(plugin_id, init_plugin);

})();
