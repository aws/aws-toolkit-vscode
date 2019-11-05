using System.Collections.Generic;
using AWS.Daemon.Lambda;
using AWS.Localization;
using JetBrains.Annotations;
using JetBrains.Application.UI.Controls.BulbMenu.Anchors;
using JetBrains.Application.UI.Controls.BulbMenu.Items;
using JetBrains.Application.UI.Icons.ComposedIcons;
using JetBrains.ProjectModel;
using JetBrains.ReSharper.Host.Features.RunMarkers;
using JetBrains.ReSharper.Resources.Shell;
using JetBrains.RiderTutorials.Utils;
using JetBrains.TextControl.DocumentMarkup;
using JetBrains.UI.Icons;
using JetBrains.UI.RichText;
using JetBrains.UI.ThemedIcons;
using JetBrains.Util;
using JetBrains.Util.Logging;

namespace AWS.Daemon.RunMarkers
{
    public abstract class LambdaRunMarkerGutterMark : IconGutterMark
    {
        private static readonly ILogger ourLogger = Logger.GetLogger<LambdaRunMarkerGutterMark>();

        public override IAnchor Anchor => BulbMenuAnchors.PermanentBackgroundItems;

        protected LambdaRunMarkerGutterMark([NotNull] IconId iconId) : base(iconId)
        {
        }

        public override IEnumerable<BulbMenuItem> GetBulbMenuItems(IHighlighter highlighter)
        {
            if (!(highlighter.UserData is RunMarkerHighlighting runMarker)) yield break;

            var solution = Shell.Instance.GetComponent<SolutionsManager>().Solution;
            if (solution == null) yield break;

            if (runMarker.AttributeId != LambdaRunMarkerAttributeIds.LAMBDA_RUN_METHOD_MARKER_ID)
                yield break;

            foreach (var item in GetRunMethodItems(solution, runMarker))
            {
                yield return item;
            }
        }

        private IEnumerable<BulbMenuItem> GetRunMethodItems(ISolution solution,
            [NotNull] RunMarkerHighlighting runMarker)
        {
            var lambdaHost = solution.GetComponent<LambdaDaemonHost>();
            var javaPropertiesLoader = solution.GetComponent<JavaPropertiesLoader>();

            var methodName = runMarker.Method.ShortName;
            if (methodName.IsEmpty())
            {
                ourLogger.Warn("MethodName for lambda runMarker should not be empty");
                yield break;
            }

            var handlerString = ComposeHandlerString(runMarker);

            yield return new BulbMenuItem(
                new ExecutableItem(() => { lambdaHost.RunLambda(methodName, handlerString); }),
                new RichText($"Run '[Local] {methodName}'"),
                LambdaRunMarkersThemedIcons.RunThis.Id, BulbMenuAnchors.PermanentBackgroundItems);

            yield return new BulbMenuItem(
                new ExecutableItem(() => { lambdaHost.DebugLambda(methodName, handlerString); }),
                new RichText($"Debug '[Local] {methodName}'"),
                LambdaRunMarkersThemedIcons.DebugThis.Id, BulbMenuAnchors.PermanentBackgroundItems);

            yield return new BulbMenuItem(
                new ExecutableItem(() => { lambdaHost.CreateNewLambda(methodName, handlerString); }),
                new RichText(javaPropertiesLoader.GetLocalizedString("lambda.create_new")),
                CompositeIconId.Compose(LambdaRunMarkersThemedIcons.Lambda.Id,
                    LambdaRunMarkersThemedIcons.CreateNew.Id), BulbMenuAnchors.PermanentBackgroundItems);
        }

        [NotNull]
        private static string ComposeHandlerString([NotNull] RunMarkerHighlighting runMarker)
        {
            var project = runMarker.Project;
            if (project == null) return "";

            var assemblyName = project.GetOutputAssemblyName(runMarker.TargetFrameworkId);

            var containingType = runMarker.Method.GetContainingType();
            if (containingType == null) return "";

            var typeString = containingType.GetFullClrName();

            var methodName = runMarker.Method.ShortName;

            return $"{assemblyName}::{typeString}::{methodName}";
        }
    }

    public class LambdaMethodRunMarkerGutterMark : LambdaRunMarkerGutterMark
    {
        public LambdaMethodRunMarkerGutterMark() : base(LambdaRunMarkersThemedIcons.Lambda.Id)
        {
        }
    }
}
