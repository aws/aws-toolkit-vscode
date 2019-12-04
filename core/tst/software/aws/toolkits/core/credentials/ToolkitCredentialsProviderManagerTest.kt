// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.auth.credentials.AwsCredentials

class ToolkitCredentialsProviderManagerTest {
    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    private val mockChangeListener: ToolkitCredentialsChangeListener = mock()
    private val mockRegistry = MockToolkitCredentialsProviderRegistry()
    private val manager = DefaultToolkitCredentialsProviderManager(mockRegistry).also {
        it.addChangeListener(mockChangeListener)
    }
    private val shutDownFactories = mutableSetOf<ToolkitCredentialsProviderFactory<*>>()

    @Before
    fun setUp() {
        mockRegistry.createMockProviderFactory("Mock1", manager)
        mockRegistry.createMockProviderFactory("Mock2", manager)
        manager.reloadFactories(mockRegistry)
    }

    @Test
    fun testGettingCredentials() {
        assertThat(manager.getCredentialProvider("Mock1:Cred1")).isNotNull
        assertThat(manager.getCredentialProvider("Mock2:Cred2")).isNotNull
    }

    @Test
    fun testGettingCredentialsThatDontExist() {
        assertThatThrownBy { manager.getCredentialProvider("DoesNotExist") }
            .isInstanceOf(CredentialProviderNotFound::class.java)
    }

    @Test
    fun testShutdownIsCalledOnFactories() {
        manager.shutDown()
        assertThat(shutDownFactories).hasSize(2)
    }

    @Test
    fun testListenerIsCalledOnAdd() {
        verify(mockChangeListener, times(4)).providerAdded(any())
    }

    @Test
    fun testListenerIsCalledOnRemove() {
        val mockProviderFactory = mockRegistry.createMockProviderFactory("Mock3", manager)
        manager.reloadFactories(mockRegistry)
        mockProviderFactory.remove("Mock3:Cred1")
        verify(mockChangeListener).providerRemoved("Mock3:Cred1")
    }

    @Test
    fun testListenerIsCalledOnModification() {
        val mockProviderFactory = mockRegistry.createMockProviderFactory("Mock3", manager)
        manager.reloadFactories(mockRegistry)
        mockProviderFactory.modify("Mock3:Cred1")
        verify(mockChangeListener).providerModified(any())
    }

    private class MockToolkitCredentialsProvider(override val id: String) : ToolkitCredentialsProvider() {
        override val displayName: String
            get() = id

        override fun resolveCredentials(): AwsCredentials = throw NotImplementedError()
    }

    private inner class MockToolkitCredentialsProviderRegistry : ToolkitCredentialsProviderRegistry {
        private val registry = mutableSetOf<ToolkitCredentialsProviderFactory<*>>()

        fun createMockProviderFactory(id: String, manager: ToolkitCredentialsProviderManager) =
            MockToolkitCredentialsProviderFactory(id, manager).also {
                registry.add(it)
            }

        override fun listFactories(manager: ToolkitCredentialsProviderManager) = registry
    }

    private inner class MockToolkitCredentialsProviderFactory(
        private val id: String,
        manager: ToolkitCredentialsProviderManager
    ) : ToolkitCredentialsProviderFactory<MockToolkitCredentialsProvider>(id, manager) {
        init {
            add(MockToolkitCredentialsProvider("$id:Cred1"))
            add(MockToolkitCredentialsProvider("$id:Cred2"))
        }

        fun remove(id: String) {
            remove(get(id)!!)
        }

        fun modify(id: String) {
            // Pretend it modifies it
            credentialsProviderManager.providerModified(get(id)!!)
        }

        override fun shutDown() {
            shutDownFactories.add(this)
            throw RuntimeException("Simulated")
        }

        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (javaClass != other?.javaClass) return false
            return id == (other as MockToolkitCredentialsProviderFactory).id
        }

        override fun hashCode(): Int = id.hashCode()
    }
}
