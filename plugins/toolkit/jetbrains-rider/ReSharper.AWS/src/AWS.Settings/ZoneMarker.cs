using JetBrains.Application.BuildScript.Application.Zones;
using JetBrains.ReSharper.Psi.CSharp;

namespace AWS.Settings
{
    [ZoneMarker]
    public class ZoneMarker : IRequire<ILanguageCSharpZone>
    {
    }
}
