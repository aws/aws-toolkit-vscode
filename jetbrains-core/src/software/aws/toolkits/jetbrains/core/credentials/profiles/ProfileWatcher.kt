// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.AsyncFileListener
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import com.intellij.util.containers.ContainerUtil
import software.amazon.awssdk.profiles.ProfileFileLocation

interface ProfileWatcher {
    fun addListener(listener: () -> Unit)

    companion object {
        fun getInstance() = service<ProfileWatcher>()
    }
}

class DefaultProfileWatcher : AsyncFileListener, Disposable, ProfileWatcher {
    private val listeners = ContainerUtil.createLockFreeCopyOnWriteList<() -> Unit>()
    private val watchRoots = mutableSetOf<LocalFileSystem.WatchRequest>()

    private val watchLocationsStrings = setOf(
        FileUtil.normalize(ProfileFileLocation.configurationFilePath().toAbsolutePath().toString()),
        FileUtil.normalize(ProfileFileLocation.credentialsFilePath().toAbsolutePath().toString())
    )

    init {
        watchRoots.addAll(LocalFileSystem.getInstance().addRootsToWatch(watchLocationsStrings, false))
        VirtualFileManager.getInstance().addAsyncFileListener(this, this)
    }

    override fun prepareChange(events: List<VFileEvent>): AsyncFileListener.ChangeApplier? {
        val isRelevant = events.any { VfsUtilCore.isUnder(it.path, watchLocationsStrings) }

        return if (isRelevant) {
            object : AsyncFileListener.ChangeApplier {
                override fun afterVfsChange() {
                    listeners.forEach { it() }
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
        LocalFileSystem.getInstance().removeWatchedRoots(watchRoots)
        listeners.clear()
    }
}
