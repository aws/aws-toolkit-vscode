using Amazon.Lambda.Core;
using Amazon.Lambda.ApplicationLoadBalancerEvents;

[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace HelloWorld
{
    public class Function
    {
        public ApplicationLoadBalancerResponse FunctionHandler(ApplicationLoadBalancerRequest appLoadBalancerEvent)
        {
            return new ApplicationLoadBalancerResponse();
        }
    }
}