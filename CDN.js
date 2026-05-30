// CDNMovies Ultra Lite for Lampa / Lampa Uncensored
// Version: 1.3 (Fully Fixed)
(function () {
    'use strict';
    if (!window.Lampa) return;

    var network = new Lampa.Reguest();

    function decode(data) {
        if (!data) return '';
        try {
            if (data.charAt(0) === '#') {
                data = data.slice(1);
            }
            return decodeURIComponent(
                atob(data)
                    .split('')
                    .map(function (c) {
                        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                    })
                    .join('')
            );
        } catch (e) {
            return data;
        }
    }

    function extractPlayerData(html) {
        try {
            html = (html || '').replace(/\n/g, '');
            var match = html.match(/Playerjs\(({.*?})\);/);
            if (!match || !match[1]) return null;
            return (0, eval)(
                '"use strict"; (function(){ return ' + match[1] + '; })();'
            );
        } catch (e) {
            console.error('CDNMovies parse error', e);
            return null;
        }
    }

    function parsePlaylist(file) {
        try {
            return JSON.parse(decode(file));
        } catch (e) {
            console.error('CDNMovies playlist parse error', e);
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

    function Component(object) {
        var comp = this;
        var html = $('<div class="cdnmovies-lite Lampa-component" style="padding:1.5em 3em"></div>');
        var scroll = new Lampa.Scroll({mask: true, over: true});
        var last_select;

        // Метод создания компонента
        this.create = function () {
            this.activity.loader(true);
            load();
            return this.render();
        };

        // Тот самый пропущенный метод, из-за которого падал зеленый экран
        this.start = function () {
            // Лампа ожидает этот метод активным после отрисовки
        };

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

        function load() {
            var kp = object.movie.kinopoisk_id || object.movie.id || '';
            var imdb = object.movie.imdb_id || '';
            var url = '';

            if (kp) {
                url = 'https://cdnmovies-stream.online/kinopoisk/' + kp + '/iframe';
            } else if (imdb) {
                url = 'https://cdnmovies-stream.online/imdb/' + imdb + '/iframe';
            }

            if (!url) {
                show('Не найден ID фильма (Kinopoisk / IMDB)');
                return;
            }

            network.timeout(15000);
            
            // Используем Lampa.TMS.proxyUrl или встроенный механизм, чтобы обойти блокировку CORS в браузере
            var targetUrl = (typeof Lampa.TMS !== 'undefined' && Lampa.TMS.proxyUrl) ? Lampa.TMS.proxyUrl(url) : url;

            network.native(
                targetUrl,
                function (response) {
                    comp.activity.loader(false);
                    renderResult(response);
                },
                function () {
                    // Если через прокси/напрямую не вышло, пробуем альтернативный вариант без проксирования
                    if (targetUrl !== url) {
                        network.native(url, function(resp) {
                            comp.activity.loader(false);
                            renderResult(resp);
                        }, function() {
                            show('Ошибка загрузки данных с CDNMovies.<br><span style="font-size:0.7em; opacity:0.6;">Возможно, домен заблокирован или требуется включить VPN/подмену DNS.</span>');
                        }, false, { dataType: 'text' });
                    } else {
                        show('Ошибка загрузки данных с CDNMovies.<br><span style="font-size:0.7em; opacity:0.6;">Возможно, домен заблокирован или требуется включить VPN/подмену DNS.</span>');
                    }
                },
                false,
                { dataType: 'text' }
            );
        }

        function renderResult(response) {
            var player = extractPlayerData(response);
            if (!player || !player.file) {
                show('Видео не найдено в базе CDNMovies');
                return;
            }

            var parsed = parsePlaylist(player.file);
            var videos = flattenVideos(parsed);

            if (!videos.length) {
                show('Нет доступных потоков для воспроизведения');
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
        if ($('.cdnmovies-ultralite-btn').length) return;

        var button = $(`
            <div class="full-start__button selector cdnmovies-ultralite-btn">
                <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M8 5v14l11-7z"/>
                </svg>
                <span>CDNMovies</span>
            </div>
        `);

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: 'CDNMovies',
                component: 'cdnmovies_ultralite',
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
        Lampa.Component.add('cdnmovies_ultralite', Component);
        
        Lampa.Listener.follow('full', function (e) {
            if (!e || !e.data || !e.data.movie) return;
            setTimeout(function () {
                addButton(e.data.movie);
            }, 200);
        });

        console.log('CDNMovies Ultra Lite (Fixed v1.3) loaded');
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
