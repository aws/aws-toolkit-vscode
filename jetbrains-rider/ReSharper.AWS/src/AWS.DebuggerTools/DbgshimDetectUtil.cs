using System.Linq;
using JetBrains.Application.platforms;
using JetBrains.Util;

namespace AWS.RiderDebuggerTools
{
  public static class DbgshimDetectUtil_Patched
  {
    private static readonly string ourDotnetName = PlatformUtil.IsRunningUnderWindows ? "dotnet.exe" : "dotnet"; 

    private static readonly ILogger ourLogger = JetBrains.Util.Logging.Logger.GetLogger(typeof(DbgshimDetectUtil_Patched));
    
    public static FileSystemPath GetDbgshimDirectory(FileSystemPath assemblyPath, FileSystemPath runtimeExecutable)
    {
      var runtimeInstallDirectory = runtimeExecutable.Parent;
      ourLogger.Trace($"Runtime location dir = {runtimeInstallDirectory}");
      var platforms = DotNetCorePlatformsProvider.CollectPlatformsFromInstallationFolder(runtimeInstallDirectory);

      if (ourLogger.IsTraceEnabled())
      {
        ourLogger.Trace($"Platforms for the runtime: {string.Join(", ", platforms)}");
      }
      
      return DotNetCorePlatformDetectUtil_Patched.GetDbgShimDirectory(
        assemblyPath,
        DotNetCorePlatformDetectUtil.GetCorePlatformRangeFromJson,
        range => DotNetCorePlatformDetectUtil.GetBestPlatform(range, platforms, ourLogger), ourLogger);
    }
    
    private static bool IsValidCoreRuntime(FileSystemPath installationFolder)
    {
        var exePath = installationFolder / ourDotnetName;
        ourLogger.Trace($"{exePath} exists={exePath.ExistsFile}");
        var sharedDir = exePath.Directory.Combine("shared");
        ourLogger.Trace($"{sharedDir} exists={sharedDir.ExistsDirectory}");
        return exePath.ExistsFile && sharedDir.ExistsDirectory;
    }

    
    public static FileSystemPath DetectDotnetCliAutomatically()
    {
        var cliDirectory = DotNetCoreRuntimesDetector.GetPossibleInstallationFolders().FirstOrDefault(IsValidCoreRuntime);
        if (cliDirectory != null)
            return cliDirectory / ourDotnetName;
        return FileSystemPath.Empty;
    }
  }
}
