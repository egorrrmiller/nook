using System.IO.Compression;
using System.Net;
using System.Text;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Nook.IntegrationTests;

/// <summary>In-code fixtures: a PNG encoder, a hand-written PDF, a DOCX via the Open XML SDK and a tiny local HTTP server.</summary>
public static class FileFixtures
{
    /// <summary>Encodes an RGB PNG (stored deflate blocks, no external library) with a horizontal gradient.</summary>
    public static byte[] Png(int width, int height)
    {
        var raw = new byte[height * (1 + width * 3)];
        for (var y = 0; y < height; y++)
        {
            var row = y * (1 + width * 3);
            raw[row] = 0; // filter: none
            for (var x = 0; x < width; x++)
            {
                raw[row + 1 + x * 3] = (byte)(x * 255 / Math.Max(1, width - 1));
                raw[row + 2 + x * 3] = (byte)(y * 255 / Math.Max(1, height - 1));
                raw[row + 3 + x * 3] = 128;
            }
        }
        using var idat = new MemoryStream();
        using (var z = new ZLibStream(idat, CompressionLevel.Fastest, leaveOpen: true)) z.Write(raw);

        using var ms = new MemoryStream();
        ms.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        var ihdr = new byte[13];
        WriteBe(ihdr, 0, width);
        WriteBe(ihdr, 4, height);
        ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
        Chunk(ms, "IHDR", ihdr);
        Chunk(ms, "IDAT", idat.ToArray());
        Chunk(ms, "IEND", []);
        return ms.ToArray();
    }

    private static void Chunk(Stream s, string type, byte[] data)
    {
        var len = new byte[4];
        WriteBe(len, 0, data.Length);
        s.Write(len);
        var typeBytes = Encoding.ASCII.GetBytes(type);
        s.Write(typeBytes);
        s.Write(data);
        var crc = Crc32(typeBytes, data);
        var crcBytes = new byte[4];
        WriteBe(crcBytes, 0, (int)crc);
        s.Write(crcBytes);
    }

    private static void WriteBe(byte[] b, int offset, int v)
    {
        b[offset] = (byte)(v >> 24); b[offset + 1] = (byte)(v >> 16); b[offset + 2] = (byte)(v >> 8); b[offset + 3] = (byte)v;
    }

    private static uint Crc32(byte[] a, byte[] b)
    {
        uint crc = 0xFFFFFFFF;
        foreach (var chunk in new[] { a, b })
        {
            foreach (var by in chunk)
            {
                crc ^= by;
                for (var k = 0; k < 8; k++) crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320 : crc >> 1;
            }
        }
        return crc ^ 0xFFFFFFFF;
    }

    /// <summary>A one-page PDF with a Helvetica text line.</summary>
    public static byte[] Pdf(string text)
    {
        var content = $"BT /F1 24 Tf 72 700 Td ({text.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)")}) Tj ET";
        var objects = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            $"<< /Length {content.Length} >>\nstream\n{content}\nendstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        };
        var sb = new StringBuilder("%PDF-1.4\n");
        var offsets = new List<int>();
        for (var i = 0; i < objects.Length; i++)
        {
            offsets.Add(Encoding.ASCII.GetByteCount(sb.ToString()));
            sb.Append($"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
        }
        var xref = Encoding.ASCII.GetByteCount(sb.ToString());
        sb.Append($"xref\n0 {objects.Length + 1}\n0000000000 65535 f \n");
        foreach (var o in offsets) sb.Append($"{o:D10} 00000 n \n");
        sb.Append($"trailer\n<< /Size {objects.Length + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(sb.ToString());
    }

    public static byte[] Docx(params string[] paragraphs)
    {
        using var ms = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document))
        {
            var main = doc.AddMainDocumentPart();
            var body = new Body();
            foreach (var p in paragraphs) body.Append(new Paragraph(new Run(new Text(p))));
            main.Document = new Document(body);
            main.Document.Save();
        }
        return ms.ToArray();
    }

    public static MultipartFormDataContent Upload(byte[] bytes, string filename, string mime, Guid nodeId, string? purpose = null, Guid? blockId = null, bool fileFirst = true)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(mime);
        void Fields()
        {
            form.Add(new StringContent(nodeId.ToString()), "nodeId");
            if (purpose is not null) form.Add(new StringContent(purpose), "purpose");
            if (blockId is not null) form.Add(new StringContent(blockId.ToString()!), "blockId");
        }
        if (fileFirst) { form.Add(file, "file", filename); Fields(); }
        else { Fields(); form.Add(file, "file", filename); }
        return form;
    }

    /// <summary>Minimal local HTTP server on 127.0.0.1 with per-path responses.</summary>
    public sealed class LocalServer : IDisposable
    {
        private readonly HttpListener _listener = new();
        private readonly Dictionary<string, (string ContentType, byte[] Body, int Status, Dictionary<string, string>? Headers)> _routes = new();
        private readonly CancellationTokenSource _cts = new();

        public LocalServer()
        {
            Port = FreePort();
            _listener.Prefixes.Add($"http://127.0.0.1:{Port}/");
            _listener.Start();
            _ = Task.Run(LoopAsync);
        }

        public int Port { get; }
        public string BaseUrl => $"http://127.0.0.1:{Port}";
        public int Hits { get; private set; }

        public LocalServer Map(string path, string contentType, byte[] body, int status = 200, Dictionary<string, string>? headers = null)
        {
            _routes[path] = (contentType, body, status, headers);
            return this;
        }

        public LocalServer Map(string path, string contentType, string body, int status = 200, Dictionary<string, string>? headers = null) =>
            Map(path, contentType, Encoding.UTF8.GetBytes(body), status, headers);

        private async Task LoopAsync()
        {
            while (!_cts.IsCancellationRequested)
            {
                HttpListenerContext ctx;
                try { ctx = await _listener.GetContextAsync(); }
                catch (Exception) { return; }
                Hits++;
                try
                {
                    var path = ctx.Request.Url!.AbsolutePath;
                    if (_routes.TryGetValue(path, out var r))
                    {
                        ctx.Response.StatusCode = r.Status;
                        ctx.Response.ContentType = r.ContentType;
                        var fakeLength = false;
                        if (r.Headers is not null)
                        {
                            foreach (var (k, v) in r.Headers)
                            {
                                // "Content-Length" advertises a bigger body than is sent (tests the pre-download size check).
                                if (k == "Content-Length") { ctx.Response.ContentLength64 = long.Parse(v); fakeLength = true; }
                                else ctx.Response.Headers[k] = v;
                            }
                        }
                        if (!fakeLength) ctx.Response.ContentLength64 = r.Body.Length;
                        await ctx.Response.OutputStream.WriteAsync(r.Body);
                        if (fakeLength) { ctx.Response.Abort(); continue; }
                    }
                    else
                    {
                        ctx.Response.StatusCode = 404;
                    }
                }
                catch (Exception) { }
                finally
                {
                    try { ctx.Response.Close(); } catch (Exception) { }
                }
            }
        }

        private static int FreePort()
        {
            using var l = new System.Net.Sockets.TcpListener(IPAddress.Loopback, 0);
            l.Start();
            return ((IPEndPoint)l.LocalEndpoint).Port;
        }

        public void Dispose()
        {
            _cts.Cancel();
            try { _listener.Stop(); } catch (Exception) { }
            _listener.Close();
        }
    }
}
