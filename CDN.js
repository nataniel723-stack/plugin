// CDNMovies Ultra Lite for Lampa
// Version: 1.0
(function () {
    'use strict';
    if (!window.Lampa) return;
    var network = new Lampa.Reguest();
    function decode(data) {
        if (!data) return '';
        if (data.charAt(0) !== '#') return data;
        try {
            return decodeURIComponent(
                atob(data.substr(1))
                    .split('')
                    .map(function (c) {
                        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                    })
                    .join('')
            );
        } catch (e) {
            return '';
        }
    }
    function parsePlaylist(file) {
        try {
            return JSON.parse(decode(file));
        } catch (e) {
            return [];
        }
    }
    function extractPlayerData(html) {
        try {
            html = (html || '').replace(/\n/g, '');
            var match = html.match(/Playerjs\(({.*?})\);/);
            if (!match || !match[1]) return null;
            var json = (0, eval)(
                '"use strict"; (function(){ return ' + match[1] + '; })();'
            );
            return json;
        } catch (e) {
            return null;
        }
    }
    function flattenVideos(data, result) {
        result = result || [];
        if (!data) return result;
        data.forEach(function (item) {
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
        var html = $('<div class="cdnmovies-lite"></div>');
        this.create = function () {
            return html;
        };
        this.start = function () {
            load();
        };
        function load() {
            html.empty();
            var kp =
                object.movie.kinopoisk_id ||
                object.movie.id ||
                '';
            var imdb =
                object.movie.imdb_id ||
                '';
            var api = '';
            if (kp) {
                api =
                    'https://cdnmovies-stream.online/kinopoisk/' +
                    kp +
                    '/iframe';
            } else if (imdb) {
                api =
                    'https://cdnmovies-stream.online/imdb/' +
                    imdb +
                    '/iframe';
            }
            if (!api) {
                html.append(
                    '<div style="padding:2em">Не найден ID фильма</div>'
                );
                return;
            }
            network.timeout(15000);
            network.native(
                api,
                function (response) {
                    render(response);
                },
                function () {
                    html.append(
                        '<div style="padding:2em">Ошибка CDNMovies</div>'
                    );
                },
                false,
                {
                    dataType: 'text'
                }
            );
        }
        function render(response) {
            var player = extractPlayerData(response);
            if (!player || !player.file) {
                html.append(
                    '<div style="padding:2em">Видео не найдено</div>'
                );
                return;
            }
            var parsed = parsePlaylist(player.file);
            var videos = flattenVideos(parsed);
            if (!videos.length) {
                html.append(
                    '<div style="padding:2em">Нет доступных потоков</div>'
                );
                return;
            }
            videos.forEach(function (video) {
                var card = $(`
                    <div class="simple-button selector">
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
            }, 0);
        });
        console.log('CDNMovies Ultra Lite loaded');
    }
    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }
})();
