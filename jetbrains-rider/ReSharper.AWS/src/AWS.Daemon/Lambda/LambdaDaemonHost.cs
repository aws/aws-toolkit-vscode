using AWS.Toolkit.Rider.Model;
using JetBrains.ProjectModel;

#if (PROFILE_2021_1) // TODO: Remove preprocessor conditions FIX_WHEN_MIN_IS_212
using JetBrains.ReSharper.Host.Features;
#else
using JetBrains.RdBackend.Common.Features;
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
