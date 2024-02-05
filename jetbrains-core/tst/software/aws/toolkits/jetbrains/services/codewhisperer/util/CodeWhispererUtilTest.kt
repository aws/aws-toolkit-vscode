// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ProjectExtension
import com.intellij.testFramework.junit5.TestDisposable
import com.intellij.testFramework.replaceService
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.verify
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.RegisterExtension
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.reauthConnectionIfNeeded
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderExtension

class CodeWhispererUtilTest {
    companion object {
        @JvmField
        @RegisterExtension
        val projectExtension = ProjectExtension()
    }

    @JvmField
    @RegisterExtension
    val mockRegionProviderExtension = MockRegionProviderExtension()

    @Test
    fun `reconnectCodeWhisperer respects connection settings`(@TestDisposable disposable: Disposable) {
        mockkStatic(::reauthConnectionIfNeeded)
        val mockConnectionManager = mockk<ToolkitConnectionManager>(relaxed = true)
        val mockConnection = mockk<ManagedBearerSsoConnection>()
        projectExtension.project.replaceService(ToolkitConnectionManager::class.java, mockConnectionManager, disposable)
        ApplicationManager.getApplication().replaceService(ToolkitAuthManager::class.java, mockk(relaxed = true), disposable)
        val startUrl = aString()
        val region = mockRegionProviderExtension.createAwsRegion().id
        val scopes = listOf(aString(), aString())

        every { mockConnectionManager.activeConnectionForFeature(any()) } returns mockConnection
        every { mockConnection.startUrl } returns startUrl
        every { mockConnection.region } returns region
        every { mockConnection.scopes } returns scopes

        CodeWhispererUtil.reconnectCodeWhisperer(projectExtension.project)

        verify {
            reauthConnectionIfNeeded(projectExtension.project, mockConnection)
        }
    }
}
