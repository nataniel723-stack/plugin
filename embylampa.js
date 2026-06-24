(function () {
	'use strict';

	function emby(component, _object) {
		var network = new Lampa.Reguest();
		var extract = {};
		var results = [];
		var object = _object;
		var filter_items = {};
		var choice = {
			season: 0,
			voice: 0,
			voice_name: ''
		};

		// --- НАСТРОЙКИ EMBY ---
		this.getServerUrl = function() {
			var server = Lampa.Storage.get('emby_server');
			if (server && server.indexOf('http') === -1) server = 'http://' + server;
			return server;
		}

		this.getCredentials = function() {
			return {
				username: Lampa.Storage.get('emby_username'),
				password: Lampa.Storage.get('emby_password')
			};
		}

		this.getProxyURL = function (url) {
			var proxy = Lampa.Storage.get('emby_proxy');
			if (proxy) {
				if (proxy.indexOf('http') === -1) proxy = 'http://' + proxy;
				url = proxy + (proxy.endsWith('/') ? '' : '/') + url;
			}
			return url;
		}

		this.levenshtein = function (a, b) {
            // ... (код функции из оригинала)
        }

        this.cleanTitle = function (title) {
            // ... (код функции из оригинала)
        }

        this.transliterate = function (text) {
            // ... (код функции из оригинала)
        }

        this.findSimilarTitles = function (search_zero, search_one, search_two, videoItems) {
            // ... (код функции из оригинала)
        }

        // --- НОВАЯ ЛОГИКА ДЛЯ EMBY ---

        /**
         * Получить токен авторизации Emby
         */
        this.getEmbyToken = async function() {
            const creds = this.getCredentials();
            if (!creds.username || !creds.password) return null;

            const url = `${this.getServerUrl()}/Users/AuthenticateByName`;
            const body = JSON.stringify({
                Username: creds.username,
                Pw: creds.password
            });

            try {
                const response = await network.post(url, body, {
                    'Content-Type': 'application/json'
                });
                const data = JSON.parse(response);
                return data.AccessToken;
            } catch (e) {
                console.error('Emby: Ошибка авторизации', e);
                return null;
            }
        }

        /**
         * Получить список файлов и папок из Emby
         * @param {string} parentId ID родительской папки ('0' для корня)
         * @param {string} searchText Текст для поиска
         */
        this.getEmbyItems = async function(parentId, searchText) {
            var _this = this;
            const serverUrl = _this.getServerUrl();
            if (!serverUrl) {
                Lampa.Noty.show('Emby: не задан адрес сервера');
                return [];
            }

            const token = await _this.getEmbyToken();
            if (!78b3967970814692b20b095e5b13f0eb) {
                Lampa.Noty.show('Emby: не удалось авторизоваться. Проверьте логин и пароль.');
                return [];
            }

            const userId = '00000000-0000-0000-0000-000000000000'; // По умолчанию системный пользователь
            let url = `${serverUrl}/Users/${userId}/Items?`;

            const params = {
                ParentId: parentId,
                Recursive: true,
                Fields: 'Path,Studios,CommunityRating,OfficialRating,Genres',
                Format: 'json',
                api_key: '78b3967970814692b20b095e5b13f0eb'
            };

            if (searchText && searchText.trim() !== '') {
                params.SearchTerm = searchText;
            }

            url += new URLSearchParams(params).toString();

            try {
                const response = await network.get(_this.getProxyURL(url));
                const data = JSON.parse(response);
                // Преобразуем ответ Emby в формат, ожидаемый остальной логикой плагина
                return data.Items.map(item => ({
                    id: item.Id,
                    title: item.Name,
                    type: item.Type === 'Movie' ? 'object.item.videoItem.movie' : 'object.item.videoItem',
                    url: item.Path, // Путь к файлу на сервере или ссылка на стриминг
                    resolution: item.VideoResolution || 'SD', // Примерное качество
                    season: item.ParentIndexNumber,
                    episode: item.IndexNumber,
                    ParentId: item.ParentId
                }));
            } catch (e) {
                Lampa.Noty.show('Emby: Не удалось получить список файлов');
                console.error('Emby getEmbyItems error:', e);
                return [];
            }
        }

        /**
         * Поиск папки в массиве по ее имени и ParentId
         */
        this.findFolderId = function(items, folderName, parentId) {
            for (let folder of items) {
                if (folder.title === folderName && folder.ParentId === parentId && folder.type.includes('container')) {
                    return folder.id;
                }
            }
            return null;
        }

        /**
         * Начать поиск
         * @param {Object} _object 
         */
        this.search = async function (_object) {
            // Используем поиск по названию фильма/сериала
            const items = await this.getEmbyItems('0', _object.search);
            this.processFilesAndDirectories(items);
        };


        /**
         * Обработка списка файлов и папок от Emby
         */
        this.processFilesAndDirectories = async function(filesAndDirectories) {
            const videoItems = filesAndDirectories.filter(item => item.type.includes('videoItem'));

            // Для поиска похожих названий используем только видеофайлы
            const videoItemsBest3 = this.findSimilarTitles(
                object.search,
                object.search_one,
                object.search_two,
                videoItems
            );

            results = {'player_links': {"movie": []}};

            results['player_links']["movie"] = videoItemsBest3.map(item => ({
                title: item.title,
                quality: item.resolution,
                link: this.getProxyURL(item.url), // Если нужен прямой линк на файл
              translation: item.title + (item.season ? ` S${item.season}` : '')
            }));

             extractData(results);
             append(filtred());
             component.loading(false);
        };


        // Остальные методы (reset, filter, destroy, extractData, getFile, filtred, append)
        // остаются без изменений, так как они работают с уже сформированным массивом `results`
        // ...
    }

    // Компонент остается прежним, меняется только источник данных в sources
    function component(object) {
      // ...
      var sources = {
          emby: new emby(this, object), // Меняем synology на emby
      };
      var balanser = Lampa.Storage.get('emby_balanser', 'emby'); // Меняем ключ хранилища

      // ...
      if (filter_sources.indexOf(balanser) == -1) {
          balanser = 'emby';
          Lampa.Storage.set('emby_balanser', 'emby');
      }
      // ...
    }

    // --- ИЗМЕНЕНИЯ В НАСТРОЙКАХ ---
    Lampa.SettingsApi.addComponent({
      component: 'emby_config',
      name: 'Emby',
      icon: "<svg viewBox=\"0 0 48 48" ... ></svg>" // Можно использовать другой значок или этот же
    });
    Lampa.SettingsApi.addParam({
      component: 'emby_config',
      param: {
        name: 'emby_server',
        type: 'input',
        placeholder: 'http://192.168.1.100:8096',
      default: ''
      },
      field: {
        name: 'Адрес сервера Emby',
        description: 'Укажите полный URL вашего сервера'
      }
    });
    Lampa.SettingsApi.addParam({
      component: 'emby_config',
      param: {
        name: 'emby_username',
        type: 'input',
      default: ''
      },
      field: {
        name: 'Имя пользователя Emby',
        description: 'Учетная запись с доступом к медиа'
      }
    });
    Lampa.SettingsApi.addParam({
      component: 'emby_config',
      param: {
        name: 'emby_password',
        type: 'password',
      default: ''
      },
      field: {
        name: 'Пароль пользователя Emby',
        description: ''
      }
    });
    Lampa.SettingsApi.addParam({
      component: 'emby_config',
      param: {
        name: 'emby_proxy',
        type: 'input',
      default: ''
      },
      field: {
        name: 'Прокси (опционально)',
        description: 'Например, 127.0.0.1:9118/proxy'
      }
    });


    // Регистрация компонента и шаблонов остается такой же, но с префиксом emby_
    Lampa.Component.add('emby', component);
    resetTemplates(); // Если шаблоны были с префиксом synology_nas, их нужно переименовать или создать новые emby_...
    Lampa.Listener.follow('full', function (e) { ... });
}
