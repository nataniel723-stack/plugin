(function () {
    'use strict';
(function () {
    'use strict';

    var EmbyIntegration = {
        name: 'Emby Local Source',
        version: '1.0.1',
        
        init: function () {
            console.log('Emby Plugin: Try Initialize...');
            
            // Железобетонный способ дождаться полной загрузки Lampa
            var timer = setInterval(function() {
                if (window.Lampa && window.Lampa.Settings) {
                    clearInterval(timer);
                    EmbyIntegration.ready();
                }
            }, 200);
        },

        ready: function () {
            console.log('Emby Plugin: Ready and loading components');
            this.setupSettings();
            this.listenCardOpen();
        },

        setupSettings: function () {
            // Добавляем пункт меню в настройки плагинов
            Lampa.Settings.listener.follow('open', function (e) {
                if (e.name === 'plugins') {
                    // Проверяем, нет ли уже наших настроек, чтобы не дублировать
                    if (e.body.find('.emby-settings-block').length) return;

                    var box = $('<div class="settings-folder emby-settings-block"><div class="settings-param title">Локальный Emby Server</div></div>');
                    
                    // Упрощенный html-шаблон полей, который не зависит от внутренней кухни Lampa
                    var htmlServer = '<div class="settings-param selector">' +
                                        '<div class="settings-param__name">Адрес сервера Emby</div>' +
                                        '<div class="settings-param__value"></div>' +
                                        '<input type="text" class="settings-param__input" style="background:transparent; border:none; color:#fff; width:100%;" placeholder="http://192.168.1.100:8096" value="' + Lampa.Storage.get('emby_server_url', '') + '">' +
                                     '</div>';

                    var htmlToken = '<div class="settings-param selector">' +
                                        '<div class="settings-param__name">API Ключ (Токен)</div>' +
                                        '<div class="settings-param__value"></div>' +
                                        '<input type="text" class="settings-param__input" style="background:transparent; border:none; color:#fff; width:100%;" placeholder="Токен из админки Emby" value="' + Lampa.Storage.get('emby_api_token', '') + '">' +
                                    '</div>';

                    var $server = $(htmlServer);
                    var $token = $(htmlToken);

                    $server.find('input').on('change input', function () {
                        var val = $(this).val().trim().replace(/\/$/, "");
                        Lampa.Storage.set('emby_server_url', val);
                    });

                    $token.find('input').on('change input', function () {
                        Lampa.Storage.set('emby_api_token', $(this).val().trim());
                    });

                    box.append($server).append($token);
                    e.body.append(box);
                    
                    // Обновляем навигацию пульта в настройках
                    if (window.Lampa.Controller) window.Lampa.Controller.toggle('settings');
                }
            });
        },

    
// Слушаем открытие полной карточки контента
        listenCardOpen: function () {
            var self = this;
            Lampa.Listener.follow('full', function (e) {
                if (e.type === 'complite') { 
                    var movieData = e.data.movie; 
                    var cardBody = e.object.activity.render(); 
                    
                    self.checkContentInEmby(movieData, cardBody);
                }
            });
        },

        // Поиск контента на сервере Emby
        checkContentInEmby: function (movie, container) {
            var self = this;
            var server = Lampa.Storage.get('emby_server_url', '');
            var token = Lampa.Storage.get('emby_api_token', '');

            if (!server || !token) return; // Если настройки не заполнены, игнорируем

            // Используем ID TMDB для точного поиска, чтобы избежать путаницы с именами
            var tmdbId = movie.id;
            var isTv = (movie.number_of_seasons || movie.first_air_date || movie.name) ? true : false;
            
            // Запрос к Emby по ProviderId (tmdb)
            var url = server + '/emby/Items?AnyProviderIdEquals=tmdb.' + tmdbId + '&api_key=' + token + '&Recursive=true';

            $.ajax({
                url: url,
                method: 'GET',
                dataType: 'json',
                timeout: 5000,
                success: function (data) {
                    if (data && data.Items && data.Items.length > 0) {
                        // Контент найден на локальном сервере!
                        var embyItem = data.Items[0];
                        self.injectEmbyButton(container, embyItem, movie, isTv, server, token);
                    }
                },
                error: function (xhr, status, error) {
                    console.log('Emby Plugin Search Error:', error);
                }
            });
        },
// Внедрение кнопки на страницу фильма
        injectEmbyButton: function (container, embyItem, movie, isTv, server, token) {
            var self = this;
            // Ищем контейнер с кнопками "Смотреть", "Торренты" и т.д.
            var buttonsContainer = container.find('.full-start-new__buttons, .full-start__buttons');
            
            if (buttonsContainer.length && !buttonsContainer.find('.button--emby-local').length) {
                // Создаем кнопку в стиле Lampa (иконка "Play")
                var btnHtml = '<div class="full-start__button selector button--emby-local">' +
                              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:1.6rem; height:1.6rem; margin-right:0.6rem; vertical-align:middle;"><path d="M5 3l14 9-14 9V3z" fill="currentColor"/></svg>' +
                              '<span>Смотреть в Emby</span>' +
                              '</div>';
                
                var embyBtn = $(btnHtml);

                // Навешиваем событие клика (OK на пульте)
                embyBtn.on('hover:enter', function () {
                    if (isTv) {
                        // Если это сериал, нам нужно понять, какую серию выбрал пользователь в интерфейсе Lampa
                        self.handleTvPlayback(embyItem, movie, server, token);
                    } else {
                        // Если фильм — запускаем сразу
                        self.startPlayback(embyItem.Id, embyItem.Name, server, token);
                    }
                });

                // Вставляем кнопку в начало или конец списка источников
                buttonsContainer.append(embyBtn);
                
                // Переинициализируем контроллер навигации Lampa, чтобы пульт "увидел" новую кнопку
                if (window.Lampa.Controller) {
                    window.Lampa.Controller.toggle('full');
                }
            }
        },
// Логика для Сериалов: ищем конкретный эпизод
        handleTvPlayback: function (embyItem, movie, server, token) {
            var self = this;
            
            // Пытаемся получить текущий выбранный сезон и серию из интерфейса Lampa
            // Lampa хранит состояние активных вкладок в проигрывателе/карточке
            var currentSeason = 1;
            var currentEpisode = 1;
            
            try {
                // Извлекаем данные о выбранной серии из компонентов Lampa (усредненный подход)
                if (window.Lampa.Activity && window.Lampa.Activity.active()) {
                    var activityData = window.Lampa.Activity.active().activity;
                    if (activityData && activityData.season_episode) {
                        currentSeason = activityData.season_episode.season || 1;
                        currentEpisode = activityData.season_episode.episode || 1;
                    }
                }
            } catch(e) {
                console.log('Emby Plugin: Failed to parse current season/episode, defaulting to S01E01');
            }

            // Ищем ID конкретного эпизода внутри ID сериала в Emby
            var episodeUrl = server + '/emby/Shows/' + embyItem.Id + '/Episodes?SeasonNumber=' + currentSeason + '&StartEpisodeNumber=' + currentEpisode + '&api_key=' + token;

            $.ajax({
                url: episodeUrl,
                method: 'GET',
                dataType: 'json',
                success: function (data) {
                    if (data && data.Items && data.Items.length > 0) {
                        var ep = data.Items[0];
                        var title = movie.name + ' - S' + currentSeason + 'E' + currentEpisode;
                        self.startPlayback(ep.Id, title, server, token);
                    } else {
                        Lampa.Noty.show('Серия S' + currentSeason + 'E' + currentEpisode + ' не найдена в Emby');
                    }
                },
                error: function () {
                    Lampa.Noty.show('Ошибка запроса серии из Emby');
                }
            });
        },
// Запуск встроенного плеера Lampa
        startPlayback: function (itemId, videoTitle, server, token) {
            // Формируем прямую ссылку на видеопоток без транскодирования (Direct Play)
            // Emby отдает оригинальный файл через этот эндпоинт
            var streamUrl = server + '/emby/Videos/' + itemId + '/stream?static=true&api_key=' + token;
            
            var videoObject = {
                url: streamUrl,
                title: videoTitle
            };

            console.log('Emby Plugin: Playing stream: ' + streamUrl);

            // Открываем плеер Lampa
            Lampa.Player.play(videoObject);
            
            // Задаем плейлист из одного (или более) элементов
            Lampa.Player.playlist([videoObject]);
        }
    };

    // Регистрируем плагин в экосистеме Lampa при загрузке страницы
    if (window.Lampa) {
        EmbyIntegration.init();
    } else {
        window.plugins_init = window.plugins_init || [];
        window.plugins_init.push(function () {
            EmbyIntegration.init();
        });
    }
})();

