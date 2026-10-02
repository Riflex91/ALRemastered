using System;
using System.Diagnostics;
using System.IO;
using System.Text;

internal static class Program
{
    private static int Main(string[] args)
    {
        string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
        string nodePath = Path.Combine(baseDirectory, "runtime", "node.exe");
        string mainPath = Path.Combine(baseDirectory, "app", "src", "main.js");

        if (!File.Exists(nodePath))
        {
            return Fail("The bundled ALRemastered runtime is missing.");
        }

        if (!File.Exists(mainPath))
        {
            return Fail("The ALRemastered application files are missing.");
        }

        var arguments = new StringBuilder();
        arguments.Append(Quote(mainPath));
        foreach (string argument in args)
        {
            arguments.Append(' ');
            arguments.Append(Quote(argument));
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = nodePath,
            Arguments = arguments.ToString(),
            WorkingDirectory = baseDirectory,
            UseShellExecute = false
        };

        Process child;
        try
        {
            child = Process.Start(startInfo);
        }
        catch (Exception error)
        {
            return Fail("ALRemastered could not start: " + error.Message);
        }

        if (child == null)
        {
            return Fail("ALRemastered could not start.");
        }

        Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs eventArgs)
        {
            eventArgs.Cancel = true;
        };

        child.WaitForExit();
        int exitCode = child.ExitCode;
        child.Dispose();

        if (exitCode != 0 && !Console.IsInputRedirected)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine("ALRemastered stopped unexpectedly with exit code " + exitCode + ".");
            Console.Error.WriteLine("Press any key to close this window.");
            Console.ReadKey(true);
        }

        return exitCode;
    }

    private static int Fail(string message)
    {
        Console.Error.WriteLine(message);
        if (!Console.IsInputRedirected)
        {
            Console.Error.WriteLine("Press any key to close this window.");
            Console.ReadKey(true);
        }
        return 1;
    }

    private static string Quote(string value)
    {
        if (value == null)
        {
            return "\"\"";
        }

        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }
}
