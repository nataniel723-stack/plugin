(function () {
    'use strict';

    var PLUGIN_VERSION = 'v1.0.2';
    var CACHE_KEY = 'kp_rating_' + PLUGIN_VERSION;

    function startsWith(str, searchString) {
        return str.lastIndexOf(searchString, 0) === 0;
    }

    function endsWith(str, searchString) {
        var start = str.length - searchString.length;
        if (start < 0) return false;
        return str.indexOf(searchString, start) === start;
    }

    function salt(input) {
        var str = (input || '') + '';
        var hash = 0;

        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);

            hash = ((hash << 5) - hash) + c;
            hash = hash & hash;
        }

        var result = '';

        for (var _i = 0, j = 32 - 3; j >= 0; _i += 3, j -= 3) {
            var x = (((hash >>> _i) & 7) << 3) + ((hash >>> j) & 7);
            result += String.fromCharCode(
                x < 26 ? 97 + x :
                x < 52 ? 39 + x :
                x - 4
            );
        }

        return result;
    }

    function decodeSecret(input, password) {
        var result = '';
        password = (password || '') + '';

        if (input && password) {
            var hash = salt('123456789' + password);

            while (hash.length < input.length) {
                hash += hash;
            }

            var i = 0;

            while (i < input.length) {
                result += String.fromCharCode(
                    input[i] ^ hash.charCodeAt(i)
                );
                i++;
            }
        }

        return result;
    }

    function isDebug() {
        var res = false;
        var origin = window.location.origin || '';

        decodeSecret(
            [
                53, 10, 80, 65, 90, 90, 94, 78, 65, 120,
                41, 25, 84, 66, 94, 72, 24, 92, 28, 32,
                38, 67, 85, 83, 90, 75, 17, 23, 69, 34,
                41, 11, 64, 28, 68, 66, 30, 86, 94, 44,
                34, 1, 23, 95, 82, 0, 18, 64, 94, 34,
                40, 8, 88, 28, 88, 85, 28, 80, 92, 38
            ],
            atob('cHJpc2FtaXNoZQ==')
        ).split(';').forEach(function (s) {
            res |= endsWith(origin, s);
        });

        return res;
    }

    function rating_kp_imdb(card) {
        var network = new Lampa.Reguest();

        var clean_title = kpCleanTitle(card.title);

        var search_date =
            card.release_date ||
            card.first_air_date ||
            card.last_air_date ||
            '0000';

        var search_year = parseInt(
            (search_date + '').slice(0, 4)
        );

        var orig = card.original_title || card.original_name;

        var kp_prox = '';

        var params = {
            id: card.id,

            url: kp_prox + 'https://kinopoiskapiunofficial.tech/',

            rating_url: kp_prox + 'https://rating.kinopoisk.ru/',

            headers: {
                'X-API-KEY': decodeSecret(
                    [
                        85, 4, 115, 118, 107, 125, 10, 70,
                        85, 67, 82, 14, 32, 110, 102, 43,
                        9, 19, 85, 73, 4, 83, 33, 110,
                        52, 44, 92, 21, 72, 22, 87, 1,
                        118, 32, 100, 127
                    ],
                    atob('X0tQM3Bhc3N3b3Jk')
                )
            },

            cache_time: 60 * 60 * 24 * 1000
        };

        getRating();

        function getRating() {
            var movieRating = _getCache(params.id);

            if (movieRating) {
                return _showRating(movieRating[params.id]);
            } else {
                searchFilm();
            }
        }

        function searchFilm() {
            var url = params.url;

            var url_by_title = Lampa.Utils.addUrlComponent(
                url + 'api/v2.1/films/search-by-keyword',
                'keyword=' + encodeURIComponent(clean_title)
            );

            if (card.imdb_id) {
                url = Lampa.Utils.addUrlComponent(
                    url + 'api/v2.2/films',
                    'imdbId=' + encodeURIComponent(card.imdb_id)
                );
            } else {
                url = url_by_title;
            }

            network.clear();
            network.timeout(15000);

            network.silent(
                url,

                function (json) {
                    if (json.items && json.items.length) {
                        chooseFilm(json.items);
                    } else if (json.films && json.films.length) {
                        chooseFilm(json.films);
                    } else if (url !== url_by_title) {

                        network.clear();
                        network.timeout(15000);

                        network.silent(
                            url_by_title,

                            function (json) {
                                if (json.items && json.items.length) {
                                    chooseFilm(json.items);
                                } else if (json.films && json.films.length) {
                                    chooseFilm(json.films);
                                } else {
                                    chooseFilm([]);
                                }
                            },

                            function (a, c) {
                                showError(
                                    network.errorDecode(a, c)
                                );
                            },

                            false,

                            {
                                headers: params.headers
                            }
                        );

                    } else {
                        chooseFilm([]);
                    }
                },

                function (a, c) {
                    showError(
                        network.errorDecode(a, c)
                    );
                },

                false,

                {
                    headers: params.headers
                }
            );
        }

        function chooseFilm(items) {
            if (items && items.length) {

                var is_sure = false;
                var is_imdb = false;

                items.forEach(function (c) {
                    var year = c.start_date || c.year || '0000';

                    c.tmp_year = parseInt(
                        (year + '').slice(0, 4)
                    );
                });

                if (card.imdb_id) {

                    var tmp = items.filter(function (elem) {
                        return (
                            elem.imdb_id ||
                            elem.imdbId
                        ) == card.imdb_id;
                    });

                    if (tmp.length) {
                        items = tmp;
                        is_sure = true;
                        is_imdb = true;
                    }
                }

                var cards = items;

                if (cards.length) {

                    if (orig) {

                        var _tmp = cards.filter(function (elem) {

                            return (
                                containsTitle(
                                    elem.orig_title ||
                                    elem.nameOriginal,
                                    orig
                                ) ||

                                containsTitle(
                                    elem.en_title ||
                                    elem.nameEn,
                                    orig
                                ) ||

                                containsTitle(
                                    elem.title ||
                                    elem.ru_title ||
                                    elem.nameRu,
                                    orig
                                )
                            );
                        });

                        if (_tmp.length) {
                            cards = _tmp;
                            is_sure = true;
                        }
                    }

                    if (card.title) {

                        var _tmp2 = cards.filter(function (elem) {

                            return (
                                containsTitle(
                                    elem.title ||
                                    elem.ru_title ||
                                    elem.nameRu,
                                    card.title
                                ) ||

                                containsTitle(
                                    elem.en_title ||
                                    elem.nameEn,
                                    card.title
                                ) ||

                                containsTitle(
                                    elem.orig_title ||
                                    elem.nameOriginal,
                                    card.title
                                )
                            );
                        });

                        if (_tmp2.length) {
                            cards = _tmp2;
                            is_sure = true;
                        }
                    }

                    if (cards.length > 1 && search_year) {

                        var _tmp3 = cards.filter(function (c) {
                            return c.tmp_year == search_year;
                        });

                        if (!_tmp3.length) {
                            _tmp3 = cards.filter(function (c) {
                                return (
                                    c.tmp_year &&
                                    c.tmp_year > search_year - 2 &&
                                    c.tmp_year < search_year + 2
                                );
                            });
                        }

                        if (_tmp3.length) {
                            cards = _tmp3;
                        }
                    }
                }

                if (cards.length == 1 && is_sure && !is_imdb) {

                    if (search_year && cards[0].tmp_year) {
                        is_sure =
                            cards[0].tmp_year > search_year - 2 &&
                            cards[0].tmp_year < search_year + 2;
                    }

                    if (is_sure) {

                        is_sure = false;

                        if (orig) {

                            is_sure |=
                                equalTitle(
                                    cards[0].orig_title ||
                                    cards[0].nameOriginal,
                                    orig
                                ) ||

                                equalTitle(
                                    cards[0].en_title ||
                                    cards[0].nameEn,
                                    orig
                                ) ||

                                equalTitle(
                                    cards[0].title ||
                                    cards[0].ru_title ||
                                    cards[0].nameRu,
                                    orig
                                );
                        }

                        if (card.title) {

                            is_sure |=
                                equalTitle(
                                    cards[0].title ||
                                    cards[0].ru_title ||
                                    cards[0].nameRu,
                                    card.title
                                ) ||

                                equalTitle(
                                    cards[0].en_title ||
                                    cards[0].nameEn,
                                    card.title
                                ) ||

                                equalTitle(
                                    cards[0].orig_title ||
                                    cards[0].nameOriginal,
                                    card.title
                                );
                        }
                    }
                }

                if (cards.length == 1 && is_sure) {

                    var id =
                        cards[0].kp_id ||
                        cards[0].kinopoisk_id ||
                        cards[0].kinopoiskId ||
                        cards[0].filmId;

                    var base_search = function () {

                        network.clear();
                        network.timeout(15000);

                        network.silent(
                            params.url +
                            'api/v2.2/films/' +
                            id,

                            function (data) {

                                var movieRating = _setCache(
                                    params.id,
                                    {
                                        kp: data.ratingKinopoisk,
                                        imdb: data.ratingImdb,
                                        timestamp: new Date().getTime()
                                    }
                                );

                                return _showRating(movieRating);
                            },

                            function (a, c) {
                                showError(
                                    network.errorDecode(a, c)
                                );
                            },

                            false,

                            {
                                headers: params.headers
                            }
                        );
                    };

                    network.clear();
                    network.timeout(5000);

                    network["native"](
                        params.rating_url + id + '.xml',

                        function (str) {

                            if (str.indexOf('<rating>') >= 0) {

                                try {

                                    var ratingKinopoisk = 0;
                                    var ratingImdb = 0;

                                    var xml = $(
                                        $.parseXML(str)
                                    );

                                    var kp_rating =
                                        xml.find('kp_rating');

                                    if (kp_rating.length) {
                                        ratingKinopoisk =
                                            parseFloat(
                                                kp_rating.text()
                                            );
                                    }

                                    var imdb_rating =
                                        xml.find('imdb_rating');

                                    if (imdb_rating.length) {
                                        ratingImdb =
                                            parseFloat(
                                                imdb_rating.text()
                                            );
                                    }

                                    var movieRating = _setCache(
                                        params.id,
                                        {
                                            kp: ratingKinopoisk,
                                            imdb: ratingImdb,
                                            timestamp: new Date().getTime()
                                        }
                                    );

                                    return _showRating(movieRating);

                                } catch (ex) {
                                }
                            }

                            base_search();
                        },

                        function () {
                            base_search();
                        },

                        false,

                        {
                            dataType: 'text'
                        }
                    );

                } else {

                    var movieRating = _setCache(
                        params.id,
                        {
                            kp: 0,
                            imdb: 0,
                            timestamp: new Date().getTime()
                        }
                    );

                    return _showRating(movieRating);
                }

            } else {

                var _movieRating = _setCache(
                    params.id,
                    {
                        kp: 0,
                        imdb: 0,
                        timestamp: new Date().getTime()
                    }
                );

                return _showRating(_movieRating);
            }
        }

        function cleanTitle(str) {
            return str
                .replace(/[\s.,:;’'`!?]+/g, ' ')
                .trim();
        }

        function kpCleanTitle(str) {
            return cleanTitle(str)
                .replace(/^[ \/\\]+/, '')
                .replace(/[ \/\\]+$/, '')
                .replace(/\+( *[+\/\\])+/g, '+')
                .replace(/([+\/\\] *)+\+/g, '+')
                .replace(/( *[\/\\]+ *)+/g, '+');
        }

        function normalizeTitle(str) {
            return cleanTitle(
                str
                    .toLowerCase()
                    .replace(
                        /[\-\u2010-\u2015\u2E3A\u2E3B\uFE58\uFE63\uFF0D]+/g,
                        '-'
                    )
                    .replace(/ё/g, 'е')
            );
        }

        function equalTitle(t1, t2) {
            return (
                typeof t1 === 'string' &&
                typeof t2 === 'string' &&
                normalizeTitle(t1) === normalizeTitle(t2)
            );
        }

        function containsTitle(str, title) {
            return (
                typeof str === 'string' &&
                typeof title === 'string' &&
                normalizeTitle(str).indexOf(
                    normalizeTitle(title)
                ) !== -1
            );
        }

        function showError(error) {
            Lampa.Noty.show(
                'Рейтинг KP: ' + error
            );
        }

        function _getCache(movie) {

            var timestamp = new Date().getTime();

            var cache = Lampa.Storage.cache(
                CACHE_KEY,
                500,
                {}
            );

            if (cache[movie]) {

                if (
                    timestamp -
                    cache[movie].timestamp >
                    params.cache_time
                ) {

                    delete cache[movie];

                    Lampa.Storage.set(
                        CACHE_KEY,
                        cache
                    );

                    return false;
                }

            } else {
                return false;
            }

            return cache;
        }

        function _setCache(movie, data) {

            var timestamp = new Date().getTime();

            var cache = Lampa.Storage.cache(
                CACHE_KEY,
                500,
                {}
            );

            if (!cache[movie]) {

                cache[movie] = data;

                Lampa.Storage.set(
                    CACHE_KEY,
                    cache
                );

            } else {

                if (
                    timestamp -
                    cache[movie].timestamp >
                    params.cache_time
                ) {

                    data.timestamp = timestamp;

                    cache[movie] = data;

                    Lampa.Storage.set(
                        CACHE_KEY,
                        cache
                    );

                } else {
                    data = cache[movie];
                }
            }

            return data;
        }

        function _showRating(data) {

            if (data) {

                var kp_rating =
                    !isNaN(data.kp) &&
                    data.kp !== null
                        ? parseFloat(data.kp).toFixed(1)
                        : '0.0';

                var imdb_rating =
                    !isNaN(data.imdb) &&
                    data.imdb !== null
                        ? parseFloat(data.imdb).toFixed(1)
                        : '0.0';

                var render =
                    Lampa.Activity
                        .active()
                        .activity
                        .render();

                $('.wait_rating', render).remove();

                $('.rate--imdb', render)
                    .removeClass('hide')
                    .find('> div')
                    .eq(0)
                    .text(imdb_rating);

                $('.rate--kp', render)
                    .removeClass('hide')
                    .find('> div')
                    .eq(0)
                    .text(kp_rating);
            }
        }
    }


    /*
     * ==========================================================
     *  CUSTOM RATING STYLES
     * ==========================================================
     *
     *  ВАЖНО:
     *  Мы НЕ удаляем штатный класс .rate.
     *
     *  Это позволяет Lampa самой управлять layout блока.
     *  Особенно важно для старых WebView Samsung/Tizen.
     */

    function injectCustomRatingStyles() {

        if ($('#custom-monochrome-rating-styles').length) {
            return;
        }

        var style = document.createElement('style');

        style.id = 'custom-monochrome-rating-styles';

        style.innerHTML =

            /*
             * Главное изменение v1.0.2:
             *
             * НЕТ:
             * display: inline-flex
             * align-self: center
             *
             * И НЕ ПЕРЕОПРЕДЕЛЯЕМ display штатного .rate.
             */

            '.monochrome-rate-custom {' +

                'margin-right: 15px !important;' +

                'background: transparent !important;' +

                'border: none !important;' +

                'box-shadow: none !important;' +

                'backdrop-filter: none !important;' +

                '-webkit-backdrop-filter: none !important;' +

                'padding: 0 !important;' +

            '}' +


            /*
             * Убираем декоративные псевдоэлементы,
             * но не вмешиваемся в основной layout.
             */

            '.monochrome-rate-custom::before,' +
            '.monochrome-rate-custom::after {' +

                'display: none !important;' +

            '}' +


            /*
             * Число рейтинга.
             */

            '.monochrome-rate-custom > div:nth-child(1) {' +

                'font-size: 1.15em;' +

                'font-weight: 600;' +

                'margin-right: 4px;' +

            '}' +


            /*
             * Контейнер иконки.
             *
             * display:flex оставляем только на внутреннем
             * контейнере, а не на самом .rate.
             */

            '.monochrome-rate-custom > div:nth-child(2) {' +

                'display: flex;' +

                'align-items: center;' +

                'justify-content: center;' +

            '}' +


            /*
             * Дополнительная защита Samsung WebView:
             * SVG не должен внезапно влиять на высоту родительского
             * блока из-за особенностей старого движка.
             */

            '.monochrome-rate-custom > div:nth-child(2) svg {' +

                'display: block !important;' +

                'flex-shrink: 0 !important;' +

            '}';


        document.head.appendChild(style);
    }


    /*
     * ==========================================================
     *  PLUGIN START
     * ==========================================================
     */

    function startPlugin() {

        window.rating_plugin = true;

        if (isDebug()) {
            return;
        }

        injectCustomRatingStyles();


        Lampa.Listener.follow(
            'full',
            function (e) {

                if (e.type == 'complite') {

                    var render =
                        e.object
                            .activity
                            .render();


                    /*
                     * ==================================================
                     * TMDB
                     * ==================================================
                     */

                    var tmdbBlock =
                        $('.rate--tmdb', render);

                    if (tmdbBlock.length) {

                        /*
                         * ВАЖНО:
                         *
                         * Было:
                         * removeClass('rate')
                         *
                         * Теперь:
                         * только добавляем наш класс.
                         */

                        tmdbBlock.addClass(
                            'monochrome-rate-custom'
                        );


                        var tmdbIcon =
                            tmdbBlock.find(
                                '> div:eq(1)'
                            );


                        if (
                            tmdbIcon.find('svg').length === 0
                        ) {

                            tmdbIcon.html(
                                '<svg width="45" height="45" viewBox="0 0 24 24" fill="currentColor">' +

                                '<path d="M19.491 21.899c2.106 0 3.531-1.424 3.531-3.531V3.531C23.022 1.425 21.598 0 19.491 0H4.509C2.403 0 .978 1.424.978 3.531V24l1.809-2.101V3.531a1.721 1.721 0 0 1 1.719-1.719h14.982c.949.002 1.718.77 1.719 1.719v14.837a1.721 1.721 0 0 1-1.719 1.719H6.92l-1.81 1.812-.011-.014zM8.787 11.466H7.09v5.698h1.697c3.793 0 3.793-5.698 0-5.698zm0 4.559h-.551v-3.419h.551c2.215 0 2.215 3.418 0 3.418zM8.456 10.389h1.139V5.83h1.418V4.699H7.037V5.83h1.419v4.559zM14.063 7.201l-1.971-2.502h-.366v5.785h1.156v-3.18l1.182 1.531 1.183-1.531-.008 3.18h1.156V4.699h-.36l-1.971 2.502zM15.983 14.315c.358-.247.51-.689.526-1.124.023-1.004-.606-1.729-1.617-1.729h-2.255v5.706h2.255a1.695 1.695 0 0 0 1.681-1.694v-.02-.008c0-.466-.231-.878-.585-1.127l-.004-.003zm-2.204-1.714h1.013c.327 0 .526.255.526.573a.533.533 0 0 1-.526.574h-1.013V12.6zm1.013 3.427h-1.013v-1.139h1.027c.309 0 .559.25.559.559v.014a.566.566 0 0 1-.566.566h-.001z"/>' +

                                '</svg>'
                            );
                        }
                    }


                    /*
                     * ==================================================
                     * IMDb
                     * ==================================================
                     */

                    var imdbBlock =
                        $('.rate--imdb', render);

                    if (imdbBlock.length) {

                        /*
                         * Не удаляем .rate.
                         */

                        imdbBlock.addClass(
                            'monochrome-rate-custom'
                        );


                        var imdbIcon =
                            imdbBlock.find(
                                '> div:eq(1)'
                            );


                        if (
                            imdbIcon.find('svg').length === 0
                        ) {

                            imdbIcon.html(
                                '<svg width="45" height="45" viewBox="0 0 32 32" fill="currentColor">' +

                                '<path d="M22.231 11.348v9.159h2.134l0.143-0.581c0.173 0.219 0.386 0.397 0.63 0.526l0.011 0.005c0.246 0.107 0.533 0.169 0.835 0.169 0.003 0 0.006 0 0.009-0h-0c0.016 0.001 0.035 0.001 0.054 0.001 0.344 0 0.662-0.111 0.921-0.299l-0.005 0.003c0.246-0.166 0.43-0.407 0.52-0.691l0.003-0.009c0.071-0.327 0.112-0.702 0.112-1.087 0-0.048-0.001-0.096-0.002-0.144l0 0.007v-2.572c0.001-0.055 0.002-0.121 0.002-0.186 0-0.315-0.016-0.626-0.048-0.932l0.003 0.038c-0.033-0.198-0.107-0.375-0.214-0.527l0.003 0.004c-0.136-0.181-0.315-0.323-0.523-0.411l-0.008-0.003c-0.23-0.091-0.496-0.144-0.775-0.144-0.015 0-0.030 0-0.045 0l0.002-0c-0.307 0.001-0.599 0.060-0.868 0.165l0.016-0.006c-0.249 0.127-0.459 0.294-0.63 0.496l-0.002 0.003v-2.986zM25.309 18.29c0.003 0.049 0.004 0.107 0.004 0.165 0 0.237-0.026 0.468-0.076 0.69l0.004-0.021c-0.041 0.118-0.236 0.177-0.379 0.177-0.007 0.001-0.016 0.001-0.024 0.001-0.114 0-0.211-0.069-0.253-0.167l-0.001-0.002c-0.052-0.185-0.081-0.397-0.081-0.616 0-0.056 0.002-0.112 0.006-0.168l-0 0.007v-2.422c-0.003-0.048-0.005-0.103-0.005-0.16 0-0.219 0.026-0.431 0.076-0.634l-0.004 0.018c0.043-0.091 0.134-0.153 0.24-0.153 0.011 0 0.021 0.001 0.032 0.002l-0.001-0c0.143 0 0.337 0.051 0.387 0.177 0.051 0.181 0.080 0.39 0.080 0.605 0 0.051-0.002 0.102-0.005 0.152l0-0.007zM18.916 20.508c0.048 0.001 0.104 0.002 0.16 0.002 0.394 0 0.78-0.034 1.154-0.1l-0.040 0.006c0.273-0.050 0.513-0.166 0.711-0.331l-0.002 0.002c0.198-0.163 0.341-0.386 0.403-0.641l0.002-0.008c0.084-0.415 0.132-0.893 0.132-1.381 0-0.093-0.002-0.185-0.005-0.277l0 0.013v-3.213c0.003-0.091 0.004-0.197 0.004-0.304 0-0.508-0.035-1.009-0.103-1.498l0.006 0.057c-0.054-0.312-0.192-0.584-0.39-0.802l0.001 0.001c-0.243-0.257-0.559-0.442-0.915-0.521l-0.012-0.002c-0.546-0.106-1.173-0.167-1.815-0.167-0.136 0-0.271 0.003-0.405 0.008l0.019-0.001h-1.772v9.159zM18.942 13.001c0.093 0.053 0.159 0.144 0.176 0.251l0 0.002c0.030 0.184 0.048 0.395 0.048 0.611 0 0.067-0.002 0.134-0.005 0.2l0-0.009v3.551c0.006 0.072 0.009 0.155 0.009 0.24 0 0.312-0.047 0.612-0.134 0.896l0.006-0.022c-0.076 0.143-0.287 0.211-0.624 0.211v-6.014c0.028-0.003 0.061-0.004 0.094-0.004 0.155 0 0.303 0.033 0.437 0.092l-0.007-0.003zM15.239 11.348v9.159h-2.066v-6.182l-0.835 6.182h-1.476l-0.869-6.047-0.008 6.047h-2.075v-9.159h3.070c0.093 0.557 0.186 1.206 0.287 1.957l0.337 2.328 0.548-4.285zM7.108 11.348v9.159h-2.37v-9.159zM28.978 1.691c0.785 0.060 1.4 0.711 1.4 1.506 0 0.001 0 0.003 0 0.004v-0 25.598c0 0.001 0 0.003 0 0.003 0 0.787-0.6 1.433-1.368 1.507l-0.006 0h-25.868c-0.74-0.067-1.322-0.658-1.375-1.395l-0-0.005v-25.809c0.049-0.754 0.646-1.355 1.395-1.408l0.005-0zM28.978 1.074h-25.817c-1.076 0.063-1.936 0.911-2.015 1.977l-0 0.007-0.001 25.851c0.054 1.063 0.881 1.917 1.927 2.013l0.008 0.001c0.016 0.002 0.034 0.003 0.052 0.003 0.001 0 0.003 0 0.004-0h25.868q0.027 0 0.054-0.003c1.089-0.109 1.932-1.018 1.936-2.125v-25.598c-0.004-1.119-0.866-2.035-1.963-2.124l-0.008-0c-0.013-0.002-0.029-0.002-0.045-0.002-0 0-0.001 0-0.001 0h0z"/>' +

                                '</svg>'
                            );
                        }
                    }


                    /*
                     * ==================================================
                     * КИНОПОИСК
                     * ==================================================
                     */

                    var kpBlock =
                        $('.rate--kp', render);

                    if (kpBlock.length) {

                        /*
                         * Не удаляем .rate.
                         */

                        kpBlock.addClass(
                            'monochrome-rate-custom'
                        );


                        var kpIcon =
                            kpBlock.find(
                                '> div:eq(1)'
                            );


                        if (
                            kpIcon.find('svg').length === 0
                        ) {

                            kpIcon.html(
                                '<svg width="46" height="46" viewBox="160 160 820 820" fill="currentColor">' +

                                '<path d="M 936.9,938.29 c 1.14,0.95 3.23,1.49 3,-0.79 c -0.05,-41.67 -0.06,-83.34 -0.03,-125 c 0.1,-1.02 -0.09,-1.97 -0.57,-2.85 c -98.43,-39.97 -197.21,-79.3 -295.65,-118.78 c -8.08,-3.24 -16.18,-6.75 -24.28,-9.73 c -47.06,-18.9 -94.1,-37.8 -141.12,-56.68 c 0.55,-0.68 1.28,-0.93 2.18,-0.77 c 152.53,10.15 305.02,20.47 457.54,30.71 c 1.34,0.07 1.92,-0.57 1.75,-1.91 c 0,-41.67 0.01,-83.33 0.03,-124.99 c -0.07,-0.95 0.23,-2.87 -1.22,-2.88 c -152.03,9.7 -304.11,19.9 -456.14,29.49 c -0.55,-0.02 -0.97,-0.25 -1.27,-0.69 c 36.11,-14.47 72.2,-28.98 108.26,-43.54 c 29.9,-11.89 60.22,-24.09 90.12,-36.13 c 10.64,-3.71 21.37,-9.15 32.24,-12.6 c 55.54,-22.54 111.13,-44.95 166.75,-67.23 c 2.59,-0.74 7.83,-3.26 10.28,-3.72 c 16.81,-6.68 33.55,-13.57 50.22,-20.67 c 0.55,-0.57 0.79,-1.25 0.73,-2.05 c 0.01,-41.98 0.01,-83.96 0.01,-125.95 c -0.01,-1.46 -0.68,-1.86 -2.02,-1.19 c -47.01,25.3 -94.28,50.29 -141.24,75.72 c -24.39,12.9 -48.69,25.91 -72.98,39.04 c -98.89,52.77 -197.32,105.6 -296.23,158.49 c -0.41,0.24 -0.8,0.21 -1.14,-0.1 c 1.13,-1.52 2.37,-2.97 3.72,-4.36 c 87.18,-89.45 174.31,-178.94 261.4,-268.47 c 0.84,-1.01 0.58,-1.47 -0.75,-1.4 c -48,0.01 -96,0.01 -143.99,0 c -1.1,-0.13 -2.13,0.04 -3.11,0.5 c -59.72,82.11 -118.86,164.5 -178.07,246.94 c -1.47,1.55 -3.15,5.07 -4.93,5.99 c -0.14,-83.39 -0.17,-166.78 -0.09,-250.19 c -0.01,-1.33 0.14,-3.5 -1.84,-3.24 c -38.65,0.02 -77.31,0.03 -115.96,0.01 c -1.09,-0.14 -2.08,0.08 -2.96,0.67 c -0.26,232.18 -0.35,464.36 -0.27,696.56 c -0.01,1.96 -0.25,3.4 2.26,3.2 c 38.97,0.01 77.95,0.02 116.93,0.03 c 1.98,0.26 1.82,-1.91 1.82,-3.23 c -0.01,-82.67 -0.02,-165.35 -0.04,-248.02 c -0.09,-0.46 0.01,-0.85 0.3,-1.19 c 1.19,0.62 2.12,1.53 2.78,2.73 c 59.91,83.16 119.94,166.23 180.07,249.22 c 0.98,0.45 2.01,0.62 3.11,0.49 c 48,-0.01 95.99,0 143.99,0.04 c 1.34,0.05 1.59,-0.42 0.76,-1.43 c -7.45,-7.58 -14.87,-15.19 -22.26,-22.83 c -79.05,-80.56 -157.98,-161.2 -236.8,-241.91 c 0.29,-0.36 0.66,-0.43 1.1,-0.22 c 26.57,14.01 53.1,28.1 79.59,42.27 c 23.44,11.61 46.35,24.38 69.66,36.28 c 3.13,2.18 6.3,3.7 9.83,5.19 c 95.16,49.6 189.79,100.75 285.2,149.86 c 19.56,10.6 39.52,20.74 59.33,31.31 Z"/>' +

                                '</svg>'
                            );
                        }
                    }


                    /*
                     * ==================================================
                     * LOADING / ПОЛУЧЕНИЕ РЕЙТИНГА
                     * ==================================================
                     */

                    if (
                        $('.rate--kp', render).hasClass('hide') &&
                        !$('.wait_rating', render).length
                    ) {

                        /*
                         * Исправлено:
                         *
                         * В старом коде здесь был незакрытый <div>.
                         * Samsung WebView мог некорректно восстановить
                         * DOM и из-за этого сдвинуть элементы карточки.
                         */

                        $('.info__rate', render).after(
                            '<div style="width:2em;margin-top:1em;margin-right:1em" class="wait_rating">' +
                                '<div class="broadcast__scan">' +
                                    '<div></div>' +
                                '</div>' +
                            '</div>'
                        );

                        rating_kp_imdb(
                            e.data.movie
                        );
                    }
                }
            }
        );
    }


    if (!window.rating_plugin) {
        startPlugin();
    }

})();
