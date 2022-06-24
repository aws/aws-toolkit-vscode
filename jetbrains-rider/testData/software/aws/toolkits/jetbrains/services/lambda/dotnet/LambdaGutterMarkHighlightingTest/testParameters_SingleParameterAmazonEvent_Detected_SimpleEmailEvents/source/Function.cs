using Amazon.Lambda.Core;
using Amazon.Lambda.SimpleEmailEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public string FunctionHandler(SimpleEmailEvent inputData)
        {
            return inputData.Records.First().EventSource;
        }
    }
}