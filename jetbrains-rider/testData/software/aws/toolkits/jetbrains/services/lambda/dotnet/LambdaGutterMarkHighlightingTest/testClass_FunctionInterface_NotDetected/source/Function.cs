using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public interface Function
    {
        public APIGatewayProxyResponse FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context);
    }
}