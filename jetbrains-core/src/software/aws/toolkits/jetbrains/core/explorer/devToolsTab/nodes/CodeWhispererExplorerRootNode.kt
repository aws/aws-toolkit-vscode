// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes

import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.codewhisperer.CodeWhispererClient
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererServiceNode
import software.aws.toolkits.resources.message

class CodeWhispererExplorerRootNode : DevToolsServiceNode {
    override val serviceId = CodeWhispererClient.SERVICE_NAME
    override fun buildServiceRootNode(nodeProject: Project) = CodeWhispererServiceNode(nodeProject, NODE_NAME)

    companion object {
        val NODE_NAME = message("explorer.node.codewhisperer")
    }
}
