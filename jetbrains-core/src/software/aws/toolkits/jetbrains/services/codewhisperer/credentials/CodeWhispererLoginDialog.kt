// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.credentials

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.ConnectionDialogCustomizer
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAddConnectionDialog
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.resources.message

// TODO: doesn't need to be a class, but need to minimize file deltas
class CodeWhispererLoginDialog(project: Project) : ToolkitAddConnectionDialog(
    project,
    customizer = ConnectionDialogCustomizer(
        title = message("codewhisperer.credential.login.dialog.title"),
        header = message("codewhisperer.credential.login.dialog.prompt"),
        helpId = HelpIds.CODEWHISPERER_LOGIN_DIALOG,
        replaceIamComment = message("codewhisperer.credential.login.dialog.iam.description")
    )
)
