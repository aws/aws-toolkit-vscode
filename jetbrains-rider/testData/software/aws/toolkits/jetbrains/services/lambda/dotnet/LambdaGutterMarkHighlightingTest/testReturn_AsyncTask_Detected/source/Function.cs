using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;
using Task = System.Threading.Tasks.Task;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public async Task FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context)
        {
            await Task.Delay(100);
        }
    }
}