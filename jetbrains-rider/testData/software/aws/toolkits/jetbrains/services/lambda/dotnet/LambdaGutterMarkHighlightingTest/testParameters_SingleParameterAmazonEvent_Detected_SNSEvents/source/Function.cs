using Amazon.Lambda.Core;
using Amazon.Lambda.SNSEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public string FunctionHandler(SNSEvent inputData)
        {
            return inputData.Records.First().Sns.Message;
        }
    }
}