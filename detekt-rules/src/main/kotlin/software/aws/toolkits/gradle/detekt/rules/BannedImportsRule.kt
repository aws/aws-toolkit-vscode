// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.detekt.rules

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtImportList

class BannedImportsRule : Rule() {
    override val issue = Issue("BannedImports", Severity.Defect, "Imports banned by the project", Debt.FIVE_MINS)

    override fun visitImportList(importList: KtImportList) {
        super.visitImportList(importList)
        importList.imports.forEach { element ->
            if (element.importedFqName?.asString() == "org.assertj.core.api.Assertions") {
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Import the assertion you want to use directly instead of importing the top level Assertions"
                    )
                )
            }

            if (element.importedFqName?.asString()?.startsWith("org.hamcrest") == true) {
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Use AssertJ instead of Hamcrest assertions"
                    )
                )
            }

            if (element.importedFqName?.asString()?.startsWith("kotlin.test.assert") == true &&
                element.importedFqName?.asString()?.startsWith("kotlin.test.assertNotNull") == false
            ) {
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Use AssertJ instead of Kotlin test assertions"
                    )
                )
            }
        }
    }
}
