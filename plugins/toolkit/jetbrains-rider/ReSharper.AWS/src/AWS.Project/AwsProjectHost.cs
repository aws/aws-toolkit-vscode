using AWS.Toolkit.Rider.Model;
using JetBrains.ProjectModel;
using JetBrains.Rd.Tasks;
using JetBrains.ReSharper.Resources.Shell;
using JetBrains.Util;

#if (PROFILE_2022_2 || PROFILE_2022_3 || PROFILE_2023_1) // FIX_WHEN_MIN_IS_232
using JetBrains.RdBackend.Common.Features;
#else
using JetBrains.ReSharper.Feature.Services.Protocol;
#endif

namespace AWS.Project
{
    [SolutionComponent]
    public class AwsProjectHost
    {
        public AwsProjectHost(ISolution solution)
        {
            var model = solution.GetProtocolSolution().GetAwsProjectModel();

            model.GetProjectOutput.Set((lifetime, request) =>
            {
                var task = new RdTask<AwsProjectOutput>();
                var assemblyPathPrefix = FileSystemPath.Parse(request.ProjectPath);

                using (ReadLockCookie.Create())
                {
                    var allProjects = solution.GetAllProjects();

                    foreach (var project in allProjects)
                    {
                        var targetFrameworks = project.GetAllTargetFrameworks();
                        foreach (var targetFramework in targetFrameworks)
                        {
                            var assembly = project.GetOutputAssemblyInfo(targetFramework.FrameworkId);
                            if (assembly == null) continue;
                            
                            if(assembly.Location.FullPath.StartsWith(assemblyPathPrefix.FullPath))
                            {
                                task.Set(new AwsProjectOutput(assembly.AssemblyNameInfo.Name, assembly.Location.FullPath));
                                return task;
                            }
                        }
                    }

                    task.SetCancelled();
                    return task;
                }
            });
        }
    }
}
