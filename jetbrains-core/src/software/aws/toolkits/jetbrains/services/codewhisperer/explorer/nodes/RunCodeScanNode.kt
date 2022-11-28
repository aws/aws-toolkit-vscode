// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.resources.message

class RunCodeScanNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject, message("codewhisperer.codescan.run_scan"),
    CodeWhispererExplorerActionManager.ACTION_RUN_SECURITY_SCAN,
    2,
    CodeWhispererCodeScanManager.getInstance(nodeProject).getActionButtonIcon()
)
