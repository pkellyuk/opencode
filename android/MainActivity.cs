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
    const int FileChooserRequestCode = 0x5142;
    WebView? web;
    WebViewAssetLoader? loader;
    IValueCallback? pendingFilePathCallback;

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
        web.SetWebChromeClient(new AppChromeClient(this));
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

    internal bool LaunchFileChooser(IValueCallback? callback, WebChromeClient.FileChooserParams? fileChooserParams)
    {
        if (callback is null) return false;

        // Cancel any stale callback before opening a new picker.
        pendingFilePathCallback?.OnReceiveValue(null);
        pendingFilePathCallback = callback;

        var intent = fileChooserParams?.CreateIntent() ?? new Intent(Intent.ActionGetContent);
        intent.AddCategory(Intent.CategoryOpenable);
        intent.SetType("*/*");

        try
        {
#pragma warning disable CS0618
            StartActivityForResult(Intent.CreateChooser(intent, "Select file"), FileChooserRequestCode);
#pragma warning restore CS0618
            return true;
        }
        catch (ActivityNotFoundException ex)
        {
            Log.Warn("OpenCodeWebView", $"No activity found to pick files: {ex.Message}");
            pendingFilePathCallback?.OnReceiveValue(null);
            pendingFilePathCallback = null;
            return false;
        }
    }

    protected override void OnActivityResult(int requestCode, Result resultCode, Intent? data)
    {
        if (requestCode != FileChooserRequestCode)
        {
            base.OnActivityResult(requestCode, resultCode, data);
            return;
        }

        var callback = pendingFilePathCallback;
        pendingFilePathCallback = null;
        if (callback is null) return;

        global::Android.Net.Uri[]? result = null;
        try
        {
            result = WebChromeClient.FileChooserParams.ParseResult((int)resultCode, data);
        }
        catch (Exception ex)
        {
            Log.Warn("OpenCodeWebView", $"Could not parse file chooser result: {ex.Message}");
        }

        if (result is null && resultCode == Result.Ok && data?.Data is not null)
        {
            result = [data.Data];
        }

        Java.Lang.Object? value = null;
        if (result is { Length: > 0 })
        {
            var uriClass = Java.Lang.Class.FromType(typeof(global::Android.Net.Uri));
            value = Java.Lang.Reflect.Array.NewInstance(uriClass, result.Length);
            for (var i = 0; i < result.Length; i++)
            {
                Java.Lang.Reflect.Array.Set(value, i, result[i]);
            }
        }

        callback.OnReceiveValue(value);
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
    const string DefaultServerUrl = "http://10.26.120.249:4096";
    static readonly string[] LegacyServerUrls = ["http://10.0.2.2:4096", "http://192.168.0.200:4096"];
    readonly ISharedPreferences prefs;

    public AppBridge(Context context)
    {
        prefs = context.GetSharedPreferences(PrefName, FileCreationMode.Private) ?? throw new InvalidOperationException("Missing prefs");
    }

    [JavascriptInterface]
    [Export("getDefaultServer")]
    public string? GetDefaultServer()
    {
        var saved = prefs.GetString(ServerKey, null)?.Trim();
        if (string.IsNullOrWhiteSpace(saved)) return DefaultServerUrl;
        if (Array.IndexOf(LegacyServerUrls, saved) < 0) return saved;

        var editor = prefs.Edit();
        editor.PutString(ServerKey, DefaultServerUrl);
        editor.Apply();
        return DefaultServerUrl;
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

sealed class AppChromeClient(MainActivity activity) : WebChromeClient
{
    public override bool OnConsoleMessage(ConsoleMessage? consoleMessage)
    {
        if (consoleMessage is null) return base.OnConsoleMessage(consoleMessage);
        Log.Warn("OpenCodeWebView", $"{consoleMessage.Message()} ({consoleMessage.SourceId()}:{consoleMessage.LineNumber()})");
        return base.OnConsoleMessage(consoleMessage);
    }

    public override bool OnShowFileChooser(WebView? webView, IValueCallback? filePathCallback, FileChooserParams? fileChooserParams)
    {
        return activity.LaunchFileChooser(filePathCallback, fileChooserParams);
    }
}
