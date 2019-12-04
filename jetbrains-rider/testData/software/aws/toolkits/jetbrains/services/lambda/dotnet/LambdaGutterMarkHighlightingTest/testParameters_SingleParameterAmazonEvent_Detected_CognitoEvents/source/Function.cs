using Amazon.Lambda.Core;
using Amazon.Lambda.CognitoEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public string FunctionHandler(CognitoEvent inputData)
        {
            return inputData.DatabaseName;
        }
    }
}