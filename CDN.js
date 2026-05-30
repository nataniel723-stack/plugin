// CDNMovies (Cdnvideohub) Dedicated Plugin for Lampa
// Version: 2.0 (Based on online_mod architecture)
(function () {
    'use strict';
    if (!window.Lampa) return;

    function Component(object) {
        var comp = this;
        var html = $('<div class="cdnvideohub Lampa-component" style="padding:1.5em 3em"></div>');
        var scroll = new Lampa.Scroll({mask: true, over: true});
        var network = new Lampa.Reguest();
        var last_select;

        this.create = function () {
            this.activity.loader(true);
            load();
            return this.render();
        };

        this.start = function () {};

        this.render = function () {
            scroll.append(html);
            return scroll.render();
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();
            html.remove();
        };

        function show(message) {
            comp.activity.loader(false);
            html.empty();
            html.append(`
                <div style="padding: 2em; font-size: 1.4em; opacity: 0.8; text-align: center;">
                    ${message}
                </div>
            `);
        }

        function decode(data) {
            if (!data) return '';
            try {
                if (data.charAt(0) === '#') data = data.slice(1);
                return decodeURIComponent(atob(data).split('').map(function (c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));
            } catch (e) {
                return data;
            }
        }

        function extractPlayerData(htmlString) {
            try {
                var cleanHtml = (htmlString || '').replace(/\n/g, '');
                var match = cleanHtml.match(/Playerjs\(({.*?})\);/);
                if (!match || !match[1]) return null;
                return (0, eval)('"use strict"; (function(){ return ' + match[1] + '; })();');
            } catch (e) {
                return null;
            }
        }

        function parsePlaylist(file) {
            try {
                return JSON.parse(decode(file));
            } catch (e) {
                return [];
            }
        }

        function flattenVideos(items, result) {
            result = result || [];
            if (!items || !items.forEach) return result;
            items.forEach(function (item) {
                if (item.file && typeof item.file === 'string') {
                    result.push({
                        title: item.title || 'Видео',
                        url: item.file
                    });
                }
                if (item.folder && item.folder.forEach) {
                    flattenVideos(item.folder, result);
                }
            });
            return result;
        }

        function load() {
            var kp = object.movie.kinopoisk_id || object.movie.id || '';
            var imdb = object.movie.imdb_id || '';
            
            if (!kp && !imdb) {
                show('Не найден ID фильма (Kinopoisk / IMDB)');
                return;
            }

            // Используем актуальное рабочее зеркало из оригинального плагина
            var domain = 'https://cdnmovies-stream.online'; 
            var path = kp ? '/kinopoisk/' + kp + '/iframe' : '/imdb/' + imdb + '/iframe';
            var url = domain + path;

            // Самое важное: проксирование запроса через API Лампы, чтобы убрать ошибку сети
            var account = Lampa.Storage.get('account', '{}');
            var logged = account.logged;
            var proxy = Lampa.Storage.field('proxy_tmdb') ? Lampa.Storage.get('proxy_tmdb_url') : '';
            
            var targetUrl = url;
            if (proxy) {
                targetUrl = proxy + window.encodeURIComponent(url);
            } else if (typeof Lampa.TMS !== 'undefined' && Lampa.TMS.proxyUrl) {
                targetUrl = Lampa.TMS.proxyUrl(url);
            }

            network.timeout(15000);
            network.native(
                targetUrl,
                function (response) {
                    comp.activity.loader(false);
                    renderResult(response);
                },
                function () {
                    // Пробуем резервный прямой запрос, если прокси не отработал
                    if (targetUrl !== url) {
                        network.native(url, function(resp) {
                            comp.activity.loader(false);
                            renderResult(resp);
                        }, function() {
                            show('Cdnvideohub: Ошибка сети.<br><span style="font-size:0.7em; opacity:0.6;">Проверьте работу прокси или VPN в Лампе.</span>');
                        }, false, { dataType: 'text' });
                    } else {
                        show('Cdnvideohub: Ошибка сети.<br><span style="font-size:0.7em; opacity:0.6;">Проверьте работу прокси или VPN в Лампе.</span>');
                    }
                },
                false,
                { dataType: 'text' }
            );
        }

        function renderResult(response) {
            var player = extractPlayerData(response);
            if (!player || !player.file) {
                show('Видео не найдено в базе Cdnvideohub');
                return;
            }

            var parsed = parsePlaylist(player.file);
            var videos = flattenVideos(parsed);

            if (!videos.length) {
                show('Нет доступных потоков');
                return;
            }

            html.empty();

            videos.forEach(function (video) {
                var card = $(`
                    <div class="full-start__button selector" style="margin-bottom:1em; width: 100%; justify-content: flex-start; text-align: left;">
                        <svg width="20" height="20" viewBox="0 0 24 24" style="margin-right: 10px;">
                            <path fill="currentColor" d="M8 5v14l11-7z"/>
                        </svg>
                        <span>${video.title}</span>
                    </div>
                `);

                card.on('hover:enter', function () {
                    Lampa.Player.play({
                        title: object.movie.title + (video.title ? ' - ' + video.title : ''),
                        url: video.url,
                        movie: object.movie
                    });
                });

                html.append(card);
            });

            comp.toggle();
        }

        this.toggle = function () {
            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(html);
                    Lampa.Controller.collectionFocus(last_select, html);
                },
                left: function () {
                    Lampa.Controller.toggle('head');
                },
                right: function () {},
                up: function () {
                    Lampa.Controller.collectionShift('up');
                },
                down: function () {
                    Lampa.Controller.collectionShift('down');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });
            Lampa.Controller.toggle('content');
        };
    }

    function addButton(movie) {
        if ($('.cdnvideohub-btn').length) return;

        var button = $(`
            <div class="full-start__button selector cdnvideohub-btn">
                <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M8 5v14l11-7z"/>
                </svg>
                <span>Cdnvideohub</span>
            </div>
        `);

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: 'Cdnvideohub',
                component: 'cdnvideohub_plugin',
                movie: movie,
                page: 1
            });
        });

        var container = $('.full-start-new__buttons, .full-start__buttons');
        if (container.length) {
            container.append(button);
        }
    }

    function init() {
        Lampa.Component.add('cdnvideohub_plugin', Component);
        
        Lampa.Listener.follow('full', function (e) {
            if (!e || !e.data || !e.data.movie) return;
            setTimeout(function () {
                addButton(e.data.movie);
            }, 200);
        });

        console.log('Cdnvideohub Dedicated Plugin Loaded');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                init();
            }
        });
    }
})();
