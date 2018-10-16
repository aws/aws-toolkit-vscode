// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.debugger.DebuggerManagerEx
import com.intellij.debugger.DefaultDebugEnvironment
import com.intellij.debugger.engine.JavaDebugProcess
import com.intellij.execution.DefaultExecutionResult
import com.intellij.execution.JavaExecutionUtil
import com.intellij.execution.configurations.JavaCommandLineState
import com.intellij.execution.configurations.JavaParameters
import com.intellij.execution.configurations.RemoteConnection
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.lang.java.JavaLanguage
import com.intellij.lang.jvm.JvmModifier
import com.intellij.openapi.compiler.CompilerManager
import com.intellij.openapi.compiler.CompilerMessageCategory
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.JavaSdk
import com.intellij.openapi.projectRoots.JavaSdkType
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.roots.LibraryOrderEntry
import com.intellij.openapi.roots.ModuleOrderEntry
import com.intellij.openapi.roots.OrderEnumerator
import com.intellij.openapi.roots.OrderRootType
import com.intellij.openapi.roots.libraries.Library
import com.intellij.pom.java.LanguageLevel
import com.intellij.psi.JavaPsiFacade
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiIdentifier
import com.intellij.psi.PsiImportList
import com.intellij.psi.PsiImportStatement
import com.intellij.psi.PsiMethod
import com.intellij.psi.PsiModifierListOwner
import com.intellij.psi.PsiParameter
import com.intellij.psi.impl.source.PsiClassReferenceType
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.util.io.exists
import com.intellij.util.io.inputStream
import com.intellij.util.io.isDirectory
import com.intellij.util.io.isHidden
import com.intellij.util.io.outputStream
import com.intellij.xdebugger.XDebugProcess
import com.intellij.xdebugger.XDebugProcessStarter
import com.intellij.xdebugger.XDebugSession
import com.intellij.xdebugger.impl.XDebugSessionImpl
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LambdaLocalRunProvider
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LambdaLocalRunSettings
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.resources.message
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.jar.JarFile
import kotlin.streams.toList

class JavaRuntimeGroup : RuntimeGroupInformation {
    override val runtimes = setOf(Runtime.JAVA8)
    override val languageIds = setOf(JavaLanguage.INSTANCE.id)
    override val requiresCompilation: Boolean = true

    override fun runtimeForSdk(sdk: Sdk): Runtime? = when {
        sdk.sdkType is JavaSdkType && JavaSdk.getInstance().getVersion(sdk)
            ?.let { it == JavaSdkVersion.JDK_1_8 || it.maxLanguageLevel.isLessThan(LanguageLevel.JDK_1_8) } == true -> Runtime.JAVA8
        else -> null
    }
}

class JavaLambdaPackager : LambdaPackager {
    override fun createPackage(module: Module, file: PsiFile): CompletionStage<Path> {
        val future = CompletableFuture<Path>()
        val compilerManager = CompilerManager.getInstance(module.project)
        val compileScope = compilerManager.createModulesCompileScope(arrayOf(module), true, true)

        compilerManager.make(compileScope) { aborted, errors, _, context ->
            if (!aborted && errors == 0) {
                try {
                    val zipContents = mutableSetOf<ZipEntry>()
                    entriesForModule(module, zipContents)
                    val zipFile = createTemporaryZipFile { zip ->
                        zipContents.forEach {
                            zip.putNextEntry(
                                it.pathInZip,
                                it.sourceFile
                            )
                        }
                    }
                    LOG.debug("Created temporary zip: $zipFile")
                    future.complete(zipFile)
                } catch (e: Exception) {
                    future.completeExceptionally(RuntimeException(message("lambda.package.zip_fail"), e))
                }
            } else if (aborted) {
                future.completeExceptionally(RuntimeException(message("lambda.package.compilation_aborted")))
            } else {
                val errorMessages = context.getMessages(CompilerMessageCategory.ERROR).joinToString("\n")
                future.completeExceptionally(
                    RuntimeException(
                        message(
                            "lambda.package.compilation_errors",
                            errorMessages
                        )
                    )
                )
            }
        }
        return future
    }

    override fun determineRuntime(module: Module, file: PsiFile): Runtime = Runtime.JAVA8

    private fun entriesForModule(module: Module, entries: MutableSet<ZipEntry>) {
        productionRuntimeEntries(module).forEach {
            when (it) {
                is ModuleOrderEntry -> it.module?.run { entriesForModule(this, entries) }
                is LibraryOrderEntry -> it.library?.run { addLibrary(this, entries) }
            }
            true
        }
        addModuleFiles(module, entries)
    }

    private fun addLibrary(library: Library, entries: MutableSet<ZipEntry>) {
        library.getFiles(OrderRootType.CLASSES).map { Paths.get(it.presentableUrl) }
            .forEach { entries.add(ZipEntry("lib/${it.fileName}", it)) }
    }

    private fun addModuleFiles(module: Module, entries: MutableSet<ZipEntry>) {
        productionRuntimeEntries(module)
            .withoutDepModules()
            .withoutLibraries()
            .pathsList.pathList
            .map { Paths.get(it) }
            .filter { it.exists() }
            .flatMap {
                when {
                    it.isDirectory() -> toEntries(it)
                    else -> throw RuntimeException(message("lambda.package.unhandled_file_type", it))
                }
            }
            .forEach { entries.add(it) }
    }

    private fun productionRuntimeEntries(module: Module) =
        OrderEnumerator.orderEntries(module).productionOnly().runtimeOnly().withoutSdk()

    private fun toEntries(path: Path): List<ZipEntry> =
        Files.walk(path).use { files ->
            files.filter { !it.isDirectory() && !it.isHidden() && it.exists() }
                .map { ZipEntry(path.relativize(it).toString().replace('\\', '/'), it) }.toList()
        }

    private data class ZipEntry(val pathInZip: String, val sourceFile: InputStream) {
        constructor(pathInZip: String, sourceFile: Path) : this(pathInZip, sourceFile.inputStream())
    }

    companion object {
        val LOG = Logger.getInstance(JavaLambdaPackager::class.java)
    }
}

class JavaLambdaHandlerResolver : LambdaHandlerResolver {
    override fun findPsiElements(
        project: Project,
        handler: String,
        searchScope: GlobalSearchScope
    ): Array<NavigatablePsiElement> {
        val split = handler.split("::")
        val className = split[0]
        val methodName = if (split.size >= 2) split[1] else null

        val psiFacade = JavaPsiFacade.getInstance(project)
        val classes = psiFacade.findClasses(className, searchScope).toList()
        return if (methodName.isNullOrEmpty()) {
            classes.filterIsInstance<NavigatablePsiElement>()
                .toTypedArray()
        } else {
            val handlerMethod = classes.asSequence()
                .map { it.findMethodsByName(methodName, true) }
                .flatMap { it.asSequence() }
                .filter { it.body != null } // Filter out interfaces
                .pickMostSpecificHandler()
            return handlerMethod?.let {
                arrayOf(it)
            } ?: NavigatablePsiElement.EMPTY_NAVIGATABLE_ELEMENT_ARRAY
        }
    }

    /**
     * https://docs.aws.amazon.com/lambda/latest/dg/java-programming-model-handler-types.html
     * Handler Overload Resolution
     *
     * If your Java code contains multiple methods with same name as the handler name, then AWS Lambda uses the following rules to pick a method to invoke:
     *
     * 1. Select the method with the largest number of parameters.
     *
     * 2. If two or more methods have the same number of parameters, AWS Lambda selects the method that has the Context as the last parameter.
     *
     * If none or all of these methods have the Context parameter, then the behavior is undefined.
     */
    private fun Sequence<PsiMethod>.pickMostSpecificHandler(): NavigatablePsiElement? {
        var maxWeight = -1
        val methods = this.filter { it.parameterList.parametersCount in 1..3 }
            .groupBy {
                var weight = it.parameterList.parametersCount
                if (it.parameterList.parameters.getOrNull(weight - 1)?.isContextParameter() == true) {
                    weight++
                }
                maxWeight = maxOf(maxWeight, weight)
                weight
            }.getOrDefault(maxWeight, emptyList())

        // Empty, or undefined behavior
        if (methods.isEmpty() || methods.size > 1) {
            return null
        }

        return methods[0]
    }

    override fun determineHandler(element: PsiElement): String? {
        return when (element) {
            is PsiClass -> findByClass(element)
            is PsiMethod -> findByMethod(element)
            is PsiIdentifier -> determineHandler(element.parent)
            else -> null
        }
    }

    private fun findByMethod(method: PsiMethod): String? {
        val parentClass = method.parent as? PsiClass ?: return null
        if (method.isPublic &&
            (method.isStatic ||
                    (parentClass.canBeInstantiatedByLambda() && !parentClass.implementsLambdaHandlerInterface())) &&
            method.hasRequiredParameters()
        ) {
            return "${parentClass.qualifiedName}::${method.name}"
        }
        return null
    }

    private fun findByClass(clz: PsiClass): String? =
        if (clz.canBeInstantiatedByLambda() && clz.implementsLambdaHandlerInterface()) {
            clz.qualifiedName
        } else {
            null
        }

    private fun PsiClass.canBeInstantiatedByLambda() =
        this.isPublic && this.isConcrete && this.hasPublicNoArgsConstructor()

    private val PsiModifierListOwner.isPublic get() = this.hasModifier(JvmModifier.PUBLIC)

    private val PsiModifierListOwner.isStatic get() = this.hasModifier(JvmModifier.STATIC)

    private val PsiClass.isConcrete get() = !this.isInterface && !this.hasModifier(JvmModifier.ABSTRACT)

    private fun PsiClass.hasPublicNoArgsConstructor() =
        this.constructors.isEmpty() || this.constructors.any { it.hasModifier(JvmModifier.PUBLIC) && it.parameters.isEmpty() }

    private fun PsiClass.implementsLambdaHandlerInterface(): Boolean {
        val module = JavaExecutionUtil.findModule(this) ?: return false
        val scope = GlobalSearchScope.moduleRuntimeScope(module, false)
        val psiFacade = JavaPsiFacade.getInstance(module.project)

        return LAMBDA_INTERFACES.any { interfaceName ->
            psiFacade.findClass(interfaceName, scope)?.let { interfacePsi ->
                this.isInheritor(interfacePsi, true)
            } == true
        }
    }

    private fun PsiMethod.hasRequiredParameters(): Boolean =
        this.parameters.size in 1..2 && this.parameterList.parameters.getOrNull(1)?.isContextParameter() ?: true

    private fun PsiParameter.isContextParameter(): Boolean {
        val className = (this.type as? PsiClassReferenceType)?.className ?: return false
        val imports = containingFile.children.filterIsInstance<PsiImportList>()
            .flatMap { it.children.filterIsInstance<PsiImportStatement>() }
            .asSequence()
            .mapNotNull { it.qualifiedName }
            .map { it.substringAfterLast(".") to it }
            .toMap()
        return imports[className] == LAMBDA_CONTEXT
    }

    private companion object {
        val LAMBDA_INTERFACES = setOf(
            "com.amazonaws.services.lambda.runtime.RequestStreamHandler",
            "com.amazonaws.services.lambda.runtime.RequestHandler"
        )
        const val LAMBDA_CONTEXT = "com.amazonaws.services.lambda.runtime.Context"
    }
}

class JavaLambdaLocalRunProvider : LambdaLocalRunProvider {
    override fun createRunProfileState(
        environment: ExecutionEnvironment,
        project: Project,
        settings: LambdaLocalRunSettings
    ): RunProfileState =
        LambdaJavaCommandLineState(environment, settings)
}

internal class LambdaJavaCommandLineState(
    environment: ExecutionEnvironment,
    private val settings: LambdaLocalRunSettings
) :
    JavaCommandLineState(environment) {
    override fun createJavaParameters(): JavaParameters {
        return JavaParameters().apply {
            val module = JavaExecutionUtil.findModule(determineClass(settings.handlerElement))
            configureByModule(module, JavaParameters.JDK_AND_CLASSES)
            classPath.addFirst(InvokerJar.jar)
            mainClass = InvokerJar.mainClass
            env = settings.environmentVariables
            // Do not inherit the System env var, they should configure through run config just like Lambda does
            isPassParentEnvs = false
            programParametersList.add("-h", settings.handler)
            settings.input.run { programParametersList.add("-i", this) }
        }
    }

    private fun determineClass(psiElement: PsiElement): PsiClass {
        return when {
            psiElement is PsiClass -> psiElement
            psiElement.parent != null -> determineClass(psiElement.parent)
            else -> throw RuntimeException("Cannot determine PsiClass from $psiElement")
        }
    }
}

object InvokerJar {
    val jar by lazy {
        val file = Files.createTempFile("jvm-lambda-invoker", "jar")
        javaClass.getResourceAsStream("/jvm-lambda-invoker.jar").copyTo(file.outputStream())
        file.toAbsolutePath().toString()
    }
    val mainClass: String by lazy {
        JarFile(jar).use {
            it.manifest.mainAttributes.getValue("Main-Class")
                    ?: throw RuntimeException("Cannot determine Main-Class in $jar")
        }
    }
}

class JavaLambdaDebugger : LambdaDebugger {
    override fun createDebugProcess(
        environment: ExecutionEnvironment,
        state: SamRunningState,
        debugPort: Int
    ): XDebugProcessStarter? {
        val connection = RemoteConnection(true, "localhost", debugPort.toString(), false)
        val debugEnvironment = DefaultDebugEnvironment(environment, state, connection, true)
        val debuggerManager = DebuggerManagerEx.getInstanceEx(environment.project)
        val debuggerSession = debuggerManager.attachVirtualMachine(debugEnvironment) ?: return null

        return object : XDebugProcessStarter() {
            override fun start(session: XDebugSession): XDebugProcess {
                if (debuggerSession is XDebugSessionImpl) {
                    val debugProcess = debuggerSession.process
                    val executionResult = debugProcess.executionResult
                    debuggerSession.addExtraActions(*executionResult.actions)
                    if (executionResult is DefaultExecutionResult) {
                        debuggerSession.addRestartActions(*executionResult.restartActions)
                    }
                }

                return JavaDebugProcess.create(session, debuggerSession)
            }
        }
    }
}