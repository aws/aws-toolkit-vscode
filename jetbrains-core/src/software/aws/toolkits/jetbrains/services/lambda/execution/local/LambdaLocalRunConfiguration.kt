// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.PlainPrefixMatcher
import com.intellij.codeInsight.lookup.CharFilter
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.execution.ExecutionException
import com.intellij.execution.Executor
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.ModuleRunProfile
import com.intellij.execution.configurations.RefactoringListenerProvider
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.util.PsiTreeUtil
import com.intellij.refactoring.listeners.RefactoringElementAdapter
import com.intellij.refactoring.listeners.RefactoringElementListener
import com.intellij.util.indexing.FileBasedIndex
import com.intellij.util.textCompletion.TextCompletionProvider
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.lambda.Lambda.findPsiElementsForHandler
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerIndex
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroupExtensionPointObject
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationBase
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.utils.ui.populateValues
import software.aws.toolkits.resources.message
import javax.swing.JPanel

class LambdaLocalRunConfigurationFactory(configuration: LambdaRunConfiguration) : ConfigurationFactory(configuration) {
    override fun createTemplateConfiguration(project: Project): RunConfiguration =
        LambdaLocalRunConfiguration(project, this)

    override fun getName(): String {
        return "Local"
    }
}

class LambdaLocalRunConfiguration(project: Project, factory: ConfigurationFactory) :
    LambdaRunConfigurationBase<LambdaLocalRunConfiguration.MutableLambdaLocalRunSettings>(project, factory, "Local"),
    ModuleRunProfile, RefactoringListenerProvider {
    override var settings = MutableLambdaLocalRunSettings()

    override fun getConfigurationEditor() = LocalLambdaRunSettingsEditor(project)

    override fun checkConfiguration() {
        settings.validateAndCreateImmutable(project)
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): RunProfileState {
        val settings = try {
            settings.validateAndCreateImmutable(project)
        } catch (e: Exception) {
            throw ExecutionException(e.message)
        }
        val provider = settings.runtime.runtimeGroup?.let { LambdaLocalRunProvider.getInstance(it) }
                ?: throw ExecutionException("Unable to find run provider for ${settings.runtime}")
        return provider.createRunProfileState(environment, project, settings)
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
        handler: String,
        input: String? = null,
        envVars: MutableMap<String, String> = mutableMapOf(),
        region: AwsRegion? = null
    ) {
        settings.input = input
        settings.runtime = runtime?.name
        settings.handler = handler
        settings.environmentVariables = envVars
        settings.regionId = region?.id
    }

    @TestOnly
    fun getHandler(): String? {
        return settings.handler
    }

    override fun suggestedName(): String? = settings.handler

    class MutableLambdaLocalRunSettings(
        var runtime: String? = null,
        var handler: String? = null,
        input: String? = null,
        inputIsFile: Boolean = false,
        var environmentVariables: MutableMap<String, String> = mutableMapOf(),
        var regionId: String? = null,
        var credentialProviderId: String? = null
    ) : MutableLambdaRunSettings(input, inputIsFile) {
        fun validateAndCreateImmutable(project: Project): LambdaLocalRunSettings {
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

            return LambdaLocalRunSettings(runtime, handler, inputText, envVarsCopy, element)
        }
    }
}

class LocalLambdaRunSettingsEditor(project: Project) : SettingsEditor<LambdaLocalRunConfiguration>() {
    private val view = LocalLambdaRunSettingsEditorPanel(project, HandlerCompletionProvider(project))
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

    override fun resetEditorFrom(configuration: LambdaLocalRunConfiguration) {
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

    override fun createEditor(): JPanel = view.panel

    override fun applyEditorTo(configuration: LambdaLocalRunConfiguration) {
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

class HandlerCompletionProvider(private val project: Project) : TextCompletionProvider {
    override fun applyPrefixMatcher(result: CompletionResultSet, prefix: String): CompletionResultSet =
        result.withPrefixMatcher(PlainPrefixMatcher(prefix))

    override fun getAdvertisement(): String? = null

    override fun getPrefix(text: String, offset: Int): String? = text

    override fun fillCompletionVariants(parameters: CompletionParameters, prefix: String, result: CompletionResultSet) {
        FileBasedIndex.getInstance().getAllKeys(LambdaHandlerIndex.NAME, project)
            .forEach { result.addElement(LookupElementBuilder.create(it)) }
        result.stopHere()
    }

    override fun acceptChar(c: Char): CharFilter.Result? {
        return if (c.isWhitespace()) {
            CharFilter.Result.SELECT_ITEM_AND_FINISH_LOOKUP
        } else {
            CharFilter.Result.ADD_TO_PREFIX
        }
    }
}

class LambdaLocalRunSettings(
    val runtime: Runtime,
    val handler: String,
    val input: String,
    val environmentVariables: Map<String, String>,
    val handlerElement: NavigatablePsiElement
)

interface LambdaLocalRunProvider {
    fun createRunProfileState(
        environment: ExecutionEnvironment,
        project: Project,
        settings: LambdaLocalRunSettings
    ): RunProfileState

    companion object :
        RuntimeGroupExtensionPointObject<LambdaLocalRunProvider>(ExtensionPointName.create("aws.toolkit.lambda.localRunProvider"))
}