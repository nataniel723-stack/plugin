// CDNMovies (Cdnvideohub) Only Plugin for Lampa
// Version: 3.0 (Wrapper for original online_mod)
(function () {
    'use strict';
    if (!window.Lampa) return;

    // 1. Загружаем оригинальный плагин, у которого работают все сетевые запросы
    var script = document.createElement('script');
    script.src = 'https://nb557.github.io/plugins/online_mod.js';
    script.type = 'text/javascript';
    
    script.onload = function () {
        console.log('Original online_mod loaded successfully');
        
        // 2. Каждую секунду проверяем карточку фильма и убираем лишние кнопки
        setInterval(function () {
            // Находим все кнопки онлайн-мода в карточке
            $('.full-start-new__buttons .selector, .full-start__buttons .selector').each(function () {
                var text = $(this).text().toLowerCase().trim();
                
                // Если кнопка создана оригинальным плагином, но это НЕ Cdnvideohub — удаляем её
                if (text && text !== '' && 
                    text !== 'cdnvideohub' && 
                    text !== 'cdnmovies' &&
                    (
                        $(this).hasClass('online-mod-btn') || // если есть метка оригинального плагина
                        text.indexOf('rezka') > -1 || 
                        text.indexOf('filmix') > -1 || 
                        text.indexOf('kinobase') > -1 || 
                        text.indexOf('vidsrc') > -1 || 
                        text.indexOf('collaps') > -1 || 
                        text.indexOf('hdvb') > -1 || 
                        text.indexOf('ashdi') > -1 || 
                        text.indexOf('voidboost') > -1
                    )
                ) {
                    $(this).remove();
                }
            });
        }, 300);
    };

    script.onerror = function () {
        console.error('Failed to load original online_mod');
    };

    document.head.appendChild(script);
})();
