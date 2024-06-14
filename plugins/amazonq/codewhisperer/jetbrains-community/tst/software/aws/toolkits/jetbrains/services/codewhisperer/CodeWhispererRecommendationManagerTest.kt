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
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererRecommendationManager
import software.aws.toolkits.jetbrains.services.codewhisperer.service.RequestContext
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
            onGeneric { findRightContextOverlap(any<RequestContext>(), any<Completion>()) } doReturn "}"
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
            onGeneric { findRightContextOverlap(any<RequestContext>(), any<Completion>()) } doReturn "}"
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

    @Test
    fun `overlap calculation should trim new line character starting from second character (index 1 of a string)`() {
        // recommendation is wrapped inside |recommendationContent|
        /**
         * public foo() {
         *     re|turn foo
         *}|
         * public bar() {
         *     return bar
         * }
         */
        var overlap: String = sut.findRightContextOverlap(rightContext = " foo\n}\n\n\npublic bar () {\n\treturn bar\n}", recommendationContent = "turn foo\n}")
        assertThat(overlap).isEqualTo(" foo\n}")

        /**
         * public foo() {
         *     |return foo
         * }|
         *
         * public bar() {
         *     return bar
         * }
         */
        overlap = sut.findRightContextOverlap(rightContext = "\n\n\n\npublic bar() {\n\treturn bar\n}", recommendationContent = "return foo\n}")
        assertThat(overlap).isEqualTo("")

        /**
         * println(|world)|;
         * String foo = "foo";
         */
        overlap = sut.findRightContextOverlap(rightContext = "ld);\nString foo = \"foo\";", recommendationContent = "world)")
        assertThat(overlap).isEqualTo("ld)")

        /**
         * return |has_d_at_end|
         *
         * def foo:
         *     pass
         */
        overlap = sut.findRightContextOverlap(rightContext = "\n\ndef foo():\n\tpass", recommendationContent = "has_d_at_end")
        assertThat(overlap).isEqualTo("")

        /**
         * {
         *    { foo: foo },
         *    { bar: bar },
         *    { |baz: baz }|
         * }
         *
         */
        overlap = sut.findRightContextOverlap(rightContext = "\n}", recommendationContent = "baz: baz }")
        assertThat(overlap).isEqualTo("")

        /**
         * |
         *
         *     foo|
         *
         */
        overlap = sut.findRightContextOverlap(rightContext = "\n\n\tfoo}", recommendationContent = "\n\tfoo")
        assertThat(overlap).isEqualTo("\n\tfoo")

        /** A case we can't cover
         * def foo():
         *   |print(foo)|
         *
         *
         *   print(foo)
         */
        overlap = sut.findRightContextOverlap(rightContext = "\n\n\n\tprint(foo)", recommendationContent = "print(foo)")
        assertThat(overlap).isEqualTo("")
    }

    @Test
    fun `trim extra prefixing new line character`() {
        var actual: String = CodeWhispererRecommendationManager.trimExtraPrefixNewLine("")
        assertThat(actual).isEqualTo("")

        actual = CodeWhispererRecommendationManager.trimExtraPrefixNewLine("f")
        assertThat(actual).isEqualTo("f")

        actual = CodeWhispererRecommendationManager.trimExtraPrefixNewLine("\n\n")
        assertThat(actual).isEqualTo("\n")

        actual = CodeWhispererRecommendationManager.trimExtraPrefixNewLine("foo")
        assertThat(actual).isEqualTo("foo")

        actual = CodeWhispererRecommendationManager.trimExtraPrefixNewLine("\nfoo")
        assertThat(actual).isEqualTo("\nfoo")

        actual = CodeWhispererRecommendationManager.trimExtraPrefixNewLine("\n\n\nfoo\nbar")
        assertThat(actual).isEqualTo("\nfoo\nbar")

        actual = CodeWhispererRecommendationManager.trimExtraPrefixNewLine("\n\n  foo\nbar")
        assertThat(actual).isEqualTo("\n  foo\nbar")

        actual = CodeWhispererRecommendationManager.trimExtraPrefixNewLine("\n\n\tfoo\nbar")
        assertThat(actual).isEqualTo("\n\tfoo\nbar")
    }
}
