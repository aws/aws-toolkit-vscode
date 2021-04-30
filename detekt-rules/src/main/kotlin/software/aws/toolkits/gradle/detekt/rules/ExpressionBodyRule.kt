// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.detekt.rules

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtBlockExpression
import org.jetbrains.kotlin.psi.KtNamedFunction
import org.jetbrains.kotlin.psi.KtReturnExpression

class ExpressionBodyRule : Rule() {
    override val issue = Issue("ExpressionBody", Severity.Style, "Use expression syntax when there is one statement", Debt.FIVE_MINS)

    override fun visitNamedFunction(element: KtNamedFunction) {
        super.visitNamedFunction(element)
        val body = element.bodyExpression as? KtBlockExpression ?: return
        if (body.statements.firstOrNull() is KtReturnExpression) {
            report(
                CodeSmell(
                    issue,
                    Entity.from(element),
                    message = "Use expression body instead of one line return"
                )
            )
        }
    }
}

