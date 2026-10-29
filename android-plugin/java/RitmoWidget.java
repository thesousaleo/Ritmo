package io.github.thesousaleo.ritmo;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/** Widget da tela inicial: tarefas de hoje e hábitos feitos. Os dados chegam do app pelo RitmoNativePlugin. */
public class RitmoWidget extends AppWidgetProvider {

    private static final int[] ROWS = { R.id.w_t1, R.id.w_t2, R.id.w_t3, R.id.w_t4, R.id.w_t5 };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, RitmoWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews views = build(ctx);
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    private static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_ritmo);
        String json = ctx.getSharedPreferences(RitmoNativePlugin.PREFS, Context.MODE_PRIVATE).getString("widget", "{}");
        int shown = 0;
        int total = 0;
        try {
            JSONObject o = new JSONObject(json);
            JSONArray tasks = o.optJSONArray("tasks");
            total = tasks == null ? 0 : tasks.length();
            int hd = o.optInt("habitsDone", 0);
            int ht = o.optInt("habitsTotal", 0);
            v.setTextViewText(R.id.w_habits, ht > 0 ? "Hábitos " + hd + "/" + ht : "");
            for (int i = 0; i < ROWS.length; i++) {
                if (tasks != null && i < tasks.length()) {
                    JSONObject t = tasks.getJSONObject(i);
                    String time = t.optString("time", "");
                    String prefix = t.optBoolean("late") ? "! " : "• ";
                    v.setTextViewText(ROWS[i], prefix + (time.isEmpty() ? "" : time + "  ") + t.optString("title"));
                    v.setViewVisibility(ROWS[i], View.VISIBLE);
                    shown++;
                } else v.setViewVisibility(ROWS[i], View.GONE);
            }
        } catch (Exception e) {
            for (int r : ROWS) v.setViewVisibility(r, View.GONE);
        }
        v.setTextViewText(R.id.w_title, total == 0 ? "Hoje: tudo em dia" : "Hoje: " + total + (total == 1 ? " tarefa" : " tarefas"));
        v.setViewVisibility(R.id.w_more, total > shown ? View.VISIBLE : View.GONE);
        if (total > shown) v.setTextViewText(R.id.w_more, "+" + (total - shown));
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open != null) {
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(R.id.w_root, pi);
        }
        return v;
    }
}
