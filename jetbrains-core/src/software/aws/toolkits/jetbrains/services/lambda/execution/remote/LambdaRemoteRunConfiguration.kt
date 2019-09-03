// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.ExecutionException
import com.intellij.execution.Executor
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationType
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationBase
import software.aws.toolkits.resources.message
import javax.swing.JPanel
import kotlin.streams.toList

class LambdaRemoteRunConfigurationFactory(configuration: LambdaRunConfigurationType) : ConfigurationFactory(configuration) {
    override fun createTemplateConfiguration(project: Project) = LambdaRemoteRunConfiguration(project, this)

    override fun getName(): String = "Remote"

    override fun getOptionsClass() = RemoteLambdaOptions::class.java
}

class LambdaRemoteRunConfiguration(project: Project, factory: ConfigurationFactory) :
    LambdaRunConfigurationBase<RemoteLambdaOptions>(project, factory, "Remote") {

    override fun getConfigurationEditor() = RemoteLambdaRunSettingsEditor(project)

    override fun getOptions() = super.getOptions() as RemoteLambdaOptions

    override fun checkConfiguration() {
        functionName() ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_function_specified"))

        resolveCredentials()
        regionId() ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_region_specified"))
        checkInput()
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): RemoteLambdaState {
        try {
            val functionName = functionName()
                ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_function_specified"))

            return RemoteLambdaState(
                environment,
                LambdaRemoteRunSettings(resolveCredentials(), resolveRegion(), functionName, resolveInput())
            )
        } catch (e: Exception) {
            throw ExecutionException(e.message, e)
        }
    }

    override fun suggestedName() = "[${message("lambda.run_configuration.remote")}] ${functionName()}"

    fun functionName() = options.functionOptions.functionName

    fun functionName(name: String?) {
        options.functionOptions.functionName = name
    }
}

class LambdaRemoteRunSettings(
    val credentialProvider: ToolkitCredentialsProvider,
    val region: AwsRegion,
    val functionName: String,
    val input: String
)

class RemoteLambdaRunSettingsEditor(project: Project) : SettingsEditor<LambdaRemoteRunConfiguration>() {
    private val view = LambdaRemoteRunSettingsEditorPanel(project)
    private val credentialManager = CredentialManager.getInstance()
    private val regionProvider = AwsRegionProvider.getInstance()
    private val clientManager = AwsClientManager.getInstance(project)

    init {
        view.credentialSelector.setCredentialsProviders(credentialManager.getCredentialProviders())
        view.regionSelector.setRegions(regionProvider.regions().values.toList())

        view.credentialSelector.addActionListener { updateFunctions() }
        view.regionSelector.addActionListener { updateFunctions() }
    }

    private fun updateFunctions() {
        view.functionNames.selectedItem = null
        view.setFunctionNames(emptyList())

        val credentialProviderId = view.credentialSelector.getSelectedCredentialsProvider() ?: return
        val region = view.regionSelector.selectedRegion ?: return

        val credProvider = try {
            credentialManager.getCredentialProvider(credentialProviderId)
        } catch (e: CredentialProviderNotFound) {
            return
        }

        view.functionNames.isEnabled = false

        ApplicationManager.getApplication().executeOnPooledThread {
            val lambdaClient = clientManager.getClient<LambdaClient>(credProvider, region)

            val functions = try {
                lambdaClient.listFunctionsPaginator().stream()
                    .flatMap { it.functions().stream().map { function -> function.functionName() } }
                    .toList()
            } catch (e: Exception) {
                LOG.warn(e) { "Failed to load functions" }
                emptyList<String>()
            }

            runInEdt(ModalityState.any()) {
                view.setFunctionNames(functions)
                view.functionNames.isEnabled = true
            }
        }
    }

    override fun createEditor(): JPanel = view.panel

    override fun resetEditorFrom(configuration: LambdaRemoteRunConfiguration) {
        configuration.credentialProviderId()?.let {
            try {
                view.credentialSelector.setSelectedCredentialsProvider(credentialManager.getCredentialProvider(it))
            } catch (e: CredentialProviderNotFound) {
                // Use the raw string here to not munge what the customer had, will also allow it to show the error
                // that it could not be found
                view.credentialSelector.setSelectedInvalidCredentialsProvider(it)
            }
        }

        view.regionSelector.selectedRegion = regionProvider.regions()[configuration.regionId()]
        view.functionNames.selectedItem = configuration.functionName()

        if (configuration.isUsingInputFile()) {
            view.lambdaInput.inputFile = configuration.inputSource()
        } else {
            view.lambdaInput.inputText = configuration.inputSource()
        }
    }

    override fun applyEditorTo(configuration: LambdaRemoteRunConfiguration) {
        configuration.credentialProviderId(view.credentialSelector.getSelectedCredentialsProvider())
        configuration.regionId(view.regionSelector.selectedRegion?.id)
        configuration.functionName(view.functionName)
        if (view.lambdaInput.isUsingFile) {
            configuration.useInputFile(view.lambdaInput.inputFile)
        } else {
            configuration.useInputText(view.lambdaInput.inputText)
        }
    }

    private companion object {
        val LOG = getLogger<RemoteLambdaRunSettingsEditor>()
    }
}