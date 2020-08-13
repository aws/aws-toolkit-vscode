// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.ide.util.projectWizard.SdkSettingsStep
import com.intellij.ide.util.projectWizard.WizardContext
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.SdkTypeId
import com.intellij.openapi.ui.ValidationInfo
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedSdkSettings
import software.aws.toolkits.jetbrains.services.lambda.SdkSettings
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.JLabel

class IntelliJSdkSelectionPanel(private val builder: SamProjectBuilder, private val runtimeGroupId: String) : SdkSelectionPanelBase() {
    private var currentSdk: Sdk? = null
    private val dummyContext = object : WizardContext(null, {}) {
        override fun setProjectJdk(sdk: Sdk?) {
            currentSdk = sdk
        }
    }
    private val currentSdkPanel: SdkSettingsStep = buildSdkSettingsPanel()

    override val sdkSelectionPanel: JComponent = currentSdkPanel.component

    override val sdkSelectionLabel: JLabel? = JLabel(message("sam.init.project_sdk.label"))

    override fun validateAll(): List<ValidationInfo>? {
        if (!currentSdkPanel.validate()) {
            throw ValidationException()
        }
        // okay to return null here since any ConfigurationError in the validate() call will propagate up to the ModuleWizardStep
        // validation checker and do-the-right-thing for us
        return null
    }

    override fun getSdkSettings(): SdkSettings {
        currentSdkPanel.updateDataModel()

        // TODO: This should probably be EP based
        return when (runtimeGroupId) {
            BuiltInRuntimeGroups.Java, BuiltInRuntimeGroups.Python -> SdkBasedSdkSettings(sdk = currentSdk)
            BuiltInRuntimeGroups.Dotnet -> object : SdkSettings {}
            else -> throw RuntimeException("Unrecognized runtime group ID: $runtimeGroupId")
        }
    }

    // don't validate on init of the SettingsStep or weird things will happen if the user has no SDK
    private fun buildSdkSettingsPanel(): SdkSettingsStep =
        SdkSettingsStep(
            dummyContext,
            builder,
            { t: SdkTypeId? -> t == RuntimeGroup.getById(runtimeGroupId).getIdeSdkType() },
            null
        )
}
