using AWS.Toolkit.Rider.Model;
using JetBrains.ProjectModel;

#if (PROFILE_2022_2 || PROFILE_2022_3 || PROFILE_2023_1) // FIX_WHEN_MIN_IS_232
using JetBrains.RdBackend.Common.Features;
#else
using JetBrains.ReSharper.Feature.Services.Protocol;
#endif

namespace AWS.Daemon.Lambda
{
    [SolutionComponent]
    public class LambdaDaemonHost
    {
        private readonly LambdaDaemonModel _model;

        public LambdaDaemonHost(ISolution solution)
        {
            _model = solution.GetProtocolSolution().GetLambdaDaemonModel();
        }

        public void RunLambda(string methodName, string handler)
        {
            _model.RunLambda(new LambdaRequest(methodName, handler));
        }

        public void DebugLambda(string methodName, string handler)
        {
            _model.DebugLambda(new LambdaRequest(methodName, handler));
        }

        public void CreateNewLambda(string methodName, string handler)
        {
            _model.CreateNewLambda(new LambdaRequest(methodName, handler));
        }
    }
}
