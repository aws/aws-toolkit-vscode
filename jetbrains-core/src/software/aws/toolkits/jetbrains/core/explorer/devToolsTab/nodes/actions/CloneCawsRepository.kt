// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import com.intellij.util.ui.cloneDialog.VcsCloneDialog
import software.aws.toolkits.jetbrains.core.credentials.sono.lazilyGetUserId
import software.aws.toolkits.jetbrains.services.caws.CawsCloneDialogExtension
import software.aws.toolkits.telemetry.CodecatalystTelemetry
import software.aws.toolkits.telemetry.Result as TelemetryResult

class CloneCawsRepository : DumbAwareAction(AllIcons.Vcs.Clone) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(CommonDataKeys.PROJECT)
        // TODO: can we simplify further and reuse all the logic from the real action somehow?
        val cloneDialog = VcsCloneDialog.Builder(project).forExtension(CawsCloneDialogExtension::class.java)
        if (cloneDialog.showAndGet()) {
            cloneDialog.doClone(ProjectLevelVcsManager.getInstance(project).compositeCheckoutListener)
        } else {
            CodecatalystTelemetry.localClone(project = null, userId = lazilyGetUserId(), result = TelemetryResult.Cancelled)
        }
    }
}
