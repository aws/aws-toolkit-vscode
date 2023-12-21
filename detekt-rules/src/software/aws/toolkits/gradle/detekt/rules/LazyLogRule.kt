// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.detekt.rules

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import io.gitlab.arturbosch.detekt.api.internal.RequiresTypeResolution
import io.gitlab.arturbosch.detekt.rules.fqNameOrNull
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.psiUtil.getCallNameExpression
import org.jetbrains.kotlin.resolve.BindingContext
import org.jetbrains.kotlin.resolve.calls.util.getReceiverExpression
import org.jetbrains.kotlin.resolve.calls.util.getResolvedCall

@RequiresTypeResolution
class LazyLogRule : Rule() {
    override val issue = Issue("LazyLog", Severity.Style, "Use lazy logging syntax (e.g. warning {\"abc\"} ) instead of warning(\"abc\")", Debt.FIVE_MINS)

    // UI tests have issues with this TODO see if we want multiple detekt.yml files or disable for certain modules in this rule
    private val optOut = setOf("software.aws.toolkits.jetbrains.uitests")

    override fun visitCallExpression(element: KtCallExpression) {
        super.visitCallExpression(element)
        element.getCallNameExpression()?.let {
            if (!logMethods.contains(it.text)) {
                return
            }

            if (optOut.any { name -> element.containingKtFile.packageFqName.asString().startsWith(name) }) {
                return
            }

            if (bindingContext == BindingContext.EMPTY) return
            val resolvedCall = it.getResolvedCall(bindingContext)
            val type = resolvedCall?.extensionReceiver?.type?.fqNameOrNull()?.asString()
                ?: resolvedCall?.dispatchReceiver?.type?.fqNameOrNull()?.asString()

            if (type !in loggers) {
                return
            }

            if (element.lambdaArguments.size != 1) {
                val receiverName = resolvedCall?.getReceiverExpression()?.text ?: type
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Use the lambda version of $receiverName.${it.text} instead"
                    )
                )
            }
        }
    }

    companion object {
        private val logMethods = setOf("error", "warn", "info", "debug", "trace")
        val loggers = setOf("org.slf4j.Logger")
    }
}
