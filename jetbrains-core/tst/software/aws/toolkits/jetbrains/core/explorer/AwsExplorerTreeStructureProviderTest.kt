// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.application.runInEdt
import com.intellij.testFramework.ExtensionTestUtil
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.ui.tree.AsyncTreeModel
import com.intellij.ui.tree.StructureTreeModel
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.concurrency.Invoker
import com.intellij.util.ui.tree.TreeUtil
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.fillResourceCache
import software.aws.toolkits.jetbrains.utils.rules.EdtDisposableRule
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.swing.tree.TreeModel

class AwsExplorerTreeStructureProviderTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val disposableRule = EdtDisposableRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Before
    fun setUp() {
        resourceCache.fillResourceCache(projectRule.project)
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

        countDownLatch.await(10, TimeUnit.SECONDS)

        verify(mockExtension, atLeastOnce()).modify(any(), any(), any())

        runInEdtAndWait {
            TreeUtil.collapseAll(model, 0)
        }
    }

    private fun createTreeModel(): TreeModel {
        val awsTreeModel = AwsExplorerTreeStructure(projectRule.project)
        val structureTreeModel =
            StructureTreeModel(awsTreeModel, null, Invoker.forBackgroundThreadWithoutReadAction(disposableRule.disposable), disposableRule.disposable)
        return AsyncTreeModel(structureTreeModel, false, disposableRule.disposable)
    }
}
