using System;
using Amazon.Lambda.Core;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public DateTime FunctionHandler(DateTime inputData)
        {
            return DateTime.Now;
        }
    }
}