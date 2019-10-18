using Amazon.Lambda.Core;
using Amazon.Lambda.CloudWatchEvents;
using Task = System.Threading.Tasks.Task;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.Json.JsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public async Task FunctionHandler(CloudWatchEvent<string> inputData)
        {
            await Task.Delay(100);
        }
    }
}