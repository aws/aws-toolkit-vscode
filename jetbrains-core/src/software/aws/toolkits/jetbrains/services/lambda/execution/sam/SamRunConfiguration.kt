// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.ExecutionException
import com.intellij.execution.Executor
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.RefactoringListenerProvider
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.refactoring.listeners.RefactoringElementAdapter
import com.intellij.refactoring.listeners.RefactoringElementListener
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.lambda.HandlerCompletionProvider
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationBase
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LambdaLocalRunProvider
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamRunConfiguration.MutableLambdaSamRunSettings
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.jetbrains.settings.SamSettings
import software.aws.toolkits.jetbrains.utils.ui.populateValues
import software.aws.toolkits.resources.message
import javax.swing.JPanel

class SamRunConfigurationFactory(configuration: LambdaRunConfiguration) : ConfigurationFactory(configuration) {
    override fun createTemplateConfiguration(project: Project): RunConfiguration =
        SamRunConfiguration(project, this)

    override fun getName(): String {
        return "SAM CLI"
    }
}

class SamRunConfiguration(project: Project, factory: ConfigurationFactory) :
    LambdaRunConfigurationBase<MutableLambdaSamRunSettings>(project, factory, "SAM CLI"),
    RefactoringListenerProvider {
    override var settings = MutableLambdaSamRunSettings()

    override fun getConfigurationEditor() = SamRunSettingsEditor(project)

    override fun checkConfiguration() {
        settings.validateAndCreateImmutable(project)
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): SamRunningState {
        val settings = try {
            settings.validateAndCreateImmutable(project)
        } catch (e: Exception) {
            throw ExecutionException(e.message)
        }
        return SamRunningState(environment, settings)
    }

    private fun getPsiElement(): PsiElement? {
        return try {
            settings.validateAndCreateImmutable(project).handlerElement
        } catch (e: Exception) {
            null
        }
    }

    override fun getRefactoringElementListener(element: PsiElement?): RefactoringElementListener? {
        element?.run {
            val handlerResolver = element.language.runtimeGroup?.let { runtimeGroup ->
                LambdaHandlerResolver.getInstance(runtimeGroup)
            } ?: return null

            val handlerPsi = getPsiElement() ?: return null

            if (PsiTreeUtil.isAncestor(element, handlerPsi, false)) {
                return object : RefactoringElementAdapter() {
                    private val originalHandler = settings.handler

                    override fun elementRenamedOrMoved(newElement: PsiElement) {
                        handlerResolver.determineHandler(handlerPsi)?.let { newHandler ->
                            settings.handler = newHandler
                        }
                    }

                    override fun undoElementMovedOrRenamed(newElement: PsiElement, oldQualifiedName: String) {
                        settings.handler = originalHandler
                    }
                }
            }
        }
        return null
    }

    fun configure(
        runtime: Runtime?,
        handler: String?,
        input: String? = null,
        inputIsFile: Boolean = false,
        envVars: MutableMap<String, String> = mutableMapOf(),
        credentialsProviderId: String? = null,
        region: AwsRegion? = null
    ) {
        settings.input = input
        settings.inputIsFile = inputIsFile
        settings.runtime = runtime?.name
        settings.handler = handler
        settings.environmentVariables = envVars
        settings.credentialProviderId = credentialsProviderId
        settings.regionId = region?.id
    }

    override fun suggestedName(): String? = settings.handler

    class MutableLambdaSamRunSettings(
        var runtime: String? = null,
        var handler: String? = null,
        input: String? = null,
        inputIsFile: Boolean = false,
        var environmentVariables: MutableMap<String, String> = mutableMapOf(),
        var regionId: String? = null,
        var credentialProviderId: String? = null
    ) : MutableLambdaRunSettings(input, inputIsFile) {
        fun validateAndCreateImmutable(project: Project): SamRunSettings {
            if (SamSettings.getInstance().executablePath.isEmpty()) {
                throw RuntimeConfigurationError(message("lambda.run_configuration.sam.not_specified")) {
                    ShowSettingsUtil.getInstance().showSettingsDialog(project, AwsSettingsConfigurable::class.java)
                }
            }

            val handler =
                handler ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_handler_specified"))
            val runtime = runtime?.let { Runtime.valueOf(it) }
                    ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_runtime_specified"))
            val element = findPsiElementsForHandler(project, runtime, handler).firstOrNull()
                    ?: throw RuntimeConfigurationError(message("lambda.run_configuration.handler_not_found", handler))
            val regionId =
                regionId ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_region_specified"))
            val envVarsCopy = environmentVariables.toMutableMap()
            val inputText = resolveInputText(input, inputIsFile)

            envVarsCopy["AWS_REGION"] = regionId
            envVarsCopy["AWS_DEFAULT_REGION"] = regionId

            credentialProviderId?.let {
                try {
                    val credentialProvider = CredentialManager.getInstance().getCredentialProvider(it)
                    val awsCredentials = credentialProvider.resolveCredentials()

                    envVarsCopy["AWS_ACCESS_KEY"] = awsCredentials.accessKeyId()
                    envVarsCopy["AWS_ACCESS_KEY_ID"] = awsCredentials.accessKeyId()
                    envVarsCopy["AWS_SECRET_KEY"] = awsCredentials.secretAccessKey()
                    envVarsCopy["AWS_SECRET_ACCESS_KEY"] = awsCredentials.secretAccessKey()

                    if (awsCredentials is AwsSessionCredentials) {
                        envVarsCopy["AWS_SESSION_TOKEN"] = awsCredentials.sessionToken()
                        envVarsCopy["AWS_SECURITY_TOKEN"] = awsCredentials.sessionToken()
                    }
                } catch (e: CredentialProviderNotFound) {
                    throw RuntimeConfigurationError(message("lambda.run_configuration.credential_not_found_error", it))
                } catch (e: Exception) {
                    throw RuntimeConfigurationError(
                        message(
                            "lambda.run_configuration.credential_error",
                            e.message ?: "Unknown"
                        )
                    )
                }
            }

            return SamRunSettings(runtime, handler, inputText, envVarsCopy, element)
        }
    }
}

class SamRunSettingsEditor(project: Project) : SettingsEditor<SamRunConfiguration>() {
    private val view = SamRunSettingsEditorPanel(project, HandlerCompletionProvider(project))
    private val regionProvider = AwsRegionProvider.getInstance()
    private val credentialManager = CredentialManager.getInstance()

    init {
        val supported = LambdaLocalRunProvider.supportedRuntimeGroups.flatMap { it.runtimes }.map { it }.sorted()
        val selected =
            ProjectRootManager.getInstance(project).projectSdk
                ?.let { RuntimeGroup.runtimeForSdk(it) }
                ?.let { if (it in supported) it else null }
        view.runtime.populateValues(selected = selected) { supported }

        view.regionSelector.setRegions(regionProvider.regions().values.toMutableList())
        view.regionSelector.selectedRegion = ProjectAccountSettingsManager.getInstance(project).activeRegion

        view.credentialSelector.setCredentialsProviders(credentialManager.getCredentialProviders())
    }

    override fun createEditor(): JPanel = view.panel

    override fun resetEditorFrom(configuration: SamRunConfiguration) {
        val settings = configuration.settings

        view.runtime.selectedItem = settings.runtime?.let { Runtime.valueOf(it) }
        view.handler.setText(settings.handler)
        view.environmentVariables.envVars = settings.environmentVariables
        view.regionSelector.selectedRegion = regionProvider.lookupRegionById(settings.regionId)

        settings.credentialProviderId?.let {
            try {
                view.credentialSelector.setSelectedInvalidCredentialsProvider(credentialManager.getCredentialProvider(it))
            } catch (e: CredentialProviderNotFound) {
                // Use the raw string here to not munge what the customer had, will also allow it to show the error
                // that it could not be found
                view.credentialSelector.setSelectedInvalidCredentialsProvider(it)
            }
        }

        view.lambdaInput.isUsingFile = settings.inputIsFile
        if (settings.inputIsFile) {
            view.lambdaInput.inputFile = settings.input
        } else {
            view.lambdaInput.inputText = settings.input
        }
    }

    override fun applyEditorTo(configuration: SamRunConfiguration) {
        val settings = configuration.settings

        settings.runtime = (view.runtime.selectedItem as? Runtime)?.name
        settings.handler = view.handler.text
        settings.environmentVariables = view.environmentVariables.envVars.toMutableMap()
        settings.regionId = view.regionSelector.selectedRegion?.id
        settings.credentialProviderId = view.credentialSelector.getSelectedCredentialsProvider()
        settings.inputIsFile = view.lambdaInput.isUsingFile
        settings.input = if (view.lambdaInput.isUsingFile) {
            view.lambdaInput.inputFile
        } else {
            view.lambdaInput.inputText
        }
    }
}

class SamRunSettings(
    val runtime: Runtime,
    val handler: String,
    val input: String,
    val environmentVariables: Map<String, String>,
    val handlerElement: NavigatablePsiElement
) {
    val runtimeGroup: RuntimeGroup = runtime.runtimeGroup
            ?: throw IllegalStateException("Attempting to run SAM for unsupported runtime $runtime")
}