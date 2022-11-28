// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import software.aws.toolkits.resources.message

class FreeTierUsageLimitHitNode(nodeProject: Project, val date: String) : CodeWhispererActionNode(
    nodeProject,
    message("codewhisperer.explorer.usage_limit_hit", date),
    "",
    -1,
    AllIcons.Actions.Suspend
)
