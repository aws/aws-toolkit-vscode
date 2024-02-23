// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.ide.projectView.PresentationData
import com.intellij.openapi.project.Project
import com.intellij.ui.SimpleTextAttributes
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent

class CustomizationNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    message("codewhisperer.explorer.customization.select"),
    2,
    AwsIcons.Resources.CodeWhisperer.CUSTOM
) {
    override fun update(presentation: PresentationData) {
        super.update(presentation)

        val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
        val activeCustomization = CodeWhispererModelConfigurator.getInstance().activeCustomization(project)

        if (connection != null) {
            val newCount = CodeWhispererModelConfigurator.getInstance().getNewUpdate(connection.id)?.count { it.isNew } ?: 0

            if (newCount > 0) {
                presentation.addText(" ($newCount new)", SimpleTextAttributes.GRAYED_ATTRIBUTES)
            } else if (activeCustomization != null) {
                presentation.addText(" ${activeCustomization.name}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
            }
        }
    }

    override fun onDoubleClick(event: MouseEvent) {
        CodeWhispererModelConfigurator.getInstance().showConfigDialog(project)
    }
}
