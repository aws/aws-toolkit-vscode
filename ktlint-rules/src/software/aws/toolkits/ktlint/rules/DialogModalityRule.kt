// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.Rule
import org.jetbrains.kotlin.com.intellij.lang.ASTNode
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtNameReferenceExpression
import org.jetbrains.kotlin.psi.psiUtil.containingClass
import org.jetbrains.kotlin.psi.psiUtil.getSuperNames

class DialogModalityRule : Rule("run-in-edt-wo-modality-in-dialog") {
    override fun visit(node: ASTNode, autoCorrect: Boolean, emit: (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> Unit) {
        val element = node.psi ?: return

        when (element) {
            is KtCallExpression -> {
                val callee = element.calleeExpression as? KtNameReferenceExpression ?: return
                if (callee.getReferencedName() != "runInEdt") return
                val clz = element.containingClass() ?: return
                if (clz.getSuperNames().none { it in KNOWN_DIALOG_SUPER_TYPES }) return

                if (element.valueArguments.none { it.text == "ModalityState.any()" }) {
                    emit(node.startOffset, "Call to runInEdt without ModalityState.any() within Dialog will not run until Dialog exits.", false)
                }
            }
        }
    }

    companion object {
        private val KNOWN_DIALOG_SUPER_TYPES = setOf("DialogWrapper")
    }
}
