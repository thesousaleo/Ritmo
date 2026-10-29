package io.github.thesousaleo.ritmo;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingEvent;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Lembretes por lugar: registra as cercas e mostra a notificação ao chegar. */
public class GeofenceReceiver extends BroadcastReceiver {

    private static PendingIntent pending(Context ctx) {
        Intent i = new Intent(ctx, GeofenceReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, 4711, i, flags);
    }

    /** (Re)registra as cercas salvas. Devolve false se faltar permissão. */
    @SuppressWarnings("MissingPermission")
    static boolean register(Context ctx) {
        GeofencingClient client = LocationServices.getGeofencingClient(ctx);
        client.removeGeofences(pending(ctx));
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return false;
        try {
            JSONArray fences = new JSONArray(ctx.getSharedPreferences(RitmoNativePlugin.PREFS, Context.MODE_PRIVATE).getString("fences", "[]"));
            List<Geofence> list = new ArrayList<>();
            for (int i = 0; i < fences.length() && i < 90; i++) {
                JSONObject f = fences.getJSONObject(i);
                list.add(new Geofence.Builder()
                    .setRequestId(f.getString("id"))
                    .setCircularRegion(f.getDouble("lat"), f.getDouble("lng"), (float) Math.max(100, f.optDouble("radius", 150)))
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                    .build());
            }
            if (list.isEmpty()) return true;
            GeofencingRequest req = new GeofencingRequest.Builder().setInitialTrigger(0).addGeofences(list).build();
            client.addGeofences(req, pending(ctx));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        GeofencingEvent ev = GeofencingEvent.fromIntent(intent);
        if (ev == null || ev.hasError() || ev.getGeofenceTransition() != Geofence.GEOFENCE_TRANSITION_ENTER) return;
        List<Geofence> hit = ev.getTriggeringGeofences();
        if (hit == null) return;
        try {
            JSONArray fences = new JSONArray(ctx.getSharedPreferences(RitmoNativePlugin.PREFS, Context.MODE_PRIVATE).getString("fences", "[]"));
            for (Geofence g : hit) {
                for (int i = 0; i < fences.length(); i++) {
                    JSONObject f = fences.getJSONObject(i);
                    if (f.getString("id").equals(g.getRequestId())) notify(ctx, i, f.optString("title"), f.optString("body"));
                }
            }
        } catch (Exception ignored) {
        }
    }

    @SuppressWarnings("MissingPermission")
    private static void notify(Context ctx, int index, String title, String body) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel("lembretes") == null) {
                nm.createNotificationChannel(new NotificationChannel("lembretes", "Lembretes", NotificationManager.IMPORTANCE_HIGH));
            }
        }
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent pi = open == null ? null : PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        int icon = ctx.getResources().getIdentifier("ic_stat_ritmo", "drawable", ctx.getPackageName());
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, "lembretes")
            .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_map)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true);
        if (pi != null) b.setContentIntent(pi);
        try {
            NotificationManagerCompat.from(ctx).notify(5_000_000 + index, b.build());
        } catch (SecurityException ignored) {
        }
    }
}
