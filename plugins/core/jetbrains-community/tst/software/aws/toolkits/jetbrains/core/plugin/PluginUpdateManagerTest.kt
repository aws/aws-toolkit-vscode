// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.plugin

import com.intellij.ide.plugins.IdeaPluginDescriptor
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.updateSettings.impl.PluginDownloader
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.AwsToolkit.TOOLKIT_PLUGIN_ID
import software.aws.toolkits.jetbrains.settings.AwsSettings

class PluginUpdateManagerTest {
    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private lateinit var sut: PluginUpdateManager
    private val testIdeaPluginDescriptorToolkit = getPluginDescriptorForIdAndVersion(TOOLKIT_PLUGIN_ID, "1.84")
    private var isAutoUpdateEnabledDefault: Boolean = false

    @Before
    fun setup() {
        assumeTrue("hangs in 2023.2?", ApplicationInfo.getInstance().build.baselineVersion != 232)
        sut = spy(PluginUpdateManager.getInstance())
        sut.stub {
            on {
                getUpdateInfo()
            } doAnswer {
                val downloaderSpy = mock<PluginDownloader>()
                downloaderSpy.stub {
                    onGeneric {
                        id
                    } doAnswer { testIdeaPluginDescriptorToolkit.pluginId }
                    onGeneric {
                        pluginVersion
                    } doAnswer { testIdeaPluginDescriptorToolkit.version }
                    onGeneric {
                        install()
                    } doAnswer {}
                }
                listOf(downloaderSpy)
            }
        }
        ApplicationManager.getApplication().replaceService(
            PluginUpdateManager::class.java,
            sut,
            disposableRule.disposable
        )
        isAutoUpdateEnabledDefault = AwsSettings.getInstance().isAutoUpdateEnabled
    }

    @After
    fun teardown() {
        AwsSettings.getInstance().isAutoUpdateEnabled = isAutoUpdateEnabledDefault
    }

    @Test
    fun `test getUpdate() should return null if aws toolkit download is not found`() {
        val testPluginDescriptor = getPluginDescriptorForIdAndVersion("test", "1.0")
        assertThat(sut.getUpdate(testPluginDescriptor)).isNull()
    }

    @Test
    fun `test getUpdate() should return null if current version is same or newer`() {
        var testPluginDescriptorCurrentVersion = getPluginDescriptorForIdAndVersion(TOOLKIT_PLUGIN_ID, "1.84")
        assertThat(sut.getUpdate(testPluginDescriptorCurrentVersion)).isNull()
        testPluginDescriptorCurrentVersion = getPluginDescriptorForIdAndVersion(TOOLKIT_PLUGIN_ID, "1.85")
        assertThat(sut.getUpdate(testPluginDescriptorCurrentVersion)).isNull()
    }

    @Test
    fun `test getUpdate() should return toolkit if current version is older`() {
        val testPluginDescriptorCurrentVersion = getPluginDescriptorForIdAndVersion(TOOLKIT_PLUGIN_ID, "1.83")
        val update = sut.getUpdate(testPluginDescriptorCurrentVersion)
        assertThat(update).isNotNull
        assertThat(update?.pluginVersion).isEqualTo("1.84")
        assertThat(update?.id.toString()).isEqualTo(TOOLKIT_PLUGIN_ID)
    }

    @Test
    fun `test auto update feature respects user setting`() {
        AwsSettings.getInstance().isAutoUpdateEnabled = false
        sut.scheduleAutoUpdate()
        runInEdt {
            verify(sut, never()).checkForUpdates(any(), any())
        }

        AwsSettings.getInstance().isAutoUpdateEnabled = true
        sut.scheduleAutoUpdate()
        runInEdt {
            verify(sut).checkForUpdates(any(), any())
        }
    }

    private fun getPluginDescriptorForIdAndVersion(id: String, version: String): IdeaPluginDescriptor {
        val mockDescriptor = mock<IdeaPluginDescriptor>()
        whenever(mockDescriptor.version).thenReturn(version)
        whenever(mockDescriptor.pluginId).thenReturn(PluginId.getId(id))
        return mockDescriptor
    }
}
