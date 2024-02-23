using AWS.Daemon.RunMarkers;
using JetBrains.TextControl.DocumentMarkup;

namespace AWS.Daemon.RunMarkers
{
    [RegisterHighlighter(
        LAMBDA_RUN_METHOD_MARKER_ID,
        GutterMarkType = typeof(LambdaMethodRunMarkerGutterMark),
        EffectType = EffectType.GUTTER_MARK,
        Layer = HighlighterLayer.SYNTAX + 1
    )]
    public static class LambdaRunMarkerAttributeIds
    {
        public const string LAMBDA_RUN_METHOD_MARKER_ID = "AWS Lambda Run Method Gutter Mark";
    }
}
