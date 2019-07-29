// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import javax.swing.JPanel
import kotlin.streams.toList

class RemoteLambdaRunSettingsEditor(project: Project) : SettingsEditor<RemoteLambdaRunConfiguration>() {
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

    override fun resetEditorFrom(configuration: RemoteLambdaRunConfiguration) {
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

    override fun applyEditorTo(configuration: RemoteLambdaRunConfiguration) {
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