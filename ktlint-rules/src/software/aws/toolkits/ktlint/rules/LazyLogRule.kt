// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.Rule
import org.jetbrains.kotlin.com.intellij.lang.ASTNode
import org.jetbrains.kotlin.name.Name
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.psiUtil.getCallNameExpression
import org.jetbrains.kotlin.psi.psiUtil.getReceiverExpression
import org.jetbrains.kotlin.psi.psiUtil.referenceExpression

class LazyLogRule : Rule("log-not-lazy") {
    private val logMethods = setOf("error", "warn", "info", "debug", "trace")
    private val logNames = setOf("log", "logger")

    // TODO updating Ktlint will allow us to disable rules based on editorconfig, but the update is
    // non trivial. So, disabled based on package name for now. Remove when ktlint is upgraded
    private val optOut = setOf("software.aws.toolkits.jetbrains.uitests")

    override fun visit(
        node: ASTNode,
        autoCorrect: Boolean,
        emit: (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> Unit
    ) {
        val element = node.psi ?: return
        when (element) {
            is KtCallExpression -> {
                element.getCallNameExpression()?.let {
                    if (!logMethods.contains(it.text)) {
                        return
                    }

                    // TODO remove when ktlint is upgraded
                    if (optOut.any { name -> element.containingKtFile.packageFqName.startsWith(Name.identifier(name)) }) {
                        return
                    }

                    val referenceExpression = it.getReceiverExpression()?.referenceExpression() ?: return

                    if (!logNames.contains(referenceExpression.text.toLowerCase())) {
                        return
                    }

                    if (element.lambdaArguments.size != 1) {
                        emit(
                            element.textOffset,
                            "Use the Lambda version of ${referenceExpression.text}.${it.text} instead",
                            false
                        )
                    }
                }
            }
        }
    }
}
