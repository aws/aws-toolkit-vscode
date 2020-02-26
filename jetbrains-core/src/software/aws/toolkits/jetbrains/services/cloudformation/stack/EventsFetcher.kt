// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.DescribeStackEventsRequest
import software.amazon.awssdk.services.cloudformation.model.StackEvent
import javax.swing.SwingUtilities

/**
 * AWS returns events in Events in reverse chronological order. This class remembers last event id and returns only new one.
 * [lastEventIdOfCurrentPage] String? id of the last event used to prevent duplicates.
 * [id] String field used as event id
 * [previousPages] stack of tokens for all pages except first. First page does not have token
 * [nextPage] next page token  (if any)
 * [currentPage] current page token (or null if current page is first)
 */
class EventsFetcher(private val stackName: String) {
    private var lastEventIdOfCurrentPage: String? = null
    private val previousPages = mutableListOf<String>()
    private var nextPage: String? = null
    private var currentPage: String? = null

    /**
     * [pageToSwitchTo] switch to another page.
     *
     * @return new events from last call or all events if [pageToSwitchTo] is set (because all events
     * are new to another page) and set of available [Page]s
     */
    fun fetchEvents(client: CloudFormationClient, pageToSwitchTo: Page?):
        Pair<List<StackEvent>, Set<Page>> {
        assert(!SwingUtilities.isEventDispatchThread())

        val pageToFetch: String? = when (pageToSwitchTo) {
            Page.NEXT -> nextPage
            Page.PREVIOUS -> previousPages.lastOrNull()
            else -> currentPage
        }

        val request = DescribeStackEventsRequest.builder().stackName(stackName).nextToken(pageToFetch).build()
        val response = client.describeStackEvents(request)

        when (pageToSwitchTo) {
            Page.NEXT -> currentPage?.let { previousPages.add(it) } // Store current as prev
            Page.PREVIOUS -> if (previousPages.isNotEmpty()) previousPages.removeAt(previousPages.size - 1)
        }
        nextPage = response.nextToken()
        currentPage = pageToFetch

        if (pageToSwitchTo != null) { // page changed, last event is not valid
            lastEventIdOfCurrentPage = null
        }

        val eventsUnprocessed = response.stackEvents()
        val eventsProcessed = when (lastEventIdOfCurrentPage) {
            null -> eventsUnprocessed
            else -> eventsUnprocessed.takeWhile { it.id != lastEventIdOfCurrentPage }
        }
        eventsProcessed.firstOrNull()?.let { lastEventIdOfCurrentPage = it.id }

        val availablePages = mutableSetOf<Page>()

        if (currentPage != null) { // We only can go prev. if current page is not first (not null)
            availablePages.add(Page.PREVIOUS)
        }
        if (nextPage != null) {
            availablePages.add(Page.NEXT)
        }

        return Pair(eventsProcessed, availablePages)
    }

    private val StackEvent.id: String get() = eventId()
}
