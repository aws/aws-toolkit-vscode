// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.ide.highlighter.JavaFileType
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.ProjectExtension
import com.intellij.testFramework.junit5.TestDisposable
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.gradle.internal.impldep.com.amazonaws.ResponseMetadata.AWS_REQUEST_ID
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.RegisterExtension
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhispererruntime.model.SendTelemetryEventResponse
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererUserModificationTracker
import software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry.InsertedCodeModificationEntry
import software.aws.toolkits.jetbrains.services.telemetry.MockTelemetryServiceExtension
import java.time.Instant
import kotlin.test.assertNotNull

class CodeWhispererUserModificationTrackerTest {
    @TestDisposable
    private lateinit var disposable: Disposable

    @JvmField
    @RegisterExtension
    val mockTelemetryService = MockTelemetryServiceExtension()

    // sut
    private lateinit var sut: CodeWhispererUserModificationTracker

    // dependencies
    private lateinit var mockBatcher: TelemetryBatcher
    private lateinit var mockClient: CodeWhispererClientAdaptor
    private lateinit var mockModelConfigurator: CodeWhispererModelConfigurator
    private val project: Project
        get() = projectExtension.project

    companion object {
        @JvmField
        @RegisterExtension
        val projectExtension = ProjectExtension()
        private const val customizationArn = "customizationArn"
        private const val steRequestId = "sendTelemetryEventRequestId"
        private const val conversationId = "conversationId"
        private const val messageId = "messageId"
        private val mockCustomization = CodeWhispererCustomization(customizationArn, "name", "description")
        private val mockSteResponse = SendTelemetryEventResponse.builder()
            .apply {
                this.sdkHttpResponse(
                    SdkHttpResponse.builder().build()
                )
                this.responseMetadata(
                    DefaultAwsResponseMetadata.create(
                        mapOf(AWS_REQUEST_ID to steRequestId)
                    )
                )
            }.build()
    }

    @BeforeEach
    fun setup() {
        sut = CodeWhispererUserModificationTracker(project)

        // set up telemetry service
        mockBatcher = mockTelemetryService.batcher()

        // set up client
        mockClient = mock()
        project.replaceService(CodeWhispererClientAdaptor::class.java, mockClient, disposable)

        // set up customization
        mockModelConfigurator = mock {
            on { activeCustomization(project) } doReturn mockCustomization
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererModelConfigurator::class.java, mockModelConfigurator, disposable)
    }

    @Test
    fun `sendModificationWithChatTelemetry`() {
        mockClient.stub {
            on {
                sendChatUserModificationTelemetry(any(), any(), any(), any(), any(), any())
            } doReturn mockSteResponse
        }

        // TODO: should use real project fixture, fix later
        val rangeMarker = mock<RangeMarker> {
            on { startOffset } doReturn 0
            on { endOffset } doReturn 10
        }
        val fileMock = mock<VirtualFile> {
            on { isValid } doReturn true
            on { extension } doReturn "java"
            on { fileType } doReturn JavaFileType.INSTANCE
        }
        val insertedCodeModificationEntry = InsertedCodeModificationEntry(
            conversationId = conversationId,
            messageId = messageId,
            Instant.now().minusSeconds(301L),
            fileMock,
            rangeMarker,
            "print"
        )

        val textRange = TextRange(rangeMarker.startOffset, rangeMarker.endOffset)
        val mockDocument = mock<Document> {
            on { getText(eq(textRange)) } doReturn "println();"
        }
        val documentManager = mock<FileDocumentManager> {
            on { getDocument(fileMock) } doReturn mockDocument
        }
        ApplicationManager.getApplication().replaceService(FileDocumentManager::class.java, documentManager, disposable)

        sut.enqueue(insertedCodeModificationEntry)
        sut.dispose()

        verify(mockClient).sendChatUserModificationTelemetry(
            eq(conversationId),
            eq(messageId),
            eq(CodeWhispererJava.INSTANCE),
            eq(sut.checkDiff("println();", "print")),
            eq(CodeWhispererSettings.getInstance().isProjectContextEnabled()),
            eq(mockCustomization)
        )

        argumentCaptor<MetricEvent> {
            verify(mockBatcher).enqueue(capture())
            val event = firstValue.data.find { it.name == "amazonq_modifyCode" }
            assertNotNull(event)
            assertThat(event)
                .matches({ it.metadata["cwsprChatConversationId"] == conversationId }, "cwsprChatConversationId doesn't match")
                .matches({ it.metadata["cwsprChatMessageId"] == messageId }, "cwsprChatMessageId doesn't match")
                .matches(
                    { it.metadata["cwsprChatModificationPercentage"] == sut.checkDiff("println();", "print").toString() },
                    "cwsprChatModificationPercentage doesn't match"
                )
        }
    }

    @Disabled
    @Test
    fun checkDiff() {
        // TODO
    }
}
