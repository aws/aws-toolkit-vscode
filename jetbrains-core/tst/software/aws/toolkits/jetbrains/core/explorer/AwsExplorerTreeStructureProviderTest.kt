// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.application.runInEdt
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ExtensionTestUtil
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.tree.TreeUtil
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.atLeastOnce
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.fillResourceCache
import software.aws.toolkits.jetbrains.ui.tree.AsyncTreeModel
import software.aws.toolkits.jetbrains.ui.tree.StructureTreeModel
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.swing.tree.TreeModel

class AwsExplorerTreeStructureProviderTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Before
    fun setUp() {
        fillResourceCache(resourceCache())
    }

    @Test
    fun testTreeStructureProviderIsInvoked() {
        val mockExtension = mock<AwsExplorerTreeStructureProvider>()
        ExtensionTestUtil.maskExtensions(AwsExplorerTreeStructureProvider.EP_NAME, listOf(mockExtension), disposableRule.disposable)

        val countDownLatch = CountDownLatch(1)

        val model = Tree(createTreeModel())

        runInEdt {
            TreeUtil.expand(model, 1) {
                countDownLatch.countDown()
            }
        }

        countDownLatch.await(1, TimeUnit.SECONDS)

        verify(mockExtension, atLeastOnce()).modify(any(), any(), any())

        runInEdtAndWait {
            TreeUtil.collapseAll(model, 0)
        }
    }

    private fun createTreeModel(): TreeModel {
        val awsTreeModel = AwsExplorerTreeStructure(projectRule.project)
        val structureTreeModel = StructureTreeModel(awsTreeModel, disposableRule.disposable)
        return AsyncTreeModel(structureTreeModel, false, disposableRule.disposable)
    }

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)
}
