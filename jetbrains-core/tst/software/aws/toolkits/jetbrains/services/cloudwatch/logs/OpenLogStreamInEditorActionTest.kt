// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.testFramework.LightVirtualFile
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.ListTableModel
import com.nhaarman.mockitokotlin2.whenever
import kotlinx.coroutines.debug.junit4.CoroutinesTimeout
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogEventsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogEventsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.amazon.awssdk.services.cloudwatchlogs.paginators.GetLogEventsIterable
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.OpenCurrentInEditorAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.OpenLogStreamInEditorAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamsStreamColumn

class OpenLogStreamInEditorActionTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    @JvmField
    @Rule
    val timeout = CoroutinesTimeout.seconds(15)

    @After
    fun after() {
        val editorManager = FileEditorManager.getInstance(projectRule.project)
        runInEdt {
            editorManager.openFiles.forEach { editorManager.closeFile(it) }
        }
    }

    @Test
    fun testOpeningFileFromGroup() {
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        whenever(client.getLogEventsPaginator(Mockito.any<GetLogEventsRequest>()))
            .thenReturn(object : GetLogEventsIterable(client, null) {
                override fun iterator() = mutableListOf(
                    GetLogEventsResponse.builder().events(
                        OutputLogEvent.builder().message("abc").build(),
                        OutputLogEvent.builder().message("def").build()
                    ).build()
                ).iterator()
            })

        val tableModel = ListTableModel<LogStream>(LogStreamsStreamColumn())
        val table = JBTable(tableModel)
        tableModel.addRow(LogStream.builder().logStreamName("54321").build())
        // select the first row
        table.setRowSelectionInterval(0, 0)
        val action = OpenLogStreamInEditorAction(projectRule.project, client, "cloudWatchMock", "12345")
        action.actionPerformed(TestActionEvent())
        runBlocking {
            blockUntilFileOpen()
        }
        val openFile = FileEditorManager.getInstance(projectRule.project).openFiles.first()
        assertThat(openFile).isInstanceOf(LightVirtualFile::class.java)
        assertThat(openFile.isWritable).isFalse()
        assertThat((openFile as LightVirtualFile).content).isEqualTo("abc\ndef\n")
    }

    @Test
    fun testOpeningFileFromStream() {
        val tableModel = ListTableModel<LogStreamEntry>()
        tableModel.addRows(
            mutableListOf(
                LogStreamEntry("abc\n", 0L),
                LogStreamEntry("def\n", 0L),
                LogStreamEntry("ghi\n", 0L)
            )
        )
        val action = OpenCurrentInEditorAction(projectRule.project, "12345") { tableModel.items }
        action.actionPerformed(TestActionEvent())
        runBlocking {
            blockUntilFileOpen()
        }
        val openFile = FileEditorManager.getInstance(projectRule.project).openFiles.first()
        assertThat(openFile).isInstanceOf(LightVirtualFile::class.java)
        assertThat(openFile.isWritable).isFalse()
        assertThat((openFile as LightVirtualFile).content).isEqualTo("abc\ndef\nghi\n")
    }

    private suspend fun blockUntilFileOpen() {
        val editorManager = FileEditorManager.getInstance(projectRule.project)
        while (editorManager.openFiles.isEmpty()) {
            delay(20)
        }
    }
}
