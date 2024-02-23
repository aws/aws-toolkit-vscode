using JetBrains.Application.BuildScript.Application.Zones;
using JetBrains.ReSharper.Feature.Services;
using JetBrains.ReSharper.Psi.CSharp;

namespace AWS.Daemon
{
    [ZoneMarker]
    public class ZoneMarker : IRequire<ILanguageCSharpZone>, IRequire<ICodeEditingZone>
    {
    }
}
