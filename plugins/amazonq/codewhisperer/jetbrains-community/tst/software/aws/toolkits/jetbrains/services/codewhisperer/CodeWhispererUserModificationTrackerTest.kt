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
import info.debatty.java.stringsimilarity.Levenshtein
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
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
import software.amazon.awssdk.awscore.util.AwsHeader
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhispererruntime.model.SendTelemetryEventResponse
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeInsertionDiff
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererUserModificationTracker
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.percentage
import software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry.InsertedCodeModificationEntry
import software.aws.toolkits.jetbrains.services.telemetry.MockTelemetryServiceExtension
import java.time.Instant
import kotlin.math.min
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
    private val levenshtein = Levenshtein()

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
                        mapOf(AwsHeader.AWS_REQUEST_ID to steRequestId)
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

        val percentageChanges = sut.checkDiff("println();", "print").percentage()
        verify(mockClient).sendChatUserModificationTelemetry(
            eq(conversationId),
            eq(messageId),
            eq(CodeWhispererJava.INSTANCE),
            eq(percentageChanges),
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
                    { it.metadata["cwsprChatModificationPercentage"] == percentageChanges.toString() },
                    "cwsprChatModificationPercentage doesn't match"
                )
        }
    }

    @Test
    fun `checkDiff edge cases`() {
        // any empty string will return null
        val r1 = sut.checkDiff("", "")
        assertThat(r1).isNull()

        val r2 = sut.checkDiff("foo", "")
        assertThat(r2).isNull()

        val r3 = sut.checkDiff("", "foo")
        assertThat(r3).isNull()

        // null will return null
        val r4 = sut.checkDiff(null, null)
        assertThat(r4).isNull()

        val r5 = sut.checkDiff(null, "foo")
        assertThat(r5).isNull()

        val r6 = sut.checkDiff("foo", null)
        assertThat(r6).isNull()
    }

    @Test
    fun `checkDiff should return data having correct payload`() {
        val r1 = sut.checkDiff("foo", "bar")
        assertThat(r1).isEqualTo(
            CodeInsertionDiff(modified = "foo", original = "bar", diff = levenshtein.distance("foo", "bar"))
        )

        val r2 = sut.checkDiff("foo", "foo")
        assertThat(r2).isEqualTo(
            CodeInsertionDiff(modified = "foo", original = "foo", diff = levenshtein.distance("foo", "foo"))
        )
    }

    @Test
    fun `CodeInsertionDiff_percentage() should return correct result`() {
        fun assertPercentageCorrect(original: String?, modified: String?) {
            val diff = sut.checkDiff(currString = modified, acceptedString = original)
            val expectedPercentage: Double = when {
                original == null || modified == null -> 1.0

                original.isEmpty() || modified.isEmpty() -> 1.0

                else -> min(1.0, (levenshtein.distance(modified, original) / original.length))
            }

            val actual = diff.percentage()

            assertThat(actual).isEqualTo(expectedPercentage)
        }

        assertPercentageCorrect(null, null)
        assertPercentageCorrect(null, "foo")
        assertPercentageCorrect("foo", null)

        assertPercentageCorrect("", "")
        assertPercentageCorrect("", "foo")
        assertPercentageCorrect("foo", "")

        assertPercentageCorrect("foo", "bar")
        assertPercentageCorrect("foo", "foo")
        assertPercentageCorrect("bar", "foo")
    }
}
