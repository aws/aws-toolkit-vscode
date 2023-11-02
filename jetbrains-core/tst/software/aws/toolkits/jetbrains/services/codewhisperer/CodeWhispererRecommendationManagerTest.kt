// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererRecommendationManager
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class CodeWhispererRecommendationManagerTest {
    @Rule
    @JvmField
    var projectRule = PythonCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private val documentContentContent = "012345678"
    private lateinit var sut: CodeWhispererRecommendationManager
    private lateinit var fixture: CodeInsightTestFixture
    private lateinit var project: Project

    @Before
    fun setup() {
        fixture = projectRule.fixture
        project = projectRule.project

        fixture.configureByText("test.py", documentContentContent)
        runInEdtAndWait {
            fixture.editor.caretModel.moveToOffset(documentContentContent.length)
        }
        sut = spy(CodeWhispererRecommendationManager.getInstance())
        ApplicationManager.getApplication().replaceService(
            CodeWhispererRecommendationManager::class.java,
            sut,
            disposableRule.disposable
        )
    }

    @Test
    fun `test overlap()`() {
        assertThat(sut.overlap("def", "abc")).isEqualTo("")
        assertThat(sut.overlap("def", "fgh")).isEqualTo("f")
        assertThat(sut.overlap("    ", "    }")).isEqualTo("    ")
        assertThat(sut.overlap("abcd", "abc")).isEqualTo("")
    }

    @Test
    fun `test recommendation will be discarded when it's a exact match to user's input`() {
        val userInput = "def"
        val detail = sut.buildDetailContext(aRequestContext(project), userInput, listOf(aCompletion("def")), aString())
        assertThat(detail[0].isDiscarded).isTrue
        assertThat(detail[0].isTruncatedOnRight).isFalse
    }

    @Test
    fun `test duplicated recommendation after truncation will be discarded`() {
        val userInput = ""
        sut.stub {
            onGeneric { findRightContextOverlap(any(), any()) } doReturn "}"
            onGeneric { reformatReference(any(), any()) } doReturn aCompletion("def")
        }
        val detail = sut.buildDetailContext(
            aRequestContext(project),
            userInput,
            listOf(aCompletion("def"), aCompletion("def}")),
            aString()
        )
        assertThat(detail[0].isDiscarded).isFalse
        assertThat(detail[0].isTruncatedOnRight).isFalse
        assertThat(detail[1].isDiscarded).isTrue
        assertThat(detail[1].isTruncatedOnRight).isTrue
    }

    @Test
    fun `test blank recommendation after truncation will be discarded`() {
        val userInput = ""
        sut.stub {
            onGeneric { findRightContextOverlap(any(), any()) } doReturn "}"
        }
        val detail = sut.buildDetailContext(
            aRequestContext(project),
            userInput,
            listOf(aCompletion("    }")),
            aString()
        )
        assertThat(detail[0].isDiscarded).isTrue
        assertThat(detail[0].isTruncatedOnRight).isTrue
    }
}
