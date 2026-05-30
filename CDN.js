// CDNMovies Source Plugin for Lampa / Lampa Uncensored
// Version: 2.0

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
            console.log('CDNMovies decode error', e);
            return '';
        }
    }

    function parsePlaylist(file) {
        try {
            return JSON.parse(decode(file));
        } catch (e) {
            console.log('CDNMovies parse error', e);
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
            console.log('CDNMovies extract error', e);
            return null;
        }
    }

    function flattenVideos(data, result, season) {
        result = result || [];

        if (!data || !data.forEach) return result;

        data.forEach(function (item) {

            // сериал
            if (item.folder && item.folder.forEach) {
                flattenVideos(item.folder, result, item.title || season);
            }

            // видео
            if (item.file && typeof item.file === 'string') {
                result.push({
                    title: item.title || 'Видео',
                    season: season || '',
                    file: item.file
                });
            }
        });

        return result;
    }

    function buildApi(movie) {
        var kp =
            movie.kinopoisk_id ||
            movie.id ||
            '';

        var imdb =
            movie.imdb_id ||
            '';

        if (kp) {
            return 'https://cdnmovies-stream.online/kinopoisk/' + kp + '/iframe';
        }

        if (imdb) {
            return 'https://cdnmovies-stream.online/imdb/' + imdb + '/iframe';
        }

        return '';
    }

    function request(movie, success, error) {
        var api = buildApi(movie);

        if (!api) {
            error();
            return;
        }

        network.timeout(15000);

        network.native(
            api,
            function (response) {
                try {
                    var player = extractPlayerData(response);

                    if (!player || !player.file) {
                        error();
                        return;
                    }

                    var parsed = parsePlaylist(player.file);

                    var videos = flattenVideos(parsed);

                    success(videos);
                } catch (e) {
                    console.log('CDNMovies request error', e);
                    error();
                }
            },
            error,
            false,
            {
                dataType: 'text'
            }
        );
    }

    function createItems(videos) {
        var items = [];

        videos.forEach(function (video, index) {

            items.push({
                title: video.season
                    ? video.season + ' / ' + video.title
                    : video.title,

                file: video.file,

                quality: 'HD',
                voice: video.title,

                subtitle: '',
                timeline: 0,

                details: {
                    title: video.title
                }
            });
        });

        return items;
    }

    function init() {

        Lampa.Api.sources.cdnmovies = {
            title: 'CDNMovies',
            icon: 'https://cdn-icons-png.flaticon.com/512/1179/1179069.png',

            search: function (movie, call) {

                request(
                    movie,

                    function (videos) {

                        if (!videos || !videos.length) {
                            call({
                                error: 'Видео не найдено'
                            });

                            return;
                        }

                        call({
                            results: createItems(videos)
                        });
                    },

                    function () {
                        call({
                            error: 'Ошибка CDNMovies'
                        });
                    }
                );
            }
        };

        console.log('CDNMovies source loaded');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') init();
        });
    }

})();
