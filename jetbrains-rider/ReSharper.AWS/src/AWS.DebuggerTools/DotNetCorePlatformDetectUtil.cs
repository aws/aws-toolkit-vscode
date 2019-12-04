using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using JetBrains.Annotations;
using JetBrains.Application.platforms;
using JetBrains.Util;
using JetBrains.Util.Dotnet.TargetFrameworkIds;
using JetBrains.Util.Extension;
using JetBrains.Util.Logging;
using Newtonsoft.Json.Linq;
using NuGet.Frameworks;
using NuGet.Versioning;

namespace AWS.RiderDebuggerTools
{
  public static class DotNetCorePlatformDetectUtil_Patched
  {
    private const string RuntimeConfigExtension = "runtimeconfig.json";

    private const string RuntimePackPrefix = "runtimepack.";
    private const string RuntimeSuffix = ".Runtime.";
    
    [CanBeNull]
    public static PlatformInfo GetBestPlatform(DotNetCorePlatformRange platformRange, List<PlatformInfo> platforms, ILogger logger)
    {
      if (platformRange.IsEmpty)
      {
        logger.Trace($"PlatformRange {platformRange} is empty, cannot find appropriate system framework");
        return null;
      }
      
      PlatformInfo result = null;
      var platformRangeMinVersion = platformRange.VersionRange.MinVersion;

      if (!platformRange.VersionRange.IsFloating && !platformRange.VersionRange.HasUpperBound)
      {
        if (platformRange.FrameworkIdentifier == FrameworkIdentifier.ASPNetCoreApp ||
            platformRange.FrameworkIdentifier == FrameworkIdentifier.ASPNetCoreAll ||
            platformRange.FrameworkIdentifier == FrameworkIdentifier.WindowsDesktopCore ||
            platformRange.FrameworkIdentifier == FrameworkIdentifier.NetCoreApp)
        {
          //see https://github.com/dotnet/core-setup, fx_muxer_t::resolve_framework_version
          //we use roll_fwd_on_no_candidate_fx = major_or_minor, patch_roll_fwd = false TODO patch_roll_fwd should be true

          var sameFrameworkPlatforms = platforms
            .Where(p => p.TargetFrameworkId.GetFrameworkIdentifier() == platformRange.FrameworkIdentifier).ToList();

          if (!platformRangeMinVersion.IsPrerelease)
          {
            logger.Trace($"Trying to find appropriate platform information for Platform Range {platformRange}, " +
                          "search inside release platforms");
            result = sameFrameworkPlatforms.Where(p => !p.NuGetVersion.IsPrerelease &&
                                          p.NuGetVersion >=
                                          platformRangeMinVersion)
              .OrderBy(p => p.NuGetVersion).FirstOrDefault();

            if (result != null) return result;

            logger.Trace("Cannot find appropriate release platform, search inside prerelease platforms");
            result = sameFrameworkPlatforms.Where(p =>
                p.NuGetVersion.IsPrerelease &&
                /*p.NuGetVersion >=
                platformRangeMinVersion)*/
                p.NuGetVersion.CompareTo(platformRangeMinVersion, VersionComparison.Version) >= 0)
              .OrderBy(p => p.NuGetVersion).FirstOrDefault();
          }
          else
          {
            logger.Trace($"Trying to find appropriate platform information for Platform Range {platformRange}, " +
                          "search inside prerelease platforms with the same version");
            result = sameFrameworkPlatforms.Where(p => p.NuGetVersion.IsPrerelease &&
                                          p.NuGetVersion.Major == platformRangeMinVersion.Major &&
                                          p.NuGetVersion.Minor == platformRangeMinVersion.Minor &&
                                          p.NuGetVersion.Patch == platformRangeMinVersion.Patch &&
                                          p.NuGetVersion >= platformRangeMinVersion)
              .OrderBy(p => p.NuGetVersion).LastOrDefault();
          }

          return result;
        }
      }
      
      var netCoreAppPlatforms = platforms
        .Where(p => p.TargetFrameworkId.GetFrameworkIdentifier() == FrameworkIdentifier.NetCoreApp).ToList();

      if (platformRange.FrameworkIdentifier == FrameworkIdentifier.NetStandart)
      {
        if (platformRangeMinVersion.Major == 1
            && platformRangeMinVersion.Minor <= 6)
        {
          return netCoreAppPlatforms.Where(p => p.NuGetVersion.Major >= 1)
            .OrderBy(p => p.NuGetVersion).LastOrDefault();
        }
        
        if (platformRangeMinVersion.Major == 2)
        {
          return netCoreAppPlatforms.Where(p => p.NuGetVersion.Major >= 2)
            .OrderBy(p => p.NuGetVersion).LastOrDefault();
        }
      }
      logger.Verbose("Use platform version search fallback for range: {0}", platformRange);
      var bestVersion = platformRange.VersionRange.FindBestMatch(netCoreAppPlatforms.Select(p => p.NuGetVersion));
      if (bestVersion != null)
      {
        result = netCoreAppPlatforms.FirstOrDefault(p => p.NuGetVersion == bestVersion);
      }

      if (bestVersion == null)
      {
        logger.Verbose(".NET Core platform not found for range: {0}", platformRange);
      }

      return result;
    }
    
    public static FrameworkIdentifier PlatformNameToFrameworkIdentifier(string platformName)
    {
      FrameworkIdentifier platformId = null;
      if (platformName == FrameworkIdentifier.NetCoreApp.PresentableName)
        platformId = FrameworkIdentifier.NetCoreApp;
      if (platformName == FrameworkIdentifier.NetStandart.PresentableName)
        platformId = FrameworkIdentifier.NetStandart;
      if (platformName.EndsWith("Microsoft.NETCore.App", StringComparison.OrdinalIgnoreCase))
        platformId = FrameworkIdentifier.NetCoreApp;
      if (platformName.EndsWith("NETStandard.Library", StringComparison.OrdinalIgnoreCase))
        platformId = FrameworkIdentifier.NetStandart;
      if (platformName.EndsWith("Microsoft.AspNetCore.App", StringComparison.OrdinalIgnoreCase))
        platformId = FrameworkIdentifier.ASPNetCoreApp;
      if (platformName.EndsWith("Microsoft.AspNetCore.All", StringComparison.OrdinalIgnoreCase))
        platformId = FrameworkIdentifier.ASPNetCoreAll;
      if (platformName.EndsWith("Microsoft.WindowsDesktop.App", StringComparison.OrdinalIgnoreCase))
        platformId = FrameworkIdentifier.WindowsDesktopCore;
      if (platformName.EndsWith("Microsoft.NETCore.Platforms", StringComparison.OrdinalIgnoreCase))
        platformId = FrameworkIdentifier.NetCorePlatforms;
      return platformId;
    }    
    
    public static bool IsDbgShimExists(FileSystemPath frameworkFolder)
    {
      RelativePath relShimDll;
      var runPlatform = PlatformUtil.RuntimePlatform;
      switch (runPlatform)
      {
        case PlatformUtil.Platform.Windows:
          relShimDll = "dbgshim.dll";
          break;
        case PlatformUtil.Platform.MacOsX:
          relShimDll = "libdbgshim.dylib";
          break;
        case PlatformUtil.Platform.Linux:
          relShimDll = "libdbgshim.so";
          break;
        default:
          return false;
      }
      return (frameworkFolder / relShimDll).ExistsFile;
    }

    public static DotNetCorePlatformRange ParseRuntimeConfigJsonFile(JObject document)
    {
      if (!(document.GetValue("runtimeOptions") is JObject runtimeOptions)) return DotNetCorePlatformRange.Empty;
      if (!(runtimeOptions.GetValue("framework") is JObject framework)) return DotNetCorePlatformRange.Empty;
      var platformNameToken = framework.GetValue("name") as JValue;
      var versionToken = framework.GetValue("version") as JValue;
            
      if (platformNameToken == null || versionToken == null) return DotNetCorePlatformRange.Empty;
            
      var platformName = platformNameToken.ToString(CultureInfo.InvariantCulture);
      var platformId = PlatformNameToFrameworkIdentifier(platformName);

      return new DotNetCorePlatformRange(platformId, versionToken.ToString(CultureInfo.InvariantCulture));
    }

    public static DotNetCorePlatformRange GetCorePlatformRangeFromJson(FileSystemPath jsonPath)
    {
      if (!jsonPath.ExistsFile)
        return DotNetCorePlatformRange.Empty;
      using (var reader = new StreamReader(jsonPath.OpenFileForReading()))
      {
        var document = JObject.Parse(reader.ReadToEnd());
        return ParseRuntimeConfigJsonFile(document);
      }
    }

    public static FileSystemPath GetJsonFileByLauncher(FileSystemPath launcherPath, string jsonFileExtensionWithoutDot)
    {
      return PlatformUtil.IsRunningUnderWindows
        ? launcherPath.ChangeExtension(jsonFileExtensionWithoutDot)
        : launcherPath.Directory.Combine($"{launcherPath.Name}.{jsonFileExtensionWithoutDot}");
    }

    private static JObject GetJObjectFromDeps(FileSystemPath depsJsonPath)
    {
      return Logger.CatchSilent(() =>
      {
        using (var reader = new StreamReader(depsJsonPath.OpenFileForReading()))
        {
          return JObject.Parse(reader.ReadToEnd());
        }
      });
    }

    [NotNull]
    private static DotNetCorePlatformRange GetPlatformRangeFromDepsJson(FileSystemPath depsFilePath)
    {
      var runtimeId = GetRuntimeIdUsingDepsJson(depsFilePath);
      if (runtimeId == null) return DotNetCorePlatformRange.Empty;
      var platformIdentifier = runtimeId.Split('/').Skip(1).FirstOrDefault();
      if (platformIdentifier == null) return DotNetCorePlatformRange.Empty;
      var depsDocument = GetJObjectFromDeps(depsFilePath);
      if (depsDocument == null) return DotNetCorePlatformRange.Empty;
      if (!(depsDocument.GetValue("targets") is JObject targetsSection)) return DotNetCorePlatformRange.Empty;
      var runtimeTarget = targetsSection.Children<JProperty>().FirstOrDefault(child => child.Name == runtimeId);
      if (runtimeTarget == null) return DotNetCorePlatformRange.Empty;
      return runtimeTarget.Value.Children<JProperty>().SelectNotNull(dependency =>
      {
        var dependencyName = dependency.Name;
        if (!dependencyName.StartsWith(RuntimePackPrefix)) return null;
        var dependencyParts = dependencyName.RemoveStart(RuntimePackPrefix).Split("/");
        if (dependencyParts.Length != 2) return null;
        var runtimeInfo = GetRuntimeInfo(dependencyParts[0], platformIdentifier);
        if (runtimeInfo == null) return null;
        var versionInfo = dependencyParts[1];
        return new DotNetCorePlatformRange(PlatformNameToFrameworkIdentifier(runtimeInfo), versionInfo);
      }).FirstOrDefault(DotNetCorePlatformRange.Empty);
    }

    private static string GetRuntimeInfo(string dependency, string platformIdentifier)
    {
      var possibleRuntimeInfoSuffix = $"{RuntimeSuffix}{platformIdentifier}";
      if (dependency.EndsWith(possibleRuntimeInfoSuffix)) return dependency.RemoveEnd(possibleRuntimeInfoSuffix);
      var portablePlatformIdentifier = GetPortablePlatformIdentifier(platformIdentifier);
      var possiblePortableRuntimeInfoSuffix = $"{RuntimeSuffix}{portablePlatformIdentifier}";
      if (dependency.EndsWith(possiblePortableRuntimeInfoSuffix)) return dependency.RemoveEnd(possiblePortableRuntimeInfoSuffix);
      return null;
    }

    private static string GetPortablePlatformIdentifier(string platformIdentifier)
    {
      var platformIdentifierParts = platformIdentifier.Split("-");
      if (platformIdentifierParts.Length < 2)
        return platformIdentifier;
      var architectureType = platformIdentifierParts.Last();
      if (platformIdentifier.StartsWith("win")) return $"win-{architectureType}";
      if (platformIdentifier.StartsWith("osx")) return $"osx-{architectureType}";
      return platformIdentifier;
    }

    [CanBeNull]
    public static string GetRuntimeIdUsingOutputStructure(FileSystemPath executePath)
    {
      var tfmKey = executePath.Parent.Parent.Name;
      var runtimeIdentifier = executePath.Directory.Name;
      var nuGetFramework = NuGetFramework.ParseFolder(tfmKey, DefaultFrameworkNameProvider.Instance);
      if (nuGetFramework == null) return null;
      var runtimeId = $"{nuGetFramework.DotNetFrameworkName}/{runtimeIdentifier}";
      return runtimeId;
    }
    
    [CanBeNull]
    public static string GetRuntimeIdUsingDepsJson(FileSystemPath depsJsonPath)
    {
      var document = GetJObjectFromDeps(depsJsonPath);
      var runtimeTarget = document?.GetValue("runtimeTarget") as JObject;
      var runtimeTargetName = runtimeTarget?.GetValue("name") as JValue;
      return runtimeTargetName?.Value as string;
    }

    [NotNull]
    public delegate DotNetCorePlatformRange RuntimeConfigToPlatformRange([NotNull] FileSystemPath runtimeConfigPath);
    [CanBeNull]
    public delegate PlatformInfo PlatformRangeToPlatformInfo([NotNull] DotNetCorePlatformRange platformRange);
    
    public static FileSystemPath GetDbgShimDirectory(FileSystemPath assemblyPath, 
      RuntimeConfigToPlatformRange runtimeConfigJsonToPlatformRange, PlatformRangeToPlatformInfo platformRangeToInfo, ILogger logger)
    {
      var runtimeConfigPath = assemblyPath.ChangeExtension(RuntimeConfigExtension);
      logger.Trace($"Using runtime config: {runtimeConfigPath}");
      var platform = platformRangeToInfo(runtimeConfigJsonToPlatformRange(runtimeConfigPath));
      
      if (platform == null)
      {
        logger.Trace("Detecting platform using deps.json...");
        var depsFile = GetJsonFileByLauncher(assemblyPath, "deps.json");
        var platformRangeFromDepsJson = GetPlatformRangeFromDepsJson(depsFile);
        platform = platformRangeToInfo(platformRangeFromDepsJson);
      }

      logger.Trace($"Detected platform is {platform?.ToString() ?? "<no platform>"}");

      while (platform != null && !IsDbgShimExists(platform.TargetFrameworkFolder))
      {
        logger.Trace($"dbgshim was not found in {platform.TargetFrameworkFolder}");
        var frameworkRuntimeConfigPath = platform.TargetFrameworkFolder /
                                         RelativePath.TryParse(
                                           $"{platform.TargetFrameworkId.PresentableString}.{RuntimeConfigExtension}");
        platform = platformRangeToInfo(runtimeConfigJsonToPlatformRange(frameworkRuntimeConfigPath));
        logger.Trace($"The next platform is {platform?.ToString() ?? "<no platform>"}");
      }

      logger.Trace(
        $"The final platform is {platform?.ToString() ?? "<no platform>"}. Shim directory: {platform?.TargetFrameworkFolder?.ToString() ?? "<no platform>"}");

      return platform != null ? platform.TargetFrameworkFolder : FileSystemPath.Empty;
    }

    public static FileSystemPath GetRuntimeConfigFromAssemblyPath(FileSystemPath assemblyPath)
    {
      return assemblyPath.ChangeExtension(RuntimeConfigExtension);
    }

    [CanBeNull]
    public static FrameworkIdentifier PlatformLikeStringToFrameworkIdentifier(string platformName)
    {
      while (platformName.Length > 0)
      {
        var identifier = PlatformNameToFrameworkIdentifier(platformName);
        if (identifier != null)
        {
          return identifier;
        }

        var lastDotIndex = platformName.LastIndexOf('.');
        if (lastDotIndex == -1) break;

        platformName = platformName.Substring(0, lastDotIndex);
      }

      return null;
    }
  }
}
