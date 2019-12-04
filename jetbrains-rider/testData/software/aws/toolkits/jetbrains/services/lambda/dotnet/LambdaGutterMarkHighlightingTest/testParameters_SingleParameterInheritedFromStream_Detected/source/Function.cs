using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;
using System.IO;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public APIGatewayProxyResponse FunctionHandler(MyCustomStream stream)
        {
            return new APIGatewayProxyResponse();
        }
    }

    public class MyCustomStream : Stream
    {
    }
}