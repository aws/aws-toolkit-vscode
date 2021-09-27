// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

@file:Suppress("BannedPattern")
package software.aws.toolkits.gradle.detekt.rules

import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtFile

class BannedPatternRule(private val patterns: List<BannedPattern>) : Rule() {
    override val issue = Issue("BannedPattern", Severity.Defect, "Banned calls", Debt.FIVE_MINS)

    override fun visitKtFile(file: KtFile) {
        var offset = 0
        file.text.split("\n").forEachIndexed { _, text ->
            patterns.forEach { pattern ->
                val match = pattern.regex.find(text) ?: return@forEach
                report(
                    CodeSmell(
                        issue,
                        Entity.from(file, offset + match.range.first),
                        message = pattern.message
                    )
                )
            }
            // account for delimiter
            offset += text.length + 1
        }
    }

    companion object {
        val DEFAULT_PATTERNS = listOf(
            BannedPattern("Runtime\\.valueOf".toRegex(), "Runtime.valueOf is banned, use Runtime.fromValue instead."),
            BannedPattern(
                """com\.intellij\.openapi\.actionSystem\.DataKeys""".toRegex(),
                "DataKeys is not available in all IDEs, use LangDataKeys instead"
            ),
            BannedPattern(
                """PsiUtil\.getPsiFile""".toRegex(),
                "PsiUtil (java-api.jar) is not available in all IDEs, use PsiManager.getInstance(project).findFile() instead"
            ),
            BannedPattern(
                """com\.intellij\.psi\.util\.PsiUtil$""".toRegex(),
                "PsiUtil (java-api.jar) is not available in all IDEs, use PsiUtilCore or PsiManager instead (platform-api.jar)"
            )
        )
    }
}

data class BannedPattern(val regex: Regex, val message: String)
