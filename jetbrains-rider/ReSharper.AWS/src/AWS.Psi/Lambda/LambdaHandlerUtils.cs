using JetBrains.Annotations;
using JetBrains.ProjectModel;
using JetBrains.ReSharper.Psi;
using JetBrains.ReSharper.Psi.Modules;
using JetBrains.RiderTutorials.Utils;

namespace AWS.Psi.Lambda
{
    public static class LambdaHandlerUtils
    {
        [NotNull]
        public static string ComposeHandlerString([NotNull] IMethod method)
        {
            if (!(method.Module is IProjectPsiModule projectPsiModule)) return "";

            var project = projectPsiModule.Project;
            var assemblyName = project.GetOutputAssemblyName(project.GetCurrentTargetFrameworkId());

            var containingType = method.GetContainingType();
            if (containingType == null) return "";

            var typeString = containingType.GetFullClrName();

            var methodName = method.ShortName;

            return $"{assemblyName}::{typeString}::{methodName}";
        }
    }
}
