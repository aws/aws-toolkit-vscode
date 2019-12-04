using Amazon.Lambda.Core;
using Amazon.Lambda.LexEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public LexResponse FunctionHandler(LexEvent inputData)
        {
            return new LexResponse();
        }
    }
}