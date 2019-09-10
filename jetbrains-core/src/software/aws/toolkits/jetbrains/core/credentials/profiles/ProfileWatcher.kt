// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.Disposable
import com.intellij.util.io.isFile
import software.amazon.awssdk.profiles.ProfileFileLocation
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.core.utils.warn
import java.nio.file.FileSystems
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardWatchEventKinds
import java.nio.file.WatchKey
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future

class ProfileWatcher : Disposable {
    private val listeners = ConcurrentHashMap.newKeySet<ProfileChangeListener>()
    private val watchService = FileSystems.getDefault().newWatchService()
    private val watchKeys: MutableMap<WatchKey, Path> = mutableMapOf()
    private val watchLocations = setOf(
        ProfileFileLocation.configurationFilePath().toAbsolutePath(),
        ProfileFileLocation.credentialsFilePath().toAbsolutePath()
    )
    private val executor = Executors.newSingleThreadExecutor {
        Thread(it).also { newThread ->
            newThread.name = "AWSProfileWatcher"
            newThread.isDaemon = true
        }
    }

    @Volatile
    private var watchFuture: Future<*>? = null

    fun addListener(listener: ProfileChangeListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: ProfileChangeListener) {
        listeners.remove(listener)
    }

    @Synchronized
    fun start() {
        if (executor.isShutdown) {
            throw IllegalStateException("ProfileWatcher was shutdown")
        }

        // Register watch locations if they exist, safe to be ran multiple times
        watchLocations.filter {
            if (Files.exists(it)) {
                true
            } else {
                LOG.info { "$it does not exist, won't watch" }
                false
            }
        }.map {
            val watchLocation = if (it.isFile()) it.parent else it
            watchLocation.register(
                watchService,
                StandardWatchEventKinds.ENTRY_CREATE,
                StandardWatchEventKinds.ENTRY_DELETE,
                StandardWatchEventKinds.ENTRY_MODIFY
            ) to watchLocation
        }.forEach {
            LOG.info { "Watching ${it.second} for file changes" }
            watchKeys[it.first] = it.second
        }

        // Only start if not already running
        if (watchFuture == null || watchFuture?.isDone == true) {
            watchFuture = executor.submit(this::watch)
        }
    }

    private fun watch() {
        while (true) {
            val key = try {
                watchService.take()
            } catch (e: InterruptedException) {
                return
            }

            var invokeListeners = false
            key.pollEvents().forEach {
                try {
                    val kind = it.kind()
                    when (kind) {
                        StandardWatchEventKinds.OVERFLOW -> {
                            LOG.debug { "ProfileWatcher got an OVERFLOW" }
                        }
                        else -> {
                            // Context path is relative to base registered to WatchKey
                            val context = it.context()
                            if (context is Path) {
                                val fullPath = watchKeys[key]?.resolve(context)
                                LOG.debug { "$fullPath was changed" }
                                if (watchLocations.contains(fullPath)) {
                                    // In case of back to back events, de-dupe them
                                    invokeListeners = true
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    LOG.warn(e) { "ProfileWatcher got an exception" }
                }
            }

            val isValid = key.reset()
            if (!isValid) {
                LOG.debug { "WatchKey $key is no longer valid" }
                watchKeys.remove(key)
            }

            if (watchKeys.isEmpty()) {
                LOG.debug { "All watch keys have been removed, terminating watcher." }
                return
            }

            if (invokeListeners) {
                listeners.forEach { listener ->
                    LOG.tryOrNull("Failed to notify listeners") {
                        listener.onProfilesChanged()
                    }
                }

                invokeListeners = false
            }
        }
    }

    override fun dispose() {
        watchService.close()
        executor.shutdown()
    }

    private companion object {
        val LOG = getLogger<ProfileWatcher>()
    }

    interface ProfileChangeListener {
        fun onProfilesChanged()
    }
}
