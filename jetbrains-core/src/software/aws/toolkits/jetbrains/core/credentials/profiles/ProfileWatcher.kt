// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.AsyncFileListener
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import software.amazon.awssdk.profiles.ProfileFileLocation
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import java.util.concurrent.ConcurrentHashMap

@Suppress("MissingRecentApi") // 2019.2 is 192.5728.98 TODO: Remove warning FIX_WHEN_MIN_IS_193
class ProfileWatcher : AsyncFileListener, Disposable {
    private val listeners = ConcurrentHashMap.newKeySet<ProfileChangeListener>()
    private val watchRoots = mutableSetOf<LocalFileSystem.WatchRequest>()

    private val watchLocationsStrings = setOf(
        FileUtil.normalize(ProfileFileLocation.configurationFilePath().toAbsolutePath().toString()),
        FileUtil.normalize(ProfileFileLocation.credentialsFilePath().toAbsolutePath().toString())
    )

    override fun prepareChange(events: MutableList<out VFileEvent>): AsyncFileListener.ChangeApplier? {
        val isRelevant = events.any { VfsUtilCore.isUnder(it.path, watchLocationsStrings) }

        return if (isRelevant) {
            object : AsyncFileListener.ChangeApplier {
                override fun afterVfsChange() {
                    listeners.forEach {
                        LOG.tryOrNull("Invoking ProfileChangeListener failed") {
                            it.onProfilesChanged()
                        }
                    }
                }
            }
        } else {
            null
        }
    }

    fun addListener(listener: ProfileChangeListener) {
        listeners.add(listener)
    }

    fun start() {
        watchRoots.addAll(LocalFileSystem.getInstance().addRootsToWatch(watchLocationsStrings, false))
        VirtualFileManager.getInstance().addAsyncFileListener(this, this)
    }

    override fun dispose() {
        listeners.clear()
        LocalFileSystem.getInstance().removeWatchedRoots(watchRoots)
    }

    interface ProfileChangeListener {
        fun onProfilesChanged()
    }

    private companion object {
        private val LOG = getLogger<ProfileWatcher>()
    }
}
