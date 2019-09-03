using System.Collections;
using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public APIGatewayProxyResponse FunctionHandler(MyCustomDictionary inputData)
        {
            return new APIGatewayProxyResponse();
        }
    }

    public class MyCustomDictionary<T> : IDictionary<String, T> {}
}