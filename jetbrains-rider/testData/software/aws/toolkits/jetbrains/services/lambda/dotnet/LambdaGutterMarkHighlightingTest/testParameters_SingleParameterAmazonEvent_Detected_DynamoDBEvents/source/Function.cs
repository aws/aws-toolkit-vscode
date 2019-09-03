using Amazon.Lambda.Core;
using Amazon.Lambda.DynamoDBEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public string FunctionHandler(DynamoDBEvent inputData)
        {
            return inputData.Records.First().EventSourceArn;
        }
    }
}