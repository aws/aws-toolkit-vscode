// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.ide.util.projectWizard.AbstractNewProjectStep
import com.intellij.ide.util.projectWizard.SdkSettingsStep
import com.intellij.ide.util.projectWizard.WizardContext
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.SdkTypeId
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.Condition
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.resources.message
import java.awt.event.ItemEvent
import javax.swing.JComponent
import javax.swing.JLabel

class IntelliJSdkSelectionPanel(callback: AbstractNewProjectStep.AbstractCallback<SamNewProjectSettings>, generator: SamProjectGenerator) : SdkSelectionPanelBase(callback, generator) {
    private var currentSdk: Sdk? = null
    private val dummyContext = object : WizardContext(null, {}) {
        override fun setProjectJdk(sdk: Sdk?) {
            currentSdk = sdk
        }
    }

    fun sdkPanelFilter(runtime: Runtime): Condition<SdkTypeId> = Condition { sdkTypeId ->
        // runtime group cannot be null since we populated the list of runtimes from the list of supported runtime groups
        val runtimeGroup = runtime.runtimeGroup
        sdkTypeId == runtimeGroup?.getIdeSdkType()
    }

    private fun buildSdkSettingsPanel(runtime: Runtime): SdkSettingsStep =
        object : SdkSettingsStep(dummyContext, generator.builder, sdkPanelFilter(runtime), null) {}.also {
            it.validate()
        }

    private var currentSdkPanel: SdkSettingsStep = buildSdkSettingsPanel(generator.settings.runtime)
    override val sdkSelectionPanel: JComponent
        get() = currentSdkPanel.component

    override fun transformUI(panel: SamInitSelectionPanel) {
        super.transformUI(panel)

        val sdkLabel = JLabel(message("sam.init.project_sdk.label"))

        panel.addSdkPanel(sdkLabel, sdkSelectionPanel)

        panel.runtime.addItemListener {
            if (it.stateChange == ItemEvent.SELECTED) {
                currentSdkPanel = buildSdkSettingsPanel(it.item as Runtime)
                panel.addSdkPanel(sdkLabel, sdkSelectionPanel)
            }
        }
    }

    override fun validateAll(): List<ValidationInfo>? {
        currentSdkPanel.validate()
        return null
    }

    override fun getSdk(): Sdk? {
        currentSdkPanel.updateDataModel()
        return currentSdk
    }
}