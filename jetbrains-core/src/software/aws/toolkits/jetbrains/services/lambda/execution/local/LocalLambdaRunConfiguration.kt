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
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
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
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.resources.message
import java.nio.file.Path

class LocalLambdaRunConfigurationFactory(configuration: LambdaRunConfiguration) : ConfigurationFactory(configuration) {
    override fun createTemplateConfiguration(project: Project) = LocalLambdaRunConfiguration(project, this)

    override fun getName(): String = "Local"
}

class LocalLambdaRunConfiguration(project: Project, factory: ConfigurationFactory) :
    LambdaRunConfigurationBase<LocalLambdaOptions>(project, factory, "SAM CLI"),
    RefactoringListenerProvider {
    override val state = LocalLambdaOptions()

    override fun getConfigurationEditor(): SettingsEditor<LocalLambdaRunConfiguration> {
        val group = SettingsEditorGroup<LocalLambdaRunConfiguration>()
        group.addEditor(ExecutionBundle.message("run.configuration.configuration.tab.title"), LocalLambdaRunSettingsEditor(project))
        group.addEditor(message("lambda.run_configuration.sam"), SamSettingsEditor())
        return group
    }

    override fun checkConfiguration() {
        SamCommon.validate()?.let {
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

            val samRunSettings = LocalLambdaSettings(
                runtime,
                handler,
                resolveInput(),
                environmentVariables(),
                resolveCredentials(),
                resolveRegion(),
                psiElement,
                templateDetails,
                state.samOptions.copy()
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
                    private val originalHandler = state.functionOptions.handler

                    override fun elementRenamedOrMoved(newElement: PsiElement) {
                        handlerResolver.determineHandler(handlerPsi)?.let { newHandler ->
                            state.functionOptions.handler = newHandler
                        }
                    }

                    override fun undoElementMovedOrRenamed(newElement: PsiElement, oldQualifiedName: String) {
                        state.functionOptions.handler = originalHandler
                    }
                }
            }
        }
        return null
    }

    fun useTemplate(templateLocation: String?, logicalId: String?) {
        val functionOptions = state.functionOptions
        functionOptions.useTemplate = true

        functionOptions.templateFile = templateLocation
        functionOptions.logicalId = logicalId

        functionOptions.handler = null
        functionOptions.runtime = null
    }

    fun useHandler(runtime: Runtime?, handler: String?) {
        val functionOptions = state.functionOptions
        functionOptions.useTemplate = false

        functionOptions.templateFile = null
        functionOptions.logicalId = null

        functionOptions.handler = handler
        functionOptions.runtime = runtime.toString()
    }

    fun isUsingTemplate() = state.functionOptions.useTemplate

    fun templateFile() = state.functionOptions.templateFile

    fun logicalId() = state.functionOptions.logicalId

    fun handler() = state.functionOptions.handler

    fun runtime(): Runtime? = Runtime.fromValue(state.functionOptions.runtime)?.validOrNull

    fun environmentVariables() = state.functionOptions.environmentVariables

    fun environmentVariables(envVars: Map<String, String>) {
        state.functionOptions.environmentVariables = envVars
    }

    fun dockerNetwork(): String? = state.samOptions.dockerNetwork

    fun dockerNetwork(network: String?) {
        state.samOptions.dockerNetwork = network
    }

    fun skipPullImage(): Boolean = state.samOptions.skipImagePull

    fun skipPullImage(skip: Boolean) {
        state.samOptions.skipImagePull = skip
    }

    fun buildInContainer(): Boolean = state.samOptions.buildInContainer

    fun buildInContainer(useContainer: Boolean) {
        state.samOptions.buildInContainer = useContainer
    }

    override fun suggestedName(): String? {
        val subName = state.functionOptions.logicalId ?: handlerDisplayName()
        return "[${message("lambda.run_configuration.local")}] $subName"
    }

    private fun handlerDisplayName(): String? {
        val handler = state.functionOptions.handler ?: return null
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

class LocalLambdaSettings(
    val runtime: Runtime,
    val handler: String,
    val input: String,
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