using AWS.Daemon.Settings;
using JetBrains.Annotations;
using JetBrains.Application.Settings;
using JetBrains.Lifetimes;
using JetBrains.ProjectModel;
using JetBrains.ProjectModel.DataContext;
using JetBrains.ReSharper.Daemon.Impl;
using JetBrains.ReSharper.Host.Features;
using JetBrains.Rider.Model;

namespace AWS.Settings
{
    [SolutionComponent]
    public class AwsSettingsHost
    {
        public AwsSettingsHost(Lifetime lifetime, [NotNull] ISolution solution, [NotNull] ISettingsStore settingsStore)
        {
            var model = solution.GetProtocolSolution().GetAwsSettingModel();

            var contextBoundSettingsStoreLive = settingsStore.BindToContextLive(lifetime, ContextRange.Smart(solution.ToDataContext()));

            model.ShowLambdaGutterMarks.Advise(lifetime, isEnabled =>
            {
                var entry = settingsStore.Schema.GetScalarEntry( (LambdaGutterMarkSettings s) => s.Enabled);
                contextBoundSettingsStoreLive.SetValue(entry, isEnabled, null);
                solution.GetComponent<DaemonImpl>().Invalidate();
            });
        }
    }
}
