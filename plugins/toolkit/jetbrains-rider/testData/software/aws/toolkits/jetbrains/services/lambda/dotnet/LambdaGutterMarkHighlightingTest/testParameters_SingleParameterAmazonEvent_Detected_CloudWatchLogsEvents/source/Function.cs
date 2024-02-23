using Amazon.Lambda.Core;
using Amazon.Lambda.CloudWatchLogsEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public string FunctionHandler(CloudWatchLogsEvent inputData)
        {
            return inputData.Awslogs.DecodeData();
        }
    }
}