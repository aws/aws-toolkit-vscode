using System.Collections.Generic;
using System.Linq;
using JetBrains.Annotations;
using JetBrains.Metadata.Reader.API;
using JetBrains.Metadata.Reader.Impl;
using JetBrains.ProjectModel;
using JetBrains.ProjectModel.ProjectsHost.Dependencies;
using JetBrains.ReSharper.Psi;
using JetBrains.ReSharper.Psi.CSharp;
using JetBrains.ReSharper.Psi.Resolve;
using JetBrains.ReSharper.Psi.Util;
using JetBrains.UI.ThemedIcons;
using JetBrains.Util;
using JetBrains.Util.Logging;

namespace AWS.Psi.Lambda
{
    public static class LambdaFinder
    {
        private static ILogger ourLogger = Logger.GetLogger(typeof(LambdaFinder));

        private const string LambdaCoreLibraryName = "Amazon.Lambda.Core";
        private const string LambdaToolsDefaultJsonName = "aws-lambda-tools-defaults.json";

        private static readonly IClrTypeName LambdaContextTypeName = new ClrTypeName("Amazon.Lambda.Core.ILambdaContext");
        private static readonly IClrTypeName AmazonLambdaNamespaceTypeName = new ClrTypeName("Amazon.Lambda");
        private static readonly IClrTypeName StreamTypeName = new ClrTypeName("System.IO.Stream");
        private static readonly IClrTypeName AmazonSerializerTypeName = new ClrTypeName("Amazon.Lambda.Core.ILambdaSerializer");
        private static readonly IClrTypeName AmazonAttributeTypeName = new ClrTypeName("Amazon.Lambda.Core.LambdaSerializerAttribute");

        public static bool IsLambdaProjectType([CanBeNull] IProject project)
        {
            if (project == null) return false;
            if (!project.IsDotNetCoreProject()) return false;

            var dependencyManager = project.GetSolution().GetComponent<ProjectDependenciesManager>();
            var descriptor = dependencyManager.GetDescriptor(project);
            if (descriptor != null && descriptor.RootDependencies.Any(dependency => dependency.Name.Contains(LambdaCoreLibraryName)))
                return true;

            return project
                .FindProjectItemsByLocation(
                    project.ProjectFileLocation.Parent.Combine(LambdaToolsDefaultJsonName)).Any();
        }

        /// <summary>
        /// Check whether method can be defined as Amazon Lambda function.
        ///
        /// Please see info about Amazon Lambda handler in C# here -
        ///     https://docs.aws.amazon.com/lambda/latest/dg/dotnet-programming-model-handler-types.html
        ///
        /// The logic perform the following checks:
        /// 1. Public static or instance method.
        /// 2. Should be a public class with default constructor.
        /// 3. Check for method parameters:
        ///    a) Parameter of <see cref="System.IO.Stream"/> type can be used without Serializer. Any class derived from Stream is a match.
        ///    b) Check for Amazon Event type (set of pre-defined Amazon types used in Amazon Lambda functions)
        ///       and for default Amazon serializer.
        ///    c) Check for any Custom Data type that could be serialized using <see cref="LambdaRunMarkersThemedIcons.Lambda.Core.ILambdaSerializer"/> serializer.
        /// 4. Check for method return type:
        ///    a) If method is async - return type should be <see cref="System.Void"/> or <see cref="System.Threading.Tasks.Task"/> are allowed.
        ///    b) If method is sync - return type could be <see cref="System.IO.Stream"/>,
        ///       or Amazon Event type or Custom Data type with defined <see cref="LambdaRunMarkersThemedIcons.Lambda.Core.ILambdaSerializer"/> serializer.
        /// </summary>
        /// <param name="method">Method to check if it matches Amazon Lambda definition.</param>
        /// <returns>The <see cref="bool"/> value if a method matches Amazon Lambda definition.</returns>
        public static bool IsSuitableLambdaMethod(IMethod method)
        {
            return method != null &&
                   method.GetAccessRights() == AccessRights.PUBLIC &&
                   IsValidInstanceOrStaticMethod(method) &&
                   HasRequiredParameters(method);
        }

        private static bool IsValidInstanceOrStaticMethod(IMethod method)
        {
            if (!(method.GetContainingType() is IClass classElement)) return false;
            return method.IsStatic || CanBeInstantiatedByLambda(classElement);
        }

        private static bool CanBeInstantiatedByLambda(IClass classElement)
        {
            return classElement.GetAccessRights() == AccessRights.PUBLIC &&
                   classElement.CanInstantiateWithPublicDefaultConstructor();
        }

        private static bool HasRequiredParameters(IMethod method)
        {
            var parameters = method.Parameters;
            if (parameters.Count < 1 || parameters.Count > 2) return false;

            var firstParameterType = parameters[0].Type;
            var isFirstParameterMatch =
                IsStreamType(firstParameterType) || (IsAmazonEventType(firstParameterType) || IsCustomDataType(firstParameterType)) && IsSerializerDefined(method);

            if (!isFirstParameterMatch) return false;

            return parameters.Count == 1 || IsLambdaContextType(parameters[1].Type);
        }

        /// <summary>
        /// Check for custom data type for input and output parameters specified for Lambda function.
        /// </summary>
        /// <param name="type">The <see cref="T:JetBrains.ReSharper.Psi.IType" /> to verify against custom user type</param>
        /// <returns>Whether type is a custom data type</returns>
        private static bool IsCustomDataType(IType type)
        {
            return IsCustomDataType(type, new HashSet<IType>());

            // "typesUnderProcess" store all types that are processing right now. Is used to avoid falling into infinitive recursion
            bool IsCustomDataType(IType typeToVerify, HashSet<IType> typesUnderProcess)
            {
                if (!typesUnderProcess.Add(typeToVerify)) return true;

                if (ourLogger.IsTraceEnabled())
                    ourLogger.Trace("Check is Custom Data for a type: {0}",
                        typeToVerify.GetPresentableName(CSharpLanguage.Instance));

                if (typeToVerify.IsVoid()) return false;

                // Skip any primitive types, DateTime, and DateTimeOffset according to Newtonsoft.Json.Serialization logic.
                if (typeToVerify.IsSimplePredefined() || typeToVerify.IsDateTime() || typeToVerify.IsDateTimeOffset()) return true;

                switch (typeToVerify)
                {
                    case IArrayType arrayType:
                        return IsCustomDataType(arrayType.ElementType, typesUnderProcess);

                    case IDeclaredType declaredType:
                    {
                        var predefinedType = declaredType.Module.GetPredefinedType();

                        var typeElement = declaredType.GetTypeElement();
                        if (ourLogger.IsTraceEnabled())
                            ourLogger.Trace("Check type element: {0}", typeElement?.GetClrName());
                        if (typeElement == null) return false;

                        // Define a substitution to verify generic types.
                        var substitution = declaredType.GetSubstitution();

                        // Check for dictionary types.
                        var genericDictionaryTypeElement = predefinedType.GenericIDictionary.GetTypeElement();
                        if (genericDictionaryTypeElement != null &&
                            typeElement.IsDescendantOf(genericDictionaryTypeElement))
                        {
                            var keyTypeParameter = genericDictionaryTypeElement.TypeParameters[0];
                            var valueTypeParameter = genericDictionaryTypeElement.TypeParameters[1];

                            foreach (var ancestorSubstitution in typeElement.GetAncestorSubstitution(
                                genericDictionaryTypeElement))
                            {
                                // Define a case when inner class override one TKey or TValue, e.g.
                                // class MyType<T> : IDictionary<int, T> {}
                                var effectiveSubstitution = ancestorSubstitution.Apply(substitution);

                                var keyType = effectiveSubstitution.Apply(keyTypeParameter);
                                if (!IsCustomDataType(keyType, typesUnderProcess)) return false;

                                var valueType = effectiveSubstitution.Apply(valueTypeParameter);
                                if (!IsCustomDataType(valueType, typesUnderProcess)) return false;
                            }

                            return true;
                        }

                        // Check for collection types.
                        var elementTypes =
                            CollectionTypeUtil.GetElementTypesForGenericType(
                                declaredType, predefinedType.GenericIEnumerable, 0)
                            ?? CollectionTypeUtil.GetElementTypesForGenericType(
                                declaredType, predefinedType.GenericIList, 0);

                        if (elementTypes != null)
                        {
                            return elementTypes.All(elementType => IsCustomDataType(elementType, typesUnderProcess));
                        }

                        // Check non-generic collection and map types
                        // assuming that value is of type Object and is always valid option.
                        if (declaredType.IsSubtypeOf(predefinedType.IEnumerable))
                        {
                            return true;
                        }

                        // Check for POCO types
                        switch (typeElement)
                        {
                            case IClass classTypeElement:
                            {
                                var superClass = classTypeElement.GetBaseClassType();
                                if (!superClass.IsObject()) return false;

                                return classTypeElement.CanInstantiateWithPublicDefaultConstructor() &&
                                       CheckMemberTypes(classTypeElement.GetMembers(), substitution, typesUnderProcess);
                            }
                            case IStruct structTypeElement:
                                return CheckMemberTypes(structTypeElement.GetMembers(), substitution, typesUnderProcess);
                        }

                        break;
                    }
                }

                return false;
            }

            // Check all fields and properties inside a class or struct for a custom data type
            bool CheckMemberTypes(IEnumerable<ITypeMember> members, ISubstitution substitution, HashSet<IType> typesUnderProcess)
            {
                var typeMembers = members.AsArray();

                if (ourLogger.IsTraceEnabled())
                    ourLogger.Trace("Verify members: {0}", string.Join(", ", typeMembers.Select(member => member.ShortName)));

                foreach (var typeMember in typeMembers)
                {
                    if (typeMember.IsStatic) continue;

                    switch (typeMember)
                    {
                        case IField field when field.IsField:
                        {
                            var fieldType = substitution.Apply(field.Type);
                            if (!IsCustomDataType(fieldType, typesUnderProcess)) return false;
                            break;
                        }
                        case IProperty property when !property.IsDefault:
                        {
                            var propertyType = substitution.Apply(property.Type);
                            if (!IsCustomDataType(propertyType, typesUnderProcess)) return false;
                            break;
                        }
                    }
                }

                return true;
            }
        }

        /// <summary>
        /// Check for predefined Amazon event types declared in Amazon namespaces
        /// </summary>
        /// <param name="type">The <see cref="T:JetBrains.ReSharper.Psi.IType" /> to verify against Amazon type</param>
        /// <returns>Whether type is Amazon event type</returns>
        private static bool IsAmazonEventType(IType type)
        {
            if (!(type is IDeclaredType declaredType)) return false;

            if (IsAmazonEventNameMatch(declaredType.GetClrName())) return true;

            var superTypes = declaredType.GetAllSuperTypes();
            return superTypes.Any(superType => IsAmazonEventNameMatch(superType.GetClrName()));

            bool IsAmazonEventNameMatch(IClrTypeName clrTypeName)
            {
                var namespaces = clrTypeName.NamespaceNames.ToArray();
                if (namespaces.Length < 3) return false;

                var baseNamespace = string.Join(".", namespaces.Take(3));
                return baseNamespace.StartsWith(AmazonLambdaNamespaceTypeName.FullName) &&
                       baseNamespace.EndsWith("Events");
            }
        }

        private static bool IsStreamType(IType type)
        {
            var streamType = TypeFactory.CreateTypeByCLRName(StreamTypeName, NullableAnnotation.Unknown, type.Module);
            return type.IsSubtypeOf(streamType);
        }

        /// <summary>
        /// Check if we have a method or assembly level serializer implementing ILambdaSerializer
        /// Please see - https://docs.aws.amazon.com/lambda/latest/dg/dotnet-programming-model-handler-types.html for details
        /// </summary>
        /// <param name="method">The <see cref="T:JetBrains.ReSharper.Psi.IMethod" /> instance to validate</param>
        /// <returns>Whether serializer is defined</returns>
        private static bool IsSerializerDefined(IMethod method)
        {
            var psiModule = method.Module;

            var amazonSerializerType =
                TypeFactory.CreateTypeByCLRName(AmazonSerializerTypeName, NullableAnnotation.Unknown, psiModule);

            var methodAttributes = method.GetAttributeInstances(AmazonAttributeTypeName, true);
            if (!methodAttributes.IsEmpty())
            {
                if (methodAttributes.Any(attribute =>
                    attribute.PositionParameters().Any(parameter =>
                        parameter.TypeValue?.IsSubtypeOf(amazonSerializerType) == true)))
                {
                    return true;
                }
            }

            var assemblyAttributes = psiModule.GetPsiServices().Symbols.GetModuleAttributes(psiModule)
                .GetAttributeInstances(AmazonAttributeTypeName, true);

            return assemblyAttributes.Any(attribute =>
                       attribute.PositionParameters().Any(parameter =>
                           parameter.TypeValue?.IsSubtypeOf(amazonSerializerType) == true));
        }

        /// <summary>
        /// Lambda function can provide a meta-information that could be obtained from Lambda context.
        /// Check if type is <see cref="T:Amazon.Lambda.Core.ILambdaContext" /> or inherited from it.
        /// </summary>
        /// <param name="type">The <see cref="T:JetBrains.ReSharper.Psi.IType" /> to verify against Lambda context</param>
        /// <returns>Whether type is Lambda context</returns>
        private static bool IsLambdaContextType(IType type)
        {
            var clrName = (type as IDeclaredType)?.GetClrName();
            return clrName != null && clrName.Equals(LambdaContextTypeName);
        }
    }
}
