// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.configurationStore.getPersistentStateComponentStorageLocation
import com.intellij.testFramework.ProjectExtension
import io.mockk.every
import io.mockk.junit5.MockKExtension
import io.mockk.mockkObject
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.RegisterExtension
import software.aws.toolkits.core.utils.deleteIfExists
import software.aws.toolkits.core.utils.touch
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerExtension
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel
import software.aws.toolkits.jetbrains.settings.GettingStartedSettings

@ExperimentalCoroutinesApi
@ExtendWith(MockKExtension::class)
class GettingStartedOnStartupTest {
    companion object {
        @JvmField
        @RegisterExtension
        val projectExtension = ProjectExtension()
    }

    @JvmField
    @RegisterExtension
    val credManagerExtension = MockCredentialManagerExtension()

    private val sut = GettingStartedOnStartup()

    @AfterEach
    fun afterEach() {
        GettingStartedSettings.getInstance().shouldDisplayPage = true
        getPersistentStateComponentStorageLocation(GettingStartedSettings::class.java)?.deleteIfExists()
    }

    @Test
    fun `does not show screen if aws settings exist and has credentials`() {
        mockkObject(GettingStartedPanel.Companion)
        every { GettingStartedPanel.openPanel(any()) } returns null
        val fp = getPersistentStateComponentStorageLocation(GettingStartedSettings::class.java) ?: error(
            "could not determine persistent storage for GettingStartedSettings"
        )
        try {
            fp.touch()
            sut.runActivity(projectExtension.project)
        } finally {
            fp.deleteIfExists()
        }

        verify(exactly = 0) {
            GettingStartedPanel.openPanel(projectExtension.project)
        }
    }

    @Test
    fun `does not show screen if has previously shown screen`() {
        mockkObject(GettingStartedPanel.Companion)
        every { GettingStartedPanel.openPanel(any()) } returns null
        GettingStartedSettings.getInstance().shouldDisplayPage = false
        sut.runActivity(projectExtension.project)

        verify(exactly = 0) {
            GettingStartedPanel.openPanel(projectExtension.project)
        }
    }

    @Test
    fun `shows screen if aws settings exist and no credentials`() {
        mockkObject(GettingStartedPanel.Companion)
        every { GettingStartedPanel.openPanel(any()) } returns null
        credManagerExtension.clear()
        val fp = getPersistentStateComponentStorageLocation(GettingStartedSettings::class.java) ?: error(
            "could not determine persistent storage for GettingStartedSettings"
        )
        try {
            fp.touch()
            sut.runActivity(projectExtension.project)
        } finally {
            fp.deleteIfExists()
        }

        verify {
            GettingStartedPanel.openPanel(projectExtension.project, any(), any())
        }
    }

    @Test
    fun `shows screen on first install`() {
        mockkObject(GettingStartedPanel.Companion)
        every { GettingStartedPanel.openPanel(any()) } returns null
        sut.runActivity(projectExtension.project)

        verify {
            GettingStartedPanel.openPanel(projectExtension.project, any(), any())
        }
    }
}
