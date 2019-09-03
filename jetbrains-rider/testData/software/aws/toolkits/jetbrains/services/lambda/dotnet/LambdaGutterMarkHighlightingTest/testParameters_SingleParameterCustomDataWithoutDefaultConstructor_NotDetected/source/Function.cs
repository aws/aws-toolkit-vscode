using Amazon.Lambda.APIGatewayEvents;
using Amazon.Lambda.Core;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public APIGatewayProxyResponse FunctionHandler(MyCustomData inputData)
        {
            return new APIGatewayProxyResponse();
        }
    }

    public class MyCustomData
    {
        public int Data { get; private set; }

        public MyCustomData(int data)
        {
            Data = data;
        }
    }
}