(function () {
  'use strict';

  const PLUGIN_NAME = 'Emby';
  const PLUGIN_VERSION = '2.5.0';

  const STORAGE_URL = 'emby_url';
  const STORAGE_API_KEY = 'emby_api_key';

  // --- Базовые утилиты ---
  function getUrl() {
    return (Lampa.Storage.get(STORAGE_URL) || '').trim();
  }

  function getApiKey() {
    return (Lampa.Storage.get(STORAGE_API_KEY) || '').trim();
  }

  function isConfigured() {
    return getUrl().length > 5 && getApiKey().length > 5;
  }

  function notify(msg) {
    Lampa.Noty.show(msg);
  }

  function apiRequest(endpoint, success, error) {
    if (!isConfigured()) {
      notify('Настройте Emby в параметрах');
      return;
    }

    const base = getUrl().replace(/\/$/, '');
    const url = `${base}/emby${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${getApiKey()}`;
    new Lampa.Reguest().silent(url, success, error || (() => {}));
  }

  // --- Поиск контента ---
  function findInEmby(movie, callback) {
    if (!movie) return callback(null);

    const fields = '&Fields=Id,Name,Type,PrimaryImageTag,Genres,Overview,PremiereDate&Recursive=true&IncludeItemTypes=Movie,Series';
    const tmdb = movie.tmdb_id || movie.id;

    if (tmdb) {
      apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, data => {
        const item = data?.Items?.[0];
        if (item) {
          const yearDiff = Math.abs(new Date(item.PremiereDate).getFullYear() - movie.year);
          if (yearDiff <= 1) return callback(item);
        }
        searchByName(movie, callback);
      });
      return;
    }
    searchByName(movie, callback);
  }

  function searchByName(movie, callback) {
    const title = encodeURIComponent(movie.title || movie.name || '');
    if (!title) return callback(null);

    apiRequest(`/Items?SearchTerm=${title}&Limit=3${fields}`, data => {
      const item = data?.Items?.[0];
      if (item) {
        const yearDiff = Math.abs(new Date(item.PremiereDate).getFullYear() - movie.year);
        if (yearDiff <= 1) return callback(item);
      }
      callback(null);
    });
  }

  // --- Запрос эпизодов ---
  function fetchAllEpisodes(seriesId, callback) {
    const params = `ParentId=${seriesId}&IsFolder=false&IncludeItemTypes=Episode&SortBy=ParentIndexNumber,IndexNumber`;
    apiRequest(`/Items?${params}`, data => {
      const episodes = data.Items || [];
      const grouped = {};
      episodes.forEach(ep => {
        const seasonNum = ep.ParentIndexNumber || 1;
        if (!grouped[seasonNum]) grouped[seasonNum] = [];
        grouped[seasonNum].push(ep);
      });
      callback(Object.keys(grouped).map(k => ({
        season: parseInt(k),
        episodes: grouped[k]
      })));
    });
  }

  // --- Воспроизведение ---
  function playEpisode(episodeId) {
    const streamUrl = `${getUrl().replace(/\/$/, '')}/Videos/${episodeId}/stream.mp4?static=true&api_key=${getApiKey()}`;
    apiRequest(`/Items/${episodeId}`, data => {
      const ep = data;
      Lampa.Player.play({
        title: `[S${ep.ParentIndexNumber}E${ep.IndexNumber}] ${ep.SeriesName} — ${ep.Name}`,
        url: streamUrl,
        poster: ep.ImageTags?.Primary ? `${getUrl()}/Items/${ep.Id}/Images/Primary?tag=${ep.ImageTags.Primary}` : '',
        timeline: Lampa.Timeline.view(Lampa.Utils.hash(ep.Id))
      });
    });
  }

  // --- Основной компонент ---
  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({ mask: true });
    var files = new Lampa.Explorer(object);

    this.initialize = function () {
      files.appendFiles(scroll.render());
      this.search();
    };

    this.search = function () {
      this.activity.loader(true);
      this.find();
    };

    this.find = function () {
      findInEmby(object.movie, item => {
        this.activity.loader(false);
        if (!item) {
          this.doesNotAnswer();
          return;
        }

        if (item.Type === 'Series') {
          Lampa.Activity.push({
            name: 'series',
            view: 'seasons',
            id: item.Id,
            title: item.Name,
            poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            data: {
              id: item.Id,
              name: item.Name,
              poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
              genres: item.Genres?.join(', '),
              rating: item.CommunityRating,
              description: item.Overview,
              year: new Date(item.PremiereDate).getFullYear()
            }
          });
        } else {
          // Фильмы
          const streamUrl = `${getUrl().replace(/\/$/, '')}/Videos/${item.Id}/stream.mp4?static=true&api_key=${getApiKey()}`;
          Lampa.Player.play({
            title: item.Name,
            url: streamUrl,
            poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id))
          });
        }
      });
    };

    this.draw = function (items) {
      var _this = this;
      if (!items.length) return this.empty();

      var viewed = Lampa.Storage.cache('online_view', 5000, []);
      var serial = object.movie.name ? true : false;

      items.forEach(function (element) {
        var episode_num = element.IndexNumber || element.Index;
        var hash_behold = Lampa.Utils.hash([element.ParentIndexNumber, episode_num, object.movie.original_title].join(''));

        var info = [];
        if (element.RunTimeTicks && element.RunTimeTicks > 0) {
          var sec = Math.floor((element.RunTimeTicks / 10000000));
          var hours = String(Math.floor(sec / 3600)).padStart(2,'0');
          var minutes = String(Math.floor((sec % 3600) / 60)).padStart(2,'0');
          var seconds = String(sec % 60).padStart(2,'0');
          info.push(`${hours}:${minutes}:${seconds}`);
        }

        var html = Lampa.Template.get('online_prestige_full', {
          title: element.Name,
          time: info.join(' '),
          quality: '', // Emby обычно отдает один файл в нужном качестве
          info: ''
        });

        html.on('hover:enter', function () {
          playEpisode(element.Id);
        });

        // Метка "просмотрено"
        if (viewed.indexOf(hash_behold) !== -1) {
          html.find('.online-prestige__img').append('<div class="online-prestige__viewed">' + Lampa.Template.get('icon_viewed', {}, true) + '</div>');
        }

        scroll.append(html);
      });

      Lampa.Controller.enable('content');
    };

    this.empty = function () {
      var html = Lampa.Template.get('online_does_not_answer', {});
      html.find('.online-empty__buttons').remove();
      html.find('.online-empty__title').text(Lampa.Lang.translate('empty_title_two'));
      scroll.append(html);
    };

    this.doesNotAnswer = function () {
      this.reset();
      var html = Lampa.Template.get('online_does_not_answer', { balanser: 'emby' });
      scroll.append(html);
    };

    this.reset = function () {
      network.clear();
      scroll.clear();
    };

    this.render = function () {
      return files.render();
    };

    this.start = function () {
      if (!this.initialized) {
        this.initialized = true;
        this.initialize();
      }
      Lampa.Controller.toggle('content');
    };

    this.destroy = function () {
      network.clear();
      scroll.destroy();
    };
  }

  // --- Хук на открытие страницы сезонов ---
  Lampa.Listener.follow('activity', e => {
    if (e.type !== 'push' || e.data.view !== 'seasons') return;

    var activityObj = e.object;
    var serieData = e.data.data; // Данные сериала из объекта активности

    activityObj.loader(true);
    fetchAllEpisodes(serieData.id, seasons => {
        // Преобразуем структуру для метода draw()
        var itemsToDraw = seasons.flatMap(s => s.episodes);
        activityObj.loader(false);

        if (!itemsToDraw.length) {
            activityObj.doesNotAnswer();
            return;
        }

        // Создаем компонент и отрисовываем эпизоды
        var comp = new component({
            movie: { name: serieData.name }, // Указываем что это сериал для корректной логики в draw()
            activity: activityObj,
            render: activityObj.render()
        });
        comp.draw(itemsToDraw);
    });
});


// --- Кнопка в карточке фильма/сериала ---
function addEmbyButton(data) {
    if (!data || !data.render || !data.movie) return;
    if (data.render.find('.emby-button').length) return;

    const button = $(`
        <div class="full-start__button selector view--emby" data-subtitle="${PLUGIN_NAME} v${PLUGIN_VERSION}">
            <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
            <span>${PLUGIN_NAME}</span>
        </div>
    `).on('hover:enter', () => handleEmbyClick(data.movie));

    const playButton = data.render.find('.button--play, .view--torrent').first();
    if (playButton.length) playButton.after(button);
}


// --- Обработчик нажатия кнопки ---
function handleEmbyClick(movie) {
   if (!isConfigured()) {
       notify('Настройте Emby в параметрах');
       return;
   }
   // Поиск и запуск происходит через хуки выше.
   // Здесь мы просто инициируем переход.
   findInEmby(movie, item => {}); // Функция сама поймет что делать (фильм или сериал)
}


// --- Настройки плагина ---
function renderSettings(body) {
   body.empty();
   const wrap = $('<div class="settings-container"></div>');
   wrap.append('<div class="settings-param-title">Настройки Emby</div>');

   const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${getUrl() || 'Не задано'}</div></div>`)
       .on('hover:enter', () => editInput('URL', STORAGE_URL));
   const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${getApiKey() ? '••••••••••' : 'Не задано'}</div></div>`)
       .on('hover:enter', () => editInput('API Key', STORAGE_API_KEY));
   wrap.append(urlRow).append(keyRow);
   body.append(wrap);
}
function editInput(title, storageKey) {
   Lampa.Input.edit({title: `Emby ${title}`, value: Lampa.Storage.get(storageKey), free: true}, val => {
       Lampa.Storage.set(storageKey, val.trim());
       window.location.reload();
   });
}


// --- Инициализация ---
function initSettings() {
   Lampa.SettingsApi.addComponent({
       component: 'emby',
       name: 'Emby',
       icon: '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>'
   });
   Lampa.Settings.listener.follow('open', e => { if (e.name === 'emby') renderSettings(e.body); });
}


function startPlugin() {
   initSettings();
   Lampa.Listener.follow('full', e => { if (e.type === 'complite') addEmbyButton(e.object); });
}


if (window.appready) startPlugin();
else Lampa.Listener.follow('app', e => { if (e.type === 'ready') startPlugin(); });
})();
