using System.IO;
using Amazon.Lambda.Core;
using Amazon.Lambda.APIGatewayEvents;
using HelloWorld;

[assembly: LambdaSerializer(typeof(MyCustomSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public APIGatewayProxyResponse FunctionHandler(APIGatewayProxyRequest apigProxyEvent, ILambdaContext context)
        {
            return new APIGatewayProxyResponse();
        }
    }

    public class MyCustomSerializer : ILambdaSerializer
    {
        public T Deserialize<T>(Stream requestStream)
        {
            throw new System.NotImplementedException();
        }

        public void Serialize<T>(T response, Stream responseStream)
        {
            throw new System.NotImplementedException();
        }
    }
}
