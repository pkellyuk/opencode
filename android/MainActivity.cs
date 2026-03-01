using Android.Content;
using Android.Graphics;
using Android.OS;
using Android.Util;
using Android.Views;
using Android.Webkit;
using AndroidX.WebKit;
using Java.Interop;

namespace OpenCode.Android;

[Activity(Label = "@string/app_name", MainLauncher = true, Theme = "@style/MainTheme")]
public class MainActivity : Activity
{
    WebView? web;
    WebViewAssetLoader? loader;

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);

        SetContentView(Resource.Layout.activity_main);
        if (Build.VERSION.SdkInt >= BuildVersionCodes.M)
        {
            Window?.SetStatusBarColor(Color.White);
            var decor = Window?.DecorView;
            if (decor is not null) decor.SystemUiVisibility = (StatusBarVisibility)SystemUiFlags.LightStatusBar;
        }

        web = FindViewById<WebView>(Resource.Id.webview);
        if (web is null) return;

        var settings = web.Settings;
        settings.JavaScriptEnabled = true;
        settings.DomStorageEnabled = true;
        settings.AllowFileAccess = false;
        settings.AllowContentAccess = true;
        settings.MixedContentMode = MixedContentHandling.AlwaysAllow;
        settings.JavaScriptCanOpenWindowsAutomatically = true;
        settings.MediaPlaybackRequiresUserGesture = false;
        settings.CacheMode = CacheModes.NoCache;

        loader = new WebViewAssetLoader.Builder()
            .AddPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
            .Build();

        WebView.SetWebContentsDebuggingEnabled(true);
        web.SetWebViewClient(new AssetWebViewClient(loader));
        web.SetWebChromeClient(new AppChromeClient());
        web.AddJavascriptInterface(new AppBridge(this), "Android");

        web.ClearCache(true);
        web.ClearHistory();

        web.LoadUrl("https://appassets.androidplatform.net/");
    }

    public override void OnBackPressed()
    {
        if (web is not null && web.CanGoBack())
        {
            web.GoBack();
            return;
        }

        base.OnBackPressed();
    }
}

sealed class AssetWebViewClient(WebViewAssetLoader loader) : WebViewClient
{
    static readonly string[] ExternalSchemes = ["http", "https", "mailto", "tel"];

    public override bool ShouldOverrideUrlLoading(WebView view, IWebResourceRequest request)
    {
        var url = request.Url;
        if (url is null) return false;

        var scheme = url.Scheme?.ToLowerInvariant();
        if (scheme is null) return false;

        if (scheme is "http" or "https")
        {
            if (url.Host == "appassets.androidplatform.net") return false;
        }

        if (Array.IndexOf(ExternalSchemes, scheme) < 0) return false;

        var intent = new Intent(Intent.ActionView, url);
        view.Context.StartActivity(intent);
        return true;
    }

    public override WebResourceResponse? ShouldInterceptRequest(WebView view, IWebResourceRequest request)
    {
        var path = request.Url?.Path;
        if (path is "/" or "")
        {
            var stream = view.Context.Assets?.Open("index.html");
            if (stream is not null)
            {
                return new WebResourceResponse("text/html", "utf-8", stream);
            }
        }

        if (!string.IsNullOrEmpty(path) && path.Contains("/assets/session-"))
        {
            Log.Info("OpenCodeWebView", $"Requesting session chunk {path}");
        }

        var response = loader.ShouldInterceptRequest(request.Url);
        if (response is not null) return response;
        return base.ShouldInterceptRequest(view, request);
    }

    public override void OnReceivedError(WebView view, IWebResourceRequest request, WebResourceError error)
    {
        Log.Warn("OpenCodeWebView", $"Load error {error.ErrorCode}: {error.Description} ({request.Url})");
        base.OnReceivedError(view, request, error);
    }

    public override void OnReceivedHttpError(WebView view, IWebResourceRequest request, WebResourceResponse errorResponse)
    {
        Log.Warn("OpenCodeWebView", $"HTTP {errorResponse.StatusCode} ({request.Url})");
        base.OnReceivedHttpError(view, request, errorResponse);
    }

    public override void OnPageFinished(WebView view, string? url)
    {
        Log.Info("OpenCodeWebView", $"Loaded {url}");
        base.OnPageFinished(view, url);
    }
}

sealed class AppBridge : Java.Lang.Object
{
    const string PrefName = "opencode";
    const string ServerKey = "default_server_url";
    const string DefaultServerUrl = "http://192.168.0.200:4096";
    readonly ISharedPreferences prefs;

    public AppBridge(Context context)
    {
        prefs = context.GetSharedPreferences(PrefName, FileCreationMode.Private) ?? throw new InvalidOperationException("Missing prefs");
    }

    [JavascriptInterface]
    [Export("getDefaultServer")]
    public string? GetDefaultServer()
    {
        return prefs.GetString(ServerKey, DefaultServerUrl);
    }

    [JavascriptInterface]
    [Export("setDefaultServer")]
    public void SetDefaultServer(string? url)
    {
        var next = string.IsNullOrWhiteSpace(url) ? null : url.Trim();
        var editor = prefs.Edit();
        if (next is null) editor.Remove(ServerKey);
        else editor.PutString(ServerKey, next);
        editor.Apply();
    }
}

sealed class AppChromeClient : WebChromeClient
{
    public override bool OnConsoleMessage(ConsoleMessage? consoleMessage)
    {
        if (consoleMessage is null) return base.OnConsoleMessage(consoleMessage);
        Log.Warn("OpenCodeWebView", $"{consoleMessage.Message()} ({consoleMessage.SourceId()}:{consoleMessage.LineNumber()})");
        return base.OnConsoleMessage(consoleMessage);
    }
}
