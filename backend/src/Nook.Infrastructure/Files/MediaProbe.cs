using System.Buffers.Binary;
using System.Text;

namespace Nook.Infrastructure.Files;

/// <summary>Cheap duration probing from container headers: ISO-BMFF (mp4/m4a/mov) <c>mvhd</c> and RIFF WAVE. Anything else → null.</summary>
public static class MediaProbe
{
    public static double? Duration(Stream s, string mime)
    {
        try
        {
            if (mime is "video/mp4" or "audio/mp4" or "video/quicktime") return Mp4Duration(s);
            if (mime is "audio/wav" or "audio/x-wav" or "audio/wave") return WavDuration(s);
        }
        catch (IOException) { }
        return null;
    }

    private static double? Mp4Duration(Stream s)
    {
        s.Position = 0;
        var header = new byte[16];
        long pos = 0;
        var length = s.Length;
        // Top-level boxes until 'moov'; then walk moov's children for 'mvhd'. Reads only headers (seeks over mdat).
        while (pos + 8 <= length)
        {
            s.Position = pos;
            if (!ReadExactly(s, header, 8)) return null;
            long size = BinaryPrimitives.ReadUInt32BigEndian(header);
            var type = Encoding.ASCII.GetString(header, 4, 4);
            var headerLen = 8;
            if (size == 1)
            {
                if (!ReadExactly(s, header, 8)) return null;
                size = (long)BinaryPrimitives.ReadUInt64BigEndian(header);
                headerLen = 16;
            }
            else if (size == 0) size = length - pos;
            if (size < headerLen) return null;

            if (type == "moov")
            {
                var end = Math.Min(length, pos + size);
                var child = pos + headerLen;
                while (child + 8 <= end)
                {
                    s.Position = child;
                    if (!ReadExactly(s, header, 8)) return null;
                    long csize = BinaryPrimitives.ReadUInt32BigEndian(header);
                    var ctype = Encoding.ASCII.GetString(header, 4, 4);
                    if (csize == 0) csize = end - child;
                    if (csize < 8) return null;
                    if (ctype == "mvhd")
                    {
                        var body = new byte[Math.Min(csize - 8, 32)];
                        if (!ReadExactly(s, body, body.Length)) return null;
                        var version = body[0];
                        if (version == 1 && body.Length >= 28)
                        {
                            var scale = BinaryPrimitives.ReadUInt32BigEndian(body.AsSpan(20));
                            var dur = BinaryPrimitives.ReadUInt64BigEndian(body.AsSpan(24));
                            return scale == 0 ? null : Math.Round(dur / (double)scale, 3);
                        }
                        if (version == 0 && body.Length >= 20)
                        {
                            var scale = BinaryPrimitives.ReadUInt32BigEndian(body.AsSpan(12));
                            var dur = BinaryPrimitives.ReadUInt32BigEndian(body.AsSpan(16));
                            return scale == 0 ? null : Math.Round(dur / (double)scale, 3);
                        }
                        return null;
                    }
                    child += csize;
                }
                return null;
            }
            pos += size;
        }
        return null;
    }

    private static double? WavDuration(Stream s)
    {
        s.Position = 12;
        var header = new byte[8];
        uint byteRate = 0;
        while (s.Position + 8 <= s.Length)
        {
            if (!ReadExactly(s, header, 8)) return null;
            var id = Encoding.ASCII.GetString(header, 0, 4);
            var size = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(4));
            if (id == "fmt ")
            {
                var fmt = new byte[16];
                if (!ReadExactly(s, fmt, 16)) return null;
                byteRate = BinaryPrimitives.ReadUInt32LittleEndian(fmt.AsSpan(8));
                s.Position += size - 16 + (size % 2);
            }
            else if (id == "data")
            {
                return byteRate == 0 ? null : Math.Round(size / (double)byteRate, 3);
            }
            else
            {
                s.Position += size + (size % 2);
            }
        }
        return null;
    }

    private static bool ReadExactly(Stream s, byte[] buffer, int count)
    {
        var total = 0;
        while (total < count)
        {
            var n = s.Read(buffer, total, count - total);
            if (n <= 0) return false;
            total += n;
        }
        return true;
    }
}
