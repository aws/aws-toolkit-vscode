using Amazon.Lambda.Core;
using Amazon.Lambda.DynamoDBEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

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