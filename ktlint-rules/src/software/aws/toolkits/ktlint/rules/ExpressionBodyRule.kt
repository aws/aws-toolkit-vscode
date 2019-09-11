// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.Rule
import org.jetbrains.kotlin.com.intellij.lang.ASTNode
import org.jetbrains.kotlin.psi.KtBlockExpression
import org.jetbrains.kotlin.psi.KtNamedFunction
import org.jetbrains.kotlin.psi.KtReturnExpression

class ExpressionBodyRule : Rule("expression-body") {
    override fun visit(node: ASTNode, autoCorrect: Boolean, emit: (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> Unit) {
        val element = node.psi ?: return
        when (element) {
            is KtNamedFunction -> {
                val body = element.bodyExpression as? KtBlockExpression ?: return
                if (body.statements.firstOrNull() is KtReturnExpression) {
                    emit(node.startOffset, "Use expression body instead of one line return", false)
                }
            }
        }
    }
}
