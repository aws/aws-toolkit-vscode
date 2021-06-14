// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.GoCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addGoLambdaHandler
import software.aws.toolkits.jetbrains.utils.rules.addGoModFile

class GoHelperTest {
    @Rule
    @JvmField
    val projectRule = GoCodeInsightTestFixtureRule()

    @Test
    fun `Infer source root - no Go Mod returns null`() {
        val element = projectRule.fixture.addGoLambdaHandler(
            subPath = "foo/bar"
        )

        runInEdtAndWait {
            val sourceRoot = inferSourceRoot(projectRule.project, element.containingFile.virtualFile)
            assertThat(sourceRoot).isNull()
        }
    }

    @Test
    fun `Infer source root - Go Mod is in sub-folder`() {
        val element = projectRule.fixture.addGoLambdaHandler(
            subPath = "foo/bar"
        )

        projectRule.fixture.addGoModFile(
            subPath = "foo"
        )

        runInEdtAndWait {
            val contentRoot = ProjectFileIndex.getInstance(projectRule.project).getContentRootForFile(element.containingFile.virtualFile)
            val sourceRoot = inferSourceRoot(projectRule.project, element.containingFile.virtualFile)
            assertThat(VfsUtilCore.findRelativeFile("foo", contentRoot)).isEqualTo(sourceRoot)
        }
    }

    @Test
    fun `Infer source root - Go Mod is in root folder`() {
        val element = projectRule.fixture.addGoLambdaHandler(
            subPath = "foo/bar"
        )

        projectRule.fixture.addGoModFile(
            subPath = "."
        )

        runInEdtAndWait {
            val contentRoot = ProjectFileIndex.getInstance(projectRule.project).getContentRootForFile(element.containingFile.virtualFile)
            val sourceRoot = inferSourceRoot(projectRule.project, element.containingFile.virtualFile)
            assertThat(contentRoot).isEqualTo(sourceRoot)
        }
    }
}
