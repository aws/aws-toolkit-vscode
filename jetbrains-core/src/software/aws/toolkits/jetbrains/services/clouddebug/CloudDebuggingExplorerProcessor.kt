// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.clouddebug

import com.intellij.icons.AllIcons
import com.intellij.ide.projectView.PresentationData
import com.intellij.ui.RowIcon
import com.intellij.ui.SimpleTextAttributes
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerNodeProcessor
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebugConstants.CLOUD_DEBUG_RESOURCE_PREFIX
import software.aws.toolkits.jetbrains.services.ecs.EcsServiceNode
import software.aws.toolkits.jetbrains.services.ecs.EcsUtils

class CloudDebuggingExplorerProcessor : AwsExplorerNodeProcessor {
    override fun postProcessPresentation(node: AwsExplorerNode<*>, presentation: PresentationData) {
        when (node) {
            is EcsServiceNode ->
                if (EcsUtils.isInstrumented(node.resourceArn())) {
                    presentation.setIcon(RowIcon(presentation.getIcon(true), AllIcons.Actions.StartDebugger))
                } else {
                    // grey out instrumented original resources
                    if (node.parent.children.map { (it as? EcsServiceNode)?.displayName() == "$CLOUD_DEBUG_RESOURCE_PREFIX${node.displayName()}" }.any { it }) {
                        presentation.clearText()
                        presentation.addText(EcsUtils.serviceArnToName(node.resourceArn()), SimpleTextAttributes.GRAYED_ATTRIBUTES)
                    }
                }
        }
    }
}
