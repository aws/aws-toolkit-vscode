using JetBrains.ProjectModel;
using JetBrains.ReSharper.Host.Features;
using JetBrains.Rider.Model;

namespace ReSharper.AWS.Lambda
{
    [SolutionComponent]
    public class LambdaHost
    {
        private readonly LambdaModel myModel;

        public LambdaHost(ISolution solution)
        {
            myModel = solution.GetProtocolSolution().GetLambdaModel();
        }

        public void RunLambda(string methodName, string handler)
        {
            myModel.RunLambda(new LambdaRequest(methodName, handler));
        }

        public void DebugLambda(string methodName, string handler)
        {
            myModel.DebugLambda(new LambdaRequest(methodName, handler));
        }

        public void CreateNewLambda(string methodName, string handler)
        {
            myModel.CreateNewLambda(new LambdaRequest(methodName, handler));
        }
    }
}