using JetBrains.ProjectModel;
using JetBrains.ReSharper.Host.Features;
using JetBrains.Rider.Model;

namespace AWS.Psi.Lambda
{
    [SolutionComponent]
    public class LambdaPsiHost
    {
        private readonly LambdaPsiModel myModel;

        public LambdaPsiHost(ISolution solution)
        {
            myModel = solution.GetProtocolSolution().GetLambdaPsiModel();

            myModel.IsHandlerExists.Set((lifetime, handlerExistRequest) =>
            {
                var className = handlerExistRequest.ClassName;
                var methodName = handlerExistRequest.MethodName;
                var projectId = handlerExistRequest.ProjectId;

                var backendPsiHelperModel = solution.GetProtocolSolution().GetBackendPsiHelperModel();
                return backendPsiHelperModel.IsMethodExists.Handler.Invoke(
                    lifetime, new MethodExistingRequest(className, methodName, "", projectId));
            });
        }
    }
}
