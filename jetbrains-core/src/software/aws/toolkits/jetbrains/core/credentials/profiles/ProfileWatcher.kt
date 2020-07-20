// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.AsyncFileListener
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.openapi.vfs.pointers.VirtualFilePointer
import com.intellij.util.containers.ContainerUtil
import software.amazon.awssdk.profiles.ProfileFileLocation
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import java.nio.file.Paths

interface ProfileWatcher {
    fun addListener(listener: () -> Unit)

    companion object {
        fun getInstance() = service<ProfileWatcher>()
    }
}

class DefaultProfileWatcher : AsyncFileListener, Disposable, ProfileWatcher {
    private val listeners = ContainerUtil.createLockFreeCopyOnWriteList<() -> Unit>()
    private val watchRoots = mutableSetOf<LocalFileSystem.WatchRequest>()
    private val watchPointers = mutableMapOf<String, VirtualFilePointer>()

    private val watchLocationsStrings = setOf(
        FileUtil.normalize(ProfileFileLocation.configurationFilePath().toAbsolutePath().toString()),
        FileUtil.normalize(ProfileFileLocation.credentialsFilePath().toAbsolutePath().toString())
    )

    init {
        LOG.info { "Starting profile watcher, profile locations: $watchLocationsStrings" }

        val localFileSystem = LocalFileSystem.getInstance()

        val watchLocationParents = watchLocationsStrings.map {
            val path = Paths.get(FileUtil.toSystemDependentName(it))

            // Make VFS aware of it
            localFileSystem.refreshAndFindFileByIoFile(path.toFile())

            // Use the parent as the watch root in case file does not exist yet
            // Note: This system requires that the parent folder already exists
            FileUtil.normalize(path.parent.toString())
        }.toSet()

        watchRoots.addAll(localFileSystem.addRootsToWatch(watchLocationParents, true))

        LOG.info { "Added watch roots: $watchRoots" }

        VirtualFileManager.getInstance().addAsyncFileListener(this, this)
    }

    override fun prepareChange(events: List<VFileEvent>): AsyncFileListener.ChangeApplier? {
        LOG.debug { "Received events: $events" }
        val isRelevant = events.any { watchLocationsStrings.contains(it.path) }

        return if (isRelevant) {
            LOG.info { "Profile file change detected, scheduling refresh" }
            object : AsyncFileListener.ChangeApplier {
                override fun afterVfsChange() {
                    // Off load this, since this is called under a write lock
                    ApplicationManager.getApplication().executeOnPooledThread {
                        listeners.forEach { it() }
                    }
                }
            }
        } else {
            null
        }
    }

    override fun addListener(listener: () -> Unit) {
        listeners.add(listener)
    }

    override fun dispose() {
        LOG.info { "Stopping profile watcher, removing roots $watchRoots" }
        LocalFileSystem.getInstance().removeWatchedRoots(watchRoots)
        listeners.clear()
        watchPointers.clear()
    }

    private companion object {
        val LOG = getLogger<ProfileWatcher>()
    }
}
