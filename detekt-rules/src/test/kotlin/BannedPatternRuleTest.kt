// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import io.gitlab.arturbosch.detekt.test.lint
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.gradle.detekt.rules.BannedPattern
import software.aws.toolkits.gradle.detekt.rules.BannedPatternRule

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
            .hasOnlyOneElementSatisfying {
                it.id == "BannedPattern" && it.message == "[2:5] Use of method blah() is banned."
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
                    it.message == "[1:8] PsiUtil (java-api.jar) is not available in all IDEs, use PsiUtilCore or PsiManager instead (platform-api.jar)"
            }
            .anyMatch {
                it.id == "BannedPattern" &&
                    it.message == "[4:23] PsiUtil (java-api.jar) is not available in all IDEs, use PsiManager.getInstance(project).findFile() instead"
            }
    }
}
