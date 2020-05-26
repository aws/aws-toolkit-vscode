// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.AsyncFileListener
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import software.amazon.awssdk.profiles.ProfileFileLocation

class ProfileWatcher(parentDisposable: Disposable) : AsyncFileListener, Disposable {
    private val watchRoots = mutableSetOf<LocalFileSystem.WatchRequest>()
    private var onUpdate: (() -> Unit)? = null

    init {
        Disposer.register(parentDisposable, this)
    }

    private val watchLocationsStrings = setOf(
        FileUtil.normalize(ProfileFileLocation.configurationFilePath().toAbsolutePath().toString()),
        FileUtil.normalize(ProfileFileLocation.credentialsFilePath().toAbsolutePath().toString())
    )

    override fun prepareChange(events: MutableList<out VFileEvent>): AsyncFileListener.ChangeApplier? {
        val isRelevant = events.any { VfsUtilCore.isUnder(it.path, watchLocationsStrings) }

        return if (isRelevant) {
            object : AsyncFileListener.ChangeApplier {
                override fun afterVfsChange() {
                    onUpdate?.invoke()
                }
            }
        } else {
            null
        }
    }

    fun start(onFileChange: () -> Unit) {
        onUpdate = onFileChange

        watchRoots.addAll(LocalFileSystem.getInstance().addRootsToWatch(watchLocationsStrings, false))
        VirtualFileManager.getInstance().addAsyncFileListener(this, this)
    }

    override fun dispose() {
        LocalFileSystem.getInstance().removeWatchedRoots(watchRoots)
    }
}
