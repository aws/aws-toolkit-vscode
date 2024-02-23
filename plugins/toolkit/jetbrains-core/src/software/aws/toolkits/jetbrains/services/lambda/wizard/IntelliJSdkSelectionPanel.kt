// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.ide.util.projectWizard.EmptyModuleBuilder
import com.intellij.ide.util.projectWizard.SdkSettingsStep
import com.intellij.ide.util.projectWizard.WizardContext
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.ui.ValidationInfo
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.utils.ui.validationInfo
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.JLabel

class IntelliJSdkSelectionPanel(private val runtimeGroupId: String) : SdkSelector {
    private val dummyContext = object : WizardContext(null, {}) {}
    private val currentSdkPanel: SdkSettingsStep = buildSdkSettingsPanel()

    private var currentSdk: Sdk? = null

    override fun sdkSelectionPanel(): JComponent = currentSdkPanel.component

    override fun sdkSelectionLabel(): JLabel? = JLabel(message("sam.init.sdk.label"))

    override fun validateSelection(): ValidationInfo? {
        if (!currentSdkPanel.validate()) {
            return currentSdkPanel.component.validationInfo(message("sam.init.sdk.error"))
        }
        return null
    }

    override fun getSdk(): Sdk? = currentSdk

    // don't validate on init of the SettingsStep or weird things will happen if the user has no SDK
    private fun buildSdkSettingsPanel(): SdkSettingsStep =
        object : SdkSettingsStep(
            dummyContext,
            EmptyModuleBuilder(), // not used
            { it == RuntimeGroup.getById(runtimeGroupId).getIdeSdkType() },
            null
        ) {
            override fun onSdkSelected(sdk: Sdk?) {
                currentSdk = sdk
            }
        }
}
