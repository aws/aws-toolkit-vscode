// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.ui.cloneDialog.VcsCloneDialogExtension
import com.intellij.openapi.vcs.ui.cloneDialog.VcsCloneDialogExtensionComponent
import icons.AwsIcons
import software.aws.toolkits.resources.message
import javax.swing.Icon

class CawsCloneDialogExtension : VcsCloneDialogExtension {
    override fun createMainComponent(project: Project): VcsCloneDialogExtensionComponent {
        throw RuntimeException("Should never be called")
    }

    override fun createMainComponent(project: Project, modalityState: ModalityState): VcsCloneDialogExtensionComponent =
        CawsCloneDialogComponent(project, modalityState)

    override fun getIcon(): Icon = AwsIcons.Logos.CODE_CATALYST_MEDIUM

    override fun getName(): String = message("caws.title")
}
