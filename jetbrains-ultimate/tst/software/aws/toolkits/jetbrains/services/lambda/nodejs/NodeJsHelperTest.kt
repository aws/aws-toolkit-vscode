// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.testFramework.runInEdtAndWait
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.NodeJsCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addLambdaHandler
import software.aws.toolkits.jetbrains.utils.rules.addPackageJsonFile
import kotlin.test.assertEquals

class NodeJsHelperTest {

    @Rule
    @JvmField
    val projectRule = NodeJsCodeInsightTestFixtureRule()

    @Test
    fun inferSourceRoot_noPackageJsonReturnsContentRoot() {
        val element = projectRule.fixture.addLambdaHandler(
            subPath = "foo/bar",
            fileName = "app.js",
            handlerName = "someHandler"
        )

        runInEdtAndWait {
            val contentRoot = ProjectFileIndex.getInstance(projectRule.project).getContentRootForFile(element.containingFile.virtualFile)
            val sourceRoot = inferSourceRoot(projectRule.project, element.containingFile.virtualFile)
            assertEquals(contentRoot, sourceRoot)
        }
    }

    @Test
    fun inferSourceRoot_packageJsonInSubFolder() {
        val element = projectRule.fixture.addLambdaHandler(
            subPath = "foo/bar",
            fileName = "app.js",
            handlerName = "someHandler"
        )

        projectRule.fixture.addPackageJsonFile(
            subPath = "foo"
        )

        runInEdtAndWait {
            val contentRoot = ProjectFileIndex.getInstance(projectRule.project).getContentRootForFile(element.containingFile.virtualFile)
            val sourceRoot = inferSourceRoot(projectRule.project, element.containingFile.virtualFile)
            assertEquals(VfsUtilCore.findRelativeFile("foo", contentRoot), sourceRoot)
        }
    }

    @Test
    fun inferSourceRoot_packageJsonInRootFolder() {
        val element = projectRule.fixture.addLambdaHandler(
            subPath = "foo/bar",
            fileName = "app.js",
            handlerName = "someHandler"
        )

        projectRule.fixture.addPackageJsonFile(
            subPath = "."
        )

        runInEdtAndWait {
            val contentRoot = ProjectFileIndex.getInstance(projectRule.project).getContentRootForFile(element.containingFile.virtualFile)
            val sourceRoot = inferSourceRoot(projectRule.project, element.containingFile.virtualFile)
            assertEquals(contentRoot, sourceRoot)
        }
    }
}
