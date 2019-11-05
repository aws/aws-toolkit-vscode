using AWS.Daemon.Settings;
using AWS.Psi.Lambda;
using JetBrains.Application.Settings;
using JetBrains.ReSharper.Feature.Services.Daemon;
using JetBrains.ReSharper.Host.Features.RunMarkers;
using JetBrains.ReSharper.Psi;
using JetBrains.ReSharper.Psi.Caches.SymbolCache;
using JetBrains.ReSharper.Psi.CSharp;
using JetBrains.ReSharper.Psi.CSharp.Tree;
using JetBrains.ReSharper.Psi.Tree;
using IMethodDeclaration = JetBrains.ReSharper.Psi.CSharp.Tree.IMethodDeclaration;

namespace AWS.Daemon.RunMarkers
{
    [Language(typeof(CSharpLanguage))]
    public class LambdaRunMarkerProvider : IRunMarkerProvider
    {
        public double Priority => RunMarkerProviderPriority.DEFAULT;

        public void CollectRunMarkers(IFile file, IContextBoundSettingsStore settings, IHighlightingConsumer consumer)
        {
            var isLambdaGutterMarksEnabled = settings.GetValue((LambdaGutterMarkSettings s) => s.Enabled);
            if (!isLambdaGutterMarksEnabled) return;
            if (!(file is ICSharpFile csharpFile)) return;
            if (!LambdaFinder.IsLambdaProjectType(file.GetProject())) return;

            foreach (var declaration in CachedDeclarationsCollector.Run<IMethodDeclaration>(csharpFile))
            {
                if (!(declaration.DeclaredElement is IMethod method)) continue;
                if (!LambdaFinder.IsSuitableLambdaMethod(method)) continue;

                var range = declaration.GetNameDocumentRange();

                var highlighting = new RunMarkerHighlighting(declaration,
                    LambdaRunMarkerAttributeIds.LAMBDA_RUN_METHOD_MARKER_ID, range,
                    file.GetPsiModule().TargetFrameworkId);

                consumer.AddHighlighting(highlighting, range);
            }
        }
    }
}
