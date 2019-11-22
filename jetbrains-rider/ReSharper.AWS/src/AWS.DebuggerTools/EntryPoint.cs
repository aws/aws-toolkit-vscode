using System;
using JetBrains.Application.BuildScript;
using JetBrains.Lifetimes;
using JetBrains.Util;
using JetBrains.Util.CommandLineMapper;
using JetBrains.Util.CommandLineMapper.Attributes;
using JetBrains.Util.Logging;

namespace AWS.RiderDebuggerTools
{
    enum Command
    {
        DbgShimDetect
    }
    
    [AppName("AWS.DebuggerTools")]
    class ToolsOptions
    {
        [EnumOption("command", typeof(Command), IsRequired = true, HelpText = "command to execute")]
        public readonly Command Command;

        [FileOption("assembly-path", IsRequired = false, HelpText = "Path to an assemly")]
        public FileSystemPath AssemblyPath;
    }
    
    static class EntryPoint
    {
        private static ILogger Log = Logger.GetLogger(typeof(EntryPoint));
        
        static int Main(string[] args)
        {
            SetUpLogging();
            
            var commandLineMapper = CLI.Mapper.Default<ToolsOptions>();
            var commandLineParser = CLI.Parser.Universal(args);
            var options = commandLineMapper.Map(commandLineParser);
            if (options == null)
            {
                Console.WriteLine(commandLineMapper.HelpGenerator.GenerateHelp());
                Environment.Exit(-1);
            }

            switch (options.Command)
            {
                case Command.DbgShimDetect:
                {
                    if (options.AssemblyPath == null)
                    {
                        Console.WriteLine("Assembly path must be specified");
                        return -1;
                    }
                    
                    return DetectCLIAndDbgShim(options.AssemblyPath);
                }
                default:
                    throw new ArgumentOutOfRangeException();
            }
        }

        private static int DetectCLIAndDbgShim(FileSystemPath assemblyPath)
        {
            var dotnetCli = DbgshimDetectUtil_Patched.DetectDotnetCliAutomatically();
            Log.Trace($"'dotnet' symlink path={dotnetCli}");
            dotnetCli = FileSystemUtil.GetFinalPathName(dotnetCli);
            Log.Trace($"'dotnet' real path={dotnetCli}");
            if (!dotnetCli.IsValidAndExistFile())
            {
                Console.WriteLine($"Failed to detect 'dotnet' location. See logs at {Environment.GetEnvironmentVariable("RESHARPER_HOST_LOG_DIR")}");
                return 500;
            }

            var dbgshimDirectory = DbgshimDetectUtil_Patched.GetDbgshimDirectory(assemblyPath, dotnetCli);
            if (!dbgshimDirectory.ExistsDirectory)
            {
                Console.WriteLine($"Failed to detect 'dbgshim' locations. See logs at {Environment.GetEnvironmentVariable("RESHARPER_HOST_LOG_DIR")}");
                return 500;
            }

            Console.WriteLine(dotnetCli);
            Console.WriteLine(dbgshimDirectory);
            return 0;
        }

        private static void SetUpLogging()
        {
            if (Environment.GetEnvironmentVariable("RESHARPER_HOST_LOG_DIR") == null)
            {
                return;
            }

            var logConfig = FileSystemPath.TryParse(Environment.GetEnvironmentVariable("RESHARPER_LOG_CONF"));
            if (logConfig.IsValidAndExistFile())
            {
                LogManager.Instance.Initialize(logConfig, LogSubconfiguration.Debug);
            }
            else
            {
                // fall back for remote debugger
                // get log dir from env
                Logger.AttachListener(Lifetime.Eternal, () => new FileLogEventListener("{env.RESHARPER_HOST_LOG_DIR}/{pname}_{date}.log", true), "", "file-listener");
            }
        }
    }
}
