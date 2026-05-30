// CDNMovies Ultra Lite for Lampa / Lampa Uncensored
// Version: 1.1
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
    function component(object) {
        var html = $('<div class="cdnmovies-lite" style="padding:1.5em"></div>');
        this.render = function () {
            return html;
        };
        this.destroy = function () {
            network.clear();
            html.remove();
        };
        this.start = function () {
            load();
        };
        function show(message) {
            html.empty();
            html.append(`
                <div style="
                    padding: 2em;
                    font-size: 1.4em;
                    opacity: 0.8;
                ">
                    ${message}
                </div>
            `);
        }
        function load() {
            show('Загрузка...');
            var kp =
                object.movie.kinopoisk_id ||
                object.movie.id ||
                '';
            var imdb =
                object.movie.imdb_id ||
                '';
            var url = '';
            if (kp) {
                url =
                    'https://cdnmovies-stream.online/kinopoisk/' +
                    kp +
                    '/iframe';
            } else if (imdb) {
                url =
                    'https://cdnmovies-stream.online/imdb/' +
                    imdb +
                    '/iframe';
            }
            if (!url) {
                show('Не найден ID фильма');
                return;
            }
            network.timeout(15000);
            network.native(
                url,
                function (response) {
                    renderResult(response);
                },
                function () {
                    show('Ошибка загрузки CDNMovies');
                },
                false,
                {
                    dataType: 'text'
                }
            );
        }
        function renderResult(response) {
            var player = extractPlayerData(response);
            if (!player || !player.file) {
                show('Видео не найдено');
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
                    <div class="simple-button selector" style="margin-bottom:1em">
                        <div class="simple-button__text">
                            ${video.title}
                        </div>
                    </div>
                `);
                card.on('hover:enter', function () {
                    Lampa.Player.play({
                        title: object.movie.title,
                        url: video.url
                    });
                });
                html.append(card);
            });
        }
    }
    function addButton(movie) {
        if ($('.cdnmovies-ultralite-btn').length) return;
        var button = $(`
            <div class="full-start__button selector cdnmovies-ultralite-btn">
                <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="currentColor"
                        d="M8 5v14l11-7z"/>
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
        $('.full-start-new__buttons').append(button);
    }
    function init() {
        Lampa.Component.add(
            'cdnmovies_ultralite',
            component
        );
        Lampa.Listener.follow('full', function (e) {
            if (!e || !e.data || !e.data.movie) return;
            setTimeout(function () {
                addButton(e.data.movie);
            }, 100);
        });
        console.log('CDNMovies Ultra Lite loaded');
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
