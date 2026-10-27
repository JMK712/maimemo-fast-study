using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

internal static class Launcher
{
    private static string service;
    private static string root;

    [STAThread]
    private static void Main()
    {
        service = AppDomain.CurrentDomain.BaseDirectory;
        root = Directory.GetParent(service.TrimEnd(Path.DirectorySeparatorChar)).FullName;
        Log("Shortcut invoked.");
        try
        {
            string[] config = File.ReadAllLines(Path.Combine(service, "launcher-settings.txt"));
            if (config.Length != 3 || !File.Exists(config[0]) ||
                !Regex.IsMatch(config[1], "^[a-p]{32}$") || config[2].Contains("\""))
                throw new InvalidDataException("Invalid Chrome app settings.");

            try { StartSpeechService(); }
            catch (Exception error) { Log("Speech startup failed: " + error.Message); }

            var chrome = new ProcessStartInfo(config[0],
                "--profile-directory=\"" + config[2] + "\" --app-id=" + config[1]);
            chrome.UseShellExecute = true;
            Process.Start(chrome);
            Log("Chrome app launch requested.");
        }
        catch (Exception error)
        {
            Log("Launcher failed: " + error);
            MessageBox.Show(error.Message, "墨墨启动器", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static void StartSpeechService()
    {
        using (var mutex = new Mutex(false, @"Local\MaiMemoFastStudyTTSWake"))
        {
            if (!mutex.WaitOne(TimeSpan.FromSeconds(5))) throw new TimeoutException("Speech startup busy.");
            try
            {
                if (Listening() || ExistingServiceProcess())
                {
                    Log("Speech service already starting or running.");
                    return;
                }
                string python = Path.Combine(root, @".venv\Scripts\pythonw.exe");
                string server = Path.Combine(service, "server.py");
                if (!File.Exists(python) || !File.Exists(server))
                    throw new FileNotFoundException("Local speech service is not installed.");
                var info = new ProcessStartInfo(python, "\"" + server + "\"");
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.WorkingDirectory = service;
                var process = Process.Start(info);
                if (process == null) throw new InvalidOperationException("Could not start Python.");
                File.WriteAllText(Path.Combine(root, "server.pid"), process.Id.ToString());
                Log("Speech process started (PID " + process.Id + ").");
            }
            finally { mutex.ReleaseMutex(); }
        }
    }

    private static bool ExistingServiceProcess()
    {
        try
        {
            int id = int.Parse(File.ReadAllText(Path.Combine(root, "server.pid")));
            using (var process = Process.GetProcessById(id))
                return !process.HasExited &&
                    String.Equals(Path.GetFullPath(process.MainModule.FileName),
                                  Path.GetFullPath(Path.Combine(root, @".venv\Scripts\pythonw.exe")),
                                  StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    private static bool Listening()
    {
        try
        {
            using (var client = new TcpClient())
            {
                IAsyncResult result = client.BeginConnect("127.0.0.1", 8765, null, null);
                if (!result.AsyncWaitHandle.WaitOne(150)) return false;
                client.EndConnect(result);
                return true;
            }
        }
        catch { return false; }
    }

    private static void Log(string message)
    {
        try { File.AppendAllText(Path.Combine(service, "launcher.log"),
            DateTime.Now.ToString("O") + " " + message + Environment.NewLine); }
        catch { }
    }
}
