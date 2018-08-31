// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import com.intellij.icons.AllIcons
import com.intellij.idea.ActionsBundle
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.psi.NavigatablePsiElement
import com.intellij.util.OpenSourceUtil
import software.aws.toolkits.jetbrains.core.explorer.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode

class GoToHandlerAction : SingleResourceNodeAction<LambdaFunctionNode>() {
    override fun update(selected: LambdaFunctionNode, e: AnActionEvent) {
        super.update(selected, e)

        val presentation = e.presentation
        presentation.icon = AllIcons.Actions.EditSource
        presentation.text = ActionsBundle.actionText("EditSource")
        presentation.description = ActionsBundle.actionText("EditSource")
        presentation.isEnabled = getHandler(selected)?.isNotEmpty() ?: false
        presentation.isVisible = true
    }

    override fun actionPerformed(selected: LambdaFunctionNode, e: AnActionEvent) {
        getHandler(selected)?.let {
            OpenSourceUtil.navigate(true, *it)
        }
    }

    private fun getHandler(node: LambdaFunctionNode): Array<NavigatablePsiElement>? {
        return node.handlerPsi()
    }
}