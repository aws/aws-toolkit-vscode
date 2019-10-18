using Amazon.Lambda.Core;
using Amazon.Lambda.KinesisFirehoseEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public string FunctionHandler(KinesisFirehoseEvent inputData)
        {
            return inputData.Records.First().DecodeData();
        }
    }
}