// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.detekt.rules

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.name.Name
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.psiUtil.getCallNameExpression
import org.jetbrains.kotlin.psi.psiUtil.getReceiverExpression
import org.jetbrains.kotlin.psi.psiUtil.referenceExpression

class LazyLogRule : Rule() {
    override val issue = Issue("LazyLog", Severity.Style, "Use lazy logging synatax (e.g. warning {\"abc\"} ) instead of warning(\"abc\")", Debt.FIVE_MINS)

    private val logMethods = setOf("error", "warn", "info", "debug", "trace")
    private val logNames = setOf("log", "logger")

    // UI tests have issues with this TODO see if we want multiple detekt.yml files or disable for certain modules in this rule
    private val optOut = setOf("software.aws.toolkits.jetbrains.uitests")

    override fun visitCallExpression(element: KtCallExpression) {
        super.visitCallExpression(element)
        element.getCallNameExpression()?.let {
            if (!logMethods.contains(it.text)) {
                return
            }

            if (optOut.any { name -> element.containingKtFile.packageFqName.startsWith(Name.identifier(name)) }) {
                return
            }

            val referenceExpression = it.getReceiverExpression()?.referenceExpression() ?: return

            if (!logNames.contains(referenceExpression.text.toLowerCase())) {
                return
            }

            if (element.lambdaArguments.size != 1) {
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Use the Lambda version of ${referenceExpression.text}.${it.text} instead"
                    )
                )
            }
        }
    }
}
