// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.ide.plugins.IdeaPluginDescriptor
import com.intellij.ide.plugins.PluginManagerCore
import io.mockk.called
import io.mockk.clearAllMocks
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.verify
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct

class PluginResolverTest {
    @Before
    fun setup() {
        mockkStatic(PluginManagerCore::class)
    }

    @After
    fun tearDown() {
        clearAllMocks()
    }

    @Test
    fun getsProductForAmazonQPlugin() {
        val pluginDescriptor = mockk<IdeaPluginDescriptor> {
            every { name } returns "amazon.q"
        }
        every { PluginManagerCore.getPluginDescriptorOrPlatformByClassName(any()) } returns pluginDescriptor

        val pluginResolver = PluginResolver.fromCurrentThread()

        assertEquals(AWSProduct.AMAZON_Q_FOR_JET_BRAINS, pluginResolver.product)
    }

    @Test
    fun getsToolkitProductByDefault() {
        val pluginDescriptor = mockk<IdeaPluginDescriptor> {
            every { name } returns "amazon.foo"
        }
        every { PluginManagerCore.getPluginDescriptorOrPlatformByClassName(any()) } returns pluginDescriptor

        val pluginResolver = PluginResolver.fromCurrentThread()

        assertEquals(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS, pluginResolver.product)
    }

    @Test
    fun getsResolvedVersion() {
        val pluginDescriptor = mockk<IdeaPluginDescriptor> {
            every { version } returns "1.2.3"
        }
        every { PluginManagerCore.getPluginDescriptorOrPlatformByClassName(any()) } returns pluginDescriptor

        val pluginResolver = PluginResolver.fromCurrentThread()

        assertEquals("1.2.3", pluginResolver.version)
    }

    @Test
    fun getsUnresolvedVersionAsUnknown() {
        val pluginDescriptor = mockk<IdeaPluginDescriptor> {
            every { version } returns null
        }
        every { PluginManagerCore.getPluginDescriptorOrPlatformByClassName(any()) } returns pluginDescriptor

        val pluginResolver = PluginResolver.fromCurrentThread()

        assertEquals("unknown", pluginResolver.version)
    }

    @Test
    fun stackTraceResolvesExpectedToolkitClass() {
        val mockStackTrace = arrayOf(
            StackTraceElement("foo", "mockMethod", "mockFile.kt", 1),
            StackTraceElement("software.aws.toolkits.core.foo", "mockMethod", "mockFile.kt", 1),
            StackTraceElement("software.aws.toolkits.plugins.amazonq.bar", "mockMethod", "mockFile.kt", 1),
            StackTraceElement("bar", "mockMethod", "mockFile.kt", 1)
        )

        val pluginDescriptor = mockk<IdeaPluginDescriptor> {
            every { name } returns "amazon.q"
            every { version } returns "1.2.3"
        }
        val pluginResolver = PluginResolver.fromStackTrace(mockStackTrace)
        every { PluginManagerCore.getPluginDescriptorOrPlatformByClassName(any()) } returns pluginDescriptor

        assertEquals(AWSProduct.AMAZON_Q_FOR_JET_BRAINS, pluginResolver.product)
        assertEquals("1.2.3", pluginResolver.version)

        verify {
            PluginManagerCore.getPluginDescriptorOrPlatformByClassName("software.aws.toolkits.plugins.amazonq.bar")
        }
    }

    @Test
    fun stackTraceNoToolkitClassMatches() {
        val mockStackTrace = arrayOf(
            StackTraceElement("foo", "mockMethod", "mockFile.kt", 1),
            StackTraceElement("bar", "mockMethod", "mockFile.kt", 1)
        )
        val pluginResolver = PluginResolver.fromStackTrace(mockStackTrace)

        assertEquals(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS, pluginResolver.product)
        assertEquals("unknown", pluginResolver.version)

        verify {
            PluginManagerCore.getPlugin(any())?.wasNot(called)
        }
    }
}
