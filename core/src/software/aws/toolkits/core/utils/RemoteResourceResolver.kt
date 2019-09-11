// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CompletionStage

interface RemoteResourceResolver {
    fun resolve(resource: RemoteResource): CompletionStage<Path>
}

class DefaultRemoteResourceResolver(
    private val urlFetcher: UrlFetcher,
    private val cacheBasePath: Path,
    private val executor: (Callable<Path>) -> CompletionStage<Path>
) : RemoteResourceResolver {

    override fun resolve(resource: RemoteResource): CompletionStage<Path> = executor(Callable { internalResolve(resource) })

    private fun internalResolve(resource: RemoteResource): Path {
        val expectedLocation = cacheBasePath.resolve(resource.name)
        val current = expectedLocation.existsOrNull()
        if (current != null && !isExpired(current, resource)) {
            LOG.debug { "Existing file ($current) for ${resource.name} is present and not expired - using it." }
            return current
        }

        LOG.debug { "Current file for ${resource.name} does not exist or is expired. Attempting to fetch from ${resource.urls}" }
        var lastException: Exception? = null
        val downloaded = resource.urls.asSequence().mapNotNull { url ->
            val tmpFile = try {
                Files.createTempFile("${resource.name}-${UUID.randomUUID()}", ".tmp")
            } catch (e: Exception) {
                LOG.warn(e) { "Error creating temporary file" }
                lastException = e
                return@mapNotNull null
            }
            LOG.debug { "Beginning file download from $url to $tmpFile" }

            try {
                urlFetcher.fetch(url, tmpFile)
            } catch (e: Exception) {
                LOG.warn(e) { "Exception occurred downloading" }
                lastException = e
                tmpFile.deleteIfExists()
                return@mapNotNull null
            }
            tmpFile
        }.firstOrNull()

        val initialValue = resource.initialValue

        when {
            downloaded != null -> {
                LOG.debug { "Downloaded new file $downloaded, replacing old file $expectedLocation" }
                Files.move(downloaded, expectedLocation, StandardCopyOption.REPLACE_EXISTING)
            }
            current != null -> LOG.debug { "No new file available - re-using current file $current" }
            initialValue != null -> {
                Files.copy(initialValue(), expectedLocation, StandardCopyOption.REPLACE_EXISTING)
            }
            else -> throw RuntimeException("Unable to resolve file $resource", lastException)
        }

        return expectedLocation
    }

    private companion object {
        val LOG = getLogger<RemoteResourceResolver>()
        fun Path.existsOrNull() = if (this.exists()) {
            this
        } else {
            null
        }

        fun isExpired(file: Path, resource: RemoteResource): Boolean {
            val ttl = resource.ttl ?: return false
            return (Duration.between(file.lastModified().toInstant(), Instant.now()) > ttl).also {
                if (it) {
                    LOG.debug { "TTL for file $file has expired." }
                }
            }
        }
    }
}

interface UrlFetcher {
    fun fetch(url: String, file: Path)
}

/**
 * A resource that can be resolved remotely from a list of [urls], falling back to an [initialValue] if specified.
 * The resource is cached at [name] until the [ttl].
 */
interface RemoteResource {
    val urls: List<String>
    val name: String
    val ttl: Duration? get() = null
    val initialValue: (() -> InputStream)? get() = null
}
