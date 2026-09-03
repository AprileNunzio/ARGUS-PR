using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.ServiceProcess;
using System.Threading;
using System.Windows.Forms;

namespace ArgusPr
{
    internal static class Launcher
    {
        private const string ServiceName = "ArgusPR";
        private const string ProductName = "ARGUS-PR";
        private const int DefaultPort = 8088;

        [STAThread]
        private static int Main(string[] args)
        {
            string installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            string dataDir = ResolveDataDir();
            int port = ResolvePort(dataDir);

            if (!IsListening(port) && !StartBackend(installDir, dataDir, port))
            {
                Fail("Impossibile avviare il servizio " + ServiceName + "." + Environment.NewLine +
                     "Verifica lo stato del servizio in services.msc oppure controlla il registro:" + Environment.NewLine +
                     Path.Combine(dataDir, "service.log"));
                return 1;
            }

            if (!WaitForPort(port, 90))
            {
                Fail("Il servizio non risponde su http://localhost:" + port + " entro il tempo previsto." + Environment.NewLine +
                     "Registro: " + Path.Combine(dataDir, "service.log"));
                return 2;
            }

            OpenConsole(port);
            return 0;
        }

        private static string ResolveDataDir()
        {
            string fromEnv = Environment.GetEnvironmentVariable("ARGUS_DATA_DIR");
            if (!string.IsNullOrEmpty(fromEnv)) return fromEnv;
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), ProductName);
        }

        private static int ResolvePort(string dataDir)
        {
            int parsed;
            string fromEnv = Environment.GetEnvironmentVariable("ARGUS_PORT");
            if (!string.IsNullOrEmpty(fromEnv) && int.TryParse(fromEnv, out parsed)) return parsed;

            string envFile = Path.Combine(dataDir, "argus.env");
            string[] lines;
            try
            {
                if (!File.Exists(envFile)) return DefaultPort;
                lines = File.ReadAllLines(envFile);
            }
            catch (IOException)
            {
                return DefaultPort;
            }
            catch (UnauthorizedAccessException)
            {
                return DefaultPort;
            }

            foreach (string line in lines)
            {
                string trimmed = line.Trim();
                if (!trimmed.StartsWith("ARGUS_PORT=", StringComparison.OrdinalIgnoreCase)) continue;
                if (int.TryParse(trimmed.Substring("ARGUS_PORT=".Length).Trim(), out parsed)) return parsed;
            }
            return DefaultPort;
        }

        private static bool StartBackend(string installDir, string dataDir, int port)
        {
            if (StartService()) return true;
            return StartDetachedNode(installDir, dataDir, port);
        }

        private static bool StartService()
        {
            if (!ServiceExists()) return false;

            ServiceController controller = null;
            try
            {
                controller = new ServiceController(ServiceName);
                if (controller.Status == ServiceControllerStatus.Running) return true;
                controller.Start();
                controller.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(45));
                return true;
            }
            catch (InvalidOperationException)
            {
                return ElevatedServiceStart();
            }
            catch (System.ComponentModel.Win32Exception)
            {
                return ElevatedServiceStart();
            }
            finally
            {
                if (controller != null) controller.Close();
            }
        }

        private static bool ServiceExists()
        {
            bool found = false;
            foreach (ServiceController candidate in ServiceController.GetServices())
            {
                if (string.Equals(candidate.ServiceName, ServiceName, StringComparison.OrdinalIgnoreCase)) found = true;
                candidate.Close();
            }
            return found;
        }

        private static bool ElevatedServiceStart()
        {
            ProcessStartInfo info = new ProcessStartInfo("sc.exe", "start " + ServiceName);
            info.UseShellExecute = true;
            info.Verb = "runas";
            info.WindowStyle = ProcessWindowStyle.Hidden;

            try
            {
                Process elevated = Process.Start(info);
                if (elevated == null) return false;
                elevated.WaitForExit(45000);
                return true;
            }
            catch (System.ComponentModel.Win32Exception)
            {
                return false;
            }
        }

        private static bool StartDetachedNode(string installDir, string dataDir, int port)
        {
            string entry = Path.Combine(installDir, "bin", "argus.js");
            if (!File.Exists(entry)) return false;

            ProcessStartInfo info = new ProcessStartInfo(ResolveNode(), "\"" + entry + "\" serve");
            info.WorkingDirectory = installDir;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.EnvironmentVariables["ARGUS_DATA_DIR"] = dataDir;
            info.EnvironmentVariables["ARGUS_MEDIA_DIR"] = Path.Combine(dataDir, "media");
            info.EnvironmentVariables["ARGUS_PORT"] = port.ToString();

            try
            {
                return Process.Start(info) != null;
            }
            catch (System.ComponentModel.Win32Exception)
            {
                return false;
            }
        }

        private static string ResolveNode()
        {
            string standard = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe");
            return File.Exists(standard) ? standard : "node.exe";
        }

        private static bool IsListening(int port)
        {
            using (TcpClient client = new TcpClient())
            {
                try
                {
                    IAsyncResult pending = client.BeginConnect("127.0.0.1", port, null, null);
                    if (!pending.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(600))) return false;
                    client.EndConnect(pending);
                    return true;
                }
                catch (SocketException)
                {
                    return false;
                }
                catch (ObjectDisposedException)
                {
                    return false;
                }
            }
        }

        private static bool WaitForPort(int port, int seconds)
        {
            for (int attempt = 0; attempt < seconds * 2; attempt++)
            {
                if (IsListening(port)) return true;
                Thread.Sleep(500);
            }
            return false;
        }

        private static void OpenConsole(int port)
        {
            string url = "http://localhost:" + port + "/";
            foreach (string browser in BrowserCandidates())
            {
                if (!File.Exists(browser)) continue;
                ProcessStartInfo info = new ProcessStartInfo(browser, "--app=" + url);
                info.UseShellExecute = false;
                try
                {
                    if (Process.Start(info) != null) return;
                }
                catch (System.ComponentModel.Win32Exception)
                {
                    continue;
                }
            }

            ProcessStartInfo fallback = new ProcessStartInfo(url);
            fallback.UseShellExecute = true;
            try
            {
                Process.Start(fallback);
            }
            catch (System.ComponentModel.Win32Exception)
            {
                Fail("Nessun browser disponibile. Apri manualmente " + url);
            }
        }

        private static string[] BrowserCandidates()
        {
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            return new string[]
            {
                Path.Combine(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(localAppData, "Google", "Chrome", "Application", "chrome.exe")
            };
        }

        private static void Fail(string message)
        {
            MessageBox.Show(message, ProductName, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
