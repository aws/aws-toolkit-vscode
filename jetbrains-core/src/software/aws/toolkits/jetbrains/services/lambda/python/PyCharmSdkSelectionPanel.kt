// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.impl.SdkConfigurationUtil
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.DocumentAdapter
import com.jetbrains.python.configuration.PyConfigurableInterpreterList
import com.jetbrains.python.newProject.steps.PyAddExistingSdkPanel
import com.jetbrains.python.newProject.steps.PyAddNewEnvironmentPanel
import com.jetbrains.python.sdk.PreferredSdkComparator
import com.jetbrains.python.sdk.PySdkSettings
import com.jetbrains.python.sdk.PythonSdkType
import com.jetbrains.python.sdk.PythonSdkUtil
import com.jetbrains.python.sdk.add.PyAddSdkGroupPanel
import software.aws.toolkits.jetbrains.services.lambda.wizard.SdkSelector
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.event.DocumentEvent

class PyCharmSdkSelectionPanel(private val projectLocation: TextFieldWithBrowseButton?) : SdkSelector {
    private val sdkPanel by lazy {
        sdkPanel()
    }

    override fun sdkSelectionPanel(): JComponent = sdkPanel

    override fun sdkSelectionLabel(): JLabel? = null

    private fun sdkPanel(): PyAddSdkGroupPanel {
        // Based on PyCharm's ProjectSpecificSettingsStep
        val existingSdks = getValidPythonSdks()
        val newProjectLocation = getProjectLocation()
        val newEnvironmentPanel = PyAddNewEnvironmentPanel(existingSdks, newProjectLocation, null)
        val existingSdkPanel = PyAddExistingSdkPanel(null, null, existingSdks, newProjectLocation, existingSdks.firstOrNull())

        val defaultPanel = if (PySdkSettings.instance.useNewEnvironmentForNewProject) newEnvironmentPanel else existingSdkPanel

        val interpreterPanel = createPythonSdkPanel(listOf(newEnvironmentPanel, existingSdkPanel), defaultPanel)

        projectLocation?.textField?.document?.addDocumentListener(
            object : DocumentAdapter() {
                override fun textChanged(e: DocumentEvent) {
                    interpreterPanel.newProjectPath = getProjectLocation()
                }
            }
        )

        return interpreterPanel
    }

    private fun getProjectLocation(): String? = projectLocation?.text?.trim()

    private fun getValidPythonSdks(): List<Sdk> = PyConfigurableInterpreterList.getInstance(null).allPythonSdks
        .asSequence()
        .filter { it.sdkType is PythonSdkType && !PythonSdkUtil.isInvalid(it) }
        .sortedWith(PreferredSdkComparator())
        .toList()

    override fun getSdk(): Sdk? {
        val sdk = sdkPanel.getOrCreateSdk() ?: return null
        if (sdkPanel.selectedPanel is PyAddNewEnvironmentPanel) {
            SdkConfigurationUtil.addSdk(sdk)
        }
        return sdk
    }

    override fun validateSelection(): ValidationInfo? = sdkPanel.validateAll().firstOrNull()
}
