// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.ide.DataManager
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestApplicationManager
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.mock
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.utils.rules.EdtDisposableRule

class S3ViewerPanelTest {
    @Rule
    @JvmField
    val disposableRule = EdtDisposableRule()

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private lateinit var s3Bucket: S3VirtualBucket
    private lateinit var sut: S3ViewerPanel

    @Before
    fun setUp() {
        s3Bucket = mock {
            on { prefix }.thenReturn("")
            on { name }.thenReturn(aString())

            onBlocking { listObjects(any(), anyOrNull()) }.thenReturn(
                ListObjectsV2Response.builder()
                    .commonPrefixes({ it.prefix("folder/") })
                    .build()
            )
        }

        sut = S3ViewerPanel(disposableRule.disposable, projectRule.project, s3Bucket)

        TestApplicationManager.getInstance().setDataProvider(DataManager.getDataProvider(sut.component), disposableRule.disposable)
    }

    @Test
    fun `data provider selected nodes key returns table selected values`() {
        runInEdtAndWait {
            val dataProvider = DataManager.getInstance().getDataContext(sut.component)
            sut.treeTable.clearSelection()
            assertThat(dataProvider.getData(S3EditorDataKeys.SELECTED_NODES)).isEmpty()

            sut.treeTable.addRowSelectionInterval(0, 0)
            assertThat(dataProvider.getData(S3EditorDataKeys.SELECTED_NODES)).containsExactly(S3TreeDirectoryNode(s3Bucket, null, "folder/"))
        }
    }

    @Test
    fun `data provider bucket table key returns the table`() {
        val dataProvider = DataManager.getInstance().getDataContext(sut.component)
        assertThat(dataProvider.getData(S3EditorDataKeys.BUCKET_TABLE)).isEqualTo(sut.treeTable)
    }
}
