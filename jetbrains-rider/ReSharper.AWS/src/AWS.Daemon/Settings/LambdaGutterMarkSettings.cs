using System;
using System.Linq.Expressions;
using JetBrains.Application.Settings;
using JetBrains.Application.Settings.WellKnownRootKeys;

namespace AWS.Daemon.Settings
{
    [SettingsKey(typeof(EnvironmentSettings), "AWS Lambda gutter mark settings")]
    public class LambdaGutterMarkSettings
    {
        [SettingsEntry(true, "Show gutter icons for all potential AWS Lambda handlers")]
        public bool Enabled;
    }

    public class LambdaGutterMarkSettingsExtensions
    {
        public static Expression<Func<LambdaGutterMarkSettings, bool>> Enabled = settings => settings.Enabled;
    }
}
