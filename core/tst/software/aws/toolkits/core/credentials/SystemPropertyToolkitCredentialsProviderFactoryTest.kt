// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.aws.toolkits.core.rules.SystemPropertyHelper

class SystemPropertyToolkitCredentialsProviderFactoryTest {
    @Rule
    @JvmField
    val sysPropHelper = SystemPropertyHelper()

    private val mockManager: ToolkitCredentialsProviderManager = mock()

    @Before
    fun setUp() {
        System.getProperties().apply {
            this.remove(AWS_ACCESS_KEY_ID)
            this.remove(AWS_SECRET_ACCESS_KEY)
            this.remove(AWS_SESSION_TOKEN)
        }
    }

    @Test
    fun testLoadingWithNoneSet() {
        val providerFactory = SystemPropertyToolkitCredentialsProviderFactory(mockManager)
        assertThat(providerFactory.listCredentialProviders()).isEmpty()
        verify(mockManager, times(0)).providerAdded(any())
    }

    @Test
    fun testLoadingPartiallySet() {
        System.setProperty(AWS_ACCESS_KEY_ID, "foo")

        val providerFactory = SystemPropertyToolkitCredentialsProviderFactory(mockManager)
        assertThat(providerFactory.listCredentialProviders()).isEmpty()
        verify(mockManager, times(0)).providerAdded(any())
    }

    @Test
    fun testLoadingBasicCredentials() {
        System.setProperty(AWS_ACCESS_KEY_ID, "foo")
        System.setProperty(AWS_SECRET_ACCESS_KEY, "bar")

        val providerFactory = SystemPropertyToolkitCredentialsProviderFactory(mockManager)
        assertThat(providerFactory.listCredentialProviders())
            .hasSize(1)
            .element(0)
            .satisfies {
                assertThat(it.resolveCredentials()).isExactlyInstanceOf(AwsBasicCredentials::class.java)
            }

        verify(mockManager).providerAdded(any())
    }

    @Test
    fun testLoadingSessionCredentials() {
        System.setProperty(AWS_ACCESS_KEY_ID, "foo")
        System.setProperty(AWS_SECRET_ACCESS_KEY, "bar")
        System.setProperty(AWS_SESSION_TOKEN, "baz")

        val providerFactory = SystemPropertyToolkitCredentialsProviderFactory(mockManager)
        assertThat(providerFactory.listCredentialProviders())
            .hasSize(1)
            .element(0)
            .satisfies {
                assertThat(it.resolveCredentials()).isExactlyInstanceOf(AwsSessionCredentials::class.java)
            }

        verify(mockManager).providerAdded(any())
    }

    companion object {
        const val AWS_ACCESS_KEY_ID = "aws.accessKeyId"
        const val AWS_SECRET_ACCESS_KEY = "aws.secretAccessKey"
        const val AWS_SESSION_TOKEN = "aws.sessionToken"
    }
}
