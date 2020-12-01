// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.projectRoots.Sdk
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.ErrorLabel
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.layout.panel
import com.intellij.util.ThrowableRunnable
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import javax.swing.JComponent
import javax.swing.JLabel

interface SdkSelector {
    fun sdkSelectionPanel(): JComponent

    fun sdkSelectionLabel(): JLabel?

    fun applySdkSettings(model: ModifiableRootModel) {
        val sdk = getSdk() ?: return
        val project = model.project

        val projectRootManager = ProjectRootManager.getInstance(project)
        WriteAction.runAndWait(
            ThrowableRunnable<Exception> {
                if (projectRootManager.projectSdk == null) {
                    projectRootManager.projectSdk = sdk
                }

                // If requested SDK matches project SDK, inherit it, else only set it for the module
                if (sdk == projectRootManager.projectSdk) {
                    model.inheritSdk()
                } else {
                    model.sdk = sdk
                }
            }
        )
    }

    fun getSdk(): Sdk? = null

    // Validate the SDK selection panel, return a list of violations if any, otherwise null
    fun validateSelection(): ValidationInfo?
}

class SdkSelectionPanel : WizardFragment {
    private var sdkSelector: SdkSelector? = null

    private val component = Wrapper()

    override fun title(): String? = null

    override fun component(): JComponent = component

    override fun validateFragment(): ValidationInfo? = sdkSelector?.validateSelection()

    override fun isApplicable(template: SamProjectTemplate?): Boolean = true

    override fun updateUi(projectLocation: TextFieldWithBrowseButton?, runtimeGroup: RuntimeGroup?, template: SamProjectTemplate?) {
        if (runtimeGroup == null) {
            component.setContent(ErrorLabel("No runtime selected"))
            return
        }

        sdkSelector = SamProjectWizard.getInstance(runtimeGroup).createSdkSelectionPanel(projectLocation).also {
            component.setContent(
                panel {
                    it?.let {
                        row(it.sdkSelectionLabel()) {
                            it.sdkSelectionPanel()(grow)
                        }
                    }
                }
            )
        }
    }

    override fun postProjectGeneration(model: ModifiableRootModel, template: SamProjectTemplate, runtime: Runtime, progressIndicator: ProgressIndicator) {
        sdkSelector?.let {
            progressIndicator.text = "Setting up SDK"
            ApplicationManager.getApplication().invokeAndWait {
                it.applySdkSettings(model)
            }
        }
    }
}
