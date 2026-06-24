(function() {
  'use strict';

  const PLUGIN_NAME = 'Emby';
  const PLUGIN_VERSION = '0.3.1';

  const STORAGE_URL = 'emby_url';
  const STORAGE_API_KEY = 'emby_api_key';

  let currentSerieId = ''; // Глобальная переменная для хранения ID текущего сериала

  // Вспомогательная функция для получения адреса сервера
  function getUrl() {
    return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
  }

  // Вспомогательная функция для получения API ключа
  function getApiKey() {
    return (Lampa.Storage.get(STORAGE_API_KEY, '') || '').trim();
  }

  // Проверяет настроено ли подключение к Emby
  function isConfigured() {
    return getUrl().length > 10 && getApiKey().length > 10;
  }

  // Вспомогательная функция для вывода уведомлений
  function notify(msg) {
    Lampa.Noty.show(msg);
  }

  // Отправляет HTTP-запросы к серверу Emby
  function apiRequest(endpoint, success, error) {
    if (!isConfigured()) {
      notify('Настройте Emby в параметрах');
      return;
    }

    const base = getUrl().replace(/\/$/, '');
    const url = `${base}/emby${endpoint}?api_key=${getApiKey()}`;

    new Lampa.Reguest().silent(url, success, error || (() => {}));
  }

  // Поиск контента в библиотеке Emby
  function findInEmby(movie, callback) {
    if (!movie) return callback(null);

    // Поиск по IMDB ID
    if (movie.imdb_id || movie.imdbid) {
      const imdb = (movie.imdb_id || movie.imdbid).replace('tt', '');
      apiRequest(`/Items?AnyProviderIdEquals=imdb.${imdb}&Fields=Id,Name&Recursive=true&IncludeItemTypes=Movie,Series,Episode`, (data) => {
        if (data?.Items?.[0]) return callback(data.Items[0]);
        searchByTMDB(movie, callback);
      });
      return;
    }

    // Поиск по TMDB ID
    searchByTMDB(movie, callback);
  }

  // Поиск по TMDB ID
  function searchByTMDB(movie, callback) {
    const tmdb = movie.tmdb_id || movie.id;
    if (!tmdb) return searchByName(movie, callback);

    apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}&Fields=Id,Name&Recursive=true`, (data) => {
      callback(data?.Items?.[0]);
    });
  }

  // Поиск по названию
  function searchByName(movie, callback) {
    const title = encodeURIComponent(movie.title || movie.name || '');
    if (!title) return callback(null);

    apiRequest(`/Items?SearchTerm=${title}&Limit=3&Fields=Id,Name&Recursive=true&IncludeItemTypes=Movie,Series`, (data) => {
      callback(data?.Items?.[0]);
    });
  }

  // Получает список сезонов сериала
  function getSeasons(seriesId, callback) {
    apiRequest(`/Shows/${seriesId}/Seasons`, (data) => callback(data.Items || []));
  }

  // Получает список эпизодов сезона
  function getEpisodes(seasonId, callback) {
    apiRequest(`/Items?ParentId=${seasonId}&IncludeItemTypes=Episode`, (data) => callback(data.Items || []));
  }

  // Получает список аудиодорожек эпизода
  function getAudioStreams(episodeId, callback) {
    apiRequest(`/Videos/${episodeId}/MediaSources`, (data) => {
      const streams = data[0]?.MediaStreams || [];
      const audios = streams.filter(s => s.Type === 'Audio');
      callback(audios);
    });
  }

  // Получает список дорожек субтитров эпизода
  function getSubtitleStreams(episodeId, callback) {
    apiRequest(`/Videos/${episodeId}/MediaSources`, (data) => {
      const streams = data[0]?.MediaStreams || [];
      const subtitles = streams.filter(s => s.Type === 'Subtitle');
      callback(subtitles);
    });
  }

  // Получает прямую ссылку на потоковое видео
  function getStreamingUrl(episodeId) {
    return `${getUrl().replace(/\/$/, '')}/Videos/${episodeId}/stream.mp4?static=true&api_key=${getApiKey()}`;
  }

  // Класс для воспроизведения видео из библиотеки Emby
  function embyPlayer(component, object) {
    let network = new Lampa.Reguest();
    let scroll = new Lampa.Scroll({mask: true, over: true});
    let files = new Lampa.Explorer(object);
    let filter = new Lampa.Filter(object);

    this.initialize = function() {
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.body().addClass('torrent-list');
      this.search();
    };

    this.search = function() {
      this.activity.loader(true);
      this.find();
    };

    this.find = function() {
      let movie = object.movie;
      if (!movie) return this.doesNotAnswer();

      findInEmby(movie, (item) => {
        if (!item) return this.doesNotAnswer();

        if (item.Type === 'Series') {
          // Обработка сериала
          currentSerieId = item.Id;
          getSeasons(item.Id, (seasons) => {
            const seasonOptions = seasons.map(s => ({
              label: `Сезон ${s.IndexNumber}`,
              value: s.Id
            }));

            filter.set('season', seasonOptions);
            filter.onSelect('season', (option) => {
              const seasonId = option.value;
              getEpisodes(seasonId, (episodes) => {
                const episodeOptions = episodes.map(e => ({
                  label: `Эпизод ${e.IndexNumber}: ${e.Name}`,
                  value: e.Id
                }));

                filter.set('episode', episodeOptions);
                filter.onSelect('episode', (option) => {
                  const episodeId = option.value;
                  getAudioStreams(episodeId, (audios) => {
                    const audioOptions = audios.map(a => ({
                      label: a.DisplayTitle,
                      value: a.Index
                    }));

                    filter.set('audio', audioOptions);
                    filter.onSelect('audio', (option) => {
                      const audioIndex = option.value;
                      getSubtitleStreams(episodeId, (subtitles) => {
                        const subtitleOptions = subtitles.map(s => ({
                          label: s.Language,
                          value: s.Index
                        }));

                        filter.set('subtitle', subtitleOptions);
                        filter.onSelect('subtitle', (option) => {
                          const subtitleIndex = option.value;
                          playEpisode(episodeId, audioIndex, subtitleIndex);
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        } else {
          // Обработка фильма
          getStreamingUrl(item.Id, (streamingUrl) => {
            if (!streamingUrl) return this.doesNotAnswer();

            Lampa.Player.play({
              title: item.Name,
              url: streamingUrl,
              poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
              timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id))
            });

            this.activity.loader(false);
            this.activity.toggle();
          });
        }
      });
    };

    this.doesNotAnswer = function() {
      this.activity.loader(false);
      this.activity.toggle();
      notify('Контент не найден в библиотеке Emby.');
    };
  }

  // Функция для воспроизведения эпизода сериала
  function playEpisode(episodeId, audioIndex, subtitleIndex) {
    const streamingUrl = getStreamingUrl(episodeId);
    if (!streamingUrl) {
      notify('Ссылка на эпизод не найдена.');
      return;
    }

    Lampa.Player.play({
      title: `Эпизод ${Lampa.Storage.get('emby_selected_episode')}`,
      url: streamingUrl,
      poster: `${getUrl()}/Shows/${currentSerieId}/Images/Primary`,
      timeline: Lampa.Timeline.view(Lampa.Utils.hash(`${currentSerieId}_${Lampa.Storage.get('emby_selected_season')}_${Lampa.Storage.get('emby_selected_episode')}`)),
      audioTrack: audioIndex,
      subtitleTrack: subtitleIndex
    });

    Lampa.Player.on('ended', () => {
      const currentPosition = Lampa.Player.currentTime();
      saveTimeline(episodeId, currentPosition);
    });
  }

  // Функция для сохранения позиции просмотра
  function saveTimeline(episodeId, position) {
    const timelineHash = Lampa.Utils.hash(episodeId);
    Lampa.Timeline.set(timelineHash, position);
  }

  // Функция для получения сохранённой позиции
  function getSavedTimeline(episodeId) {
    const timelineHash = Lampa.Utils.hash(episodeId);
    return Lampa.Timeline.view(timelineHash);
  }

  // Функция для обработки клика по кнопке Emby
  function handleEmbyClick(movie) {
    if (!isConfigured()) {
      notify('Настройте Emby в параметрах');
      return;
    }

    findInEmby(movie, (item) => {
      if (!item) {
        notify('Контент не найден в библиотеке Emby.');
        return;
      }

      if (item.Type === 'Series') {
        // Обработка сериала
        currentSerieId = item.Id;
        getSeasons(item.Id, (seasons) => {
          const seasonOptions = seasons.map(s => ({
            label: `Сезон ${s.IndexNumber}`,
            value: s.Id
          }));

          filter.set('season', seasonOptions);
          filter.onSelect('season', (option) => {
            const seasonId = option.value;
            getEpisodes(seasonId, (episodes) => {
              const episodeOptions = episodes.map(e => ({
                label: `Эпизод ${e.IndexNumber}: ${e.Name}`,
                value: e.Id
              }));

              filter.set('episode', episodeOptions);
              filter.onSelect('episode', (option) => {
                const episodeId = option.value;
                getAudioStreams(episodeId, (audios) => {
                  const audioOptions = audios.map(a => ({
                    label: a.DisplayTitle,
                    value: a.Index
                  }));

                  filter.set('audio', audioOptions);
                  filter.onSelect('audio', (option) => {
                    const audioIndex = option.value;
                    getSubtitleStreams(episodeId, (subtitles) => {
                      const subtitleOptions = subtitles.map(s => ({
                        label: s.Language,
                        value: s.Index
                      }));

                      filter.set('subtitle', subtitleOptions);
                      filter.onSelect('subtitle', (option) => {
                        const subtitleIndex = option.value;
                        playEpisode(episodeId, audioIndex, subtitleIndex);
                      });
                    });
                  });
                });
              });
            });
          });
        });
      } else {
        // Обработка фильма
        const streamingUrl = getStreamingUrl(item.Id);

        Lampa.Player.play({
          title: item.Name,
          url: streamingUrl,
          poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
          timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id))
        });
      }
    });
  }

  // Функция для добавления кнопки Emby
  function addEmbyButton(data) {
    if (!data || !data.render) return;
    if (data.render.find('.emby-button').length) return;

    const button = $(`
      <div class="full-start__button selector view--emby" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
        <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
        <span>${PLUGIN_NAME}</span>
      </div>
    `);

    button.on('hover:enter', function() {
      handleEmbyClick(data.movie || data.card);
    });

    const playButton = data.render.find('.button--play, .view--torrent').first();
    if (playButton.length) {
      playButton.after(button);
    } else {
      data.render.find('.buttons, .activity__body').append(button);
    }
  }

  // Функция для отображения настроек Emby
  function renderSettings(body) {
    body.empty();
    const url = getUrl();
    const key = getApiKey();

    const wrap = $('<div class="settings-container"></div>');
    wrap.append('<div class="settings-param-title">Настройки Emby</div>');

    const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${url || 'Не задано'}</div></div>`);
    urlRow.on('hover:enter', () => {
      Lampa.Input.edit({title: 'Emby URL', value: url, free: true}, (val) => {
        Lampa.Storage.set(STORAGE_URL, val);
        urlRow.find('.settings-param__value').text(val || 'Не задано');
      });
    });

    const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${key ? '••••••••••' : 'Не задано'}</div></div>`);
    keyRow.on('hover:enter', () => {
      Lampa.Input.edit({title: 'Emby API Key', value: key, free: true}, (val) => {
        Lampa.Storage.set(STORAGE_API_KEY, val);
        keyRow.find('.settings-param__value').text(val ? '••••••••••' : 'Не задано');
      });
    });

    wrap.append(urlRow).append(keyRow);
    body.append(wrap);
  }

  // Инициализация настроек
  function initSettings() {
    Lampa.SettingsApi.addComponent({
      component: 'emby',
      name: 'Emby',
      icon: '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>'
    });

    Lampa.Settings.listener.follow('open', function(e) {
      if (e.name === 'emby') renderSettings(e.body);
    });
  }

  // Запуск плагина
  function startPlugin() {
    initSettings();

    Lampa.Listener.follow('full', function(e) {
      if (e.type === 'complite') {
        const data = {
          render: e.object.activity.render(),
          movie: e.data.movie || e.data.card
        };
        addEmbyButton(data);
      }
    });

    console.log(`%c${PLUGIN_NAME} v${PLUGIN_VERSION} загружен`, 'color: #00ff88; font-weight: bold');
  }

  if (window.appready) startPlugin();
  else Lampa.Listener.follow('app', function(e) {
    if (e.type === 'ready') startPlugin();
  });
})();
