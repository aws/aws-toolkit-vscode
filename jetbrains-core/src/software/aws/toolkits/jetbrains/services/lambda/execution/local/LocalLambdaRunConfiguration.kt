// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.ExecutionBundle
import com.intellij.execution.ExecutionException
import com.intellij.execution.Executor
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.RefactoringListenerProvider
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.components.service
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.options.SettingsEditorGroup
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.psi.PsiElement
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.refactoring.listeners.RefactoringElementAdapter
import com.intellij.refactoring.listeners.RefactoringElementListener
import com.intellij.util.PathMappingSettings.PathMapping
import com.intellij.util.text.SemVer
import org.jetbrains.concurrency.isPending
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.lambda.LambdaArchitecture
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.lambda.validOrNull
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutableIfPresent
import software.aws.toolkits.jetbrains.services.cloudformation.SamFunction
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationBase
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationType
import software.aws.toolkits.jetbrains.services.lambda.execution.ResolvedFunction
import software.aws.toolkits.jetbrains.services.lambda.execution.resolveLambdaFromHandler
import software.aws.toolkits.jetbrains.services.lambda.execution.resolveLambdaFromTemplate
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.HandlerRunSettings
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageDebugSupport
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.ImageTemplateRunSettings
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.LocalLambdaRunSettings
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunningState
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamSettingsEditor
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamSettingsRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.TemplateRunSettings
import software.aws.toolkits.jetbrains.services.lambda.execution.validateSamTemplateDetails
import software.aws.toolkits.jetbrains.services.lambda.minSamVersion
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.validation.LambdaHandlerEvaluationListener
import software.aws.toolkits.jetbrains.services.lambda.validation.LambdaHandlerValidator
import software.aws.toolkits.jetbrains.ui.connection.AwsConnectionSettingsEditor
import software.aws.toolkits.jetbrains.ui.connection.addAwsConnectionEditor
import software.aws.toolkits.resources.message
import java.nio.file.Paths

class LocalLambdaRunConfigurationFactory(configuration: LambdaRunConfigurationType) : ConfigurationFactory(configuration) {
    override fun createTemplateConfiguration(project: Project) = LocalLambdaRunConfiguration(project, this)
    override fun getName(): String = "Local"
    override fun getId(): String = name
}

class LocalLambdaRunConfiguration(project: Project, factory: ConfigurationFactory) :
    LambdaRunConfigurationBase<LocalLambdaOptions>(project, factory, "SAM CLI"),
    RefactoringListenerProvider,
    SamSettingsRunConfiguration {
    private val messageBus = project.messageBus

    override val serializableOptions = LocalLambdaOptions()

    override fun getConfigurationEditor(): SettingsEditor<LocalLambdaRunConfiguration> {
        val group = SettingsEditorGroup<LocalLambdaRunConfiguration>()
        group.addEditor(ExecutionBundle.message("run.configuration.configuration.tab.title"), LocalLambdaRunSettingsEditor(project))
        group.addEditor(message("lambda.run_configuration.sam"), SamSettingsEditor())
        group.addAwsConnectionEditor(AwsConnectionSettingsEditor(project, LambdaClient.SERVICE_NAME))
        return group
    }

    override fun checkConfiguration() {
        resolveRegion()
        resolveCredentials()
        checkInput()
        if (isImage) {
            validateSamTemplateDetails(templateFile(), logicalId())
            checkImageSamVersion()
            checkImageDebugger()
        } else {
            val function = resolveLambdaInfo(project = project, functionOptions = serializableOptions.functionOptions)
            checkRuntimeSamVersion(function.runtime)
            checkArchitectureSamVersion(function.architecture)
            // If we aren't using a template we need to be able to find the handler. If it's a template, we don't care.
            if (!serializableOptions.functionOptions.useTemplate) {
                checkLambdaHandler(function.handler, function.runtime)
            }
        }
    }

    private fun checkImageSamVersion() {
        val executable = getSam()

        SemVer.parseFromText(executable.version)?.let { semVer ->
            if (semVer < SamCommon.minImageVersion) {
                throw RuntimeConfigurationError(message("lambda.image.sam_version_too_low", semVer, SamCommon.minImageVersion))
            }
        }
    }

    private fun checkImageDebugger() {
        imageDebugger() ?: throw RuntimeConfigurationError(message("lambda.image.missing_debugger", rawImageDebugger().toString()))
    }

    private fun checkRuntimeSamVersion(runtime: LambdaRuntime) {
        val executable = getSam()

        runtime.runtimeGroup?.let { runtimeGroup ->
            SemVer.parseFromText(executable.version)?.let { semVer ->
                // TODO: Executable manager should better expose the VersionScheme of the Executable...
                try {
                    runtimeGroup.validateSamVersionForZipDebugging(runtime, semVer)
                } catch (e: Exception) {
                    throw RuntimeConfigurationError(e.message)
                }
            }
        }
    }

    private fun checkArchitectureSamVersion(architecture: LambdaArchitecture) {
        val executable = getSam()

        SemVer.parseFromText(executable.version)?.let { semVer ->
            val architectureMinSam = architecture.minSamVersion()
            if (semVer < architectureMinSam) {
                throw RuntimeConfigurationError(message("sam.executable.minimum_too_low_architecture", architecture, architectureMinSam))
            }
        }
    }

    private fun getSam() = ExecutableManager.getInstance().getExecutableIfPresent<SamExecutable>().let {
        when (it) {
            is ExecutableInstance.Executable -> it
            is ExecutableInstance.InvalidExecutable, is ExecutableInstance.UnresolvedExecutable -> throw RuntimeConfigurationError(
                (it as? ExecutableInstance.BadExecutable)?.validationError
            )
        }
    }

    private fun checkLambdaHandler(handler: String, runtime: LambdaRuntime): LambdaRuntime {
        val handlerValidator = project.service<LambdaHandlerValidator>()
        val sdkRuntime = runtime.toSdkRuntime() ?: throw IllegalStateException("Cannot map runtime $runtime to SDK runtime.")
        val promise = handlerValidator.evaluate(LambdaHandlerValidator.LambdaEntry(project, sdkRuntime, handler))

        if (promise.isPending) {
            promise.then { isValid ->
                messageBus.syncPublisher(LambdaHandlerEvaluationListener.TOPIC).handlerValidationFinished(handler, isValid)
            }
            throw RuntimeConfigurationError(message("lambda.run_configuration.handler.validation.in_progress"))
        }

        val isHandlerValid = promise.blockingGet(0)!!
        if (!isHandlerValid) {
            throw RuntimeConfigurationError(message("lambda.run_configuration.handler_not_found", handler))
        }

        return runtime
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): SamRunningState {
        try {
            val options: LocalLambdaRunSettings = if (serializableOptions.functionOptions.useTemplate) {
                if (serializableOptions.functionOptions.isImage) {
                    val (templateFile, logicalName) = validateSamTemplateDetails(templateFile(), logicalId())

                    val resource = SamTemplateUtils
                        .findImageFunctionsFromTemplate(project, templateFile)
                        .firstOrNull { it.logicalName == logicalId() } ?: throw IllegalStateException("Function ${logicalId()} not found in template!")
                    val function = resource as? SamFunction ?: throw IllegalStateException("Image functions must be a SAM function")

                    val debugger = imageDebugger() ?: throw IllegalStateException("No image debugger with ID ${rawImageDebugger()}")

                    val dockerFile = function.dockerFile() ?: "Dockerfile"
                    val dockerFilePath = Paths.get(templateFile.path).parent.resolve(function.codeLocation()).resolve(dockerFile)
                    ImageTemplateRunSettings(
                        templateFile,
                        debugger,
                        logicalName,
                        LocalFileSystem.getInstance().refreshAndFindFileByIoFile(dockerFilePath.toFile())
                            ?: throw IllegalStateException("Unable to get virtual file for path $dockerFilePath"),
                        pathMappings,
                        environmentVariables(),
                        ConnectionSettings(resolveCredentials(), resolveRegion()),
                        serializableOptions.samOptions.copy(),
                        serializableOptions.debugHost,
                        resolveInput()
                    )
                } else {
                    val (templateFile, logicalId) = validateSamTemplateDetails(templateFile(), logicalId())
                    val resolvedFunction = resolveLambdaInfo(project = project, functionOptions = serializableOptions.functionOptions)
                    TemplateRunSettings(
                        templateFile,
                        resolvedFunction.runtime,
                        resolvedFunction.architecture,
                        resolvedFunction.handler,
                        logicalId,
                        environmentVariables(),
                        ConnectionSettings(resolveCredentials(), resolveRegion()),
                        serializableOptions.samOptions.copy(),
                        serializableOptions.debugHost,
                        resolveInput()
                    )
                }
            } else {
                val resolvedFunction = resolveLambdaInfo(project = project, functionOptions = serializableOptions.functionOptions)
                HandlerRunSettings(
                    resolvedFunction.runtime,
                    resolvedFunction.architecture,
                    resolvedFunction.handler,
                    timeout(),
                    memorySize(),
                    environmentVariables(),
                    ConnectionSettings(resolveCredentials(), resolveRegion()),
                    serializableOptions.samOptions.copy(),
                    serializableOptions.debugHost,
                    resolveInput()
                )
            }
            return SamRunningState(environment, options)
        } catch (e: Exception) {
            throw ExecutionException(e.message, e)
        }
    }

    override fun getRefactoringElementListener(element: PsiElement?): RefactoringElementListener? {
        element?.run {
            val handlerResolver = element.language.runtimeGroup?.let { runtimeGroup ->
                LambdaHandlerResolver.getInstanceOrNull(runtimeGroup)
            } ?: return null

            val handlerPsi = handlerPsiElement() ?: return null

            if (PsiTreeUtil.isAncestor(element, handlerPsi, false)) {
                return object : RefactoringElementAdapter() {
                    private val originalHandler = serializableOptions.functionOptions.handler

                    override fun elementRenamedOrMoved(newElement: PsiElement) {
                        handlerResolver.determineHandler(handlerPsi)?.let { newHandler ->
                            serializableOptions.functionOptions.handler = newHandler
                        }
                    }

                    override fun undoElementMovedOrRenamed(newElement: PsiElement, oldQualifiedName: String) {
                        serializableOptions.functionOptions.handler = originalHandler
                    }
                }
            }
        }
        return null
    }

    fun useTemplate(templateLocation: String?, logicalId: String?, runtime: String? = null) {
        val functionOptions = serializableOptions.functionOptions
        functionOptions.useTemplate = true

        functionOptions.templateFile = templateLocation
        functionOptions.logicalId = logicalId

        functionOptions.handler = null
        functionOptions.runtime = runtime
    }

    fun useHandler(runtime: Runtime?, handler: String?) {
        val functionOptions = serializableOptions.functionOptions
        functionOptions.useTemplate = false

        functionOptions.templateFile = null
        functionOptions.logicalId = null

        functionOptions.handler = handler
        functionOptions.runtime = runtime?.toString()
    }

    fun isUsingTemplate() = serializableOptions.functionOptions.useTemplate

    fun templateFile() = serializableOptions.functionOptions.templateFile

    fun logicalId() = serializableOptions.functionOptions.logicalId

    fun handler() = serializableOptions.functionOptions.handler

    fun runtime(): LambdaRuntime? = LambdaRuntime.fromValue(serializableOptions.functionOptions.runtime)

    /*
     * This is only to be called for Image functions, otherwise we do not store the runtime for ZIP based template functions
     * This is one of the things that needs to be cleaned up when we migrate the underlying representation
     */
    fun runtime(runtime: Runtime?) {
        serializableOptions.functionOptions.runtime = runtime?.toString()
    }

    fun runtime(runtime: LambdaRuntime?) {
        serializableOptions.functionOptions.runtime = runtime?.toString()
    }

    fun architecture() = serializableOptions.functionOptions.architecture

    fun architecture(architecture: LambdaArchitecture?) {
        serializableOptions.functionOptions.architecture = architecture?.toString()
    }

    fun imageDebugger(): ImageDebugSupport? = serializableOptions.functionOptions.runtime?.let {
        ImageDebugSupport.debuggers().get(it)
    }

    private fun rawImageDebugger(): String? = serializableOptions.functionOptions.runtime

    fun imageDebugger(imageDebugger: ImageDebugSupport?) {
        serializableOptions.functionOptions.runtime = imageDebugger?.id
    }

    fun timeout() = serializableOptions.functionOptions.timeout

    fun timeout(timeout: Int) {
        serializableOptions.functionOptions.timeout = timeout
    }

    fun memorySize() = serializableOptions.functionOptions.memorySize

    fun memorySize(memorySize: Int) {
        serializableOptions.functionOptions.memorySize = memorySize
    }

    fun environmentVariables() = serializableOptions.functionOptions.environmentVariables

    fun environmentVariables(envVars: Map<String, String>) {
        serializableOptions.functionOptions.environmentVariables = envVars
    }

    /*
     * This is only needed in `getState` during runtime. Although it is persisted, we don't actually
     * care about reading the value back off of disk.
     * TODO when we have a template registry remove this
     */
    var isImage: Boolean
        get() = serializableOptions.functionOptions.isImage
        set(value) {
            serializableOptions.functionOptions.isImage = value
        }

    var pathMappings: List<PathMapping>
        get() = serializableOptions.functionOptions.pathMappings.map { PathMapping(it.local, it.remote) }
        set(list) {
            serializableOptions.functionOptions.pathMappings = list.map { PersistedPathMapping(it.localRoot, it.remoteRoot) }
        }

    override var dockerNetwork: String?
        get() = serializableOptions.samOptions.dockerNetwork
        set(network) {
            serializableOptions.samOptions.dockerNetwork = network
        }

    override var debugHost: String
        get() = serializableOptions.debugHost
        set(host) {
            serializableOptions.debugHost = host
        }

    override var skipPullImage: Boolean
        get() = serializableOptions.samOptions.skipImagePull
        set(skip) {
            serializableOptions.samOptions.skipImagePull = skip
        }

    override var buildInContainer: Boolean
        get() = serializableOptions.samOptions.buildInContainer
        set(useContainer) {
            serializableOptions.samOptions.buildInContainer = useContainer
        }

    override var additionalBuildArgs: String?
        get() = serializableOptions.samOptions.additionalBuildArgs
        set(args) {
            serializableOptions.samOptions.additionalBuildArgs = args
        }

    override var additionalLocalArgs: String?
        get() = serializableOptions.samOptions.additionalLocalArgs
        set(args) {
            serializableOptions.samOptions.additionalLocalArgs = args
        }

    override fun suggestedName(): String? {
        val subName = serializableOptions.functionOptions.logicalId ?: handlerDisplayName()
        return "[${message("lambda.run_configuration.local")}] $subName"
    }

    private fun handlerDisplayName(): String? {
        val handler = serializableOptions.functionOptions.handler ?: return null
        return runtime()
            ?.toSdkRuntime()
            .validOrNull
            ?.runtimeGroup
            ?.let { LambdaHandlerResolver.getInstanceOrNull(it) }
            ?.handlerDisplayName(handler) ?: handler
    }

    private fun resolveLambdaInfo(project: Project, functionOptions: FunctionOptions): ResolvedFunction =
        if (functionOptions.useTemplate) {
            resolveLambdaFromTemplate(
                project = project,
                templatePath = functionOptions.templateFile,
                functionName = functionOptions.logicalId
            )
        } else {
            resolveLambdaFromHandler(
                handler = functionOptions.handler,
                runtime = functionOptions.runtime,
                architecture = functionOptions.architecture
            )
        }

    private fun handlerPsiElement(handler: String? = handler(), runtime: Runtime? = runtime()?.toSdkRuntime()) = try {
        runtime?.let {
            handler?.let {
                findPsiElementsForHandler(project, runtime, handler).firstOrNull()
            }
        }
    } catch (e: Exception) {
        null
    }
}
