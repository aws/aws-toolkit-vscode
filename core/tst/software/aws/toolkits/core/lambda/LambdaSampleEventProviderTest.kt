// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.lambda

import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.utils.RemoteResourceResolver
import java.util.concurrent.CompletableFuture

class LambdaSampleEventProviderTest {

    @Rule
    @JvmField
    val tempPath = TemporaryFolder()

    @Test
    fun canParseManifestFileAndLoadContent() {
        val manifestFile = tempPath.newFile()
        val firstFile = tempPath.newFile()
        val secondFile = tempPath.newFile()

        manifestFile.writeText(
            """
            <requests>
                <request category="AWS">
                    <name>First Sample</name>
                    <filename>first.json</filename>
                </request>
                <request category="AWS">
                    <name>Second Sample</name>
                    <filename>second.json</filename>
                </request>
            </requests>
        """.trimIndent()
        )

        val firstContent = """
            {
                "hello": "world"
            }
        """.trimIndent()

        firstFile.writeText(firstContent)

        val secondContent = """
            ["hello"]
        """.trimIndent()

        secondFile.writeText(secondContent)

        val resourceResolver = mock<RemoteResourceResolver> {
            on { resolve(LambdaSampleEventManifestResource) }.thenReturn(CompletableFuture.completedFuture(manifestFile.toPath()))
            on { resolve(LambdaSampleEventResource("first.json")) }.thenReturn(CompletableFuture.completedFuture(firstFile.toPath()))
            on { resolve(LambdaSampleEventResource("second.json")) }.thenReturn(CompletableFuture.completedFuture(secondFile.toPath()))
        }
        val sut = LambdaSampleEventProvider(resourceResolver)

        val samples = sut.get().toCompletableFuture().get()

        assertThat(samples).hasSize(2)

        val first = samples[0]
        assertThat(first.name).isEqualTo("First Sample")
        assertThat(first.content.toCompletableFuture().get()).isEqualTo(firstContent)

        val second = samples[1]
        assertThat(second.name).isEqualTo("Second Sample")
        assertThat(second.content.toCompletableFuture().get()).isEqualTo(secondContent)
    }

    @Test
    fun manifestResultsAreCached() {
        val manifestFile = tempPath.newFile()

        manifestFile.writeText(
            """
            <requests>
                <request category="AWS">
                    <name>First Sample</name>
                    <filename>first.json</filename>
                </request>
            </requests>
        """.trimIndent()
        )

        val resourceResolver = mock<RemoteResourceResolver> {
            on { resolve(LambdaSampleEventManifestResource) }.thenReturn(CompletableFuture.completedFuture(manifestFile.toPath()))
        }
        val sut = LambdaSampleEventProvider(resourceResolver)

        sut.get().toCompletableFuture().get()
        sut.get().toCompletableFuture().get()

        verify(resourceResolver, times(1)).resolve(LambdaSampleEventManifestResource)
    }
}
