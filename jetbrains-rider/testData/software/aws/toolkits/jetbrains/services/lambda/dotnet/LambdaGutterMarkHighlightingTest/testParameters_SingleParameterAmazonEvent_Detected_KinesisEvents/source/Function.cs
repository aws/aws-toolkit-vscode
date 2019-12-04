using Amazon.Lambda.Core;
using Amazon.Lambda.KinesisEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public string FunctionHandler(KinesisEvent inputData)
        {
            return inputData.Records.First().Kinesis.KinesisSchemaVersion;
        }
    }
}