using System.Threading.Tasks;
using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public async void FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context)
        {
            await Task.Delay(100);
        }
    }
}