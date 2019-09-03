using Amazon.Lambda.Core;
using Amazon.Lambda.S3Events;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public string FunctionHandler(S3Event inputData)
        {
            return inputData.Records.First().S3.Bucket.Name;
        }
    }
}