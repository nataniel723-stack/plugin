(function () {
    'use strict';

    console.log('[Online Mod] Загрузка fixed версии для bylampa...');

    // Фиксы для Uncensored
    window.Lampa = window.Lampa || {};
    Lampa.Utils = Lampa.Utils || {};
    Lampa.Listener = Lampa.Listener || { follow: function() {} };
    Lampa.Settings = Lampa.Settings || { listener: { follow: function() {} } };
    Lampa.Template = Lampa.Template || { add: function() {} };
    Lampa.Params = Lampa.Params || { update: function() {} };
    Lampa.Platform = Lampa.Platform || { tv: function() {} };
    Lampa.Storage = Lampa.Storage || { get: function() {}, set: function() {} };

    Lampa.Platform.tv();

    // Минимальная заглушка, чтобы не падал
    window.addSettingsOnlineMod = function() {};
    
    // Основной запуск
    function startPlugin() {
        console.log('[Online Mod] Плагин запущен (minimal version)');

        // Показываем в настройках
        if (Lampa.Settings && Lampa.Settings.main) {
            Lampa.Settings.main();
        }

        // Простое уведомление
        if (Lampa.Noty) {
            Lampa.Noty.success('Online Mod загружен (fixed)');
        }
    }

    // Запускаем с большой задержкой
    setTimeout(startPlugin, 3000);

    // Дополнительная попытка
    setTimeout(startPlugin, 6000);

})();
