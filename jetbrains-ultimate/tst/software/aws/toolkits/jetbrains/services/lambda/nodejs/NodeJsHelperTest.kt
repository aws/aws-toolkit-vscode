// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VfsUtilCore
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addLambdaHandler
import software.aws.toolkits.jetbrains.utils.rules.addPackageJsonFile

class NodeJsHelperTest {

    @Rule
    @JvmField
    val projectRule = NodeJsCodeInsightTestFixtureRule()

    @Test
    fun noPackageJsonReturnsNull() {
        val element = projectRule.fixture.addLambdaHandler(
            subPath = "foo/bar",
            fileName = "app.js",
            handlerName = "someHandler"
        )

        runReadAction {
            val sourceRoot = inferSourceRoot(element.containingFile.virtualFile)
            assertThat(sourceRoot).isNull()
        }
    }

    @Test
    fun packageJsonInSubFolder() {
        val element = projectRule.fixture.addLambdaHandler(
            subPath = "foo/bar",
            fileName = "app.js",
            handlerName = "someHandler"
        )

        projectRule.fixture.addPackageJsonFile(
            subPath = "foo"
        )

        runReadAction {
            val contentRoot = ProjectFileIndex.getInstance(projectRule.project).getContentRootForFile(element.containingFile.virtualFile)
            val sourceRoot = inferSourceRoot(element.containingFile.virtualFile)
            assertThat(sourceRoot).isEqualTo(VfsUtilCore.findRelativeFile("foo", contentRoot))
        }
    }

    @Test
    fun packageJsonInRootFolder() {
        val element = projectRule.fixture.addLambdaHandler(
            subPath = "foo/bar",
            fileName = "app.js",
            handlerName = "someHandler"
        )

        projectRule.fixture.addPackageJsonFile(
            subPath = "."
        )

        runReadAction {
            val contentRoot = ProjectFileIndex.getInstance(projectRule.project).getContentRootForFile(element.containingFile.virtualFile)
            val sourceRoot = inferSourceRoot(element.containingFile.virtualFile)
            assertThat(sourceRoot).isEqualTo(contentRoot)
        }
    }
}
