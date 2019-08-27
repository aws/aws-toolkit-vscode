// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.ide.util.projectWizard.AbstractNewProjectStep
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.impl.SdkConfigurationUtil
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.io.FileUtil
import com.intellij.ui.DocumentAdapter
import com.intellij.util.ui.UIUtil
import com.jetbrains.python.newProject.PyNewProjectSettings
import com.jetbrains.python.newProject.PythonProjectGenerator
import com.jetbrains.python.newProject.steps.ProjectSpecificSettingsStep
import com.jetbrains.python.newProject.steps.PyAddExistingSdkPanel
import com.jetbrains.python.newProject.steps.PyAddNewEnvironmentPanel
import com.jetbrains.python.sdk.add.PyAddSdkGroupPanel
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.lambda.SdkBasedSdkSettings
import software.aws.toolkits.jetbrains.services.lambda.SdkSettings
import software.aws.toolkits.resources.message
import java.io.File
import javax.swing.Icon
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

class PyCharmSdkSelectionPanel(val step: SamProjectRuntimeSelectionStep) : SdkSelectionPanelBase() {
    private var documentListener: DocumentListener? = null

    override val sdkSelectionPanel: PyAddSdkGroupPanel by lazy { newSdkPanel() }

    override val sdkSelectionLabel: JLabel? = null

    private fun newSdkPanel(): PyAddSdkGroupPanel =
    // construct a py-specific settings step and grab its sdk panel instance
        object : ProjectSpecificSettingsStep<PyNewProjectSettings>(object : PythonProjectGenerator<PyNewProjectSettings>() {
            override fun getLogo(): Icon? = AwsIcons.Logos.AWS

            override fun getName(): String = message("sam.init.name")
        }, AbstractNewProjectStep.AbstractCallback<PyNewProjectSettings>()) {
            // shim validation back to the user UI...
            override fun setErrorText(text: String?) {
                step.setErrorText(text)
            }

            override fun createPanel(): JPanel {
                val panel = super.createPanel()
                // patch the default create button that gets generated
                myCreateButton.isVisible = false
                // we only want this panel for its' sdk selector
                myLocationField.isEnabled = false
                // hide label and textbox
                myLocationField.parent.isVisible = false
                val myInterpreterPanel = UIUtil.findComponentOfType(panel, PyAddSdkGroupPanel::class.java)

                return myInterpreterPanel
                    ?: throw RuntimeException("Could not find PyAddSdkGroupPanel in UI Tree")
            }
        }.createPanel() as PyAddSdkGroupPanel

    override fun registerListeners() {
        val document = step.getLocationField().textField.document
        // cleanup because generators are re-used
        if (documentListener != null) {
            document.removeDocumentListener(documentListener)
        }

        documentListener = object : DocumentAdapter() {
            val locationField = step.getLocationField()
            override fun textChanged(e: DocumentEvent) {
                sdkSelectionPanel.newProjectPath = locationField.text.trim()
            }
        }

        document.addDocumentListener(documentListener)

        sdkSelectionPanel.addChangeListener(Runnable {
            step.checkValid()
        })

        sdkSelectionPanel.newProjectPath = step.getLocationField().text.trim()
    }

    override fun getSdkSettings(): SdkSettings =
        getSdk()?.let {
            SdkBasedSdkSettings(sdk = it)
        } ?: throw RuntimeException(message("sam.init.python.bad_sdk"))

    private fun getSdk(): Sdk? =
        when (val panel = sdkSelectionPanel.selectedPanel) {
            // this list should be exhaustive
            is PyAddNewEnvironmentPanel -> {
                FileUtil.createDirectory(File(step.getLocationField().text.trim()))
                panel.getOrCreateSdk()?.also {
                    SdkConfigurationUtil.addSdk(it)
                }
            }
            is PyAddExistingSdkPanel -> panel.sdk
            else -> null
        }

    override fun validateAll(): List<ValidationInfo>? = sdkSelectionPanel.validateAll()
}