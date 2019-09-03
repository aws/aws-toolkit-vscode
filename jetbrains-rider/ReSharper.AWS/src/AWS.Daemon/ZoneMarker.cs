using JetBrains.Application.BuildScript.Application.Zones;
using JetBrains.ReSharper.Feature.Services;
using JetBrains.ReSharper.Psi.CSharp;

namespace ReSharper.AWS
{
    [ZoneMarker]
    public class ZoneMarker : IRequire<ILanguageCSharpZone>, IRequire<ICodeEditingZone>
    {
    }
}