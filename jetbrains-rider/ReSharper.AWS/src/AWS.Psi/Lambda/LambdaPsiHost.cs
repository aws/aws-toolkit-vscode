using System.Collections.Generic;
using System.Linq;
using JetBrains.Application;
using JetBrains.Application.Progress;
using JetBrains.Application.Threading;
using JetBrains.Diagnostics;
using JetBrains.Lifetimes;
using JetBrains.ProjectModel;
using JetBrains.Rd.Tasks;
using JetBrains.ReSharper.Host.Features;
using JetBrains.ReSharper.Host.Features.ProjectModel.View;
using JetBrains.ReSharper.Host.Platform.Icons;
using JetBrains.ReSharper.Psi;
using JetBrains.ReSharper.Psi.Caches;
using JetBrains.ReSharper.Psi.Modules;
using JetBrains.ReSharper.Resources.Shell;
using JetBrains.Rider.Model;
using JetBrains.Util;

namespace AWS.Psi.Lambda
{
    [SolutionComponent]
    public class LambdaPsiHost
    {
        private readonly ISymbolCache _symbolCache;
        private readonly PsiIconManager _psiIconManager;
        private readonly IconHost _iconHost;
        private readonly ProjectModelViewHost _projectModelViewHost;
        private readonly IShellLocks _locks;
        private readonly ILogger _logger;

        public LambdaPsiHost(ISolution solution, ISymbolCache symbolCache, PsiIconManager psiIconManager, IconHost iconHost,
            ProjectModelViewHost projectModelViewHost, IShellLocks locks, ILogger logger)
        {
            _symbolCache = symbolCache;
            _psiIconManager = psiIconManager;
            _iconHost = iconHost;
            _projectModelViewHost = projectModelViewHost;
            _locks = locks;
            _logger = logger;

            var model = solution.GetProtocolSolution().GetLambdaPsiModel();

            model.DetermineHandlers.Set((lifetime, unit) =>
            {
                var task = new RdTask<List<HandlerCompletionItem>>();
                task.Set(DetermineHandlers(solution));
                return task;
            });

            model.IsHandlerExists.Set((lifetime, request) =>
            {
                var task = new RdTask<bool>();
                var className = request.ClassName;
                var methodName = request.MethodName;
                var projectId = request.ProjectId;

                var handlerExists = IsHandlerExists(lifetime, projectId, className, methodName);
                task.Set(handlerExists);
                return task;
            });
        }

        private bool IsHandlerExists(Lifetime lifetime, int projectId, string className, string methodName)
        {
            using (TryReadLockCookie.Create(NullProgressIndicator.Create(), _locks,
                () => !lifetime.IsAlive || _locks.ContentModelLocks.IsWriteLockRequested))
            {
                var project = _projectModelViewHost.GetItemById<IProject>(projectId);
                Assertion.AssertNotNull(project, "project instance should not be null");
                _logger.Verbose($"Searching handler with name '{className}.{methodName}' in the project {project}...");

                var psiModules = project.GetPsiModules();
                foreach (var psiModule in psiModules)
                {
                    using (CompilationContextCookie.OverrideOrCreate(psiModule.GetContextFromModule()))
                    {
                        var scope = _symbolCache.GetSymbolScope(psiModule, false, true);

                        var typeElements = scope.GetElementsByQualifiedName(className).OfType<IClass>();
                        foreach (var typeElement in typeElements)
                        {
                            InterruptableActivityCookie.CheckAndThrow();
                            foreach (var method in typeElement.Methods)
                            {
                                if (method.ShortName != methodName) continue;
                                if (!LambdaFinder.IsSuitableLambdaMethod(method)) continue;

                                return true;
                            }
                        }
                    }
                }
            }

            return false;
        }

        private List<HandlerCompletionItem> DetermineHandlers(ISolution solution)
        {
            var handlers = new List<HandlerCompletionItem>();

            using (ReadLockCookie.Create())
            {
                var projects = solution.GetAllProjects();

                foreach (var project in projects)
                {
                    if (!LambdaFinder.IsLambdaProjectType(project)) continue;
                    var psiModules = project.GetPsiModules();

                    foreach (var psiModule in psiModules)
                    {
                        using (CompilationContextCookie.OverrideOrCreate(psiModule.GetContextFromModule()))
                        {
                            var scope = _symbolCache.GetSymbolScope(psiModule, false, true);
                            var namespaces = scope.GlobalNamespace.GetNestedNamespaces(scope);

                            foreach (var @namespace in namespaces)
                            {
                                ProcessNamespace(@namespace, scope, handlers);
                            }
                        }
                    }
                }
            }

            return handlers;
        }

        private void ProcessNamespace(INamespace element, ISymbolScope scope,
            ICollection<HandlerCompletionItem> handlers)
        {
            var nestedNamespaces = element.GetNestedNamespaces(scope);

            foreach (var @namespace in nestedNamespaces)
            {
                ProcessNamespace(@namespace, scope, handlers);
            }

            var classes = element.GetNestedElements(scope).OfType<IClass>();
            foreach (var @class in classes)
            {
                ProcessClass(@class, handlers);
            }
        }

        private void ProcessClass(ITypeElement element, ICollection<HandlerCompletionItem> handlers)
        {
            var nestedClasses = element.GetMembers().OfType<IClass>();

            foreach (var @class in nestedClasses)
            {
                ProcessClass(@class, handlers);
            }

            var methods = element.Methods;
            foreach (var method in methods)
            {
                GetHandlers(method, handlers);
            }
        }

        private void GetHandlers(IMethod method, ICollection<HandlerCompletionItem> handlers)
        {
            if (!LambdaFinder.IsSuitableLambdaMethod(method)) return;

            var handlerString = LambdaHandlerUtils.ComposeHandlerString(method);
            var iconId = _psiIconManager.GetImage(method.GetElementType());
            var iconModel = _iconHost.Transform(iconId);
            handlers.Add(new HandlerCompletionItem(handlerString, iconModel));
        }
    }
}
