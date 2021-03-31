// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.gradle.changelog

import com.nhaarman.mockitokotlin2.mock
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.time.LocalDate

class ReleaseCreatorTest {

    private val date = LocalDate.of(2018, 8, 27)

    @Rule
    @JvmField
    val folder = TemporaryFolder()

    @Test
    fun basicReleaseAggregation() {
        val nextRelease = folder.newFolder()
        val nextReleaseFile = folder.newFolder().resolve("2.0.0.json")

        val firstFile = File(nextRelease, "firstChange.json").apply {
            writeText(
                """
            {
                "type": "bugfix",
                "description": "Some bugfix"
            }
                """.trimIndent()
            )
        }

        val secondFile = File(nextRelease, "secondChange.json").apply {
            writeText(
                """
            {
                "type": "feature",
                "description": "Some feature"
            }
                """.trimIndent()
            )
        }

        val sut = ReleaseCreator(listOf(firstFile, secondFile), nextReleaseFile, mock())

        sut.create("2.0.0", date)

        assertThat(nextReleaseFile).exists().hasContent(
            """
            {
              "date" : "2018-08-27",
              "version" : "2.0.0",
              "entries" : [ {
                "type" : "feature",
                "description" : "Some feature"
              }, {
                "type" : "bugfix",
                "description" : "Some bugfix"
              } ]
            }
            """.trimIndent()
        )

        assertThat(firstFile).doesNotExist()
        assertThat(secondFile).doesNotExist()
    }

    @Test(expected = RuntimeException::class)
    fun exitingReleaseVersionThrows() {
        val nextReleaseFile = folder.newFolder().resolve("2.0.0.json")
        nextReleaseFile.createNewFile()
        ReleaseCreator(listOf(folder.newFile()), nextReleaseFile, mock())
    }
}
