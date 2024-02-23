// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.icons.AllIcons
import com.intellij.idea.ActionsBundle
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.psi.NavigatablePsiElement
import com.intellij.util.OpenSourceUtil
import software.aws.toolkits.jetbrains.core.explorer.actions.ExplorerNodeAction
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.telemetry.LambdaTelemetry

class GoToHandlerAction : ExplorerNodeAction<LambdaFunctionNode>(ActionsBundle.actionText("EditSource"), description = ActionsBundle.actionText("EditSource")) {
    override fun update(selected: List<LambdaFunctionNode>, e: AnActionEvent) {
        super.update(selected, e)

        val presentation = e.presentation
        presentation.icon = AllIcons.Actions.EditSource
        if (selected.size == 1) {
            presentation.isEnabled = getHandler(selected.first())?.isNotEmpty() ?: false
        } else {
            presentation.isEnabled = false
        }
        presentation.isVisible = true
    }

    override fun actionPerformed(selected: List<LambdaFunctionNode>, e: AnActionEvent) {
        val handlers = getHandler(selected.first())
        if (handlers != null) {
            OpenSourceUtil.navigate(true, *handlers)
            LambdaTelemetry.goToHandler(e.project, true)
        } else {
            LambdaTelemetry.goToHandler(e.project, false)
        }
    }

    private fun getHandler(node: LambdaFunctionNode): Array<NavigatablePsiElement>? = node.handlerPsi()
}
