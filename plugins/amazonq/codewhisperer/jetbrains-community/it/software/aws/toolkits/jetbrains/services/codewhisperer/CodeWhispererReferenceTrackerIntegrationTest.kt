// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.jupiter.api.assertDoesNotThrow
import org.mockito.kotlin.any
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.jsFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.utils.rules.RunWithRealCredentials.RequiresRealCredentials
import software.aws.toolkits.resources.message

@RequiresRealCredentials
class CodeWhispererReferenceTrackerIntegrationTest : CodeWhispererIntegrationTestBase() {
    private val leftContextWithReference = """
InAuto.GetContent(
    InAuto.servers.auto, "vendors.json", function (data) {
        let block = '';
        for(let i = 0; i < data.length; i++) {
            block += '<a href="' + data
    """.trimIndent()

    private val rightContextWithReference = """
[i].title + '">' + cars[i].title + '</a>';
        }
        ${'$'}('#cars').html(block);
    }
);
    """.trimIndent()

    @Before
    override fun setUp() {
        super.setUp()
        setFileContext(jsFileName, leftContextWithReference, rightContextWithReference)
    }

    @Test
    fun testInvokeCompletionWithReference() {
        assertDoesNotThrow {
            settingsManager.toggleIncludeCodeWithReference(true)
            withCodeWhispererServiceInvokedAndWait { response ->
                val requestId = response.responseMetadata().requestId()
                assertThat(requestId).isNotNull
                val sessionId = response.sdkHttpResponse().headers().getOrDefault(
                    CodeWhispererService.KET_SESSION_ID,
                    listOf(requestId)
                )[0]
                assertThat(sessionId).isNotNull
                assertThat(response.hasCompletions()).isTrue
                assertThat(response.completions()).isNotEmpty
                assertThat(response.completions()[0].hasReferences()).isTrue
            }
        }
    }

    @Test
    fun testInvokeCompletionWithReferenceWithReferenceSettingDisabled() {
        assertDoesNotThrow {
            settingsManager.toggleIncludeCodeWithReference(false)
            invokeCodeWhispererService()
            verify(popupManager, never()).showPopup(any(), any(), any(), any(), any())
            testMessageShown(message("codewhisperer.popup.no_recommendations"))
        }
    }
}
