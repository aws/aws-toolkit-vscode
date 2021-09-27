// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

@file:Suppress("BannedPattern")
package software.aws.toolkits.gradle.detekt.rules

import io.gitlab.arturbosch.detekt.test.lint
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
        )
            .singleElement()
            .matches {
                it.id == "BannedPattern" &&
                    it.message == "Use of method blah() is banned." &&
                    it.location.source.line == 2 &&
                    it.location.source.column == 5
            }
    }

    @Test
    fun forbidPsiUtil() {
        val rule = BannedPatternRule(BannedPatternRule.DEFAULT_PATTERNS)
        assertThat(
            rule.lint(
                """
            import com.intellij.psi.util.PsiUtil
            class DockerfileParser(private val project: Project) {
                fun parse(virtualFile: VirtualFile): DockerfileDetails? {
                    val psiFile = PsiUtil.getPsiFile(project, virtualFile)
                }
            }
                """.trimIndent()
            )
        )
            .hasSize(2)
            .anyMatch {
                it.id == "BannedPattern" &&
                    it.message == "PsiUtil (java-api.jar) is not available in all IDEs, use PsiUtilCore or PsiManager instead (platform-api.jar)" &&
                    it.location.source.line == 1 &&
                    it.location.source.column == 8
            }
            .anyMatch {
                it.id == "BannedPattern" &&
                    it.message == "PsiUtil (java-api.jar) is not available in all IDEs, use PsiManager.getInstance(project).findFile() instead" &&
                    it.location.source.line == 4 &&
                    it.location.source.column == 23
            }
    }

    @Test
    fun allowPsiUtilCore() {
        val rule = BannedPatternRule(BannedPatternRule.DEFAULT_PATTERNS)
        assertThat(
            rule.lint(
                """
            import com.intellij.psi.util.PsiUtilCore
            class DockerfileParser(private val project: Project) {
                fun parse(virtualFile: VirtualFile): DockerfileDetails? {
                    val psiFile = PsiUtilCore.getPsiFile(project, virtualFile)
                }
            }
                """.trimIndent()
            )
        )
            .hasSize(0)
    }
}
