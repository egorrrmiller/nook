using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Contracts;
using Nook.Application.Files;
using Nook.Infrastructure.Files;
using Nook.Infrastructure.Http;
using Nook.Infrastructure.Jobs;
using Nook.Infrastructure.Persistence;

namespace Nook.IntegrationTests;

public class FileTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    // One owner session per factory: the login endpoint is rate-limited (10/min per IP) and xUnit runs the tests of a class sequentially.
    private static readonly System.Runtime.CompilerServices.ConditionalWeakTable<NookApiFactory, Task<(HttpClient, Guid)>> Sessions = new();

    private Task<(HttpClient Client, Guid WorkspaceId)> OwnerAsync() =>
        Sessions.GetValue(factory, f => Task.Run(async () =>
        {
            var client = f.CreateClient();
            var auth = await client.LoginAsOwnerAsync();
            return (client, auth.Workspaces[0].Id);
        }));

    private async Task<(HttpClient Client, Guid WorkspaceId, NodeDto Page)> OwnerWithPageAsync(string title = "Files page")
    {
        var (client, ws) = await OwnerAsync();
        client.WithWorkspace(ws);
        var page = await client.CreateNodeAsync(title);
        return (client, ws, page);
    }

    private static async Task<AttachmentDto> UploadAsync(HttpClient client, byte[] bytes, string filename, string mime, Guid nodeId, string? purpose = null, bool fileFirst = true)
    {
        var res = await client.PostAsync("/api/files", FileFixtures.Upload(bytes, filename, mime, nodeId, purpose, fileFirst: fileFirst));
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<AttachmentDto>(TestClient.Json))!;
    }

    [Fact]
    public async Task Upload_dedupes_blobs_and_lists_node_files()
    {
        var (client, _, page) = await OwnerWithPageAsync();
        var png = FileFixtures.Png(64, 32);

        var a = await UploadAsync(client, png, "photo.png", "image/png", page.Id);
        var b = await UploadAsync(client, png, "copy.png", "application/octet-stream", page.Id, purpose: "cover", fileFirst: false);

        Assert.NotEqual(a.Id, b.Id);
        Assert.Equal(a.Sha256, b.Sha256);
        Assert.Equal(64, a.Sha256.Length);
        Assert.Equal("image/png", a.Mime);
        Assert.Equal("image/png", b.Mime); // sniffed from magic bytes despite the declared octet-stream
        Assert.Equal("content", a.Purpose);
        Assert.Equal("cover", b.Purpose);
        Assert.Equal(png.Length, a.Size);
        Assert.Equal($"/api/files/{a.Id}", a.Url);
        Assert.Equal($"/api/files/{a.Id}/thumb", a.ThumbUrl);
        Assert.Equal(page.Id, a.NodeId);
        if (factory.Services.GetRequiredService<IImageProcessor>().IsAvailable)
        {
            Assert.Equal(64, a.Meta.Width);
            Assert.Equal(32, a.Meta.Height);
        }

        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, await db.Blobs.CountAsync(x => x.Sha256 == a.Sha256));
            Assert.Equal(2, await db.Attachments.CountAsync(x => x.BlobSha == a.Sha256));
            var store = scope.ServiceProvider.GetRequiredService<DiskBlobStore>();
            Assert.True(File.Exists(store.PathOf(a.Sha256)));
            Assert.Contains("/blobs/" + a.Sha256[..2] + "/" + a.Sha256[2..4] + "/", store.PathOf(a.Sha256).Replace('\\', '/'));
            Assert.Contains(await db.EventsOutbox.Select(e => e.Type).ToListAsync(), t => t == "AttachmentCreated");
        }

        var list = await client.GetJsonAsync<List<AttachmentDto>>($"/api/nodes/{page.Id}/files");
        Assert.Equal([a.Id, b.Id], list.Select(x => x.Id));
        var meta = await client.GetJsonAsync<AttachmentDto>($"/api/files/{a.Id}/meta");
        Assert.Equal("photo.png", meta.Filename);

        // validation
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/files", FileFixtures.Upload(png, "x.png", "image/png", page.Id, purpose: "banner"))).StatusCode);
        var noNode = new MultipartFormDataContent { { new ByteArrayContent(png), "file", "x.png" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/files", noNode)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/files", FileFixtures.Upload(png, "x.png", "image/png", Guid.NewGuid()))).StatusCode);
    }

    [Fact]
    public async Task Get_supports_range_etag_and_download_disposition()
    {
        var (client, _, page) = await OwnerWithPageAsync();
        var bytes = new byte[10_000];
        new Random(7).NextBytes(bytes);
        var a = await UploadAsync(client, bytes, "данные.bin", "application/octet-stream", page.Id);

        var full = await client.GetAsync($"/api/files/{a.Id}");
        Assert.Equal(HttpStatusCode.OK, full.StatusCode);
        Assert.Equal(bytes, await full.Content.ReadAsByteArrayAsync());
        Assert.Equal("application/octet-stream", full.Content.Headers.ContentType?.MediaType);
        Assert.Equal($"\"{a.Sha256}\"", full.Headers.ETag?.Tag);
        Assert.True(full.Headers.CacheControl is { Private: true, MaxAge: { } age } && age == TimeSpan.FromSeconds(31536000), full.Headers.CacheControl?.ToString());
        Assert.Equal("bytes", full.Headers.AcceptRanges.Single());
        var cd = full.Content.Headers.ContentDisposition!;
        Assert.Equal("inline", cd.DispositionType);
        Assert.Contains("filename*=UTF-8''%D0%B4%D0%B0%D0%BD%D0%BD%D1%8B%D0%B5.bin", full.Content.Headers.GetValues("Content-Disposition").Single());

        var req = new HttpRequestMessage(HttpMethod.Get, $"/api/files/{a.Id}");
        req.Headers.Range = new RangeHeaderValue(100, 199);
        var partial = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.PartialContent, partial.StatusCode);
        Assert.Equal(bytes[100..200], await partial.Content.ReadAsByteArrayAsync());
        Assert.Equal("bytes 100-199/10000", partial.Content.Headers.ContentRange?.ToString());

        var notModified = new HttpRequestMessage(HttpMethod.Get, $"/api/files/{a.Id}");
        notModified.Headers.IfNoneMatch.Add(new EntityTagHeaderValue($"\"{a.Sha256}\""));
        Assert.Equal(HttpStatusCode.NotModified, (await client.SendAsync(notModified)).StatusCode);

        var download = await client.GetAsync($"/api/files/{a.Id}?download=1");
        Assert.Equal("attachment", download.Content.Headers.ContentDisposition!.DispositionType);

        // no X-Workspace-Id at all (plain <img src>): the workspace comes from the attachment
        var bare = factory.CreateClient();
        await bare.LoginAsOwnerAsync();
        var bareRes = await bare.GetAsync($"/api/files/{a.Id}");
        Assert.Equal(HttpStatusCode.OK, bareRes.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bare.GetAsync($"/api/files/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task Svg_and_html_are_neutralised_inline_but_downloadable()
    {
        var (client, _, page) = await OwnerWithPageAsync();
        var svg = Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"><script>alert(1)</script><rect width=\"10\" height=\"10\"/></svg>");
        var a = await UploadAsync(client, svg, "evil.svg", "image/svg+xml", page.Id);
        Assert.Equal("image/svg+xml", a.Mime);

        var inline = await client.GetAsync($"/api/files/{a.Id}");
        Assert.Equal("application/octet-stream", inline.Content.Headers.ContentType?.MediaType);
        Assert.Equal("nosniff", inline.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Contains("sandbox", inline.Headers.GetValues("Content-Security-Policy").Single());

        var download = await client.GetAsync($"/api/files/{a.Id}?download=1");
        Assert.Equal("image/svg+xml", download.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", download.Content.Headers.ContentDisposition!.DispositionType);

        var html = await UploadAsync(client, "<html><body><script>1</script></body></html>"u8.ToArray(), "page.html", "text/html", page.Id);
        Assert.Equal("application/octet-stream", (await client.GetAsync($"/api/files/{html.Id}")).Content.Headers.ContentType?.MediaType);
        Assert.Null(html.ThumbUrl);
    }

    [Fact]
    public async Task Thumb_returns_webp_of_requested_width()
    {
        var (client, _, page) = await OwnerWithPageAsync();
        var a = await UploadAsync(client, FileFixtures.Png(1600, 800), "big.png", "image/png", page.Id);
        var available = factory.Services.GetRequiredService<IImageProcessor>().IsAvailable;

        var res = await client.GetAsync($"/api/files/{a.Id}/thumb?w=320");
        if (!available)
        {
            Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
            return;
        }
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("image/webp", res.Content.Headers.ContentType?.MediaType);
        Assert.True(res.Headers.CacheControl is { Private: true, MaxAge: { } age } && age == TimeSpan.FromSeconds(31536000), res.Headers.CacheControl?.ToString());
        var webp = await res.Content.ReadAsByteArrayAsync();
        Assert.Equal("RIFF"u8.ToArray(), webp[..4]);
        Assert.Equal("WEBP"u8.ToArray(), webp[8..12]);
        using (var img = NetVips.Image.NewFromBuffer(webp))
        {
            Assert.Equal(320, img.Width);
            Assert.Equal(160, img.Height);
        }

        // cached on disk under derivatives/<sha>/w320.webp; served again from cache
        var store = factory.Services.GetRequiredService<DiskBlobStore>();
        Assert.True(File.Exists(Path.Combine(store.DerivativeDir(a.Sha256), "w320.webp")));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/files/{a.Id}/thumb?w=320")).StatusCode);

        // default width, invalid width, non-image
        var def = await client.GetAsync($"/api/files/{a.Id}/thumb");
        using (var img = NetVips.Image.NewFromBuffer(await def.Content.ReadAsByteArrayAsync())) Assert.Equal(640, img.Width);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/api/files/{a.Id}/thumb?w=333")).StatusCode);
        var txt = await UploadAsync(client, "hello"u8.ToArray(), "a.txt", "text/plain", page.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/files/{txt.Id}/thumb")).StatusCode);
    }

    [Fact]
    public async Task Viewer_reads_but_cannot_write_and_other_workspaces_do_not_see_files()
    {
        var (owner, _) = await OwnerAsync();
        var (viewer, viewerAuth) = await factory.RegisterUserAsync(owner, "files-viewer@test.local", "Viewer");
        var created = await owner.PostAsJsonAsync("/api/workspaces", new { name = "Files team" });
        var team = (await created.Content.ReadFromJsonAsync<WorkspaceSummary>(TestClient.Json))!;
        Assert.Equal(HttpStatusCode.Created, (await owner.PostAsJsonAsync($"/api/workspaces/{team.Id}/members", new { email = "files-viewer@test.local", role = "viewer" })).StatusCode);
        owner.WithWorkspace(team.Id);
        var page = await owner.CreateNodeAsync("Team page");
        var png = FileFixtures.Png(8, 8);
        var a = await UploadAsync(owner, png, "a.png", "image/png", page.Id);

        viewer.WithWorkspace(team.Id);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync($"/api/files/{a.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync($"/api/files/{a.Id}/meta")).StatusCode);
        Assert.Single(await viewer.GetJsonAsync<List<AttachmentDto>>($"/api/nodes/{page.Id}/files"));
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PostAsync("/api/files", FileFixtures.Upload(png, "b.png", "image/png", page.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PostAsJsonAsync("/api/files/from-url", new { url = "https://example.com/x.png", nodeId = page.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.DeleteAsync($"/api/files/{a.Id}")).StatusCode);

        // the viewer's own personal workspace does not contain the file -> 404
        viewer.WithWorkspace(viewerAuth.Workspaces[0].Id);
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.GetAsync($"/api/files/{a.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await viewer.GetAsync($"/api/nodes/{page.Id}/files")).StatusCode);

        // an unrelated user: 403 with the team header, 403 without any header (workspace taken from the attachment)
        var (stranger, _) = await factory.RegisterUserAsync(owner, "files-stranger@test.local", "Stranger");
        stranger.WithWorkspace(team.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync($"/api/files/{a.Id}")).StatusCode);
        stranger.DefaultRequestHeaders.Remove("X-Workspace-Id");
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync($"/api/files/{a.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync($"/api/nodes/{page.Id}/files")).StatusCode);

        // header is still required for uploads
        var noHeader = factory.CreateClient();
        await noHeader.LoginAsOwnerAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await noHeader.PostAsync("/api/files", FileFixtures.Upload(png, "c.png", "image/png", page.Id))).StatusCode);
    }

    [Fact]
    public async Task From_url_rejects_private_hosts_and_fetches_public_ones()
    {
        var (client, _, page) = await OwnerWithPageAsync();
        foreach (var url in new[] { "http://127.0.0.1/", "http://10.0.0.1/x.png", "http://localhost/", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "ftp://example.com/x", "not a url" })
        {
            var res = await client.PostAsJsonAsync("/api/files/from-url", new { url, nodeId = page.Id });
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        }

        // a loopback port explicitly allowed by the guard stands in for a public host
        using var server = new FileFixtures.LocalServer();
        var png = FileFixtures.Png(40, 20);
        server.Map("/img.png", "image/png", png);
        server.Map("/redirect", "text/plain", "", 302, new Dictionary<string, string> { ["Location"] = "/img.png" });
        server.Map("/to-private", "text/plain", "", 302, new Dictionary<string, string> { ["Location"] = "http://10.0.0.1/secret" });
        server.Map("/big", "application/octet-stream", new byte[1024], headers: new Dictionary<string, string> { ["Content-Length"] = (600L * 1024 * 1024).ToString() });
        factory.Services.GetRequiredService<UrlFetchGuard>().AllowLoopbackPort(server.Port);

        var ok = await client.PostAsJsonAsync("/api/files/from-url", new { url = $"{server.BaseUrl}/redirect", nodeId = page.Id, purpose = "icon" });
        Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
        var a = (await ok.Content.ReadFromJsonAsync<AttachmentDto>(TestClient.Json))!;
        Assert.Equal("img.png", a.Filename);
        Assert.Equal("image/png", a.Mime);
        Assert.Equal("icon", a.Purpose);
        Assert.Equal(png, await client.GetByteArrayAsync($"/api/files/{a.Id}"));

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/files/from-url", new { url = $"{server.BaseUrl}/to-private", nodeId = page.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/files/from-url", new { url = $"{server.BaseUrl}/missing", nodeId = page.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, (await client.PostAsJsonAsync("/api/files/from-url", new { url = $"{server.BaseUrl}/big", nodeId = page.Id })).StatusCode);
    }

    [Fact]
    public async Task Link_preview_parses_open_graph_and_caches()
    {
        var (client, _) = await OwnerAsync();
        using var server = new FileFixtures.LocalServer();
        factory.Services.GetRequiredService<UrlFetchGuard>().AllowLoopbackPort(server.Port);
        server.Map("/article", "text/html; charset=utf-8", """
            <!doctype html><html><head>
            <title>Fallback title</title>
            <meta property="og:title" content="Nook — файлы">
            <meta property="og:description" content="Описание страницы">
            <meta property="og:image" content="/img/cover.png">
            <meta property="og:site_name" content="Nook Blog">
            <link rel="icon" href="/favicon.png">
            <link rel="alternate" type="application/json+oembed" href="/oembed?url=article">
            </head><body>hi</body></html>
            """);
        server.Map("/oembed", "application/json", """{"version":"1.0","type":"rich","provider_name":"LocalEmbed","html":"<iframe src=\"x\"></iframe>","width":640,"height":360}""");
        server.Map("/plain", "text/html", "<html><head><title>Only a title</title></head></html>");

        var res = await client.PostAsJsonAsync("/api/links/preview", new { url = $"{server.BaseUrl}/article" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var p = (await res.Content.ReadFromJsonAsync<LinkPreviewDto>(TestClient.Json))!;
        Assert.Equal($"{server.BaseUrl}/article", p.Url);
        Assert.Equal(p.Url, p.FinalUrl);
        Assert.Equal("Nook — файлы", p.Title);
        Assert.Equal("Описание страницы", p.Description);
        Assert.Equal($"{server.BaseUrl}/img/cover.png", p.ImageUrl);
        Assert.Equal($"{server.BaseUrl}/favicon.png", p.FaviconUrl);
        Assert.Equal("Nook Blog", p.SiteName);
        Assert.NotNull(p.Embed);
        Assert.Equal("LocalEmbed", p.Embed!.Provider);
        Assert.Equal(640, p.Embed.Width);
        Assert.Equal(360, p.Embed.Height);
        Assert.Equal(16.0 / 9.0, p.Embed.AspectRatio!.Value, 3);
        Assert.Contains("iframe", p.Embed.Html);

        var hits = server.Hits;
        var again = (await (await client.PostAsJsonAsync("/api/links/preview", new { url = $"{server.BaseUrl}/article" })).Content.ReadFromJsonAsync<LinkPreviewDto>(TestClient.Json))!;
        Assert.Equal(p.FetchedAt, again.FetchedAt);
        Assert.Equal(hits, server.Hits); // served from link_previews

        var plain = (await (await client.PostAsJsonAsync("/api/links/preview", new { url = $"{server.BaseUrl}/plain" })).Content.ReadFromJsonAsync<LinkPreviewDto>(TestClient.Json))!;
        Assert.Equal("Only a title", plain.Title);
        Assert.Null(plain.Embed);

        // failures still answer 200 with url/finalUrl
        var failed = await client.PostAsJsonAsync("/api/links/preview", new { url = "http://10.0.0.1/private" });
        Assert.Equal(HttpStatusCode.OK, failed.StatusCode);
        var f = (await failed.Content.ReadFromJsonAsync<LinkPreviewDto>(TestClient.Json))!;
        Assert.Equal("http://10.0.0.1/private", f.Url);
        Assert.Null(f.Title);
        Assert.Null(f.Embed);

        // provider table works offline: the embed url is derived from the link itself
        var yt = (await (await client.PostAsJsonAsync("/api/links/preview", new { url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).Content.ReadFromJsonAsync<LinkPreviewDto>(TestClient.Json))!;
        Assert.Equal("https://www.youtube.com/embed/dQw4w9WgXcQ", yt.Embed?.Url);
        Assert.Equal("YouTube", yt.Embed?.Provider);

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/links/preview", new { url = "javascript:alert(1)" })).StatusCode);
    }

    [Fact]
    public async Task Delete_then_blob_gc_removes_unreferenced_files()
    {
        var (client, _, page) = await OwnerWithPageAsync();
        var bytes = Encoding.UTF8.GetBytes("gc me " + Guid.NewGuid());
        var a = await UploadAsync(client, bytes, "gc.txt", "text/plain", page.Id);
        var b = await UploadAsync(client, bytes, "gc-copy.txt", "text/plain", page.Id);
        var store = factory.Services.GetRequiredService<DiskBlobStore>();
        var path = store.PathOf(a.Sha256);
        Assert.True(File.Exists(path));

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/files/{a.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/files/{a.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/files/{a.Id}")).StatusCode);

        using var scope = factory.CreateScope();
        var gc = ActivatorUtilities.CreateInstance<BlobGcJob>(scope.ServiceProvider);
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // still referenced by b -> kept
        await gc.CollectAsync(DateTimeOffset.UtcNow.AddMinutes(1), CancellationToken.None);
        Assert.True(File.Exists(path));
        Assert.True(await db.Blobs.AnyAsync(x => x.Sha256 == a.Sha256));

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/files/{b.Id}")).StatusCode);
        // younger than the cutoff -> kept
        Assert.Equal(0, await gc.CollectAsync(DateTimeOffset.UtcNow.AddHours(-24), CancellationToken.None));
        Assert.True(File.Exists(path));
        // older than the cutoff -> row + file removed
        Assert.Equal(1, await gc.CollectAsync(DateTimeOffset.UtcNow.AddMinutes(1), CancellationToken.None));
        Assert.False(File.Exists(path));
        Assert.False(await db.Blobs.AnyAsync(x => x.Sha256 == a.Sha256));
        Assert.Contains(await db.EventsOutbox.Select(e => e.Type).ToListAsync(), t => t == "AttachmentDeleted");
    }

    [Fact]
    public async Task Extraction_fills_text_for_pdf_docx_and_markdown()
    {
        var (client, _, page) = await OwnerWithPageAsync();
        var pdf = await UploadAsync(client, FileFixtures.Pdf("Hello Nook PDF"), "doc.pdf", "application/pdf", page.Id);
        var docx = await UploadAsync(client, FileFixtures.Docx("First paragraph", "Второй абзац"), "doc.docx", "application/octet-stream", page.Id);
        var md = await UploadAsync(client, Encoding.UTF8.GetBytes("# Title\n\nSome **markdown** text."), "notes.md", "text/markdown", page.Id);
        var png = await UploadAsync(client, FileFixtures.Png(30, 10), "i.png", "image/png", page.Id);
        Assert.Equal("application/pdf", pdf.Mime);
        Assert.Equal("application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx.Mime);
        Assert.Equal("text/markdown", md.Mime);
        Assert.Null(pdf.Meta.TextExtracted);

        using var scope = factory.CreateScope();
        var job = ActivatorUtilities.CreateInstance<FileExtractionJob>(scope.ServiceProvider);
        foreach (var id in new[] { pdf.Id, docx.Id, md.Id, png.Id }) await job.RunAsync(id, CancellationToken.None);

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var rows = await db.Attachments.AsNoTracking().Where(a => a.NodeId == page.Id).ToDictionaryAsync(a => a.Id);
        Assert.Contains("Hello Nook PDF", rows[pdf.Id].ExtractedText);
        Assert.Contains("First paragraph", rows[docx.Id].ExtractedText);
        Assert.Contains("Второй абзац", rows[docx.Id].ExtractedText);
        Assert.Contains("Some **markdown** text.", rows[md.Id].ExtractedText);
        Assert.Null(rows[png.Id].ExtractedText);

        var pdfMeta = await client.GetJsonAsync<AttachmentDto>($"/api/files/{pdf.Id}/meta");
        Assert.True(pdfMeta.Meta.TextExtracted);
        Assert.Equal(1, pdfMeta.Meta.Pages);
        Assert.True((await client.GetJsonAsync<AttachmentDto>($"/api/files/{docx.Id}/meta")).Meta.TextExtracted);

        // the generated tsvector columns index the text
        var hit = await db.Attachments
            .Where(a => a.NodeId == page.Id && EF.Functions.ToTsVector("russian", a.ExtractedText!).Matches(EF.Functions.PlainToTsQuery("russian", "абзац")))
            .Select(a => a.Id)
            .ToListAsync();
        Assert.Equal([docx.Id], hit);
        var viaColumn = await db.Database.SqlQueryRaw<Guid>("SELECT id AS \"Value\" FROM attachments WHERE text_en @@ plainto_tsquery('english', 'markdown')").ToListAsync();
        Assert.Equal([md.Id], viaColumn);
    }

    [Fact]
    public async Task Covers_gallery_is_listed_and_served_statically()
    {
        var (client, _) = await OwnerAsync();
        var covers = await client.GetJsonAsync<List<CoverDto>>("/api/covers");
        Assert.InRange(covers.Count, 25, 60);
        Assert.Contains(covers, c => c.Group == "Gradients");
        Assert.Contains(covers, c => c.Group == "Solid");
        Assert.Contains(covers, c => c.Group == "Nature");
        Assert.Contains(covers, c => c.Group == "Patterns");
        Assert.All(covers, c => Assert.StartsWith("/covers/", c.Url));
        Assert.Equal(covers.Count, covers.Select(c => c.Id).Distinct().Count());

        var anonymous = factory.CreateClient();
        var svg = await anonymous.GetAsync(covers[0].Url);
        Assert.Equal(HttpStatusCode.OK, svg.StatusCode);
        Assert.Equal("image/svg+xml", svg.Content.Headers.ContentType?.MediaType);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/covers")).StatusCode);
    }

    [Fact]
    public async Task Upload_beyond_limit_is_413()
    {
        var (client, _, page) = await OwnerWithPageAsync();
        var options = factory.Services.GetRequiredService<FilesOptions>();
        Assert.Equal(512L * 1024 * 1024, options.MaxUploadBytes); // default NOOK_MAX_UPLOAD_MB
        // exercise the store's cap directly (a 512 MB request body would be too slow for the suite)
        var store = factory.Services.GetRequiredService<IBlobStore>();
        await Assert.ThrowsAsync<PayloadTooLargeException>(() => store.StoreAsync(new MemoryStream(new byte[2048]), 1024, CancellationToken.None));
        Assert.Empty(Directory.EnumerateFiles(Path.Combine(((DiskBlobStore)store).Root, "tmp")));
        _ = page;
    }
}
