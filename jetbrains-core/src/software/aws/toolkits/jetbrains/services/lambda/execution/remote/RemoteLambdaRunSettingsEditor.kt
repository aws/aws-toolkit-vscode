// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.map
import software.aws.toolkits.jetbrains.services.lambda.resources.LambdaResources
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import java.util.concurrent.atomic.AtomicReference
import javax.swing.JPanel

class RemoteLambdaRunSettingsEditor(project: Project) : SettingsEditor<RemoteLambdaRunConfiguration>() {
    private val settings = AtomicReference<Pair<AwsRegion, ToolkitCredentialsProvider>>()
    private val functionSelector = ResourceSelector
        .builder(project)
        .resource(LambdaResources.LIST_FUNCTIONS.map { it.functionName() })
        .disableAutomaticLoading()
        .awsConnection { settings.get() ?: throw IllegalStateException("functionSelector.reload() called before region/credentials set") }
        .build()
    private val view = RemoteLambdaRunSettingsEditorPanel(project, functionSelector)
    private val credentialManager = CredentialManager.getInstance()

    internal fun updateFunctions(region: AwsRegion?, credentialProviderId: String?) {
        region ?: return
        credentialProviderId ?: return

        val credentialIdentifier = credentialManager.getCredentialIdentifierById(credentialProviderId) ?: return
        val credentialProvider = tryOrNull { credentialManager.getAwsCredentialProvider(credentialIdentifier, region) } ?: return

        val oldSettings = settings.getAndUpdate { region to credentialProvider }
        if (oldSettings?.first == region && oldSettings.second == credentialProvider) return
        functionSelector.reload()
    }

    override fun createEditor(): JPanel = view.panel

    override fun resetEditorFrom(configuration: RemoteLambdaRunConfiguration) {
        view.functionNames.selectedItem = configuration.functionName()
        if (configuration.isUsingInputFile()) {
            view.lambdaInput.inputFile = configuration.inputSource()
        } else {
            view.lambdaInput.inputText = configuration.inputSource()
        }
    }

    override fun applyEditorTo(configuration: RemoteLambdaRunConfiguration) {
        configuration.functionName(view.functionNames.selected())
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
