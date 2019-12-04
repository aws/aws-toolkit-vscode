// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.LintError
import com.pinterest.ktlint.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test

class BannedPatternRuleTest {

    @Test
    fun classContainingRegexCreatesError() {
        val rule = BannedPatternRule(listOf(BannedPattern("""blah\(\)""".toRegex(), "Use of method blah() is banned.")))
        assertThat(
            rule.lint(
                """
            fun hello() {
                blah()
            }
        """.trimIndent()
            )
        ).containsExactly(LintError(1, 1, "banned-pattern", "[2:5] Use of method blah() is banned."))
    }

    @Test
    fun forbidPsiUtil() {
        val rule = BannedPatternRule(BannedPatternRule.DEFAULT_PATTERNS)
        assertThat(
            rule.lint(""" 
            import com.intellij.psi.util.PsiUtil
            class DockerfileParser(private val project: Project) {
                fun parse(virtualFile: VirtualFile): DockerfileDetails? {
                    val psiFile = PsiUtil.getPsiFile(project, virtualFile)
                }
            }
            """.trimIndent())
        ).containsExactly(
            LintError(1, 1, "banned-pattern",
                "[1:8] PsiUtil (java-api.jar) is not available in all IDEs, use PsiUtilCore or PsiManager instead (platform-api.jar)"),
            LintError(1, 1, "banned-pattern",
                "[4:23] PsiUtil (java-api.jar) is not available in all IDEs, use PsiManager.getInstance(project).findFile() instead"))
    }
}
