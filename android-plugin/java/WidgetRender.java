package io.github.thesousaleo.ritmo;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Desenha todos os widgets do Ritmo a partir do pacote que o app guarda (RitmoNativePlugin.updateWidget).
 * Cada widget tem ajustes próprios (o que mostrar e o tema), escolhidos ao colocá-lo na tela inicial.
 */
public final class WidgetRender {

    static final String TASKS = "tasks";
    static final String HABITS = "habits";
    static final String PROGRESS = "progress";
    static final String AGENDA = "agenda";
    static final String COUNTDOWN = "countdown";
    static final String QUICK = "quick";

    static final Class<?>[] PROVIDERS = {
        RitmoWidget.class, HabitsWidget.class, ProgressWidget.class, AgendaWidget.class, CountdownWidget.class, QuickWidget.class,
    };

    private WidgetRender() {
    }

    static String typeOf(String className) {
        if (className.endsWith("HabitsWidget")) return HABITS;
        if (className.endsWith("ProgressWidget")) return PROGRESS;
        if (className.endsWith("AgendaWidget")) return AGENDA;
        if (className.endsWith("CountdownWidget")) return COUNTDOWN;
        if (className.endsWith("QuickWidget")) return QUICK;
        return TASKS;
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(RitmoNativePlugin.PREFS, Context.MODE_PRIVATE);
    }

    static JSONObject payload(Context ctx) {
        try {
            JSONObject p = new JSONObject(prefs(ctx).getString("widget", "{}"));
            rollover(p);
            return p;
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static final java.text.SimpleDateFormat DAY = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);

    static String dayKey(int offset) {
        java.util.Calendar c = java.util.Calendar.getInstance();
        c.add(java.util.Calendar.DAY_OF_MONTH, offset);
        synchronized (DAY) {
            return DAY.format(c.getTime());
        }
    }

    /**
     * O pacote foi montado num dia que já passou (app não foi aberto desde a meia-noite):
     * zera os hábitos diários, desconta os dias das contagens e tira os compromissos que ficaram para trás.
     */
    static void rollover(JSONObject p) throws Exception {
        String built = p.optString("date", "");
        String today = dayKey(0);
        if (built.isEmpty() || built.compareTo(today) >= 0) return;
        int diff = 1;
        try {
            synchronized (DAY) {
                diff = (int) Math.round((DAY.parse(today).getTime() - DAY.parse(built).getTime()) / 86400000.0);
            }
        } catch (Exception ignored) {
        }
        JSONArray hs = p.optJSONArray("habits");
        if (hs != null) {
            for (int i = 0; i < hs.length(); i++) {
                JSONObject h = hs.optJSONObject(i);
                if (h == null || h.optBoolean("weekly")) continue;
                if (!h.optBoolean("done") && h.optInt("streak", 0) > 0) h.put("streak", 0);
                h.put("count", 0);
                h.put("done", false);
            }
        }
        JSONArray cds = p.optJSONArray("countdowns");
        if (cds != null) {
            JSONArray kept = new JSONArray();
            for (int i = 0; i < cds.length(); i++) {
                JSONObject c = cds.optJSONObject(i);
                if (c == null || c.optString("date").compareTo(today) < 0) continue;
                c.put("days", Math.max(0, c.optInt("days", 0) - diff));
                kept.put(c);
            }
            p.put("countdowns", kept);
        }
        JSONArray evs = p.optJSONArray("events");
        if (evs != null) {
            JSONArray kept = new JSONArray();
            for (int i = 0; i < evs.length(); i++) {
                JSONObject e = evs.optJSONObject(i);
                if (e != null && e.optString("date").compareTo(today) >= 0) kept.put(e);
            }
            p.put("events", kept);
        }
        p.put("tasksDone", 0);
        p.put("date", today);
        WidgetActionReceiver.recountHabits(p);
    }

    static String opt(Context ctx, int id, String key, String def) {
        return prefs(ctx).getString("w_" + id + "_" + key, def);
    }

    static void setOpt(Context ctx, int id, String key, String value) {
        prefs(ctx).edit().putString("w_" + id + "_" + key, value).apply();
    }

    static void forget(Context ctx, int id) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        for (String k : new String[] { "source", "theme" }) e.remove("w_" + id + "_" + k);
        e.apply();
    }

    /** Redesenha todos os widgets de todos os tipos. */
    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (Class<?> c : PROVIDERS) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, c));
            if (ids == null) continue;
            for (int id : ids) render(ctx, mgr, id, typeOf(c.getName()));
        }
    }

    /* ---------------- cores ---------------- */
    static final class Palette {
        int bg, ink, muted, line, accent;
        int bgAlpha;
    }

    static Palette palette(Context ctx, JSONObject p, int id) {
        String theme = opt(ctx, id, "theme", "app");
        if ("app".equals(theme)) {
            theme = p.optString("theme", "");
            if (theme.isEmpty()) {
                boolean night = (ctx.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
                theme = night ? "dark" : "light";
            }
        }
        Palette c = new Palette();
        int opacity = Math.max(20, Math.min(100, p.optInt("opacity", 100)));
        c.bgAlpha = Math.round(255 * opacity / 100f);
        switch (theme) {
            case "dark":
                c.bg = 0xFF171E1B; c.ink = 0xFFEBF0EA; c.muted = 0xFF97A29B; c.line = 0xFF2C3632;
                break;
            case "black":
                c.bg = 0xFF000000; c.ink = 0xFFEBF0EA; c.muted = 0xFF8A948D; c.line = 0xFF232826;
                break;
            case "glass":
                c.bg = 0xFF000000; c.ink = 0xFFFFFFFF; c.muted = 0xD9FFFFFF; c.line = 0x55FFFFFF;
                c.bgAlpha = Math.round(c.bgAlpha * 0.32f);
                break;
            default:
                c.bg = 0xFFFAFBF8; c.ink = 0xFF131A16; c.muted = 0xFF5A655F; c.line = 0xFFD5DBD2;
        }
        c.accent = parse(p.optString("accent", ""), "light".equals(theme) ? 0xFF3450E6 : 0xFF8197FF);
        return c;
    }

    static int parse(String hex, int def) {
        try {
            return hex == null || hex.isEmpty() ? def : Color.parseColor(hex);
        } catch (Exception e) {
            return def;
        }
    }

    /* ---------------- intents ---------------- */
    /** Abre o app num endereço ritmo:// (tarefa, foco, nova tarefa...). */
    static PendingIntent open(Context ctx, String url, int req) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.setPackage(ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Ação feita direto no widget (concluir tarefa, marcar hábito), sem abrir o app. */
    static PendingIntent action(Context ctx, String type, String id, int widgetId) {
        Intent i = new Intent(ctx, WidgetActionReceiver.class);
        i.setAction(WidgetActionReceiver.ACTION);
        i.setData(Uri.parse("ritmo-widget://" + type + "/" + Uri.encode(id) + "?w=" + widgetId));
        i.putExtra("type", type);
        i.putExtra("id", id);
        return PendingIntent.getBroadcast(ctx, (type + id + widgetId).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static int rowsFor(AppWidgetManager mgr, int id, int rowDp, int headerDp) {
        Bundle o = mgr.getAppWidgetOptions(id);
        int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (h <= 0) h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        if (h <= 0) h = 180;
        return Math.max(1, Math.min(10, (h - headerDp) / rowDp));
    }

    static void base(RemoteViews v, Palette c) {
        v.setInt(R.id.w_bg, "setColorFilter", c.bg | 0xFF000000);
        v.setInt(R.id.w_bg, "setImageAlpha", c.bgAlpha);
    }

    static void size(RemoteViews v, int viewId, float sp, float scale) {
        v.setTextViewTextSize(viewId, TypedValue.COMPLEX_UNIT_SP, sp * scale);
    }

    /* ---------------- desenho ---------------- */
    static void render(Context ctx, AppWidgetManager mgr, int id, String type) {
        JSONObject p = payload(ctx);
        Palette c = palette(ctx, p, id);
        RemoteViews v;
        try {
            switch (type) {
                case HABITS: v = habits(ctx, mgr, id, p, c); break;
                case PROGRESS: v = progress(ctx, id, p, c); break;
                case AGENDA: v = agenda(ctx, mgr, id, p, c); break;
                case COUNTDOWN: v = countdown(ctx, id, p, c); break;
                case QUICK: v = quick(ctx, id, c); break;
                default: v = tasks(ctx, mgr, id, p, c);
            }
        } catch (Exception e) {
            v = new RemoteViews(ctx.getPackageName(), R.layout.widget_list);
            base(v, c);
            v.setTextViewText(R.id.w_title, "Ritmo");
            v.setTextViewText(R.id.w_empty, "Abra o app para atualizar");
            v.setViewVisibility(R.id.w_empty, View.VISIBLE);
        }
        mgr.updateAppWidget(id, v);
    }

    /** Cabeçalho das listas: título, subtítulo e botão de ação à direita. */
    static RemoteViews listShell(Context ctx, Palette c, float scale, String title, String sub, String plusUrl, int req) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_list);
        base(v, c);
        v.setTextViewText(R.id.w_title, title);
        v.setTextColor(R.id.w_title, c.ink);
        size(v, R.id.w_title, 15, scale);
        v.setTextViewText(R.id.w_sub, sub);
        v.setTextColor(R.id.w_sub, c.accent);
        size(v, R.id.w_sub, 12, scale);
        v.setTextColor(R.id.w_empty, c.muted);
        v.setTextColor(R.id.w_more, c.muted);
        v.setInt(R.id.w_add, "setColorFilter", c.accent);
        v.removeAllViews(R.id.w_rows);
        if (plusUrl != null) {
            v.setViewVisibility(R.id.w_add, View.VISIBLE);
            v.setOnClickPendingIntent(R.id.w_add, open(ctx, plusUrl, req + 1));
        } else v.setViewVisibility(R.id.w_add, View.GONE);
        return v;
    }

    static JSONObject findSource(JSONObject p, String id) {
        JSONArray s = p.optJSONArray("sources");
        if (s == null) return null;
        JSONObject first = null;
        for (int i = 0; i < s.length(); i++) {
            JSONObject o = s.optJSONObject(i);
            if (o == null) continue;
            if (first == null) first = o;
            if (id.equals(o.optString("id"))) return o;
        }
        return first;
    }

    static RemoteViews tasks(Context ctx, AppWidgetManager mgr, int id, JSONObject p, Palette c) {
        float scale = (float) p.optDouble("textScale", 1);
        String sourceId = opt(ctx, id, "source", "today");
        JSONObject src = findSource(p, sourceId);
        String name = src == null ? "Tarefas" : src.optString("name", "Tarefas");
        int count = src == null ? 0 : src.optInt("count", 0);
        String newUrl = "ritmo://new-task" + (sourceId.startsWith("list:") ? "?list=" + Uri.encode(sourceId.substring(5)) : "");
        RemoteViews v = listShell(ctx, c, scale, name, count == 0 ? "" : String.valueOf(count), newUrl, id * 10);
        v.setOnClickPendingIntent(R.id.w_head, open(ctx, "ritmo://tasks/" + Uri.encode(sourceId), id * 10 + 2));
        JSONArray list = src == null ? null : src.optJSONArray("tasks");
        int max = rowsFor(mgr, id, 34, 56);
        int shown = 0;
        if (list != null) {
            for (int i = 0; i < list.length() && shown < max; i++) {
                JSONObject t = list.optJSONObject(i);
                if (t == null) continue;
                RemoteViews r = new RemoteViews(ctx.getPackageName(), R.layout.widget_row_task);
                r.setTextViewText(R.id.r_title, t.optString("title"));
                r.setTextColor(R.id.r_title, c.ink);
                size(r, R.id.r_title, 14, scale);
                String meta = t.optString("meta", "");
                r.setTextViewText(R.id.r_meta, meta);
                r.setViewVisibility(R.id.r_meta, meta.isEmpty() ? View.GONE : View.VISIBLE);
                r.setTextColor(R.id.r_meta, t.optBoolean("late") ? 0xFFD6453D : c.muted);
                size(r, R.id.r_meta, 12, scale);
                r.setInt(R.id.r_check, "setColorFilter", parse(t.optString("color"), c.muted));
                r.setOnClickPendingIntent(R.id.r_check, action(ctx, "task-done", t.optString("id"), id));
                r.setOnClickPendingIntent(R.id.r_body, open(ctx, "ritmo://task/" + Uri.encode(t.optString("id")), (t.optString("id") + id).hashCode()));
                v.addView(R.id.w_rows, r);
                shown++;
            }
        }
        v.setViewVisibility(R.id.w_empty, shown == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, "Tudo em dia por aqui.");
        int more = count - shown;
        v.setViewVisibility(R.id.w_more, more > 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_more, "+" + more);
        return v;
    }

    static RemoteViews habits(Context ctx, AppWidgetManager mgr, int id, JSONObject p, Palette c) {
        float scale = (float) p.optDouble("textScale", 1);
        String period = opt(ctx, id, "source", "all");
        JSONArray all = p.optJSONArray("habits");
        String title = "Hábitos";
        JSONArray periods = p.optJSONArray("periods");
        if (!"all".equals(period) && periods != null) {
            for (int i = 0; i < periods.length(); i++) {
                JSONObject o = periods.optJSONObject(i);
                if (o != null && period.equals(o.optString("id"))) title = o.optString("name", title);
            }
        }
        int done = 0;
        int total = 0;
        if (all != null) {
            for (int i = 0; i < all.length(); i++) {
                JSONObject h = all.optJSONObject(i);
                if (h == null || (!"all".equals(period) && !period.equals(h.optString("period"))) || h.optBoolean("weekly")) continue;
                total++;
                if (h.optBoolean("done")) done++;
            }
        }
        RemoteViews v = listShell(ctx, c, scale, title, total == 0 ? "" : done + "/" + total, "ritmo://new-habit", id * 10);
        v.setOnClickPendingIntent(R.id.w_head, open(ctx, "ritmo://habits", id * 10 + 2));
        int max = rowsFor(mgr, id, 36, 56);
        int shown = 0;
        int listed = 0;
        if (all != null) {
            for (int i = 0; i < all.length(); i++) {
                JSONObject h = all.optJSONObject(i);
                if (h == null || (!"all".equals(period) && !period.equals(h.optString("period")))) continue;
                listed++;
                if (shown >= max) continue;
                RemoteViews r = new RemoteViews(ctx.getPackageName(), R.layout.widget_row_habit);
                boolean isDone = h.optBoolean("done");
                int color = parse(h.optString("color"), c.accent);
                r.setTextViewText(R.id.r_title, h.optString("name"));
                r.setTextColor(R.id.r_title, isDone ? c.muted : c.ink);
                size(r, R.id.r_title, 14, scale);
                int target = h.optInt("target", 1);
                int count = h.optInt("count", 0);
                int streak = h.optInt("streak", 0);
                String meta = target > 1 ? count + " de " + target : "";
                if (streak > 0) meta = (meta.isEmpty() ? "" : meta + " · ") + streak + (h.optBoolean("weekly") ? " sem" : " dias");
                r.setTextViewText(R.id.r_meta, meta);
                r.setViewVisibility(R.id.r_meta, meta.isEmpty() ? View.GONE : View.VISIBLE);
                r.setTextColor(R.id.r_meta, c.muted);
                size(r, R.id.r_meta, 12, scale);
                r.setInt(R.id.r_ring, "setColorFilter", color);
                r.setInt(R.id.r_fill, "setColorFilter", color);
                r.setViewVisibility(R.id.r_fill, isDone ? View.VISIBLE : View.GONE);
                r.setViewVisibility(R.id.r_mark, isDone ? View.VISIBLE : View.GONE);
                r.setViewVisibility(R.id.r_count, !isDone && target > 1 ? View.VISIBLE : View.GONE);
                r.setTextViewText(R.id.r_count, String.valueOf(count));
                r.setTextColor(R.id.r_count, color);
                if (h.optBoolean("timed") && !isDone) {
                    // Hábito com temporizador: abre o app para rodar o tempo
                    r.setOnClickPendingIntent(R.id.r_check, open(ctx, "ritmo://habit/" + Uri.encode(h.optString("id")), (h.optString("id") + "t" + id).hashCode()));
                } else {
                    r.setOnClickPendingIntent(R.id.r_check, action(ctx, "habit", h.optString("id"), id));
                }
                r.setOnClickPendingIntent(R.id.r_body, open(ctx, "ritmo://habit/" + Uri.encode(h.optString("id")), (h.optString("id") + id).hashCode()));
                v.addView(R.id.w_rows, r);
                shown++;
            }
        }
        v.setViewVisibility(R.id.w_empty, shown == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, "Nenhum hábito para hoje.");
        v.setViewVisibility(R.id.w_more, listed > shown ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_more, "+" + (listed - shown));
        return v;
    }

    static RemoteViews agenda(Context ctx, AppWidgetManager mgr, int id, JSONObject p, Palette c) {
        float scale = (float) p.optDouble("textScale", 1);
        String range = opt(ctx, id, "source", "2days");
        RemoteViews v = listShell(ctx, c, scale, "Agenda", "2days".equals(range) ? "Hoje e amanhã" : "7 dias", "ritmo://new-event", id * 10);
        v.setTextColor(R.id.w_sub, c.muted);
        v.setOnClickPendingIntent(R.id.w_head, open(ctx, "ritmo://calendar", id * 10 + 2));
        JSONArray evs = p.optJSONArray("events");
        int max = rowsFor(mgr, id, 40, 56);
        int shown = 0;
        String lastDay = "";
        String today = p.optString("date", "");
        String limit = today;
        try {
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
            java.util.Calendar cal = java.util.Calendar.getInstance();
            cal.setTime(f.parse(today));
            cal.add(java.util.Calendar.DAY_OF_MONTH, "2days".equals(range) ? 1 : 6);
            limit = f.format(cal.getTime());
        } catch (Exception ignored) {
        }
        if (evs != null) {
            for (int i = 0; i < evs.length() && shown < max; i++) {
                JSONObject e = evs.optJSONObject(i);
                if (e == null || e.optString("date").compareTo(limit) > 0) continue;
                RemoteViews r = new RemoteViews(ctx.getPackageName(), R.layout.widget_row_event);
                String evDate = e.optString("date");
                String dayName = evDate.equals(today) ? "Hoje" : evDate.equals(dayKey(1)) ? "Amanhã" : e.optString("day");
                String timeTxt = e.optString("time");
                r.setTextViewText(R.id.r_time, dayName.equals(lastDay) || "Hoje".equals(dayName) ? timeTxt : dayName + " · " + timeTxt);
                lastDay = dayName;
                r.setTextColor(R.id.r_time, parse(e.optString("color"), c.accent));
                size(r, R.id.r_time, 11.5f, scale);
                String title = e.optString("title");
                String loc = e.optString("location", "");
                r.setTextViewText(R.id.r_title, loc.isEmpty() ? title : title + " · " + loc);
                r.setTextColor(R.id.r_title, c.ink);
                size(r, R.id.r_title, 14, scale);
                r.setInt(R.id.r_bar, "setColorFilter", parse(e.optString("color"), c.accent));
                r.setOnClickPendingIntent(R.id.r_body, open(ctx, "ritmo://event/" + Uri.encode(e.optString("id")), (e.optString("id") + e.optString("date") + id).hashCode()));
                v.addView(R.id.w_rows, r);
                shown++;
            }
        }
        v.setViewVisibility(R.id.w_empty, shown == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, "Agenda livre.");
        v.setViewVisibility(R.id.w_more, View.GONE);
        return v;
    }

    /** Anel de progresso desenhado como imagem (RemoteViews não tem anel nativo). */
    static Bitmap ring(float frac, int color, int track) {
        int s = 240;
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint pt = new Paint(Paint.ANTI_ALIAS_FLAG);
        pt.setStyle(Paint.Style.STROKE);
        pt.setStrokeWidth(26);
        pt.setStrokeCap(Paint.Cap.ROUND);
        RectF r = new RectF(18, 18, s - 18, s - 18);
        pt.setColor(track);
        cv.drawArc(r, 0, 360, false, pt);
        if (frac > 0) {
            pt.setColor(color);
            cv.drawArc(r, -90, Math.max(4, 360 * Math.min(1f, frac)), false, pt);
        }
        return b;
    }

    static RemoteViews progress(Context ctx, int id, JSONObject p, Palette c) {
        float scale = (float) p.optDouble("textScale", 1);
        String what = opt(ctx, id, "source", "both");
        int hd = p.optInt("habitsDone", 0);
        int ht = p.optInt("habitsTotal", 0);
        int to = p.optInt("tasksOpen", 0);
        int tdn = p.optInt("tasksDone", 0);
        int done;
        int total;
        String label;
        if ("habits".equals(what)) {
            done = hd; total = ht; label = "hábitos";
        } else if ("tasks".equals(what)) {
            done = tdn; total = tdn + to; label = "tarefas";
        } else {
            done = hd + tdn; total = ht + tdn + to; label = "do dia";
        }
        float frac = total == 0 ? 0 : done / (float) total;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_progress);
        base(v, c);
        v.setImageViewBitmap(R.id.p_ring, ring(frac, c.accent, c.line));
        v.setTextViewText(R.id.p_pct, total == 0 ? "–" : Math.round(frac * 100) + "%");
        v.setTextColor(R.id.p_pct, c.ink);
        size(v, R.id.p_pct, 22, scale);
        v.setTextViewText(R.id.p_label, done + " de " + total + " " + label);
        v.setTextColor(R.id.p_label, c.muted);
        size(v, R.id.p_label, 12, scale);
        String sub = "both".equals(what) ? (ht - hd) + " hábitos · " + to + " tarefas" : "";
        v.setTextViewText(R.id.p_sub, sub);
        v.setViewVisibility(R.id.p_sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextColor(R.id.p_sub, c.muted);
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, "habits".equals(what) ? "ritmo://habits" : "ritmo://tasks/today", id * 10 + 3));
        return v;
    }

    static RemoteViews countdown(Context ctx, int id, JSONObject p, Palette c) {
        float scale = (float) p.optDouble("textScale", 1);
        String want = opt(ctx, id, "source", "next");
        JSONArray list = p.optJSONArray("countdowns");
        JSONObject pick = null;
        if (list != null) {
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.optJSONObject(i);
                if (o == null) continue;
                if (pick == null) pick = o;
                if (want.equals(o.optString("id"))) {
                    pick = o;
                    break;
                }
            }
        }
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_countdown);
        base(v, c);
        if (pick == null) {
            v.setTextViewText(R.id.c_num, "–");
            v.setTextViewText(R.id.c_label, "Sem contagem");
            v.setTextViewText(R.id.c_title, "Marque um evento como contagem regressiva");
        } else {
            int days = pick.optInt("days", 0);
            v.setTextViewText(R.id.c_num, days == 0 ? "Hoje" : String.valueOf(days));
            v.setTextViewText(R.id.c_label, days == 0 ? "" : days == 1 ? "dia para" : "dias para");
            v.setTextViewText(R.id.c_title, pick.optString("title"));
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, "ritmo://event/" + Uri.encode(pick.optString("id")), id * 10 + 4));
        }
        int color = pick == null ? c.accent : parse(pick.optString("color"), c.accent);
        v.setTextColor(R.id.c_num, color);
        size(v, R.id.c_num, 30, scale);
        v.setTextColor(R.id.c_label, c.muted);
        size(v, R.id.c_label, 12, scale);
        v.setTextColor(R.id.c_title, c.ink);
        size(v, R.id.c_title, 14, scale);
        return v;
    }

    static RemoteViews quick(Context ctx, int id, Palette c) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_quick);
        base(v, c);
        int[][] items = {
            { R.id.q1, R.id.q1_icon, R.id.q1_label },
            { R.id.q2, R.id.q2_icon, R.id.q2_label },
            { R.id.q3, R.id.q3_icon, R.id.q3_label },
            { R.id.q4, R.id.q4_icon, R.id.q4_label },
        };
        String[] urls = { "ritmo://new-task", "ritmo://focus", "ritmo://habits", "ritmo://calendar" };
        for (int i = 0; i < items.length; i++) {
            v.setInt(items[i][1], "setColorFilter", i == 0 ? c.accent : c.ink);
            v.setTextColor(items[i][2], c.muted);
            v.setOnClickPendingIntent(items[i][0], open(ctx, urls[i], id * 10 + 5 + i));
        }
        return v;
    }
}
