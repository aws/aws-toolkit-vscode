using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;
using System.IO;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public void FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context)
        {
            return;
        }
    }
}
