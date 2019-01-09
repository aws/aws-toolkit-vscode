// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.util.registry.Registry
import com.intellij.openapi.util.registry.RegistryValue
import com.intellij.testFramework.ApplicationRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.http.apache.ApacheHttpClient
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient

class AwsSdkClientTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

    private lateinit var registryValue: RegistryValue

    @Before
    fun setUp() {
        registryValue = Registry.get("aws.toolkit.useUrlConnection")
    }

    @After
    fun tearDown() {
        registryValue.resetToDefault()
    }

    @Test
    fun apacheIsDefault() {
        assertThat(registryValue.asBoolean()).isFalse()
    }

    @Test
    fun useUrlConnection() {
        registryValue.setValue(true)
        assertThat(AwsSdkClient().sdkHttpClient.base).isInstanceOf(UrlConnectionHttpClient::class.java)
    }

    @Test
    fun useApache() {
        registryValue.setValue(false)
        assertThat(AwsSdkClient().sdkHttpClient.base).isInstanceOf(ApacheHttpClient::class.java)
    }
}