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
import software.aws.toolkits.core.rules.EnvironmentVariableHelper

class EnvironmentVariableToolkitCredentialsProviderFactoryTest {
    @Rule
    @JvmField
    val envHelper = EnvironmentVariableHelper()

    private val mockManager: ToolkitCredentialsProviderManager = mock()

    @Before
    fun setUp() {
        envHelper.remove(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
    }

    @Test
    fun testLoadingWithNoneSet() {
        val providerFactory = EnvironmentVariableToolkitCredentialsProviderFactory(mockManager)
        assertThat(providerFactory.listCredentialProviders()).isEmpty()
        verify(mockManager, times(0)).providerAdded(any())
    }

    @Test
    fun testLoadingPartiallySet() {
        envHelper[AWS_ACCESS_KEY_ID] = "foo"

        val providerFactory = EnvironmentVariableToolkitCredentialsProviderFactory(mockManager)
        assertThat(providerFactory.listCredentialProviders()).isEmpty()
        verify(mockManager, times(0)).providerAdded(any())
    }

    @Test
    fun testLoadingBasicCredentials() {
        envHelper[AWS_ACCESS_KEY_ID] = "foo"
        envHelper[AWS_SECRET_ACCESS_KEY] = "bar"

        val providerFactory = EnvironmentVariableToolkitCredentialsProviderFactory(mockManager)
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
        envHelper[AWS_ACCESS_KEY_ID] = "foo"
        envHelper[AWS_SECRET_ACCESS_KEY] = "bar"
        envHelper[AWS_SESSION_TOKEN] = "baz"

        val providerFactory = EnvironmentVariableToolkitCredentialsProviderFactory(mockManager)
        assertThat(providerFactory.listCredentialProviders())
            .hasSize(1)
            .element(0)
            .satisfies {
                assertThat(it.resolveCredentials()).isExactlyInstanceOf(AwsSessionCredentials::class.java)
            }

        verify(mockManager).providerAdded(any())
    }

    companion object {
        const val AWS_ACCESS_KEY_ID = "AWS_ACCESS_KEY_ID"
        const val AWS_SECRET_ACCESS_KEY = "AWS_SECRET_ACCESS_KEY"
        const val AWS_SESSION_TOKEN = "AWS_SESSION_TOKEN"
    }
}
