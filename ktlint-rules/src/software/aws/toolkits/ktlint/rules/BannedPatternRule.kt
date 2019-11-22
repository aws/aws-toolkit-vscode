// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.Rule
import org.jetbrains.kotlin.com.intellij.lang.ASTNode

class BannedPatternRule(private val patterns: List<BannedPattern>) : Rule("banned-pattern"), Rule.Modifier.RestrictToRoot {
    override fun visit(node: ASTNode, autoCorrect: Boolean, emit: (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> Unit) {
        val text = node.text
        if (text.contains("BannedPatternRule")) {
            return
        }
        text.lines().forEachIndexed { lineNumber, line ->
            patterns.forEach { pattern ->
                val match = pattern.regex.find(line) ?: return@forEach
                emit(node.startOffset, "[${lineNumber + 1}:${match.range.start + 1}] ${pattern.message}", false)
            }
        }
    }

    companion object {
        val DEFAULT_PATTERNS = listOf(
            BannedPattern("Runtime\\.valueOf".toRegex(), "Runtime.valueOf banned, use Runtime.fromValue instead."),
            BannedPattern("""com\.intellij\.openapi\.actionSystem\.DataKeys""".toRegex(),
                "DataKeys is not available in all IDEs, use LangDataKeys instead"),
            BannedPattern("""PsiUtil\.getPsiFile""".toRegex(),
                "PsiUtil (java-api.jar) is not available in all IDEs, use PsiManager.getInstance(project).findFile() instead"),
            BannedPattern("""com\.intellij\.psi\.util\.PsiUtil""".toRegex(),
                "PsiUtil (java-api.jar) is not available in all IDEs, use PsiUtilCore or PsiManager instead (platform-api.jar)")
        )
    }
}

data class BannedPattern(val regex: Regex, val message: String)
