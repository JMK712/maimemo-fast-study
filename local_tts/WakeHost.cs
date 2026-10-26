using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

internal static class WakeHost
{
    private const int Port = 8765;

    private static int Main(string[] args)
    {
        bool ok = false;
        try
        {
            string service = AppDomain.CurrentDomain.BaseDirectory;
            string root = Directory.GetParent(service.TrimEnd(Path.DirectorySeparatorChar)).FullName;
            string allowedOrigin = File.ReadAllText(Path.Combine(service, "extension-origin.txt")).Trim();
            string request = ReadMessage();
            if (args.Length > 0 && args[0].TrimEnd('/') == allowedOrigin.TrimEnd('/') &&
                Regex.IsMatch(request, "^\\s*\\{\\s*\"action\"\\s*:\\s*\"wake\"\\s*\\}\\s*$"))
            {
                using (var mutex = new Mutex(false, @"Local\MaiMemoFastStudyTTSWake"))
                {
                    if (mutex.WaitOne(TimeSpan.FromSeconds(12)))
                    {
                        try { ok = Wake(root, service); }
                        finally { mutex.ReleaseMutex(); }
                    }
                }
            }
        }
        catch { ok = false; }

        byte[] response = Encoding.UTF8.GetBytes(ok ? "{\"ok\":true}" : "{\"ok\":false}");
        Stream output = Console.OpenStandardOutput();
        byte[] length = BitConverter.GetBytes(response.Length);
        output.Write(length, 0, length.Length);
        output.Write(response, 0, response.Length);
        output.Flush();
        return 0;
    }

    private static string ReadMessage()
    {
        Stream input = Console.OpenStandardInput();
        byte[] length = ReadExact(input, 4);
        int size = BitConverter.ToInt32(length, 0);
        if (size < 1 || size > 256) throw new InvalidDataException();
        return Encoding.UTF8.GetString(ReadExact(input, size));
    }

    private static byte[] ReadExact(Stream stream, int length)
    {
        byte[] bytes = new byte[length];
        int offset = 0;
        while (offset < length)
        {
            int count = stream.Read(bytes, offset, length - offset);
            if (count == 0) throw new EndOfStreamException();
            offset += count;
        }
        return bytes;
    }

    private static bool Listening()
    {
        try
        {
            using (var client = new TcpClient())
            {
                IAsyncResult result = client.BeginConnect("127.0.0.1", Port, null, null);
                if (!result.AsyncWaitHandle.WaitOne(150)) return false;
                client.EndConnect(result);
                return true;
            }
        }
        catch { return false; }
    }

    private static bool Wake(string root, string service)
    {
        if (Listening()) return true;
        string python = Path.Combine(root, @".venv\Scripts\pythonw.exe");
        string server = Path.Combine(service, "server.py");
        if (!File.Exists(python) || !File.Exists(server)) return false;
        var process = Process.Start(new ProcessStartInfo(python, "\"" + server + "\"")
        {
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            WorkingDirectory = service
        });
        if (process == null) return false;
        File.WriteAllText(Path.Combine(root, "server.pid"), process.Id.ToString());
        for (int i = 0; i < 80; i++)
        {
            if (Listening()) return true;
            if (process.HasExited) return false;
            Thread.Sleep(100);
        }
        return false;
    }
}
