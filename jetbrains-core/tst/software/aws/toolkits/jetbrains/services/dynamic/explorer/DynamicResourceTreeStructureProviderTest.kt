// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.application.runInEdt
import com.intellij.testFramework.ProjectRule
import com.intellij.ui.tree.AsyncTreeModel
import com.intellij.ui.tree.StructureTreeModel
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.concurrency.Invoker
import com.intellij.util.ui.tree.TreeUtil
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.AwsExplorerTreeStructure
import software.aws.toolkits.jetbrains.core.fillResourceCache
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceSupportedTypes
import software.aws.toolkits.jetbrains.settings.DynamicResourcesSettings
import software.aws.toolkits.jetbrains.utils.rules.EdtDisposableRule
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.swing.tree.TreeModel
import javax.swing.tree.TreeNode

class DynamicResourceTreeStructureProviderTest {
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
    fun `dynamic resources settings node is first in subtree`() {
        DynamicResourcesSettings.getInstance().selected = DynamicResourceSupportedTypes.getInstance().getSupportedTypes().toSet()

        val countDownLatch = CountDownLatch(1)

        val model = Tree(createTreeModel())

        runInEdt {
            TreeUtil.expand(model, 2) {
                countDownLatch.countDown()
            }
        }
        countDownLatch.await(1, TimeUnit.SECONDS)

        val children = TreeUtil.listChildren(model.model.root as TreeNode)
            .last()
            .let { TreeUtil.listChildren(it as TreeNode) }
            .map { TreeUtil.getUserObject(it) as AbstractTreeNode<*> }

        assertThat(children).hasSizeGreaterThan(1)
        assertThat(children.first()).isInstanceOf(DynamicResourceSelectorNode::class.java)
        assertThat(children).containsOnlyOnce(children.first())
    }

    @Test
    fun `dynamic resources root node is last in service list`() {
        val countDownLatch = CountDownLatch(1)

        val model = Tree(createTreeModel())

        runInEdt {
            TreeUtil.expand(model, 1) {
                countDownLatch.countDown()
            }
        }
        countDownLatch.await(1, TimeUnit.SECONDS)

        val children = TreeUtil.listChildren(model.model.root as TreeNode)
            .map { TreeUtil.getUserObject(it) as AbstractTreeNode<*> }

        assertThat(children.last()).isInstanceOf(OtherResourcesNode::class.java)
        assertThat(children).containsOnlyOnce(children.last())
    }

    private fun createTreeModel(): TreeModel {
        val awsTreeModel = AwsExplorerTreeStructure(projectRule.project)
        val structureTreeModel =
            StructureTreeModel(awsTreeModel, null, Invoker.forBackgroundThreadWithoutReadAction(disposableRule.disposable), disposableRule.disposable)
        return AsyncTreeModel(structureTreeModel, false, disposableRule.disposable)
    }
}
