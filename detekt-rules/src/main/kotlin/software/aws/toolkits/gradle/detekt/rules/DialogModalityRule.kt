// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.detekt.rules

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtNameReferenceExpression
import org.jetbrains.kotlin.psi.psiUtil.containingClass
import org.jetbrains.kotlin.psi.psiUtil.getSuperNames

class DialogModalityRule : Rule() {
    override val issue = Issue("RunInEdtWithoutModalityInDialog", Severity.Defect, "Use ModalityState when calling runInEdt in dialogs", Debt.FIVE_MINS)

    override fun visitCallExpression(element: KtCallExpression) {
        super.visitCallExpression(element)
        val callee = element.calleeExpression as? KtNameReferenceExpression ?: return
        if (callee.getReferencedName() != "runInEdt") return
        val clz = element.containingClass() ?: return
        if (clz.getSuperNames().none { it in KNOWN_DIALOG_SUPER_TYPES }) return

        if (element.valueArguments.none { it.text == "ModalityState.any()" }) {
            report(
                CodeSmell(
                    issue,
                    Entity.from(element),
                    message = "Call to runInEdt without ModalityState.any() within Dialog will not run until Dialog exits."
                )
            )
        }
    }

    companion object {
        private val KNOWN_DIALOG_SUPER_TYPES = setOf("DialogWrapper")
    }
}
