// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.projectView.PresentationData
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.util.Ref
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ExtensionTestUtil
import com.intellij.testFramework.ProjectRule
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.tree.TreeUtil
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.atLeastOnce
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.fillResourceCache
import software.aws.toolkits.jetbrains.ui.tree.AsyncTreeModel
import software.aws.toolkits.jetbrains.ui.tree.StructureTreeModel
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.swing.tree.TreeModel

class AwsExplorerNodeProcessorTest {
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
    fun testNodePostProcessorIsInvoked() {
        val mockExtension = mock<AwsExplorerNodeProcessor>()

        ExtensionTestUtil.maskExtensions(AwsExplorerNodeProcessor.EP_NAME, listOf(mockExtension), disposableRule.disposable)

        val countDownLatch = CountDownLatch(1)

        runInEdt {
            TreeUtil.expand(Tree(createTreeModel()), 1) {
                countDownLatch.countDown()
            }
        }

        countDownLatch.await(1, TimeUnit.SECONDS)

        verify(mockExtension, atLeastOnce()).postProcessPresentation(any(), any())
    }

    @Test
    fun testNodesArePostProcessedInBackground() {
        val ranOnCorrectThread = Ref(true)
        val ran = Ref(false)

        ExtensionTestUtil.maskExtensions(
            AwsExplorerNodeProcessor.EP_NAME,
            listOf(object : AwsExplorerNodeProcessor {
                override fun postProcessPresentation(node: AwsExplorerNode<*>, presentation: PresentationData) {
                    ran.set(true)
                    ran.set(ranOnCorrectThread.get() && !ApplicationManager.getApplication().isDispatchThread)
                }
            }),
            disposableRule.disposable
        )

        val countDownLatch = CountDownLatch(1)

        runInEdt {
            TreeUtil.expand(Tree(createTreeModel()), 1) {
                countDownLatch.countDown()
            }
        }

        countDownLatch.await(1, TimeUnit.SECONDS)

        assertThat(ran.get()).isTrue()
        assertThat(ranOnCorrectThread.get()).isTrue()
    }

    private fun createTreeModel(): TreeModel {
        val awsTreeModel = AwsExplorerTreeStructure(projectRule.project)
        val structureTreeModel = StructureTreeModel(awsTreeModel, disposableRule.disposable)
        return AsyncTreeModel(structureTreeModel, true, disposableRule.disposable)
    }

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)
}
