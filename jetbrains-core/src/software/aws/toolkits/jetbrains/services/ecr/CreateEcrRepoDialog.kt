// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.EcrTelemetry
import software.aws.toolkits.telemetry.Result
import java.awt.Component
import javax.swing.JComponent

class CreateEcrRepoDialog(
    private val project: Project,
    private val ecrClient: EcrClient,
    parent: Component? = null
) : DialogWrapper(project, parent, false, IdeModalityType.IDE) {
    var repoName: String = ""

    private val panel = panel {
        row(message("general.name.label")) {
            textField()
                .focused()
                .validationOnApply {
                    if (it.text.isBlank()) {
                        error(message("ecr.create.repo.validation.empty"))
                    } else {
                        null
                    }
                }
                .bindText(::repoName)
        }
    }

    init {
        title = message("ecr.create.repo.title")
        setOKButtonText(message("general.create_button"))

        init()
    }

    override fun createCenterPanel(): JComponent = panel

    override fun doCancelAction() {
        EcrTelemetry.createRepository(project, Result.Cancelled)
        super.doCancelAction()
    }

    override fun continuousValidation() = false

    override fun doValidateAll(): List<ValidationInfo> =
        panel.validateCallbacks.mapNotNull { it() }

    override fun doOKAction() {
        val validation = doValidateAll()
        if (!validation.isEmpty()) {
            setErrorInfoAll(validation)
            return
        }
        panel.apply()

        if (okAction.isEnabled) {
            setOKButtonText(message("general.create_in_progress"))
            isOKActionEnabled = false

            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    createRepo()
                    ApplicationManager.getApplication().invokeLater(
                        {
                            close(OK_EXIT_CODE)
                        },
                        ModalityState.stateForComponent(rootPane)
                    )
                    project.refreshAwsTree(EcrResources.LIST_REPOS)
                    EcrTelemetry.createRepository(project, Result.Succeeded)
                } catch (e: Exception) {
                    ApplicationManager.getApplication().invokeLater(
                        {
                            setErrorText(e.message, panel)
                            setOKButtonText(message("general.create_button"))
                            isOKActionEnabled = true
                        },
                        ModalityState.stateForComponent(rootPane)
                    )
                    EcrTelemetry.createRepository(project, Result.Failed)
                }
            }
        }
    }

    fun createRepo() {
        ecrClient.createRepository { it.repositoryName(repoName.trim()) }
    }

    @TestOnly
    fun validateForTest(): List<ValidationInfo> {
        panel.reset()
        return doValidateAll()
    }
}
