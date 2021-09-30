// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.aCredentialsIdentifier
import software.aws.toolkits.core.credentials.aToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture

class ResourceSelectorTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    private val mockResource = mock<Resource.Cached<List<String>>> {
        on { id }.thenReturn("mockResource")
    }

    @Test
    fun canSpecifyADefaultItem() {
        resourceCache.addEntry(projectRule.project, mockResource, listOf("foo", "bar", "baz"))
        val comboBox = ResourceSelector.builder().resource(mockResource).awsConnection(projectRule.project).build()

        comboBox.selectedItem = "bar"

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.selected()).isEqualTo("bar")
            }
        }
    }

    @Test
    fun canSpecifyADefaultItemMatcher() {
        resourceCache.addEntry(projectRule.project, mockResource, listOf("foo", "bar", "baz"))
        val comboBox = ResourceSelector.builder().resource(mockResource).awsConnection(projectRule.project).build()

        comboBox.reload()

        // There is a potential timing issue with reload since it's asyncrhonous but does not return a future
        // so, if we hit it, sleep to fix the issue
        if (comboBox.isLoading) {
            Thread.sleep(200)
        }
        comboBox.selectedItem { it.endsWith("z") }

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.selected()).isEqualTo("baz")
            }
        }
    }

    @Test
    fun loadFailureShowsAnErrorAndDisablesTheBox() {
        val future = CompletableFuture<List<String>>()
        resourceCache.addEntry(projectRule.project, mockResource, future)
        val comboBox = ResourceSelector.builder().resource(mockResource).awsConnection(projectRule.project).build()

        future.completeExceptionally(RuntimeException("boom"))

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.isEnabled).isFalse
                assertThat(comboBox.model.selectedItem).isEqualTo(message("loading_resource.failed"))
            }
        }
    }

    @Test
    fun usePreviouslySelectedItemAfterReloadUnlessSelectItemSet() {
        resourceCache.addEntry(projectRule.project, mockResource, listOf("foo", "bar", "baz"))
        val comboBox = ResourceSelector.builder().resource(mockResource).awsConnection(projectRule.project).build()

        runInEdtAndWait {
            comboBox.selectedItem = "bar"
        }

        comboBox.reload()

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.selected()).isEqualTo("bar")
            }
        }
    }

    @Test
    fun comboBoxIsDisabledWhileEntriesAreLoading() {
        val future = CompletableFuture<List<String>>()
        resourceCache.addEntry(projectRule.project, mockResource, future)
        val comboBox = ResourceSelector.builder().resource(mockResource).awsConnection(projectRule.project).build()

        assertThat(comboBox.selected()).isNull()

        runInEdtAndWait {
            assertThat(comboBox.isEnabled).isFalse
            assertThat(comboBox.selectedItem).isEqualTo(message("loading_resource.loading"))
        }

        future.complete(listOf("foo", "bar", "baz"))

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.isEnabled).isTrue
                assertThat(comboBox.selectedItem).isNull()
            }
        }
    }

    @Test
    fun comboBoxCancelsOldLoadingFutures() {
        val future = CompletableFuture<List<String>>()
        resourceCache.addEntry(projectRule.project, mockResource, future)
        val comboBox = ResourceSelector.builder().resource(mockResource).awsConnection(projectRule.project).build()

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.isLoading).isTrue()
            }
        }

        assertThat(future).isNotDone

        val replacementFuture = CompletableFuture<List<String>>()
        resourceCache.addEntry(projectRule.project, mockResource, replacementFuture)

        comboBox.reload()

        replacementFuture.complete(listOf("foo", "bar", "baz"))

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.isEnabled).isTrue
                assertThat(comboBox.selectedItem).isNull()
            }

            assertThat(future).isCancelled
        }
    }

    @Test
    fun comboBoxLoadingDoesntCancelIdempotentFutures() {
        val future = CompletableFuture<List<String>>()
        resourceCache.addEntry(projectRule.project, mockResource, future)
        val comboBox = ResourceSelector.builder().resource(mockResource).awsConnection(projectRule.project).build()

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.isLoading).isTrue()
            }
        }

        assertThat(future).isNotDone

        comboBox.reload()

        future.complete(listOf("foo", "bar", "baz"))

        retryableAssert {
            runInEdtAndWait {
                assertThat(future).isNotCancelled
                assertThat(comboBox.isEnabled).isTrue
            }
        }
    }

    @Test
    fun actionListenerIsInvokedOnLoadingCorrectly() {
        val future = CompletableFuture<List<String>>() // Use the future to force slow load
        resourceCache.addEntry(projectRule.project, mockResource, future)
        val comboBox = ResourceSelector.builder().resource(mockResource).awsConnection(projectRule.project).disableAutomaticLoading().build()

        val loadingStatus = mutableListOf<Boolean>()
        comboBox.addActionListener { loadingStatus.add(comboBox.isLoading) }

        comboBox.reload()

        runInEdtAndWait {
            comboBox.selectedItem = "bar"
        }

        future.complete(listOf("foo", "bar", "baz"))

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.selected()).isEqualTo("bar")
                assertThat(loadingStatus).containsExactly(true, false)
            }
        }
    }

    @Test
    fun aSingleResultWillAutoSelect() {
        resourceCache.addEntry(projectRule.project, mockResource, listOf("bar"))
        val comboBox = ResourceSelector.builder().resource(mockResource).awsConnection(projectRule.project).build()

        runInEdtAndWait {
            comboBox.selectedItem = "bar"
        }

        comboBox.reload()

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.selected()).isEqualTo("bar")
            }
        }
    }

    @Test
    fun selectingAnInvalidItemWillDefaultToUnselected() {
        resourceCache.addEntry(projectRule.project, mockResource, listOf("foo", "bar", "baz"))
        val comboBox = ResourceSelector.builder().resource(mockResource).awsConnection(projectRule.project).build()

        runInEdtAndWait {
            comboBox.selectedItem = "invalidItem"
        }

        comboBox.reload()

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.selected()).isEqualTo(null)
            }
        }
    }

    @Test
    fun canSpecifyWhichRegionAndCredentialsToUse() {
        resourceCache.addEntry(mockResource, "region1", "credential1", listOf("foo"))
        val comboBox = ResourceSelector.builder()
            .resource(mockResource)
            .awsConnection(ConnectionSettings(mockCred("credential1"), AwsRegion("region1", "", "aws")))
            .build()

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.selected()).isEqualTo("foo")
            }
        }
    }

    @Test
    fun onlyTheLastReloadIsApplied() {
        fun createMockResource(name: String): Triple<Resource.Cached<List<String>>, CompletableFuture<List<String>>, List<String>> {
            val future = CompletableFuture<List<String>>()
            val resource = mock<Resource.Cached<List<String>>> {
                on { id }.thenReturn(name)
            }

            resourceCache.addEntry(projectRule.project, resource, future)

            return Triple(resource, future, listOf(name))
        }

        // Create a bunch of different cache entries
        val resultList = listOf(
            createMockResource("1"),
            createMockResource("2"),
            createMockResource("3"),
            createMockResource("4"),
            createMockResource("5")
        )

        var counter = 0
        val comboBox = ResourceSelector.builder()
            .resource { resultList[counter].first }
            .awsConnection(projectRule.project)
            .disableAutomaticLoading()
            .build()

        val loadingStatus = mutableListOf<Boolean>()
        comboBox.addActionListener { loadingStatus.add(comboBox.isLoading) }

        // Trigger a reload for each resource to simulate a bunch of reloads against different cache entries
        runInEdtAndWait {
            resultList.forEach { _ ->
                comboBox.reload()
                counter++
            }
        }

        // Complete the cache load
        resultList.forEach {
            it.second.complete(it.third)
        }

        retryableAssert {
            runInEdtAndWait {
                assertThat(comboBox.selected()).isEqualTo("5")
                // 5 loads = 5 loadings + 1 loaded
                assertThat(loadingStatus).containsExactly(true, true, true, true, true, false)
            }
        }
    }

    private companion object {
        fun mockCred(id: String) = aToolkitCredentialsProvider(aCredentialsIdentifier(id))
    }
}
