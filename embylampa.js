(function() {
  'use strict';

  const PLUGIN_NAME = 'Emby';
  const PLUGIN_VERSION = '2.4.0';

  const STORAGE_URL = 'emby_url';
  const STORAGE_API_KEY = 'emby_api_key';

  let currentSerieId = '';

  function getUrl() {
    return (Lampa.Storage.get(STORAGE_URL, 'http://192.168.1.145:8096') || '').trim();
  }

  function getApiKey() {
    return (Lampa.Storage.get(STORAGE_API_KEY, '78b3967970814692b20b095e5b13f0eb') || '').trim();
  }

  function isConfigured() {
    return getUrl().length > 10 && getApiKey().length > 10;
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

  function findInEmby(movie, callback) {
    if (!movie) return callback(null);

    const fields = '&Fields=Id,Name&Recursive=true&IncludeItemTypes=Movie,Series,Episode';

    if (movie.imdb_id || movie.imdbid) {
      const imdb = (movie.imdb_id || movie.imdbid).replace('tt', '');
      apiRequest(`/Items?AnyProviderIdEquals=imdb.${imdb}${fields}`, (data) => {
        if (data?.Items?.[0]) return callback(data.Items[0]);
        searchByTMDB(movie, callback);
      });
      return;
    }

    searchByTMDB(movie, callback);
  }

  function searchByTMDB(movie, callback) {
    const tmdb = movie.tmdb_id || movie.id;
    if (!tmdb) return searchByName(movie, callback);

    const fields = '&Fields=Id,Name&Recursive=true';
    apiRequest(`/Items?AnyProviderIdEquals=tmdb.${tmdb}${fields}`, (data) => {
      callback(data?.Items?.[0]);
    });
  }

  function searchByName(movie, callback) {
    const title = encodeURIComponent(movie.title || movie.name || '');
    if (!title) return callback(null);

    const fields = '&Fields=Id,Name&Recursive=true&IncludeItemTypes=Movie,Series';
    apiRequest(`/Items?SearchTerm=${title}&Limit=3${fields}`, (data) => {
      callback(data?.Items?.[0]);
    });
  }

  function getSeasons(seriesId, callback) {
    apiRequest(`/Shows/${seriesId}/Seasons`, (data) => callback(data.Items || []));
  }

  function getEpisodes(seasonId, callback) {
    apiRequest(`/Items?ParentId=${seasonId}&IncludeItemTypes=Episode`, (data) => callback(data.Items || []));
  }

  function getAudioStreams(episodeId, callback) {
    apiRequest(`/Videos/${episodeId}/MediaSources`, (data) => {
      const streams = data[0]?.MediaStreams || [];
      const audios = streams.filter(s => s.Type === 'Audio');
      callback(audios);
    });
  }

  function getSubtitleStreams(episodeId, callback) {
    apiRequest(`/Videos/${episodeId}/MediaSources`, (data) => {
      const streams = data[0]?.MediaStreams || [];
      const subtitles = streams.filter(s => s.Type === 'Subtitle');
      callback(subtitles);
    });
  }

  function getStreamingUrl(episodeId) {
    return `${getUrl().replace(/\/$/, '')}/Videos/${episodeId}/stream.mp4?static=true&api_key=${getApiKey()}`;
  }

  function saveTimeline(episodeId, position) {
    const timelineHash = Lampa.Utils.hash(episodeId);
    Lampa.Timeline.set(timelineHash, position);
  }

  function getSavedTimeline(episodeId) {
    const timelineHash = Lampa.Utils.hash(episodeId);
    return Lampa.Timeline.view(timelineHash);
  }

  function emby(component, object) {
    let network = new Lampa.Reguest();
    let extract = {};
    let results = [];
    let objectData = object;
    let waitSimilars;
    let filterItems = {};
    let choice = {
      season: 0,
      voice: 0,
      voiceName: ''
    };

    this.search = function(object, sim) {
      if (waitSimilars) this.find(sim[0].id);
    };

    function normalizeString(str) {
      return str.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
    }

    this.searchByTitle = function(object, query) {
      objectData = object;
      const year = parseInt(((object.movie.release_date || object.movie.first_air_date || '0000') + '').slice(0, 4));
      const orig = object.movie.original_name || object.movie.original_title;
      const url = `/Items?SearchTerm=${encodeURIComponent(query)}&Fields=Id,Name&Recursive=true&IncludeItemTypes=Movie,Series,Episode`;
      apiRequest(url, (json) => {
        if (!json || !Array.isArray(json.Items)) {
          component.doesNotAnswer();
          return;
        }

        const cards = json.Items.filter(c => {
          c.year = parseInt(c.Year || c.AltName.split('-').pop());
          return c.year > year - 2 && c.year < year + 2;
        });

        const card = cards.find(c => c.year == year && normalizeString(c.OriginalTitle) == normalizeString(orig));

        if (!card) {
          card = cards.find(c => normalizeString(c.OriginalTitle) == normalizeString(orig));
        }

        if (!card && cards.length == 1) card = cards[0];
        if (card) this.find(card.Id);
        else if (cards.length) {
          waitSimilars = true;
          component.similars(cards);
          component.loading(false);
        } else component.doesNotAnswer();
      });
    };

    this.find = function(embyId) {
      apiRequest(`/Items/${embyId}?Fields=Id,Name,Type`, (item) => {
        if (!item) return component.doesNotAnswer();

        if (item.Type === 'Series') {
          currentSerieId = item.Id;
          getSeasons(item.Id, (seasons) => {
            const seasonOptions = seasons.map(s => ({
              label: `Сезон ${s.IndexNumber}`,
              value: s.Id
            }));

            filterItems = {
              season: seasonOptions,
              voice: [], // Для озвучек пока оставляем пустым
              voiceInfo: []
            };

            this.filter(filterItems, choice);
            this.selected(filterItems);
          });
        } else {
          const streamingUrl = getStreamingUrl(item.Id);
          if (!streamingUrl) return component.doesNotAnswer();

          Lampa.Player.play({
            title: item.Name,
            url: streamingUrl,
            poster: item.PrimaryImageTag ? `${getUrl()}/Items/${item.Id}/Images/Primary?tag=${item.PrimaryImageTag}` : '',
            timeline: Lampa.Timeline.view(Lampa.Utils.hash(item.Id))
          });

          component.loading(false);
        }
      });
    };

    this.extendChoice = function(saved) {
      Lampa.Arrays.extend(choice, saved, true);
    };

    this.reset = function() {
      component.reset();
      choice = {
        season: 0,
        voice: 0,
        voiceName: ''
      };
      extractData(results);
      filter();
      append(filtered());
      component.saveChoice(choice);
    };

    this.filter = function(type, a, b) {
      choice[a.stype] = b.index;
      if (a.stype == 'voice') choice.voiceName = filterItems.voice[b.index];
      component.reset();
      extractData(results);
      filter();
      append(filtered());
      component.saveChoice(choice);
    };

    this.destroy = function() {
      network.clear();
      results = null;
    };

    function success(json) {
      results = json;
      extractData(json);
      filter();
      const items = filtered();

      if (!items.length) {
        component.doesNotAnswer();
        return;
      }

      append(items);
    }

    function extractData(data) {}

    function filter() {
      filterItems = {
        season: [],
        voice: [],
        voiceInfo: []
      };

      if (currentSerieId) {
        getSeasons(currentSerieId, (seasons) => {
          const seasonOptions = seasons.map(s => ({
            label: `Сезон ${s.IndexNumber}`,
            value: s.Id
          }));

          filterItems.season = seasonOptions;
          this.filter(filterItems, choice);
          this.selected(filterItems);
        });
      }
    }

    function filtered() {
      const filtered = [];

      if (currentSerieId) {
        const seasonId = filterItems.season[choice.season].value;
        getEpisodes(seasonId, (episodes) => {
          episodes.forEach(episode => {
            filtered.push({
              episode: episode.IndexNumber,
              season: episode.ParentIndexNumber,
              title: `Эпизод ${episode.IndexNumber}`,
              quality: 'SD',
              translation: 'Основной звук',
              voiceName: 'Основной звук'
            });
          });
        });
      }

      return filtered;
    }

    function toPlayElement(element) {
      const episodeId = element.id;
      const streamingUrl = getStreamingUrl(episodeId);
      const play = {
        title: element.title,
        url: streamingUrl,
        timeline: element.timeline,
        callback: element.mark
      };
      return play;
    }

    function append(items) {
      component.reset();
      component.draw(items, {
        similars: waitSimilars,
        onEnter: function(item, html) {
          const extra = toPlayElement(item);
          if (extra.url) {
            const playlist = [];
            const first = toPlayElement(item);
            playlist.push(first);
            Lampa.Player.play(first);
            Lampa.Player.playlist(playlist);
            item.mark();
          } else Lampa.Noty.show('Не удалось извлечь ссылку');
        },
        onContextMenu: function(item, html, data, call) {
          call(toPlayElement(item));
        }
      });
    }
  }

  function component(object) {
    let network = new Lampa.Reguest();
    let scroll = new Lampa.Scroll({mask: true, over: true});
    let files = new Lampa.Explorer(object);
    let filter = new Lampa.Filter(object);
    let sources = {
      emby: emby
    };
    let last;
    let extended;
    let selectedId;
    let source;
    let balancer = 'emby';
    let initialized;
    let balancerTimer;
    let images = [];
    let filterTranslate = {
      season: 'Сезон',
      voice: 'Озвучка',
      source: 'Источник'
    };

    this.initialize = function() {
      source = this.createSource();

      filter.onSearch = function(value) {
        Lampa.Activity.replace({
          search: value,
          clarification: true
        });
      };

      filter.onBack = function() {
        this.start();
      };

      filter.render().find('.selector').on('hover:enter', function() {
        clearInterval(balancerTimer);
      });

      filter.onSelect = function(type, a, b) {
        if (type == 'filter') {
          if (a.reset) {
            if (extended) source.reset();
            else this.start();
          } else {
            source.filter(type, a, b);
          }
        } else if (type == 'sort') {
          Lampa.Select.close();
        }
      };

      if (filter.addButtonBack) filter.addButtonBack();
      filter.render().find('.filter--sort').remove();
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.body().addClass('torrent-list');
      scroll.minus(files.render().find('.explorer__files-head'));
      this.search();
    };

    this.createSource = function() {
      return new sources[balance](this, object);
    };

    this.create = function() {
      return this.render();
    };

    this.search = function() {
      this.activity.loader(true);
      this.find();
    };

    this.find = function() {
      if (source.searchByTitle) {
        this.extendChoice();
        source.searchByTitle(object, object.search || object.movie.original_title || object.movie.original_name || object.movie.title || object.movie.name);
      }
    };

    this.getChoice = function(forBalancer) {
      const data = Lampa.Storage.cache('online_choice_' + (forBalancer || balance), 3000, {});
      const save = data[selectedId || object.movie.id] || {};
      Lampa.Arrays.extend(save, {
        season: 0,
        voice: 0,
        voiceName: '',
        voiceId: 0,
        episodesView: {},
        movieView: ''
      });
      return save;
    };

    this.extendChoice = function() {
      extended = true;
      source.extendChoice(this.getChoice());
    };

    this.saveChoice = function(choice, forBalancer) {
      const data = Lampa.Storage.cache('online_choice_' + (forBalancer || balance), 3000, {});
      data[selectedId || object.movie.id] = choice;
      Lampa.Storage.set('online_choice_' + (forBalancer || balance), data);
    };

    this.similars = function(json) {
      json.forEach(elem => {
        const info = [];
        const year = ((elem.StartDate || elem.Year || '') + '').slice(0, 4);
        if (elem.Rating && elem.Rating !== 'null' && elem.FilmId) info.push(Lampa.Template.get('online_prestige_rate', {
          rate: elem.Rating
        }, true));
        if (year) info.push(year);

        if (elem.Countries && elem.Countries.length) {
          info.push((elem.FilmId ? elem.Countries.map(c => c.Country) : elem.Countries).join(', '));
        }

        if (elem.Categories && elem.Categories.length) {
          info.push(elem.Categories.slice(0, 4).join(', '));
        }

        const name = elem.Title || elem.RuTitle || elem.EnTitle || elem.NameRu || elem.NameEn;
        const orig = elem.OrigTitle || elem.NameEn || '';
        elem.Title = name + (orig && orig !== name ? ' / ' + orig : '');
        elem.Time = elem.FilmLength || '';
        elem.Info = info.join('<span class="online-prestige-split">●</span>');
        const item = Lampa.Template.get('online_prestige_folder', elem);
        item.on('hover:enter', () => {
          this.activity.loader(true);
          this.reset();
          object.searchDate = year;
          selectedId = elem.Id;
          this.extendChoice();
          if (source.search) {
            source.search(object, [elem]);
          } else {
            this.doesNotAnswer();
          }
        }).on('hover:focus', e => {
          last = e.target;
          scroll.update($(e.target), true);
        });
        scroll.append(item);
      });
    };

    this.clearImages = function() {
      images.forEach(img => {
        img.onerror = function() {};
        img.onload = function() {};
        img.src = '';
      });
      images = [];
    };

    this.reset = function() {
      last = false;
      clearInterval(balancerTimer);
      network.clear();
      this.clearImages();
      scroll.render().find('.empty').remove();
      scroll.clear();
    };

    this.loading = function(status) {
      if (status) this.activity.loader(true);
      else {
        this.activity.loader(false);
        this.activity.toggle();
      }
    };

    this.filter = function(filterItems, choice) {
      const select = [];

      const add = (type, title) => {
        const need = this.getChoice();
        const items = filterItems[type];
        const subitems = [];
        const value = need[type];
        items.forEach((name, i) => {
          subitems.push({
            title: name.label,
            selected: value == i,
            index: i
          });
        });
        select.push({
          title: title,
          subtitle: items[value].label,
          items: subitems,
          stype: type
        });
      };

      select.push({
        title: 'Сбросить фильтры',
        reset: true
      });

      if (filterItems.season && filterItems.season.length) add('season', 'Сезон');
      if (filterItems.voice && filterItems.voice.length) add('voice', 'Озвучка');

      this.saveChoice(choice);
      filter.set('filter', select);
      this.selected(filterItems);
    };

    this.closeFilter = function() {
      if ($('body').hasClass('selectbox--open')) Lampa.Select.close();
    };

    this.selected = function(filterItems) {
      const need = this.getChoice();
      const select = [];

      for (const i in need) {
        if (filterItems[i] && filterItems[i].length) {
          if (i == 'voice') {
            select.push(`${filterTranslate[i]}: ${filterItems[i][need[i]].label}`);
          } else if (i !== 'source') {
            select.push(`${filterTranslate[i]}: ${filterItems[i][need[i]].label}`);
          }
        }
      }

      filter.chosen('filter', select);
      filter.chosen('sort', [balance]);
    };

    this.getEpisodes = function(season, call) {
      const episodes = [];
      if (typeof object.movie.id == 'number' && object.movie.name) {
        const tmdbUrl = `tv/${object.movie.id}/season/${season}?api_key=${Lampa.TMDB.key()}&language=${Lampa.Storage.get('language', 'ru')}`;
        const baseUrl = Lampa.TMDB.api(tmdbUrl);
        network.timeout(1000 * 10);
        network.native(baseUrl, data => {
          episodes = data.episodes || [];
          call(episodes);
        }, (a, c) => {
          call(episodes);
        });
      } else call(episodes);
    };

    this.append = function(item) {
      item.on('hover:focus', e => {
        last = e.target;
        scroll.update($(e.target), true);
      });
      scroll.append(item);
    };

    this.watched = function(set) {
      const fileId = Lampa.Utils.hash(object.movie.numberOfSeasons ? object.movie.originalName : object.movie.originalTitle);
      const watched = Lampa.Storage.cache('online_watched_last', 5000, {});

      if (set) {
        if (!watched[fileId]) watched[fileId] = {};
        Lampa.Arrays.extend(watched[fileId], set, true);
        Lampa.Storage.set('online_watched_last', watched);
      } else {
        return watched[fileId];
      }
    };

    this.draw = function(items) {
      if (!items.length) return this.empty();
      this.getEpisodes(items[0].season, episodes => {
        const viewed = Lampa.Storage.cache('online_view', 5000, []);
        const serial = object.movie.name ? true : false;
        const fully = window.innerWidth > 480;
        const scrollToElement = false;
        const scrollToMark = false;
        items.forEach((element, index) => {
          const episode = serial && episodes.length && !similars ? episodes.find(e => e.EpisodeNumber == element.episode) : false;
          const episodeNum = element.episode || index + 1;
          const episodeLast = choice.episodesView[element.season];
          Lampa.Arrays.extend(element, {
            info: '',
            quality: '',
            time: Lampa.Utils.secondsToTime((episode ? episode.Runtime : object.movie.runtime) * 60, true)
          });
          const hashTimeline = Lampa.Utils.hash(element.season ? [element.season, element.episode, object.movie.originalTitle].join('') : object.movie.originalTitle);
          const hashBehold = Lampa.Utils.hash(element.season ? [element.season, element.episode, object.movie.originalTitle, element.voiceName].join('') : object.movie.originalTitle + element.voiceName);
          const data = {
            hashTimeline,
            hashBehold
          };
          const info = [];

          if (element.season) {
            element.translateEpisodeEnd = this.getLastEpisode(items);
            element.translateVoice = element.voiceName;
          }

          element.timeline = Lampa.Timeline.view(hashTimeline);

          if (episode) {
            element.title = episode.Name;
            if (element.info.length < 30 && episode.VoteAverage) info.push(Lampa.Template.get('online_prestige_rate', {
              rate: parseFloat(episode.VoteAverage + '').toFixed(1)
            }, true));
            if (episode.AirDate && fully) info.push(Lampa.Utils.parseTime(episode.AirDate).full);
          } else if (object.movie.releaseDate && fully) {
            info.push(Lampa.Utils.parseTime(object.movie.releaseDate).full);
          }

          if (!serial && object.movie.tagline && element.info.length < 30) info.push(object.movie.tagline);
          if (element.info) info.push(element.info);
          if (info.length) element.info = info.map(i => `<span>${i}</span>`).join('<span class="online-prestige-split">●</span>');
          const html = Lampa.Template.get('online_prestige_full', element);
          const loader = html.find('.online-prestige__loader');
          const image = html.find('.online-prestige__img');

          if (!serial) {
            if (choice.movieView == hashBehold) scrollToElement = html;
          } else if (typeof episodeLast !== 'undefined' && episodeLast == episodeNum) {
            scrollToElement = html;
          }

          if (serial && !episode) {
            image.append(`<div class="online-prestige__episode-number">${
              ('0' + (element.episode || index + 1)).slice(-2)
            }</div>`);
            loader.remove();
          } else {
            const img = html.find('img')[0];
            img.onerror = function() {
              img.src = './img/img_broken.svg';
            };

            img.onload = function() {
              image.addClass('online-prestige__img--loaded');
              loader.remove();
              if (serial) image.append(`<div class="online-prestige__episode-number">${
                ('0' + (element.episode || index + 1)).slice(-2)
              }</div>`);
            };

            img.src = Lampa.TMDB.image(
              `t/p/w300${episode ? episode.StillPath : object.movie.backdropPath}`
            );
            images.push(img);
          }

          html.find('.online-prestige__timeline').append(Lampa.Timeline.render(element.timeline));

          if (viewed.indexOf(hashBehold) !== -1) {
            scrollToMark = html;
            html.find('.online-prestige__img').append(`<div class="online-prestige__viewed">${
              Lampa.Template.get('icon_viewed', {}, true)
            }</div>`);
          }

          element.mark = function() {
            viewed = Lampa.Storage.cache('online_view', 5000, []);
            if (viewed.indexOf(hashBehold) == -1) {
              viewed.push(hashBehold);
              Lampa.Storage.set('online_view', viewed);
              if (html.find('.online-prestige__viewed').length == 0) {
                html.find('.online-prestige__img').append(`<div class="online-prestige__viewed">${
                  Lampa.Template.get('icon_viewed', {}, true)
                }</div>`);
              }
            }

            choice = this.getChoice();
            if (!serial) {
              choice.movieView = hashBehold;
            } else {
              choice.episodesView[element.season] = episodeNum;
            }

            this.saveChoice(choice);
            this.watched({
              balancer: balance,
              balancerName: Lampa.Utils.capitalizeFirstLetter(balance),
              voiceId: choice.voiceId,
              voiceName: choice.voiceName || element.voiceName,
              episode: element.episode,
              season: element.season
            });
          };

          element.unmark = function() {
            viewed = Lampa.Storage.cache('online_view', 5000, []);
            if (viewed.indexOf(hashBehold) !== -1) {
              Lampa.Arrays.remove(viewed, hashBehold);
              Lampa.Storage.set('online_view', viewed);
              if (Lampa.Manifest.appDigital >= 177) Lampa.Storage.remove('online_view', hashBehold);
              html.find('.online-prestige__viewed').remove();
            }
          };

          element.timeclear = function() {
            element.timeline.percent = 0;
            element.timeline.time = 0;
            element.timeline.duration = 0;
            Lampa.Timeline.update(element.timeline);
          };

          html.on('hover:enter', () => {
            if (object.movie.id) Lampa.Favorite.add('history', object.movie, 100);
          }).on('hover:focus', e => {
            last = e.target;
            scroll.update($(e.target), true);
          });

          this.contextMenu({
            html,
            element,
            onFile: call => {
              call(toPlayElement(element));
            },
            onClearAllMark: () => {
              items.forEach(elem => {
                elem.unmark();
              });
            },
            onClearAllTime: () => {
              items.forEach(elem => {
                elem.timeclear();
              });
            }
          });

          scroll.append(html);
        });

        if (serial && episodes.length > items.length && !similars) {
          const left = episodes.slice(items.length);
          left.forEach(episode => {
            const info = [];
            if (episode.VoteAverage) info.push(Lampa.Template.get('online_prestige_rate', {
              rate: parseFloat(episode.VoteAverage + '').toFixed(1)
            }, true));
            if (episode.AirDate) info.push(Lampa.Utils.parseTime(episode.AirDate).full);
            const air = new Date((episode.AirDate + '').replace(/-/g, '/'));
            const now = Date.now();
            const day = Math.round((air.getTime() - now) / (24 * 60 * 60 * 1000));
            const txt = Lampa.Lang.translate('full_episode_days_left') + ': ' + day;
            const html = Lampa.Template.get('online_prestige_full', {
              time: Lampa.Utils.secondsToTime((episode ? episode.Runtime : object.movie.runtime) * 60, true),
              info: info.length ? info.map(i => `<span>${i}</span>`).join('<span class="online-prestige-split">●</span>') : '',
              title: episode.Name,
              quality: day > 0 ? txt : ''
            });
            const loader = html.find('.online-prestige__loader');
            const image = html.find('.online-prestige__img');
            const season = items[0] ? items[0].season : 1;
            html.find('.online-prestige__timeline').append(Lampa.Timeline.render(Lampa.Timeline.view(Lampa.Utils.hash([season, episode.EpisodeNumber, object.movie.originalTitle].join('')))
            ));
            const img = html.find('img')[0];

            if (episode.StillPath) {
              img.onerror = function() {
                img.src = './img/img_broken.svg';
              };

              img.onload = function() {
                image.addClass('online-prestige__img--loaded');
                loader.remove();
                image.append(`<div class="online-prestige__episode-number">${
                  ('0' + episode.EpisodeNumber).slice(-2)
                }</div>`);
              };

              img.src = Lampa.TMDB.image(`t/p/w300${episode.StillPath}`);
              images.push(img);
            } else {
              loader.remove();
              image.append(`<div class="online-prestige__episode-number">${
                ('0' + episode.EpisodeNumber).slice(-2)
              }</div>`);
            }

            html.on('hover:focus', e => {
              last = e.target;
              scroll.update($(e.target), true);
            });
            scroll.append(html);
          });
        }

        if (scrollToElement) {
          last = scrollToElement[0];
        } else if (scrollToMark) {
          last = scrollToMark[0];
        }

        Lampa.Controller.enable('content');
      });
    };

    this.contextMenu = function(params) {
      params.html.on('hover:long', () => {
        function show(extra) {
          const enabled = Lampa.Controller.enabled().name;
          const menu = [];

          if (Lampa.Platform.is('webos')) {
            menu.push({
              title: Lampa.Lang.translate('player_lauch') + ' - Webos',
              player: 'webos'
            });
          }

          if (Lampa.Platform.is('android')) {
            menu.push({
              title: Lampa.Lang.translate('player_lauch') + ' - Android',
              player: 'android'
            });
          }

          menu.push({
            title: Lampa.Lang.translate('player_lauch') + ' - Lampa',
            player: 'lampa'
          });
          menu.push({
            title: Lampa.Lang.translate('online_video'),
            separator: true
          });
          menu.push({
            title: Lampa.Lang.translate('torrent_parser_label_title'),
            mark: true
          });
          menu.push({
            title: Lampa.Lang.translate('torrent_parser_label_cancel_title'),
            unmark: true
          });
          menu.push({
            title: Lampa.Lang.translate('time_reset'),
            timeclear: true
          });

          if (extra) {
            menu.push({
              title: Lampa.Lang.translate('copy_link'),
              copylink: true
            });
          }

          menu.push({
            title: Lampa.Lang.translate('more'),
            separator: true
          });

          if (Lampa.Account.logged() && params.element && typeof params.element.season !== 'undefined' && params.element.translateVoice) {
            menu.push({
              title: Lampa.Lang.translate('online_voice_subscribe'),
              subscribe: true
            });
          }

          menu.push({
            title: Lampa.Lang.translate('online_clear_all_marks'),
            clearallmark: true
          });
          menu.push({
            title: Lampa.Lang.translate('online_clear_all_timecodes'),
            timeclearall: true
          });
          Lampa.Select.show({
            title: Lampa.Lang.translate('title_action'),
            items: menu,
            onBack: () => {
              Lampa.Controller.toggle(enabled);
            },
            onSelect: a => {
              if (a.mark) params.element.mark();
              if (a.unmark) params.element.unmark();
              if (a.timeclear) params.element.timeclear();
              if (a.clearallmark) params.onClearAllMark();
              if (a.timeclearall) params.onClearAllTime();
              Lampa.Controller.toggle(enabled);

              if (a.player) {
                Lampa.Player.runas(a.player);
                params.html.trigger('hover:enter');
              }

              if (a.copylink) {
                if (extra.quality) {
                  const qual = [];
                  for (const i in extra.quality) {
                    qual.push({
                      title: i,
                      file: extra.quality[i]
                    });
                  }

                  Lampa.Select.show({
                    title: Lampa.Lang.translate('settings_server_links'),
                    items: qual,
                    onBack: () => {
                      Lampa.Controller.toggle(enabled);
                    },
                    onSelect: b => {
                      Lampa.Utils.copyTextToClipboard(b.file, () => {
                        Lampa.Noty.show(Lampa.Lang.translate('copy_secuses'));
                      }, () => {
                        Lampa.Noty.show(Lampa.Lang.translate('copy_error'));
                      });
                    }
                  });
                } else {
                  Lampa.Utils.copyTextToClipboard(extra.file, () => {
                    Lampa.Noty.show(Lampa.Lang.translate('copy_secuses'));
                  }, () => {
                    Lampa.Noty.show(Lampa.Lang.translate('copy_error'));
                  });
                }
              }

              if (a.subscribe) {
                Lampa.Account.subscribeToTranslation({
                  card: object.movie,
                  season: params.element.season,
                  episode: params.element.translateEpisodeEnd,
                  voice: params.element.translateVoice
                }, () => {
                  Lampa.Noty.show(Lampa.Lang.translate('online_voice_success'));
                }, () => {
                  Lampa.Noty.show(Lampa.Lang.translate('online_voice_error'));
                });
              }
            }
          });
        }

        params.onFile(show);
      }).on('hover:focus', () => {
        if (Lampa.Helper) Lampa.Helper.show('online_file', Lampa.Lang.translate('helper_online_file'), params.html);
      });
    };

    this.empty = function(msg) {
      const html = Lampa.Template.get('online_does_not_answer', {});
      html.find('.online-empty__buttons').remove();
      html.find('.online-empty__title').text(Lampa.Lang.translate('empty_title_two'));
      scroll.append(html);
      this.loading(false);
    };

    this.doesNotAnswer = function() {
      this.reset();
      const html = Lampa.Template.get('online_does_not_answer', {
        balancer: balance
      });
      scroll.append(html);
      this.loading(false);
    };

    this.getLastEpisode = function(items) {
      let lastEpisode = 0;
      items.forEach(e => {
        if (typeof e.episode !== 'undefined') lastEpisode = Math.max(lastEpisode, parseInt(e.episode));
      });
      return lastEpisode;
    };

    this.start = function() {
      if (Lampa.Activity.active().activity !== this.activity) return;

      if (!initialized) {
        initialized = true;
        this.initialize();
      }

      Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
      Lampa.Controller.add('content', {
        toggle: () => {
          Lampa.Controller.collectionSet(scroll.render(), files.render());
          Lampa.Controller.collectionFocus(last || false, scroll.render());
        },
        up: () => {
          if (Navigator.canmove('up')) {
            Navigator.move('up');
          } else Lampa.Controller.toggle('head');
        },
        down: () => {
          Navigator.move('down');
        },
        right: () => {
          if (Navigator.canmove('right')) Navigator.move('right');
          else filter.show(Lampa.Lang.translate('title_filter'), 'filter');
        },
        left: () => {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        gone: () => {
          clearInterval(balancerTimer);
        },
        back: this.back
      });
      Lampa.Controller.toggle('content');
    };

    this.render = function() {
      return files.render();
    };

    this.back = function() {
      Lampa.Activity.backward();
    };

    this.pause = function() {};

    this.stop = function() {};

    this.destroy = function() {
      network.clear();
      this.clearImages();
      files.destroy();
      scroll.destroy();
      clearInterval(balancerTimer);
      if (source && source.destroy) source.destroy();
      clearInterval(pingAuth);
    };
  }

  function startPlugin() {
    const manifest = {
      type: 'video',
      version: '2.4.0',
      name: 'Emby',
      description: 'Просмотр фильмов и сериалов из локального хранилища Emby',
      component: 'emby_player',
      onContextMenu: object => ({
        name: Lampa.Lang.translate('watch_emby'),
        description: ''
      }),
      onContextLaunch: object => {
        Lampa.Component.add('emby_player', component);
        Lampa.Activity.push({
          url: '',
          title: Lampa.Lang.translate('title_emby'),
          component: 'emby_player',
          search: object.title,
          searchOne: object.title,
          searchTwo: object.originalTitle,
          movie: object,
          page: 1
        });
      }
    };

    Lampa.Manifest.plugins = manifest;
    Lampa.Lang.add({
      watch_emby: {
        ru: 'Смотреть в Emby',
        en: 'Watch in Emby',
        ua: 'Дивитися в Emby',
        zh: '在Emby中观看'
      },
      title_emby: {
        ru: 'Emby',
        en: 'Emby',
        ua: 'Emby',
        zh: 'Emby'
      }
    });

    const button = `
      <div class="full-start__button selector view--emby" data-subtitle="${manifest.version}">
        <svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>
        <span>${Lampa.Lang.translate('watch_emby')}</span>
      </div>
    `;

    Lampa.Listener.follow('full', e => {
      if (e.type == 'complete') {
        const btn = $(Lampa.Lang.translate(button));
        btn.on('hover:enter', () => {
          Lampa.Component.add('emby_player', component);
          Lampa.Activity.push({
            url: '',
            title: Lampa.Lang.translate('title_emby'),
            component: 'emby_player',
            search: e.data.movie.title,
            searchOne: e.data.movie.title,
            searchTwo: e.data.movie.originalTitle,
            movie: e.data.movie,
            page: 1
          });
        });
        e.object.activity.render().find('.view--torrent').after(btn);
      }
    });

    Lampa.Params.select(STORAGE_URL, 'http://192.168.1.145:8096', '');
    Lampa.Params.select(STORAGE_API_KEY, '78b3967970814692b20b095e5b13f0eb', '');

    Lampa.SettingsApi.addComponent({
      component: 'emby_settings',
      name: 'Emby Settings',
      icon: '<svg width="40" height="40" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#00B0FF"/><text x="20" y="27" text-anchor="middle" fill="#fff" font-size="24" font-weight="bold">E</text></svg>'
    });

    Lampa.Settings.listener.follow('open', e => {
      if (e.name != 'emby_settings') return;

      const url = getUrl();
      const key = getApiKey();

      const wrap = $('<div class="settings-container"></div>');
      wrap.append('<div class="settings-param-title">Настройки Emby</div>');

      const urlRow = $(`<div class="settings-param selector"><div class="settings-param__name">Адрес сервера</div><div class="settings-param__value">${url || 'Не задано'}</div></div>`);
      urlRow.on('hover:enter', () => {
        Lampa.Input.edit({title: 'Emby URL', value: url, free: true}, val => {
          Lampa.Storage.set(STORAGE_URL, val);
          urlRow.find('.settings-param__value').text(val || 'Не задано');
        });
      });

      const keyRow = $(`<div class="settings-param selector"><div class="settings-param__name">API Key</div><div class="settings-param__value">${key ? '••••••••••' : 'Не задано'}</div></div>`);
      keyRow.on('hover:enter', () => {
        Lampa.Input.edit({title: 'Emby API Key', value: key, free: true}, val => {
          Lampa.Storage.set(STORAGE_API_KEY, val);
          keyRow.find('.settings-param__value').text(val ? '••••••••••' : 'Не задано');
        });
      });

      wrap.append(urlRow).append(keyRow);
      e.body.append(wrap);
    });

    if (Lampa.Manifest.appDigital >= 177) {
      Lampa.Storage.sync('online_choice_emby', 'object_object');
    }
  }

  if (!window.emby_plugin_loaded && Lampa.Manifest.appDigital >= 155) startPlugin();
  window.emby_plugin_loaded = true;
})();
