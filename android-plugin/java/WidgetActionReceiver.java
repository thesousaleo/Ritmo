package io.github.thesousaleo.ritmo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Toques feitos no widget sem abrir o app (concluir tarefa, marcar hábito).
 * O widget muda na hora; a ação fica numa fila que o app aplica (e sincroniza) assim que acorda.
 */
public class WidgetActionReceiver extends BroadcastReceiver {

    static final String ACTION = "io.github.thesousaleo.ritmo.WIDGET_ACTION";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String type = intent.getStringExtra("type");
        String id = intent.getStringExtra("id");
        if (type == null || id == null) return;
        SharedPreferences sp = WidgetRender.prefs(ctx);
        try {
            JSONObject p = WidgetRender.payload(ctx);
            JSONObject queued = new JSONObject();
            queued.put("type", type);
            queued.put("id", id);
            queued.put("date", p.optString("date", ""));
            queued.put("at", System.currentTimeMillis());
            if ("task-done".equals(type)) {
                if (!removeTask(p, id)) return;
            } else if ("habit".equals(type)) {
                JSONObject h = findHabit(p, id);
                if (h == null) return;
                int target = Math.max(1, h.optInt("target", 1));
                int count = h.optInt("count", 0);
                // Um toque soma uma vez; depois de completo, o toque desfaz
                int next = count >= target ? 0 : count + 1;
                h.put("count", next);
                h.put("done", next >= target);
                queued.put("count", next);
                recountHabits(p);
            } else return;
            JSONArray queue = new JSONArray(sp.getString("queue", "[]"));
            queue.put(queued);
            sp.edit().putString("widget", p.toString()).putString("queue", queue.toString()).apply();
        } catch (Exception e) {
            return;
        }
        WidgetRender.updateAll(ctx);
        RitmoNativePlugin.emitWidgetAction();
    }

    static boolean removeTask(JSONObject p, String id) throws Exception {
        boolean found = false;
        boolean inToday = false;
        JSONArray sources = p.optJSONArray("sources");
        if (sources == null) return false;
        for (int i = 0; i < sources.length(); i++) {
            JSONObject s = sources.getJSONObject(i);
            JSONArray tasks = s.optJSONArray("tasks");
            if (tasks == null) continue;
            JSONArray kept = new JSONArray();
            boolean here = false;
            for (int j = 0; j < tasks.length(); j++) {
                JSONObject t = tasks.getJSONObject(j);
                if (id.equals(t.optString("id"))) here = true;
                else kept.put(t);
            }
            if (here) {
                found = true;
                if ("today".equals(s.optString("id"))) inToday = true;
                s.put("tasks", kept);
                s.put("count", Math.max(0, s.optInt("count", 0) - 1));
            }
        }
        if (found) {
            if (inToday) p.put("tasksOpen", Math.max(0, p.optInt("tasksOpen", 0) - 1));
            p.put("tasksDone", p.optInt("tasksDone", 0) + 1);
        }
        return found;
    }

    static JSONObject findHabit(JSONObject p, String id) {
        JSONArray hs = p.optJSONArray("habits");
        if (hs == null) return null;
        for (int i = 0; i < hs.length(); i++) {
            JSONObject h = hs.optJSONObject(i);
            if (h != null && id.equals(h.optString("id"))) return h;
        }
        return null;
    }

    static void recountHabits(JSONObject p) throws Exception {
        JSONArray hs = p.optJSONArray("habits");
        int done = 0;
        int total = 0;
        if (hs != null) {
            for (int i = 0; i < hs.length(); i++) {
                JSONObject h = hs.optJSONObject(i);
                if (h == null || h.optBoolean("weekly")) continue;
                total++;
                if (h.optBoolean("done")) done++;
            }
        }
        p.put("habitsDone", done);
        p.put("habitsTotal", total);
    }
}
