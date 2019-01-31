// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.ide.util.projectWizard.AbstractNewProjectStep
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.projectRoots.impl.SdkConfigurationUtil
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.DocumentAdapter
import com.intellij.util.ui.UIUtil
import com.jetbrains.python.newProject.PyNewProjectSettings
import com.jetbrains.python.newProject.PythonProjectGenerator
import com.jetbrains.python.newProject.steps.ProjectSpecificSettingsStep
import com.jetbrains.python.newProject.steps.PyAddExistingSdkPanel
import com.jetbrains.python.newProject.steps.PyAddNewEnvironmentPanel
import com.jetbrains.python.sdk.add.PyAddSdkGroupPanel
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.lambda.python.PythonRuntimeGroup
import software.aws.toolkits.resources.message
import javax.swing.Icon
import javax.swing.JPanel
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

class PyCharmSdkSelectionPanel(callback: AbstractNewProjectStep.AbstractCallback<SamNewProjectSettings>, generator: SamProjectGenerator) : SdkSelectionPanelBase(callback, generator) {
    private var documentListener: DocumentListener? = null
    override lateinit var sdkSelectionPanel: PyAddSdkGroupPanel

    private fun newSdkPanel(): PyAddSdkGroupPanel =
    // construct a py-specific settings step and grab its sdk panel instance
        object : ProjectSpecificSettingsStep<PyNewProjectSettings>(object : PythonProjectGenerator<PyNewProjectSettings>() {
            override fun getLogo(): Icon? = AwsIcons.Logos.AWS

            override fun getName(): String = message("sam.init.name")
        }, callback) {
            // shim validation back to the user UI...
            override fun setErrorText(text: String?) {
                generator.step.setErrorText(text)
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
        val document = generator.step.getLocationField().textField.document
        // cleanup because generators are re-used
        if (documentListener != null) {
            document.removeDocumentListener(documentListener)
        }

        documentListener = object : DocumentAdapter() {
            val locationField = generator.step.getLocationField()
            override fun textChanged(e: DocumentEvent) {
                sdkSelectionPanel.newProjectPath = locationField.text.trim()
            }
        }

        document.addDocumentListener(documentListener)

        sdkSelectionPanel.addChangeListener(Runnable {
            generator.step.checkValid()
        })
    }

    override fun transformUI(panel: SamInitSelectionPanel) {
        super.transformUI(panel)
        // remove runtime panel
        panel.hideRuntime()
        // to save space, don't label the sdk selector
        sdkSelectionPanel = newSdkPanel()
        panel.addSdkPanel(null, sdkSelectionPanel)
    }

    override fun getSdk(): Sdk? {
        val panel = sdkSelectionPanel.selectedPanel
        return when (panel) {
            // this list should be exhaustive
            is PyAddNewEnvironmentPanel -> {
                val sdk = panel.getOrCreateSdk()?.let {
                    SdkConfigurationUtil.addSdk(it)
                    it
                }
                generator.settings.runtime = PythonRuntimeGroup.determineRuntimeForSdk(sdk
                    ?: throw RuntimeException(message("sam.init.python.bad_sdk"))
                ) ?: throw RuntimeException("Could not determine runtime for SDK")
                return sdk
            }
            is PyAddExistingSdkPanel -> panel.sdk
            else -> null
        }
    }

    override fun validateAll(): List<ValidationInfo>? = sdkSelectionPanel.validateAll()
}