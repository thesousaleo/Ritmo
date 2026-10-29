package io.github.thesousaleo.ritmo;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Base de todos os widgets: redesenha ao atualizar, ao mudar de tamanho e limpa os ajustes ao remover. */
public abstract class BaseWidget extends AppWidgetProvider {

    abstract String type();

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) WidgetRender.render(ctx, mgr, id, type());
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle options) {
        WidgetRender.render(ctx, mgr, id, type());
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        for (int id : ids) WidgetRender.forget(ctx, id);
    }
}
