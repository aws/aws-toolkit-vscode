using AWS.Toolkit.Rider.Model;
using JetBrains.ProjectModel;
using JetBrains.Rd.Tasks;
using JetBrains.ReSharper.Resources.Shell;
using JetBrains.Util;

#if (PROFILE_2020_2 || PROFILE_2020_3 || PROFILE_2021_1) // TODO: Remove preprocessor conditions FIX_WHEN_MIN_IS_212
using JetBrains.ReSharper.Host.Features;
#else
using JetBrains.RdBackend.Common.Features;
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
