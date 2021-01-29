using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Amazon.Lambda.Core;

// Assembly attribute to enable the Lambda function's JSON input to be converted into a .NET class.
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace EchoLambda
{
    public class Function
    {
        public System.Collections.IDictionary FunctionHandler(ILambdaContext context)
        {
            return System.Environment.GetEnvironmentVariables();
        }
    }
}
