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
            val importedFqName = element.importedFqName?.asString()
            if (importedFqName == "org.assertj.core.api.Assertions") {
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Import the assertion you want to use directly instead of importing the top level Assertions"
                    )
                )
            }

            if (importedFqName?.startsWith("org.hamcrest") == true) {
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Use AssertJ instead of Hamcrest assertions"
                    )
                )
            }

            if (importedFqName?.startsWith("kotlin.test.assert") == true &&
                importedFqName.startsWith("kotlin.test.assertNotNull") == false
            ) {
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Use AssertJ instead of Kotlin test assertions"
                    )
                )
            }

            if (importedFqName?.contains("kotlinx.coroutines.Dispatchers") == true) {
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Use contexts from contexts.kt instead of Dispatchers"
                    )
                )
            }

            if (importedFqName == "com.intellij.ui.layout.panel") {
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Use com.intellij.ui.dsl.builder.panel from Kotlin UI DSL Version 2"
                    )
                )
            }

            if (importedFqName == "com.google.gson.Gson") {
                report(
                    CodeSmell(
                        issue,
                        Entity.from(element),
                        message = "Use jacksonObjectMapper() insted of Gson"
                    )
                )
            }
        }
    }
}
