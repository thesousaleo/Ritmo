package io.github.thesousaleo.ritmo;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Personalização de cada widget: abre ao colocar o widget na tela inicial
 * e de novo ao tocar e segurar nele e escolher "Reconfigurar" (Android 12 ou mais novo).
 */
public class WidgetConfigActivity extends Activity {

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private String type = WidgetRender.TASKS;

    private static final String[] THEME_IDS = { "app", "light", "dark", "black", "glass" };
    private static final String[] THEME_NAMES = { "Igual ao app", "Claro", "Escuro", "Preto", "Transparente" };

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Bundle extras = getIntent().getExtras();
        if (extras != null) widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        // Fechar sem escolher mantém o widget com o padrão
        setResult(RESULT_OK, result());
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId);
        if (info != null && info.provider != null) type = WidgetRender.typeOf(info.provider.getClassName());
        askContent();
    }

    private Intent result() {
        Intent i = new Intent();
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        return i;
    }

    private AlertDialog.Builder dialog(String title) {
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        int theme = night ? android.R.style.Theme_DeviceDefault_Dialog_Alert : android.R.style.Theme_DeviceDefault_Light_Dialog_Alert;
        return new AlertDialog.Builder(this, theme).setTitle(title).setOnCancelListener(d -> done());
    }

    private void askContent() {
        final List<String> ids = new ArrayList<>();
        final List<String> names = new ArrayList<>();
        JSONObject p = WidgetRender.payload(this);
        String title = "O que mostrar";
        switch (type) {
            case WidgetRender.TASKS: {
                title = "Quais tarefas";
                JSONArray s = p.optJSONArray("sources");
                if (s != null) for (int i = 0; i < s.length(); i++) {
                    JSONObject o = s.optJSONObject(i);
                    if (o == null) continue;
                    ids.add(o.optString("id"));
                    names.add(o.optString("name"));
                }
                if (ids.isEmpty()) {
                    ids.add("today");
                    names.add("Hoje");
                    ids.add("next7");
                    names.add("Próximos 7 dias");
                }
                break;
            }
            case WidgetRender.HABITS: {
                title = "Quais hábitos";
                ids.add("all");
                names.add("Todos de hoje");
                JSONArray s = p.optJSONArray("periods");
                if (s != null) for (int i = 0; i < s.length(); i++) {
                    JSONObject o = s.optJSONObject(i);
                    if (o == null) continue;
                    ids.add(o.optString("id"));
                    names.add("Só " + o.optString("name").toLowerCase());
                }
                break;
            }
            case WidgetRender.AGENDA:
                title = "Quanto da agenda";
                ids.add("2days");
                names.add("Hoje e amanhã");
                ids.add("7days");
                names.add("Próximos 7 dias");
                break;
            case WidgetRender.PROGRESS:
                title = "Progresso de";
                ids.add("both");
                names.add("Hábitos e tarefas");
                ids.add("habits");
                names.add("Só hábitos");
                ids.add("tasks");
                names.add("Só tarefas");
                break;
            case WidgetRender.COUNTDOWN: {
                title = "Contar os dias até";
                ids.add("next");
                names.add("O próximo evento");
                JSONArray s = p.optJSONArray("countdowns");
                if (s != null) for (int i = 0; i < s.length(); i++) {
                    JSONObject o = s.optJSONObject(i);
                    if (o == null) continue;
                    ids.add(o.optString("id"));
                    names.add(o.optString("title"));
                }
                break;
            }
            default:
                askTheme();
                return;
        }
        String cur = WidgetRender.opt(this, widgetId, "source", ids.get(0));
        int checked = Math.max(0, ids.indexOf(cur));
        dialog(title)
            .setSingleChoiceItems(names.toArray(new String[0]), checked, (d, which) -> {
                WidgetRender.setOpt(this, widgetId, "source", ids.get(which));
                d.dismiss();
                askTheme();
            })
            .show();
    }

    private void askTheme() {
        String cur = WidgetRender.opt(this, widgetId, "theme", "app");
        int checked = 0;
        for (int i = 0; i < THEME_IDS.length; i++) if (THEME_IDS[i].equals(cur)) checked = i;
        dialog("Aparência")
            .setSingleChoiceItems(THEME_NAMES, checked, (d, which) -> {
                WidgetRender.setOpt(this, widgetId, "theme", THEME_IDS[which]);
                d.dismiss();
                done();
            })
            .show();
    }

    private void done() {
        WidgetRender.render(this, AppWidgetManager.getInstance(this), widgetId, type);
        setResult(RESULT_OK, result());
        finish();
    }
}
