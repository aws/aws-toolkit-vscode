using JetBrains.Application.BuildScript.Application.Zones;
using JetBrains.ReSharper.Psi.CSharp;

namespace AWS.Psi
{
    [ZoneMarker]
    public class ZoneMarker : IRequire<ILanguageCSharpZone>
    {
    }
}