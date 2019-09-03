using JetBrains.TextControl.DocumentMarkup;
using ReSharper.AWS.RunMarkers;

[assembly:
    RegisterHighlighter(
        LambdaRunMarkerAttributeIds.LAMBDA_RUN_METHOD_MARKER_ID,
        GutterMarkType = typeof(LambdaMethodRunMarkerGutterMark),
        EffectType = EffectType.GUTTER_MARK,
        Layer = HighlighterLayer.SYNTAX + 1
    )
]

namespace ReSharper.AWS.RunMarkers
{
    public static class LambdaRunMarkerAttributeIds
    {
        public const string LAMBDA_RUN_METHOD_MARKER_ID = "AWS Lambda Run Method Gutter Mark";
    }
}