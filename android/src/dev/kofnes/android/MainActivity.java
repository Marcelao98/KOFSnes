package dev.kofnes.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * KOFnes no Android: uma WebView em tela cheia que abre o KOFnes-android.html guardado dentro do app
 * (assets/index.html), servido em https://appassets.androidplatform.net/ pra a página ter um endereço seguro
 * (IndexedDB, crypto, WebAssembly). Faz só o que a página não consegue sozinha: escolher arquivo (ROM, .spc),
 * salvar arquivo (pacote de bug, .spc exportado) e abrir links no navegador. Também se atualiza sozinho (Atualizador):
 * a página e os núcleos novos vêm do GitHub e valem na abertura seguinte, sem reinstalar o APK.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int PEDIDO_ARQUIVO = 1, PEDIDO_SALVAR = 2;
    // sobe a cada mudança neste Java: página publicada com casca maior pede APK novo (ela pode usar algo que esta não tem)
    static final int CASCA = 3;
    private static final String FONTE = "https://raw.githubusercontent.com/Marcelao98/KOFSnes/main/publicado/";
    private static final String APK = "https://raw.githubusercontent.com/Marcelao98/KOFSnes/main/android/apk/KOFstation.apk";
    private File raizWeb;   // pasta da versão baixada (null = a que veio dentro do APK)

    private WebView web;
    private ValueCallback<Uri[]> escolha;
    private byte[] paraSalvar;
    private Ps1Jogo ps1;   // PlayStation nativo (null = a ponte não carregou: o app usa o WebAssembly)

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        FrameLayout raiz = new FrameLayout(this);
        raiz.addView(web);
        setContentView(raiz);
        if (Ps1.carregar(null)) ps1 = new Ps1Jogo(this, raiz);
        web.setBackgroundColor(0xFF000000);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        try { WebView.setWebContentsDebuggingEnabled(true); } catch (Throwable t) { /* sem depuração */ }
        web.addJavascriptInterface(new Ponte(), "KOFnesApk");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return servir(u.getPath());
                return null;                       // o resto (capas na internet...) segue normal
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                if (url.startsWith("https://" + HOST)) return false;
                abrirFora(url);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (escolha != null) escolha.onReceiveValue(null);
                escolha = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");                  // o seletor do Android não conhece .sfc/.smc: deixa escolher qualquer arquivo
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(i, "Escolha o arquivo"), PEDIDO_ARQUIVO);
                } catch (ActivityNotFoundException e) {
                    escolha = null;
                    cb.onReceiveValue(null);
                    return false;
                }
                return true;
            }

            // window.open(): a janela nova só serve pra abrir um link (a issue do GitHub), que vai pro navegador
            @Override
            public boolean onCreateWindow(WebView v, boolean dialog, boolean gesto, Message msg) {
                WebView aba = new WebView(MainActivity.this);
                aba.getSettings().setJavaScriptEnabled(true);
                aba.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView w, String url) {
                        abrirFora(url);
                        return true;
                    }
                });
                WebView.WebViewTransport t = (WebView.WebViewTransport) msg.obj;
                t.setWebView(aba);
                msg.sendToTarget();
                return true;
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("KOFnes", m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        final Atualizador at = new Atualizador(new File(getFilesDir(), "web"), FONTE, CASCA, new Atualizador.Embutidos() {
            public InputStream abrir(String nome) throws IOException { return getAssets().open(nome); }
        });
        raizWeb = at.raiz();
        if (b == null) web.loadUrl("https://" + HOST + "/index.html");
        else web.restoreState(b);
        new Thread(new Runnable() {
            public void run() {
                final int r = at.atualizar(raizWeb);
                android.util.Log.d("KOFnes", "atualização: " + r + " " + at.erro);
                runOnUiThread(new Runnable() {
                    public void run() {
                        if (isFinishing()) return;
                        if (r == Atualizador.NOVA) Toast.makeText(MainActivity.this, "KOFstation atualizado: a versão nova abre na próxima vez", Toast.LENGTH_LONG).show();
                        else if (r == Atualizador.CASCA_NOVA) new AlertDialog.Builder(MainActivity.this)
                                .setTitle("KOFstation novo").setMessage("Essa atualização precisa instalar o app de novo (seus jogos e saves continuam). Baixar agora?")
                                .setPositiveButton("Baixar", new DialogInterface.OnClickListener() { public void onClick(DialogInterface d, int w) { abrirFora(APK); } })
                                .setNegativeButton("Depois", null).show();
                    }
                });
            }
        }).start();
    }

    private WebResourceResponse servir(String caminho) {
        String nome = (caminho == null || caminho.equals("/") || caminho.isEmpty()) ? "index.html" : caminho.substring(1);
        try {
            File f = raizWeb == null || nome.contains("..") ? null : new File(raizWeb, nome);
            InputStream in = f != null && f.isFile() ? new FileInputStream(f) : getAssets().open(nome);   // a versão baixada, senão a do APK
            String mime = nome.endsWith(".html") ? "text/html" : nome.endsWith(".js") ? "application/javascript"
                    : nome.endsWith(".png") ? "image/png" : nome.endsWith(".webmanifest") ? "application/manifest+json" : "application/octet-stream";
            return new WebResourceResponse(mime, "utf-8", in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
        }
    }

    private void abrirFora(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(this, "não consegui abrir o link", Toast.LENGTH_SHORT).show();
        }
    }

    /** O que a página enxerga como window.KOFnesApk. */
    public class Ponte {
        @JavascriptInterface
        public void salvar(String nome, String mime, String base64) {
            paraSalvar = Base64.decode(base64, Base64.DEFAULT);
            final Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
            i.putExtra(Intent.EXTRA_TITLE, nome);
            runOnUiThread(new Runnable() {
                public void run() { startActivityForResult(i, PEDIDO_SALVAR); }
            });
        }

        @JavascriptInterface
        public String versao() { return "@VERSAO_NOME@"; }

        // ---- PlayStation nativo (Ps1Jogo): a página chama no lugar do núcleo em WebAssembly ----
        @JavascriptInterface
        public boolean ps1Nativo() { return ps1 != null; }

        /** Prepara o CD e abre; a resposta (JSON) chega em window.__ps1Pronto, porque copiar 500 MB demora. */
        @JavascriptInterface
        public void ps1Abrir(final String nome) {
            new Thread(new Runnable() { public void run() {
                final String r = ps1.abrir(nome);
                runOnUiThread(new Runnable() { public void run() { web.evaluateJavascript("window.__ps1Pronto && window.__ps1Pronto(" + r + ")", null); } });
            } }).start();
        }

        @JavascriptInterface
        public void ps1Pad(int botoes) { ps1.sinal(botoes); }

        @JavascriptInterface
        public void ps1Area(float x, float y, float w, float h) { ps1.area(x, y, w, h); }

        @JavascriptInterface
        public void ps1Fechar() { ps1.fechar(); }

        @JavascriptInterface
        public void ps1Reiniciar() { ps1.reiniciar(); }

        @JavascriptInterface
        public void ps1Volume(float v) { ps1.volume(v); }

        @JavascriptInterface
        public String ps1Estado() { return ps1.estado(); }

        @JavascriptInterface
        public boolean ps1CarregarEstado(String b64) { return ps1.carregarEstado(b64); }
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        super.onActivityResult(pedido, resultado, dados);
        if (pedido == PEDIDO_ARQUIVO && escolha != null) {
            Uri[] r = WebChromeClient.FileChooserParams.parseResult(resultado, dados);
            // vários arquivos (o .cue com os .bin do CD de PlayStation) vêm no ClipData, que o parseResult ignora
            if (resultado == RESULT_OK && dados != null && dados.getClipData() != null && dados.getClipData().getItemCount() > 0) {
                ClipData c = dados.getClipData();
                r = new Uri[c.getItemCount()];
                for (int k = 0; k < r.length; k++) r[k] = c.getItemAt(k).getUri();
            }
            if (ps1 != null && r != null) ps1.ultimaEscolha = r;   // o PS1 nativo copia o CD direto dos arquivos escolhidos
            escolha.onReceiveValue(r);
            escolha = null;
        } else if (pedido == PEDIDO_SALVAR) {
            if (resultado == RESULT_OK && dados != null && dados.getData() != null && paraSalvar != null) {
                try {
                    OutputStream o = getContentResolver().openOutputStream(dados.getData());
                    o.write(paraSalvar);
                    o.close();
                    Toast.makeText(this, "arquivo salvo", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, "não consegui salvar o arquivo", Toast.LENGTH_LONG).show();
                }
            }
            paraSalvar = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle b) {
        super.onSaveInstanceState(b);
        web.saveState(b);
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); if (ps1 != null) ps1.pausar(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); imersivo(); }

    @Override
    public void onWindowFocusChanged(boolean foco) { super.onWindowFocusChanged(foco); if (foco) imersivo(); }

    private void imersivo() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }
}
