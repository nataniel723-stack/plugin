(function () {
    'use strict';

    var default_url = 'https://liveball.sx';
    // Используем CORS-прокси, так как браузер не даст web-версии Lampa отправить прямой запрос к сайту
    var proxy_url = 'https://corsproxy.io/?'; 

    // 1. Добавляем настройку зеркала, так как спортивные домены часто меняются
    Lampa.SettingsApi.addParam({
        component: 'server',
        param: {
            name: 'liveball_domain',
            type: 'input',
            default: default_url
        },
        field: {
            name: 'LiveBall URL',
            description: 'Текущее зеркало сайта (по умолчанию https://liveball.sx)'
        }
    });

    function LiveBallComponent(object) {
        var network = new Lampa.Reguest(); // В API Lampa используется именно Reguest
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var items = [];
        var html = $('<div></div>');
        var body = $('<div class="liveball-grid category-full"></div>');
        
        var current_domain = Lampa.Storage.get('liveball_domain', default_url);

        this.create = function () {
            this.activity.loader(true);
            
            // Если Lampa запущена в браузере (web), оборачиваем ссылку в прокси
            var req_url = Lampa.Platform.is('web') ? (proxy_url + encodeURIComponent(current_domain)) : current_domain;

            network.silent(req_url, (str) => {
                this.parseMatches(str);
            }, (a, c) => {
                this.empty('Ошибка загрузки. Возможно, сайт заблокирован провайдером.');
            }, false, { dataType: 'text' });
        };

        this.parseMatches = function (html_str) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(html_str, 'text/html');
            var match_data = [];
            
            // Собираем все ссылки, ведущие на страницу трансляции (обычно содержат /match/ или /live/)
            var links = Array.from(doc.querySelectorAll('a')).filter(a => {
                var href = a.getAttribute('href') || '';
                return href.includes('/match/') || href.includes('/live/');
            });

            links.forEach(link => {
                var title = link.innerText.replace(/\n/g, ' ').trim();
                var url = link.getAttribute('href');
                
                // Нормализация относительных ссылок
                if (url.startsWith('/')) url = current_domain + url;
                if (!url.startsWith('http')) url = current_domain + '/' + url;

                if (url && title && title.length > 5) {
                    // Ищем картинку турнира или ставим заглушку
                    var imgTag = link.querySelector('img');
                    var imgUrl = imgTag ? imgTag.src : 'https://lampa.mx/img/splash.png';
                    
                    match_data.push({ title: title, url: url, img: imgUrl });
                }
            });

            // Удаляем дубликаты ссылок
            match_data = match_data.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);

            if (match_data.length > 0) {
                this.build(match_data);
            } else {
                this.empty('Трансляции не найдены. Возможно, изменилась верстка сайта.');
            }
        };

        this.empty = function (msg) {
            var empty = new Lampa.Empty({ title: msg });
            html.append(empty.render());
            this.start = empty.start;
            this.activity.loader(false);
            this.activity.toggle();
        };

        this.build = function (data) {
            this.activity.loader(false);
            
            data.forEach(element => {
                var card = Lampa.Template.get('card', {
                    title: element.title,
                    release_year: 'Прямой эфир'
                });
                
                card.find('.card__img').attr('src', element.img);
                
                card.on('hover:enter', () => {
                    this.play(element.title, element.url);
                });

                body.append(card);
                items.push(card);
            });

            html.append(scroll.render());
            scroll.append(body);
            this.activity.toggle();
        };

        this.play = function (title, match_url) {
            Lampa.Noty.show('Поиск потока...');
            var req_url = Lampa.Platform.is('web') ? (proxy_url + encodeURIComponent(match_url)) : match_url;

            network.silent(req_url, (str) => {
                // Пытаемся вытащить прямую m3u8 ссылку или iframe плеера из HTML-кода страницы
                var m3u8Match = str.match(/(https?:\/\/[^"'>\s]+\.m3u8)/i);
                var iframeMatch = str.match(/<iframe[^>]+src="([^">]+)"/i);

                var stream_url = '';
                if (m3u8Match) {
                    stream_url = m3u8Match[1];
                } else if (iframeMatch) {
                    stream_url = iframeMatch[1];
                    if (stream_url.startsWith('//')) stream_url = 'https:' + stream_url;
                }

                if (stream_url) {
                    var video = { title: title, url: stream_url };
                    
                    // Передаем ссылку встроенному плееру Lampa
                    Lampa.Player.play(video);
                    Lampa.Player.playlist([video]);
                } else {
                    Lampa.Noty.show('Не удалось найти HLS/iframe ссылку на странице матча');
                }
            }, (a, c) => {
                Lampa.Noty.show('Ошибка при загрузке страницы матча');
            }, false, { dataType: 'text' });
        };

        this.render = function () { return html; };

        this.start = function () {
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(this.render());
                    Lampa.Controller.collectionFocus(items.length ? items[0] : false, this.render());
                },
                left: () => { Lampa.Controller.toggle('menu'); },
                up: () => { return false; },
                down: () => { return false; }
            });
            Lampa.Controller.toggle('content');
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();
            items = [];
            html.remove();
        };
    }

    Lampa.Component.add('liveball_sport', LiveBallComponent);

    // 2. Добавляем иконку и кнопку в боковое меню Lampa
    Lampa.Listener.follow('app', function (e) {
        if (e.type == 'ready') {
            var menuItem = $(`
                <li class="menu__item selector">
                    <div class="menu__ico">
                        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2ZM12 20A8 8 0 1 1 20 12A8 8 0 0 1 12 20Z"/></svg>
                    </div>
                    <div class="menu__text">LiveBall Спорт</div>
                </li>
            `);

            menuItem.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: '',
                    title: 'LiveBall Спорт',
                    component: 'liveball_sport',
                    page: 1
                });
            });

            $('.menu .menu__list').eq(0).append(menuItem);
        }
    });

})();
