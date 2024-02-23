using JetBrains.Application.BuildScript.Application.Zones;
using JetBrains.ProjectModel;
using JetBrains.ReSharper.Psi.CSharp;

namespace AWS.Project
{
    [ZoneMarker]
    public class ZoneMarker : IRequire<ILanguageCSharpZone>, IRequire<IProjectModelZone>
    {
    }
}
