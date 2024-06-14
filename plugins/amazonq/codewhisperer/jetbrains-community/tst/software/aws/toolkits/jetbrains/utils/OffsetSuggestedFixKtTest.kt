// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.SuggestedFix

class OffsetSuggestedFixKtTest {
    @Test
    fun offsetSuggestedFixUpdateLineNumbersWithInsertion() {
        val suggestedFix = SuggestedFix(
            code = """
            @@ -1,3 +1,4 @@
             fun main() {
            +    val greeting = "Hello, Suggested Fix is Here!"
                 println("Hello, Suggested Fix is Here!")
             }
            """.trimIndent(),
            description = "Add a variable for the greeting"
        )

        val expectedCode = """
            @@ -2,3 +2,4 @@
             fun main() {
            +    val greeting = "Hello, Suggested Fix is Here!"
                 println("Hello, Suggested Fix is Here!")
             }
        """.trimIndent()

        val result = offsetSuggestedFix(suggestedFix, 1)
        assertThat(expectedCode).isEqualTo(result.code)
    }

    @Test
    fun offsetSuggestedFixUpdateMultipleLineNumbersWithInsertion() {
        val suggestedFix = SuggestedFix(
            code = """
            @@ -1,3 +1,5 @@
             fun main() {
            +    val greeting = "Hello, Suggested Fix is Here!"
                 println("Hello, Suggested Fix is Here!"))
            +    println("Hello, Welcome to Amazon Q")
             }
            """.trimIndent(),
            description = "Add a variable for the greeting with multiple lines"
        )

        val expectedCode = """
            @@ -4,3 +4,5 @@
             fun main() {
            +    val greeting = "Hello, Suggested Fix is Here!"
                 println("Hello, Suggested Fix is Here!"))
            +    println("Hello, Welcome to Amazon Q")
             }
        """.trimIndent()

        val result = offsetSuggestedFix(suggestedFix, 3)
        assertThat(expectedCode).isEqualTo(result.code)
    }

    @Test
    fun offsetSuggestedFixUpdateLineNumbersWithDeletion() {
        val suggestedFix = SuggestedFix(
            code = """
            @@ -24,3 +24,4 @@
             fun main() {
            +    val greeting = "Hello, Suggested Fix is Here!"
                 println("Hello, Suggested Fix is Here!")
             }
            """.trimIndent(),
            description = "Add a variable for the greeting"
        )

        val expectedCode = """
            @@ -19,3 +19,4 @@
             fun main() {
            +    val greeting = "Hello, Suggested Fix is Here!"
                 println("Hello, Suggested Fix is Here!")
             }
        """.trimIndent()

        val result = offsetSuggestedFix(suggestedFix, -5)
        assertThat(expectedCode).isEqualTo(result.code)
    }

    @Test
    fun offsetSuggestedFixUpdateMultipleLineNumbersWithDeletion() {
        val suggestedFix = SuggestedFix(
            code = """
            @@ -10,3 +10,5 @@
             fun main() {
            +    val greeting = "Hello, Suggested Fix is Here!"
                 println("Hello, Suggested Fix is Here!"))
            +    println("Hello, Welcome to Amazon Q")
             }
            """.trimIndent(),
            description = "Add a variable for the greeting with multiple lines"
        )

        val expectedCode = """
            @@ -8,3 +8,5 @@
             fun main() {
            +    val greeting = "Hello, Suggested Fix is Here!"
                 println("Hello, Suggested Fix is Here!"))
            +    println("Hello, Welcome to Amazon Q")
             }
        """.trimIndent()

        val result = offsetSuggestedFix(suggestedFix, -2)
        assertThat(expectedCode).isEqualTo(result.code)
    }
}
