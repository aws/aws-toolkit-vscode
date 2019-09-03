using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;
using System.IO;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public Stream FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context)
        {
            var response = new APIGatewayProxyResponse();
            return new MemoryStream(response.StatusCode);
        }
    }
}