/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../../shared/extensionGlobals'
import { getLogger } from '../../../shared/logger/logger'
import { SmusUtils } from '../../shared/smusUtils'

const logger = getLogger('smus')

/**
 * Domain cache utility for SageMaker Unified Studio (SMUS) authentication.
 *
 * This module provides functionality to cache recently used
 * domain URLs, eliminating the need for users to manually re-enter their domain
 * URL on each authentication attempt.
 */

/**
 * Represents a cached domain entry with metadata
 */
export interface DomainCacheEntry {
    /** Full domain URL (e.g., "https://dzd_abc123.sagemaker.us-east-1.on.aws") */
    domainUrl: string
    /** Extracted domain ID (e.g., "dzd_abc123") */
    domainId: string
    /** AWS region (e.g., "us-east-1") */
    region: string
    /** User-friendly domain name from DataZone GetDomain API (optional) */
    domainName?: string
    /** ISO 8601 timestamp of when domain was last used */
    lastUsedTimestamp: string
}

/**
 * Storage key for domain cache in globalState
 */
export const domainCacheKey = 'aws.smus.recentDomains'

/**
 * Maximum number of domains to cache
 */
export const maxCachedDomains = 10

/**
 * Storage structure for domain cache
 */
interface DomainCacheStorage {
    domains: DomainCacheEntry[]
}

/**
 * Gets recently used domain URLs from cache
 * @returns Array of domain entries, ordered from most recent to oldest (max 10)
 */
export function getRecentDomains(): DomainCacheEntry[] {
    const cache = globals.globalState.tryGet<DomainCacheStorage>(domainCacheKey, Object, { domains: [] })
    return cache.domains || []
}

/**
 * Adds or updates a domain in the cache
 * If domain already exists, updates its timestamp and moves to front
 * If cache is full (10 entries), removes oldest entry
 * @param domainUrl The domain URL to cache
 * @param domainName Optional user-friendly domain name from DataZone
 */
export async function updateRecentDomains(domainUrl: string, domainName?: string): Promise<void> {
    try {
        const domains = getRecentDomains()

        // Extract domain metadata using SmusUtils
        const { domainId, region } = SmusUtils.extractDomainInfoFromUrl(domainUrl)

        if (!domainId) {
            throw new Error('Invalid domain URL: could not extract domain ID')
        }

        // Create new entry with current timestamp
        const newEntry: DomainCacheEntry = {
            domainUrl,
            domainId,
            region,
            domainName,
            lastUsedTimestamp: new Date().toISOString(),
        }

        // Remove existing entry with same URL if present
        const filteredDomains = domains.filter((d) => d.domainUrl !== domainUrl)

        // Add new entry at the front
        const updatedDomains = [newEntry, ...filteredDomains]

        // Trim array to max 10 entries
        const trimmedDomains = updatedDomains.slice(0, maxCachedDomains)

        // Save to globalState
        await globals.globalState.update(domainCacheKey, { domains: trimmedDomains })
    } catch (err) {
        logger.warn('unable to update domain cache: %s', err)
    }
}

/**
 * Removes a domain from the cache
 * Used when a domain fails validation or becomes inaccessible
 * @param domainUrl The domain URL to remove
 */
export async function removeDomainFromCache(domainUrl: string): Promise<void> {
    try {
        const domains = getRecentDomains()
        const filteredDomains = domains.filter((d) => d.domainUrl !== domainUrl)
        await globals.globalState.update(domainCacheKey, { domains: filteredDomains })
    } catch (err) {
        logger.warn('unable to remove domain from cache: %s', err)
    }
}

/**
 * Formats a timestamp for display in QuickPick
 * @param isoTimestamp ISO 8601 timestamp string
 * @returns Human-readable relative time (e.g., "2 hours ago", "Yesterday")
 */
export function formatTimestamp(isoTimestamp: string): string {
    const date = new Date(isoTimestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) {
        return 'Just now'
    }
    if (diffMins < 60) {
        return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    }
    if (diffHours < 24) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    }
    if (diffDays === 1) {
        return 'Yesterday'
    }
    if (diffDays < 7) {
        return `${diffDays} days ago`
    }

    return date.toLocaleDateString()
}
