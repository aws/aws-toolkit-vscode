// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.projectView.PresentationData
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.util.Ref
import com.intellij.testFramework.ExtensionTestUtil
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
import org.mockito.kotlin.any
import org.mockito.kotlin.atLeastOnce
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.fillResourceCache
import software.aws.toolkits.jetbrains.utils.rules.EdtDisposableRule
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.swing.tree.TreeModel

class AwsExplorerNodeProcessorTest {
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
            listOf(
                object : AwsExplorerNodeProcessor {
                    override fun postProcessPresentation(node: AwsExplorerNode<*>, presentation: PresentationData) {
                        ran.set(true)
                        ran.set(ranOnCorrectThread.get() && !ApplicationManager.getApplication().isDispatchThread)
                    }
                }
            ),
            disposableRule.disposable
        )

        val countDownLatch = CountDownLatch(1)

        runInEdt {
            TreeUtil.expand(Tree(createTreeModel()), 1) {
                countDownLatch.countDown()
            }
        }

        countDownLatch.await(10, TimeUnit.SECONDS)

        assertThat(ran.get()).isTrue()
        assertThat(ranOnCorrectThread.get()).isTrue()
    }

    private fun createTreeModel(): TreeModel {
        val awsTreeModel = AwsExplorerTreeStructure(projectRule.project)
        val structureTreeModel = StructureTreeModel(
            awsTreeModel,
            null,
            Invoker.forBackgroundPoolWithoutReadAction(disposableRule.disposable),
            disposableRule.disposable
        )
        return AsyncTreeModel(structureTreeModel, false, disposableRule.disposable)
    }
}
