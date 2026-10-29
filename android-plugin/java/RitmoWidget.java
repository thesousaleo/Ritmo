package io.github.thesousaleo.ritmo;

import android.content.Context;

/** Widget de tarefas (mantém o nome antigo para os widgets já colocados continuarem funcionando). */
public class RitmoWidget extends BaseWidget {
    @Override
    String type() {
        return WidgetRender.TASKS;
    }

    static void updateAll(Context ctx) {
        WidgetRender.updateAll(ctx);
    }
}
