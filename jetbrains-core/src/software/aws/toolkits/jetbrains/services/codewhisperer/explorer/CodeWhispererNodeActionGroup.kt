// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.explorer

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.actions.SsoLogoutAction
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.utils.buildList
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererShowSettingsAction
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.ActionProvider
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.Customize
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.Learn
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.OpenCodeReference
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.Pause
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.Resume
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.actions.buildActionList

class CodeWhispererNodeActionGroup : DefaultActionGroup() {
    private val actionProvider = object : ActionProvider<AnAction> {
        override val pause = Pause()
        override val resume = Resume()
        override val openCodeReference = OpenCodeReference()
        override val customize = Customize()
        override val learn = Learn()
    }

    override fun getChildren(e: AnActionEvent?) = e?.project?.let {
        buildList {
            addAll(buildActionList(it, actionProvider))

            add(Separator.create())

            add(CodeWhispererShowSettingsAction())

            ToolkitConnectionManager.getInstance(it).activeConnectionForFeature(CodeWhispererConnection.getInstance())?.let { c ->
                (c as? AwsBearerTokenConnection)?.let { connection ->
                    add(SsoLogoutAction(connection))
                }
            }
        }.toTypedArray()
    }.orEmpty()
}
