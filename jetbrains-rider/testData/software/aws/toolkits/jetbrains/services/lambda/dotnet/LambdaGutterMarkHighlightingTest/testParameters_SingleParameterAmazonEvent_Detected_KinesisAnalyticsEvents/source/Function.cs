using Amazon.Lambda.Core;
using Amazon.Lambda.KinesisAnalyticsEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public KinesisAnalyticsOutputDeliveryResponse FunctionHandler(KinesisAnalyticsOutputDeliveryEvent inputData)
        {
            return new KinesisAnalyticsOutputDeliveryResponse();
        }
    }
}