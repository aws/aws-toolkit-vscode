// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.ecr.EcrClient
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.utils.ui.validationInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.EcrTelemetry
import software.aws.toolkits.telemetry.Result
import java.awt.Component
import javax.swing.JComponent

class CreateEcrRepoDialog(
    private val project: Project,
    private val ecrClient: EcrClient,
    parent: Component? = null,
    initialRepoPolicy: String = ""
) : DialogWrapper(project, parent, false, IdeModalityType.PROJECT) {
    private val view = CreateRepoPanel(project, initialRepoPolicy)

    var repoName
        get() = view.repoName.text.trim()
        @TestOnly
        set(value) {
            view.repoName.text = value
        }

    var repoPolicy
        get() = view.policy.text.trim()
        @TestOnly
        set(value) {
            view.policy.text = value
        }

    init {
        title = message("ecr.create.repo.title")
        setOKButtonText(message("general.create_button"))

        repoPolicy = initialRepoPolicy

        init()
    }

    override fun createCenterPanel(): JComponent? = view.component

    override fun getPreferredFocusedComponent(): JComponent? = view.repoName

    override fun doValidate(): ValidationInfo? = if (repoName.isBlank()) view.repoName.validationInfo(message("ecr.create.repo.validation.empty")) else null

    override fun doCancelAction() {
        EcrTelemetry.createRepository(project, Result.Cancelled)
        super.doCancelAction()
    }

    override fun doOKAction() {
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
                        ModalityState.stateForComponent(view.repoName)
                    )
                    project.refreshAwsTree(EcrResources.LIST_REPOS)
                    EcrTelemetry.createRepository(project, Result.Succeeded)
                } catch (e: Exception) {
                    setErrorText(e.message)
                    setOKButtonText(message("general.create_button"))
                    isOKActionEnabled = true
                    EcrTelemetry.createRepository(project, Result.Failed)
                }
            }
        }
    }

    fun createRepo() {
        ecrClient.createRepository { it.repositoryName(repoName) }
        repoPolicy.takeIf { it.isNotEmpty() }?.let {
            ecrClient.setRepositoryPolicy {
                it.repositoryName(repoName)
                it.policyText(repoPolicy)
            }
        }
    }

    @TestOnly
    fun validateForTest(): ValidationInfo? = doValidate()
}
