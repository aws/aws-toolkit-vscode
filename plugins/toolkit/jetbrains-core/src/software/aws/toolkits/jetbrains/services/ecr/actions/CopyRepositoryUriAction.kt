// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecr.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.ecr.EcrRepositoryNode
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.EcrTelemetry
import java.awt.datatransfer.StringSelection

class CopyRepositoryUriAction : SingleResourceNodeAction<EcrRepositoryNode>(message("ecr.copy_uri.action")), DumbAware {
    override fun actionPerformed(selected: EcrRepositoryNode, e: AnActionEvent) {
        val copyPasteManager = CopyPasteManager.getInstance()
        copyPasteManager.setContents(StringSelection(selected.repository.repositoryUri))
        EcrTelemetry.copyRepositoryUri(selected.nodeProject)
    }
}
