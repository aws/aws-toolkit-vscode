using AWS.Daemon.RunMarkers;
using JetBrains.TextControl.DocumentMarkup;

[assembly:
    RegisterHighlighter(
        LambdaRunMarkerAttributeIds.LAMBDA_RUN_METHOD_MARKER_ID,
        GutterMarkType = typeof(LambdaMethodRunMarkerGutterMark),
        EffectType = EffectType.GUTTER_MARK,
        Layer = HighlighterLayer.SYNTAX + 1
    )
]

namespace AWS.Daemon.RunMarkers
{
    public static class LambdaRunMarkerAttributeIds
    {
        public const string LAMBDA_RUN_METHOD_MARKER_ID = "AWS Lambda Run Method Gutter Mark";
    }
}
