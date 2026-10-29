package io.github.thesousaleo.ritmo;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin próprio do Ritmo (widget, ícone, digital, voz, lugares, barra de navegação e diagnóstico)
        registerPlugin(RitmoNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Antes do app carregar, a barra de navegação já segue o modo do sistema (o tema exato vem depois, pelo app)
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        RitmoNativePlugin.paintNavigationBar(getWindow(), Color.parseColor(night ? "#0F1412" : "#ECEFE9"), night);
    }
}
