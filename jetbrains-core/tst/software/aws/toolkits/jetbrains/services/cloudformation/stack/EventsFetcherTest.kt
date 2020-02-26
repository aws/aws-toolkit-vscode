// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.testFramework.ProjectRule
import org.junit.Assert
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudformation.model.StackEvent
import software.aws.toolkits.jetbrains.core.MockClientManagerRule

private fun expectRange(from: String, to: String, events: List<StackEvent>, expectedSize: Int = 1024) {
    Assert.assertEquals("Wrong number of items", expectedSize, events.size)
    Assert.assertEquals("Wrong page start", from, events.first().eventId())
    Assert.assertEquals("Wrong page end", to, events.last().eventId())
}

private const val nonEmptyMessage = "Second call on the same page must not return anything"
private const val wrongPageMessage = "Wrong list of available pages"

class EventsFetcherTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    @Test
    fun onlyNewEvents() {
        val generator = MockEventsGenerator()
        val client = mockClientManagerRule.createMock(generator)

        val fetcher = EventsFetcher("myStack")
        fetcher.fetchEvents(client, null).apply {
            expectRange("4096", "3073", first)
        }
        fetcher.fetchEvents(client, null).apply {
            Assert.assertTrue(nonEmptyMessage, first.isEmpty())
        }
        generator.addEvent() // New event arrived
        fetcher.fetchEvents(client, null).apply {
            expectRange("4097", "4097", first, expectedSize = 1)
        }
        fetcher.fetchEvents(client, null).apply {
            Assert.assertTrue(nonEmptyMessage, first.isEmpty())
        }
    }

    @Test
    fun paging() {
        val client = mockClientManagerRule.createMock(MockEventsGenerator())
        val fetcher = EventsFetcher("myStack")
        fetcher.fetchEvents(client, null).apply {
            expectRange("4096", "3073", first)
            Assert.assertEquals(wrongPageMessage, setOf(Page.NEXT), second)
        }
        fetcher.fetchEvents(client, null).apply {
            Assert.assertTrue(nonEmptyMessage, first.isEmpty())
            Assert.assertEquals(wrongPageMessage, setOf(Page.NEXT), second)
        }
        fetcher.fetchEvents(client, Page.NEXT).apply {
            expectRange("3072", "2049", first)
            Assert.assertEquals(wrongPageMessage, setOf(Page.PREVIOUS, Page.NEXT), second)
        }
        fetcher.fetchEvents(client, null).apply {
            Assert.assertTrue(nonEmptyMessage, first.isEmpty())
            Assert.assertEquals(wrongPageMessage, setOf(Page.PREVIOUS, Page.NEXT), second)
        }
        fetcher.fetchEvents(client, Page.NEXT) // Scroll to the end
        fetcher.fetchEvents(client, Page.NEXT).apply {
            expectRange("1024", "1", first)
            Assert.assertEquals(wrongPageMessage, setOf(Page.PREVIOUS), second)
        }
        fetcher.fetchEvents(client, Page.PREVIOUS).apply {
            expectRange("2048", "1025", first)
            Assert.assertEquals(wrongPageMessage, setOf(Page.PREVIOUS, Page.NEXT), second)
        }
    }
}
