using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;

namespace HelloWorld
{
    public class Function
    {
        public APIGatewayProxyResponse FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context)
        {
            return new APIGatewayProxyResponse();
        }
    }
}