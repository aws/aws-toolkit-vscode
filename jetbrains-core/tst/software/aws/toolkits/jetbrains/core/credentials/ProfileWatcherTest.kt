// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.Ref
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.impl.local.LocalFileSystemImpl
import com.intellij.openapi.vfs.newvfs.ManagingFS
import com.intellij.openapi.vfs.newvfs.RefreshQueue
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.jetbrains.core.credentials.profiles.DefaultProfileWatcher
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.spinUntil
import java.io.File
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class ProfileWatcherTest {
    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    @Rule
    @JvmField
    val systemPropertyHelper = SystemPropertyHelper()

    private lateinit var awsFolder: File
    private lateinit var profileFile: File
    private lateinit var credentialsFile: File

    @Before
    fun setUp() {
        awsFolder = File(temporaryFolder.root, ".aws")
        profileFile = File(awsFolder, "config")
        credentialsFile = File(awsFolder, "credentials")

        System.getProperties().setProperty("aws.configFile", profileFile.absolutePath)
        System.getProperties().setProperty("aws.sharedCredentialsFile", credentialsFile.absolutePath)
    }

    @Test
    fun `watcher is notified on creation`() {
        profileFile.parentFile.mkdirs()

        assertFileChange {
            profileFile.writeText("Test")
        }
    }

    @Test
    fun `watcher is notified on edit`() {
        profileFile.parentFile.mkdirs()
        profileFile.writeText("Test")

        assertThat(LocalFileSystem.getInstance().refreshAndFindFileByIoFile(profileFile)).isNotNull

        assertFileChange {
            profileFile.writeText("Test2")
        }
    }

    @Test
    fun `watcher is notified on deletion`() {
        profileFile.parentFile.mkdirs()
        profileFile.writeText("Test")

        assertThat(LocalFileSystem.getInstance().refreshAndFindFileByIoFile(profileFile)).isNotNull

        assertFileChange {
            profileFile.delete()
        }

        assertThat(LocalFileSystem.getInstance().refreshAndFindFileByIoFile(profileFile)).isNull()
    }

    /**
     * These tests are complicated and reaching into some low level systems inside of the IDE to replicate how it works due stuff is disabled in unit test mode.
     *
     * First, FileWatcher (fsnotify[.exe]) that notifies the IDE that files are dirty is not ran in unit test mode. We start/stop it manually so that we can
     * validate external edits to the profile file is handled.
     *
     * Second, the system that marks VFS files dirty from the FileWatcher is only configured to run if FileWatcher is running in the constructor.
     * See com.intellij.openapi.vfs.impl.local.LocalFileSystemImpl constructor. Due to that, we schedule a manual VFS refresh to recheck all the files
     * marked dirty.
     */
    private fun assertFileChange(block: () -> Unit) {
        val fileWatcher = (LocalFileSystem.getInstance() as LocalFileSystemImpl).fileWatcher
        Disposer.register(projectRule.fixture.testRootDisposable, Disposable {
            fileWatcher.shutdown()

            spinUntil(Duration.ofSeconds(10)) {
                !fileWatcher.isOperational
            }
        })

        val watcherTriggered = CountDownLatch(1)
        fileWatcher.startup {
            // Contains due to /private/ vs /
            if (it.contains(awsFolder.absolutePath)) {
                watcherTriggered.countDown()
            }
        }

        spinUntil(Duration.ofSeconds(10)) {
            fileWatcher.isOperational
        }

        val sut = DefaultProfileWatcher()

        spinUntil(Duration.ofSeconds(10)) {
            !fileWatcher.isSettingRoots
        }

        val updateCalled = Ref.create(false)
        sut.addListener { updateCalled.set(true) }

        block()

        // Wait for fsnotify to see the change
        assertThat(watcherTriggered.await(5, TimeUnit.SECONDS)).describedAs("FileWatcher is triggered").isTrue()

        val refreshComplete = CountDownLatch(1)
        RefreshQueue.getInstance().refresh(true, true, Runnable { refreshComplete.countDown() }, *ManagingFS.getInstance().localRoots)

        // Wait for refresh to complete
        refreshComplete.await()

        assertThat(updateCalled.get()).describedAs("ProfileWatcher is triggered").isTrue()
    }
}
