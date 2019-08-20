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
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.options.SettingsEditorGroup
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.refactoring.listeners.RefactoringElementAdapter
import com.intellij.refactoring.listeners.RefactoringElementListener
import com.intellij.util.ExceptionUtil
import org.jetbrains.concurrency.isPending
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationBase
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils.findFunctionsFromTemplate
import software.aws.toolkits.jetbrains.services.lambda.sam.SamVersionCache
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.resources.message
import java.nio.file.Path

class LocalLambdaRunConfigurationFactory(configuration: LambdaRunConfiguration) : ConfigurationFactory(configuration) {
    override fun createTemplateConfiguration(project: Project) = LocalLambdaRunConfiguration(project, this)

    override fun getName(): String = "Local"
}

class LocalLambdaRunConfiguration(project: Project, factory: ConfigurationFactory) :
    LambdaRunConfigurationBase<LocalLambdaOptions>(project, factory, "SAM CLI"),
    RefactoringListenerProvider {
    companion object {
        private val logger = getLogger<LocalLambdaRunConfiguration>()
    }

    override val lambdaOptions = LocalLambdaOptions()

    override fun getConfigurationEditor(): SettingsEditor<LocalLambdaRunConfiguration> {
        val group = SettingsEditorGroup<LocalLambdaRunConfiguration>()
        group.addEditor(ExecutionBundle.message("run.configuration.configuration.tab.title"), LocalLambdaRunSettingsEditor(project))
        group.addEditor(message("lambda.run_configuration.sam"), SamSettingsEditor())
        return group
    }

    override fun checkConfiguration() {
        val executablePath = SamSettings.getInstance().executablePath
            ?: throw RuntimeConfigurationError(message("sam.cli_not_configured"))

        val promise = SamVersionCache.evaluate(executablePath)

        if (promise.isPending) {
            logger.info { "Validation will proceed asynchronously for SAM CLI version" }
            throw RuntimeConfigurationError(message("lambda.run_configuration.sam.validation.in_progress"))
        }

        val errorMessage = try {
            val semVer = promise.blockingGet(0)!!
            SamCommon.getInvalidVersionMessage(semVer)
        } catch (e: Exception) {
            ExceptionUtil.getRootCause(e).message ?: message("general.unknown_error")
        }

        errorMessage?.let {
            throw RuntimeConfigurationError(message("lambda.run_configuration.sam.invalid_executable", it)) {
                ShowSettingsUtil.getInstance().showSettingsDialog(project, AwsSettingsConfigurable::class.java)
            }
        }

        resolveCredentials()

        val (handler, runtime) = resolveLambdaInfo()
        handlerPsiElement(handler, runtime) ?: throw RuntimeConfigurationError(message("lambda.run_configuration.handler_not_found", handler))
        regionId() ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_region_specified"))
        checkInput()
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): SamRunningState {
        try {
            val (handler, runtime, templateDetails) = resolveLambdaInfo()
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
                lambdaOptions.samOptions.copy()
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
                    private val originalHandler = lambdaOptions.functionOptions.handler

                    override fun elementRenamedOrMoved(newElement: PsiElement) {
                        handlerResolver.determineHandler(handlerPsi)?.let { newHandler ->
                            lambdaOptions.functionOptions.handler = newHandler
                        }
                    }

                    override fun undoElementMovedOrRenamed(newElement: PsiElement, oldQualifiedName: String) {
                        lambdaOptions.functionOptions.handler = originalHandler
                    }
                }
            }
        }
        return null
    }

    fun useTemplate(templateLocation: String?, logicalId: String?) {
        val functionOptions = lambdaOptions.functionOptions
        functionOptions.useTemplate = true

        functionOptions.templateFile = templateLocation
        functionOptions.logicalId = logicalId

        functionOptions.handler = null
        functionOptions.runtime = null
    }

    fun useHandler(runtime: Runtime?, handler: String?) {
        val functionOptions = lambdaOptions.functionOptions
        functionOptions.useTemplate = false

        functionOptions.templateFile = null
        functionOptions.logicalId = null

        functionOptions.handler = handler
        functionOptions.runtime = runtime.toString()
    }

    fun isUsingTemplate() = lambdaOptions.functionOptions.useTemplate

    fun templateFile() = lambdaOptions.functionOptions.templateFile

    fun logicalId() = lambdaOptions.functionOptions.logicalId

    fun handler() = lambdaOptions.functionOptions.handler

    fun runtime(): Runtime? = Runtime.fromValue(lambdaOptions.functionOptions.runtime)?.validOrNull

    fun timeout() = lambdaOptions.functionOptions.timeout

    fun timeout(timeout: Int) {
        lambdaOptions.functionOptions.timeout = timeout
    }

    fun memorySize() = lambdaOptions.functionOptions.memorySize

    fun memorySize(memorySize: Int) {
        lambdaOptions.functionOptions.memorySize = memorySize
    }

    fun environmentVariables() = lambdaOptions.functionOptions.environmentVariables

    fun environmentVariables(envVars: Map<String, String>) {
        lambdaOptions.functionOptions.environmentVariables = envVars
    }

    fun dockerNetwork(): String? = lambdaOptions.samOptions.dockerNetwork

    fun dockerNetwork(network: String?) {
        lambdaOptions.samOptions.dockerNetwork = network
    }

    fun skipPullImage(): Boolean = lambdaOptions.samOptions.skipImagePull

    fun skipPullImage(skip: Boolean) {
        lambdaOptions.samOptions.skipImagePull = skip
    }

    fun buildInContainer(): Boolean = lambdaOptions.samOptions.buildInContainer

    fun buildInContainer(useContainer: Boolean) {
        lambdaOptions.samOptions.buildInContainer = useContainer
    }

    fun additionalBuildArgs(): String? = lambdaOptions.samOptions.additionalBuildArgs

    fun additionalBuildArgs(args: String?) {
        lambdaOptions.samOptions.additionalBuildArgs = args
    }

    fun additionalLocalArgs(): String? = lambdaOptions.samOptions.additionalLocalArgs

    fun additionalLocalArgs(args: String?) {
        lambdaOptions.samOptions.additionalLocalArgs = args
    }

    override fun suggestedName(): String? {
        val subName = lambdaOptions.functionOptions.logicalId ?: handlerDisplayName()
        return "[${message("lambda.run_configuration.local")}] $subName"
    }

    private fun handlerDisplayName(): String? {
        val handler = lambdaOptions.functionOptions.handler ?: return null
        return runtime()
            ?.runtimeGroup
            ?.let { LambdaHandlerResolver.getInstance(it) }
            ?.handlerDisplayName(handler) ?: handler
    }

    private fun resolveLambdaInfo() = if (isUsingTemplate()) {
        val templatePath = templateFile()
            ?.takeUnless { it.isEmpty() }
            ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.no_template_specified"))

        val functionName = logicalId() ?: throw RuntimeConfigurationError(
            message("lambda.run_configuration.sam.no_function_specified")
        )

        val templateFile = LocalFileSystem.getInstance().findFileByPath(templatePath)
            ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.template_file_not_found"))

        val function = findFunctionsFromTemplate(
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

        Triple(handler, runtime, SamTemplateDetails(VfsUtil.virtualToIoFile(templateFile).toPath(), functionName))
    } else {
        val handler = handler()
            ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_handler_specified"))
        val runtime = runtime()
            ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_runtime_specified"))

        Triple(handler, runtime, null)
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
    val samOptions: SamOptions
) {
    val runtimeGroup: RuntimeGroup = runtime.runtimeGroup
        ?: throw IllegalStateException("Attempting to run SAM for unsupported runtime $runtime")
}

data class SamTemplateDetails(val templateFile: Path, val logicalName: String)