// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getCompletionType
import software.aws.toolkits.jetbrains.services.codewhisperer.util.toCodeChunk
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererCompletionType

class CodeWhispererUtilTest {
    @JvmField
    @Rule
    val projectRule = JavaCodeInsightTestFixtureRule()

    lateinit var fixture: CodeInsightTestFixture

    @Before
    fun setup() {
        fixture = projectRule.fixture
    }

    @Test
    fun `toCodeChunk case_1`() {
        val psiFile = fixture.configureByText(
            "Sample.java",
            """public class Main {
            |    public static void main() {
            |    }
            |}
            """.trimMargin()
        )

        val result = runBlocking {
            psiFile.virtualFile.toCodeChunk("fake/path")
        }.toList()

        assertThat(result).hasSize(2)

        assertThat(result[0].content).isEqualTo(
            """public class Main {
                |    public static void main() {
                |    }
            """.trimMargin()
        )
        assertThat(result[1].content).isEqualTo(
            """public class Main {
            |    public static void main() {
            |    }
            |}
            """.trimMargin()
        )
    }

    @Test
    fun `toCodeChunk case_2`() {
        val psiFile = fixture.configureByText("Sample.java", codeSample33Lines)

        val result = runBlocking {
            psiFile.virtualFile.toCodeChunk("fake/path")
        }.toList()

        assertThat(result).hasSize(5)

        // 0th
        assertThat(result[0].content).isEqualTo(
            """public int runBinarySearchRecursively(int[] sortedArray, int key, int low, int high) {
                |    int middle = low  + ((high - low) / 2);
            """.trimMargin()
        )
        assertThat(result[0].path).isEqualTo("fake/path")
        assertThat(result[0].nextChunk).isEqualTo(result[1].content)

        // 1st
        assertThat(result[1].content).isEqualTo(
            """|public int runBinarySearchRecursively(int[] sortedArray, int key, int low, int high) {
                    |    int middle = low  + ((high - low) / 2);
                    |    
                    |    if (high < low) {
                    |        return -1;
                    |    }
                    |
                    |    if (key == sortedArray[middle]) {
                    |        return middle;
                    |    } else if (key < sortedArray[middle]) {
            """.trimMargin()
        )
        assertThat(result[1].path).isEqualTo("fake/path")
        assertThat(result[1].nextChunk).isEqualTo(result[2].content)

        // 2nd
        assertThat(result[2].content).isEqualTo(
            """|        return runBinarySearchRecursively(sortedArray, key, low, middle - 1);
               |    } else {
               |        return runBinarySearchRecursively(sortedArray, key, middle + 1, high);
               |    }
               |}
               |
               |public int runBinarySearchIteratively(int[] sortedArray, int key, int low, int high) {
               |    int index = Integer.MAX_VALUE;
               |    
               |    while (low <= high) {
            """.trimMargin()
        )
        assertThat(result[2].path).isEqualTo("fake/path")
        assertThat(result[2].nextChunk).isEqualTo(result[3].content)

        // 3rd
        assertThat(result[3].content).isEqualTo(
            """|        int mid = low  + ((high - low) / 2);
       |        if (sortedArray[mid] < key) {
       |            low = mid + 1;
       |        } else if (sortedArray[mid] > key) {
       |            high = mid - 1;
       |        } else if (sortedArray[mid] == key) {
       |            index = mid;
       |            break;
       |        }
       |     }
            """.trimMargin()
        )
        assertThat(result[3].path).isEqualTo("fake/path")
        assertThat(result[3].nextChunk).isEqualTo(result[4].content)

        // 4th
        assertThat(result[4].content).isEqualTo(
            """|    
               |    return index;
               |}
            """.trimMargin()
        )
        assertThat(result[4].path).isEqualTo("fake/path")
        assertThat(result[4].nextChunk).isEqualTo(result[4].content)
    }

    @Test
    fun `test getCompletionType() should give Block completion type to multi-line completions that has at least two non-blank lines`() {
        assertThat(getCompletionType(aCompletion("test\n\n\t\nanother test"))).isEqualTo(CodewhispererCompletionType.Block)
        assertThat(getCompletionType(aCompletion("test\ntest\n"))).isEqualTo(CodewhispererCompletionType.Block)
        assertThat(getCompletionType(aCompletion("\n   \t\r\ntest\ntest"))).isEqualTo(CodewhispererCompletionType.Block)
    }

    @Test
    fun `test getCompletionType() should give Line completion type to line completions`() {
        assertThat(getCompletionType(aCompletion("test"))).isEqualTo(CodewhispererCompletionType.Line)
        assertThat(getCompletionType(aCompletion("test\n\t   "))).isEqualTo(CodewhispererCompletionType.Line)
    }

    @Test
    fun `test getCompletionType() should give Line completion type to multi-line completions that has at most 1 non-blank line`() {
        assertThat(getCompletionType(aCompletion("test\n\t"))).isEqualTo(CodewhispererCompletionType.Line)
        assertThat(getCompletionType(aCompletion("test\n    "))).isEqualTo(CodewhispererCompletionType.Line)
        assertThat(getCompletionType(aCompletion("test\n\r"))).isEqualTo(CodewhispererCompletionType.Line)
        assertThat(getCompletionType(aCompletion("\n\n\n\ntest"))).isEqualTo(CodewhispererCompletionType.Line)
    }
}

private val codeSample33Lines =
    """public int runBinarySearchRecursively(int[] sortedArray, int key, int low, int high) {
       |    int middle = low  + ((high - low) / 2);
       |    
       |    if (high < low) {
       |        return -1;
       |    }
       |
       |    if (key == sortedArray[middle]) {
       |        return middle;
       |    } else if (key < sortedArray[middle]) {
       |        return runBinarySearchRecursively(sortedArray, key, low, middle - 1);
       |    } else {
       |        return runBinarySearchRecursively(sortedArray, key, middle + 1, high);
       |    }
       |}
       |
       |public int runBinarySearchIteratively(int[] sortedArray, int key, int low, int high) {
       |    int index = Integer.MAX_VALUE;
       |    
       |    while (low <= high) {
       |        int mid = low  + ((high - low) / 2);
       |        if (sortedArray[mid] < key) {
       |            low = mid + 1;
       |        } else if (sortedArray[mid] > key) {
       |            high = mid - 1;
       |        } else if (sortedArray[mid] == key) {
       |            index = mid;
       |            break;
       |        }
       |     }
       |    
       |    return index;
       |}
       |
    """.trimMargin()
