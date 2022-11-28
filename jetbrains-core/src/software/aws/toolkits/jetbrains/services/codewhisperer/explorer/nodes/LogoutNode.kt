// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer.nodes

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project

class LogoutNode(nodeProject: Project) : CodeWhispererActionNode(
    nodeProject,
    "logout",
    "logout",
    10,
    AllIcons.CodeWithMe.CwmAccessOff
)
