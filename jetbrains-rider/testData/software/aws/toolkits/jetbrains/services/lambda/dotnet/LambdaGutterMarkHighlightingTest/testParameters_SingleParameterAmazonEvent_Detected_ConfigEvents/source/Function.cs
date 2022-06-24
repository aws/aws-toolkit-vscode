using Amazon.Lambda.Core;
using Amazon.Lambda.ConfigEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public string FunctionHandler(ConfigEvent inputData)
        {
            return inputData.ConfigRuleName;
        }
    }
}