using AWS.Daemon.Settings;
using AWS.Toolkit.Rider.Model;
using JetBrains.Annotations;
using JetBrains.Application.Settings;
using JetBrains.Lifetimes;
using JetBrains.ProjectModel;
using JetBrains.ProjectModel.DataContext;
using JetBrains.ReSharper.Daemon.Impl;

#if (PROFILE_2022_2 || PROFILE_2022_3 || PROFILE_2023_1) // FIX_WHEN_MIN_IS_232
using JetBrains.RdBackend.Common.Features;
#else
using JetBrains.ReSharper.Feature.Services.Protocol;
#endif

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
