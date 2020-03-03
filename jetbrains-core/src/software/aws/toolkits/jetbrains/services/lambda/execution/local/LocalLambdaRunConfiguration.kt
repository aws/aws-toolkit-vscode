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
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.refactoring.listeners.RefactoringElementAdapter
import com.intellij.refactoring.listeners.RefactoringElementListener
import org.jetbrains.concurrency.isPending
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutableIfPresent
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationBase
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationType
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.jetbrains.services.lambda.validation.LambdaHandlerEvaluationListener
import software.aws.toolkits.jetbrains.services.lambda.validation.LambdaHandlerValidator
import software.aws.toolkits.jetbrains.ui.connection.AwsConnectionSettingsEditor
import software.aws.toolkits.jetbrains.ui.connection.addAwsConnectionEditor
import software.aws.toolkits.resources.message
import java.nio.file.Path

class LocalLambdaRunConfigurationFactory(configuration: LambdaRunConfigurationType) : ConfigurationFactory(configuration) {
    override fun createTemplateConfiguration(project: Project) = LocalLambdaRunConfiguration(project, this)
    override fun getName(): String = "Local"
}

class LocalLambdaRunConfiguration(project: Project, factory: ConfigurationFactory) :
    LambdaRunConfigurationBase<LocalLambdaOptions>(project, factory, "SAM CLI"),
    RefactoringListenerProvider {

    companion object {
        private val logger = getLogger<LocalLambdaRunConfiguration>()
    }

    private val messageBus = project.messageBus

    override val serializableOptions = LocalLambdaOptions()

    override fun getConfigurationEditor(): SettingsEditor<LocalLambdaRunConfiguration> {
        val group = SettingsEditorGroup<LocalLambdaRunConfiguration>()
        group.addEditor(ExecutionBundle.message("run.configuration.configuration.tab.title"), LocalLambdaRunSettingsEditor(project))
        group.addEditor(message("lambda.run_configuration.sam"), SamSettingsEditor())
        group.addAwsConnectionEditor(AwsConnectionSettingsEditor(project))
        return group
    }

    override fun checkConfiguration() {
        checkSamVersion()
        resolveRegion()
        resolveCredentials()
        checkLambdaHandler()
        checkInput()
    }

    private fun checkSamVersion() {
        ExecutableManager.getInstance().getExecutableIfPresent<SamExecutable>().let {
            when (it) {
                is ExecutableInstance.Executable -> it
                is ExecutableInstance.InvalidExecutable, is ExecutableInstance.UnresolvedExecutable -> throw RuntimeConfigurationError(
                    (it as? ExecutableInstance.BadExecutable)?.validationError
                )
            }
        }
    }

    private fun checkLambdaHandler() {
        val handlerValidator = project.service<LambdaHandlerValidator>()
        val (handler, runtime) = resolveLambdaInfo(project = project, functionOptions = serializableOptions.functionOptions)
        val promise = handlerValidator.evaluate(LambdaHandlerValidator.LambdaEntry(project, runtime, handler))

        if (promise.isPending) {
            promise.then { isValid ->
                messageBus.syncPublisher(LambdaHandlerEvaluationListener.TOPIC).handlerValidationFinished(handler, isValid)
            }
            logger.info { "Validation will proceed asynchronously for SAM CLI version" }
            throw RuntimeConfigurationError(message("lambda.run_configuration.handler.validation.in_progress"))
        }

        val isHandlerValid = promise.blockingGet(0)!!
        if (!isHandlerValid)
            throw RuntimeConfigurationError(message("lambda.run_configuration.handler_not_found", handler))
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): SamRunningState {
        try {
            val (handler, runtime, templateDetails) = resolveLambdaInfo(project = project, functionOptions = serializableOptions.functionOptions)
            val psiElement = handlerPsiElement(handler, runtime)
                ?: throw RuntimeConfigurationError(message("lambda.run_configuration.handler_not_found", handler))

            val samRunSettings = LocalLambdaRunSettings(
                runtime,
                handler,
                resolveInput(),
                timeout(),
                memorySize(),
                environmentVariables(),
                resolveCredentials(),
                resolveRegion(),
                psiElement,
                templateDetails,
                serializableOptions.samOptions.copy(),
                serializableOptions.debugHost
            )

            return SamRunningState(environment, samRunSettings)
        } catch (e: Exception) {
            throw ExecutionException(e.message, e)
        }
    }

    override fun getRefactoringElementListener(element: PsiElement?): RefactoringElementListener? {
        element?.run {
            val handlerResolver = element.language.runtimeGroup?.let { runtimeGroup ->
                LambdaHandlerResolver.getInstance(runtimeGroup)
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

    fun useTemplate(templateLocation: String?, logicalId: String?) {
        val functionOptions = serializableOptions.functionOptions
        functionOptions.useTemplate = true

        functionOptions.templateFile = templateLocation
        functionOptions.logicalId = logicalId

        functionOptions.handler = null
        functionOptions.runtime = null
    }

    fun useHandler(runtime: Runtime?, handler: String?) {
        val functionOptions = serializableOptions.functionOptions
        functionOptions.useTemplate = false

        functionOptions.templateFile = null
        functionOptions.logicalId = null

        functionOptions.handler = handler
        functionOptions.runtime = runtime.toString()
    }

    fun isUsingTemplate() = serializableOptions.functionOptions.useTemplate

    fun templateFile() = serializableOptions.functionOptions.templateFile

    fun logicalId() = serializableOptions.functionOptions.logicalId

    fun handler() = serializableOptions.functionOptions.handler

    fun runtime(): Runtime? = Runtime.fromValue(serializableOptions.functionOptions.runtime)?.validOrNull

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

    fun dockerNetwork(): String? = serializableOptions.samOptions.dockerNetwork

    fun dockerNetwork(network: String?) {
        serializableOptions.samOptions.dockerNetwork = network
    }

    fun debugHost(): String = serializableOptions.debugHost

    fun debugHost(host: String) {
        serializableOptions.debugHost = host
    }

    fun skipPullImage(): Boolean = serializableOptions.samOptions.skipImagePull

    fun skipPullImage(skip: Boolean) {
        serializableOptions.samOptions.skipImagePull = skip
    }

    fun buildInContainer(): Boolean = serializableOptions.samOptions.buildInContainer

    fun buildInContainer(useContainer: Boolean) {
        serializableOptions.samOptions.buildInContainer = useContainer
    }

    fun additionalBuildArgs(): String? = serializableOptions.samOptions.additionalBuildArgs

    fun additionalBuildArgs(args: String?) {
        serializableOptions.samOptions.additionalBuildArgs = args
    }

    fun additionalLocalArgs(): String? = serializableOptions.samOptions.additionalLocalArgs

    fun additionalLocalArgs(args: String?) {
        serializableOptions.samOptions.additionalLocalArgs = args
    }

    override fun suggestedName(): String? {
        val subName = serializableOptions.functionOptions.logicalId ?: handlerDisplayName()
        return "[${message("lambda.run_configuration.local")}] $subName"
    }

    private fun handlerDisplayName(): String? {
        val handler = serializableOptions.functionOptions.handler ?: return null
        return runtime()
            ?.runtimeGroup
            ?.let { LambdaHandlerResolver.getInstance(it) }
            ?.handlerDisplayName(handler) ?: handler
    }

    private fun resolveLambdaFromTemplate(project: Project, templatePath: String?, functionName: String?): Triple<String, Runtime, SamTemplateDetails?> {
        templatePath?.takeUnless { it.isEmpty() }
            ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.no_template_specified"))

        functionName ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.no_function_specified"))

        val templateFile = LocalFileSystem.getInstance().refreshAndFindFileByPath(templatePath)
            ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.template_file_not_found"))

        val function = SamTemplateUtils.findFunctionsFromTemplate(
            project,
            templateFile
        ).find { it.logicalName == functionName }
            ?: throw RuntimeConfigurationError(
                message(
                    "lambda.run_configuration.sam.no_such_function",
                    functionName,
                    templateFile.path
                )
            )

        val handler = tryOrNull { function.handler() }
            ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_handler_specified"))

        val runtime = tryOrNull { Runtime.fromValue(function.runtime()).validOrNull }
            ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_runtime_specified"))

        return Triple(handler, runtime, SamTemplateDetails(VfsUtil.virtualToIoFile(templateFile).toPath(), functionName))
    }

    private fun resolveLambdaFromHandler(handler: String?, runtime: Runtime?): Triple<String, Runtime, SamTemplateDetails?> {
        handler ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_handler_specified"))
        runtime ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_runtime_specified"))
        return Triple(handler, runtime, null)
    }

    private fun resolveLambdaInfo(project: Project, functionOptions: FunctionOptions): Triple<String, Runtime, SamTemplateDetails?> =
        if (functionOptions.useTemplate) {
            resolveLambdaFromTemplate(
                project = project,
                templatePath = functionOptions.templateFile,
                functionName = functionOptions.logicalId
            )
        } else {
            resolveLambdaFromHandler(
                handler = functionOptions.handler,
                runtime = Runtime.fromValue(functionOptions.runtime)?.validOrNull
            )
        }

    private fun handlerPsiElement(handler: String? = handler(), runtime: Runtime? = runtime()) = try {
        runtime?.let {
            handler?.let {
                findPsiElementsForHandler(project, runtime, handler).firstOrNull()
            }
        }
    } catch (e: Exception) {
        null
    }
}

data class LocalLambdaRunSettings(
    val runtime: Runtime,
    val handler: String,
    val input: String,
    val timeout: Int,
    val memorySize: Int,
    val environmentVariables: Map<String, String>,
    val credentials: ToolkitCredentialsProvider,
    val region: AwsRegion,
    val handlerElement: NavigatablePsiElement,
    val templateDetails: SamTemplateDetails?,
    val samOptions: SamOptions,
    val debugHost: String
) {
    val runtimeGroup: RuntimeGroup = runtime.runtimeGroup
        ?: throw IllegalStateException("Attempting to run SAM for unsupported runtime $runtime")
}

data class SamTemplateDetails(val templateFile: Path, val logicalName: String)
