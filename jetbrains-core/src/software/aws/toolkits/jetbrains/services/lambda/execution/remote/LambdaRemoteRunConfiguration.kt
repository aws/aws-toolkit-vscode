// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.Executor
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.RunConfiguration
import com.intellij.execution.configurations.RunProfileState
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.project.Project
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfiguration
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationBase
import software.aws.toolkits.resources.message
import javax.swing.JPanel
import kotlin.streams.toList

class LambdaRemoteRunConfigurationFactory(configuration: LambdaRunConfiguration) : ConfigurationFactory(configuration) {
    override fun createTemplateConfiguration(project: Project): RunConfiguration =
        LambdaRemoteRunConfiguration(project, this)

    override fun getName(): String = "Remote"
}

class LambdaRemoteRunConfiguration(project: Project, factory: ConfigurationFactory) :
    LambdaRunConfigurationBase<LambdaRemoteRunConfiguration.MutableRemoteLambdaSettings>(project, factory, "Remote") {

    override var settings = MutableRemoteLambdaSettings()

    override fun getConfigurationEditor() = RemoteLambdaRunSettingsEditor(project)

    override fun checkConfiguration() {
        settings.validateAndCreateImmutable()
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): RunProfileState = RemoteLambdaState(
        environment,
        settings.validateAndCreateImmutable()
    )

    override fun suggestedName() = "[${message("lambda.run_configuration.remote")}] ${settings.functionName}"

    fun configure(
        credentialProviderId: String?,
        regionId: String?,
        functionName: String?,
        input: String? = null,
        inputIsFile: Boolean = false
    ) {
        settings.credentialProviderId = credentialProviderId
        settings.regionId = regionId
        settings.functionName = functionName
        settings.input = input
        settings.inputIsFile = inputIsFile
    }

    @TestOnly
    fun getInternalSettings() = settings

    class MutableRemoteLambdaSettings(
        var credentialProviderId: String? = null,
        var regionId: String? = null,
        var functionName: String? = null,
        input: String? = null,
        inputIsFile: Boolean = false
    ) : MutableLambdaRunSettings(input, inputIsFile) {
        fun validateAndCreateImmutable(): LambdaRemoteRunSettings {
            val credProviderId = credentialProviderId
                    ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_credentials_specified"))

            val credentialProvider = try {
                CredentialManager.getInstance().getCredentialProvider(credProviderId)
            } catch (e: CredentialProviderNotFound) {
                throw RuntimeConfigurationError(
                    message(
                        "lambda.run_configuration.credential_not_found_error",
                        credProviderId
                    )
                )
            } catch (e: Exception) {
                throw RuntimeConfigurationError(
                    message(
                        "lambda.run_configuration.credential_error",
                        e.message ?: "Unknown"
                    )
                )
            }

            val regionId =
                regionId ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_region_specified"))
            val region = AwsRegionProvider.getInstance().regions()[regionId] ?: throw RuntimeConfigurationError(
                message(
                    "lambda.run_configuration.unknown_region",
                    regionId
                )
            )
            val functionName = functionName
                    ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_function_specified"))

            val inputText = resolveInputText(input, inputIsFile)

            return LambdaRemoteRunSettings(credentialProvider, region, functionName, inputText)
        }
    }

    class LambdaRemoteRunSettings(
        val credentialProvider: ToolkitCredentialsProvider,
        val region: AwsRegion,
        val functionName: String,
        val input: String
    )
}

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
                LOG.warn("Failed to load functions", e)
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
        val settings = configuration.settings

        settings.credentialProviderId?.let {
            try {
                view.credentialSelector.setSelectedCredentialsProvider(credentialManager.getCredentialProvider(it))
            } catch (e: CredentialProviderNotFound) {
                // Use the raw string here to not munge what the customer had, will also allow it to show the error
                // that it could not be found
                view.credentialSelector.setSelectedInvalidCredentialsProvider(it)
            }
        }
        view.regionSelector.selectedRegion = regionProvider.regions()[settings.regionId]
        view.functionNames.selectedItem = settings.functionName

        view.lambdaInput.isUsingFile = settings.inputIsFile
        if (settings.inputIsFile) {
            view.lambdaInput.inputFile = settings.input
        } else {
            view.lambdaInput.inputText = settings.input
        }
    }

    override fun applyEditorTo(configuration: LambdaRemoteRunConfiguration) {
        val settings = configuration.settings

        settings.credentialProviderId = view.credentialSelector.getSelectedCredentialsProvider()
        settings.regionId = view.regionSelector.selectedRegion?.id
        settings.functionName = view.functionName
        settings.inputIsFile = view.lambdaInput.isUsingFile
        settings.input = if (view.lambdaInput.isUsingFile) {
            view.lambdaInput.inputFile
        } else {
            view.lambdaInput.inputText
        }
    }

    private companion object {
        val LOG = Logger.getInstance(RemoteLambdaRunSettingsEditor::class.java)
    }
}