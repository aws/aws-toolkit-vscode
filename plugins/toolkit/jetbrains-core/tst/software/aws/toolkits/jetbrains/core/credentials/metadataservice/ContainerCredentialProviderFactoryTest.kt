// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.metadataservice

import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.any
import com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration
import com.github.tomakehurst.wiremock.junit.WireMockRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.core.SdkSystemSetting
import software.aws.toolkits.core.credentials.CredentialType
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.rules.SystemPropertyHelper
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeFormatter

class ContainerCredentialProviderFactoryTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val systemPropertyHelper = SystemPropertyHelper()

    @Rule
    @JvmField
    val wireMockRule = WireMockRule(
        WireMockConfiguration.wireMockConfig()
            .dynamicPort()
    )

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private val profileLoadCallback = mock<CredentialsChangeListener>()
    private val credentialChangeEvent = argumentCaptor<CredentialsChangeEvent>()
    private val sut = ContainerCredentialProviderFactory()

    @Before
    fun setUp() {
        System.setProperty(SdkSystemSetting.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI.property(), "")
        System.setProperty(SdkSystemSetting.AWS_CONTAINER_CREDENTIALS_FULL_URI.property(), "")
        profileLoadCallback.stub {
            on { profileLoadCallback.invoke(credentialChangeEvent.capture()) }.thenReturn(Unit)
        }
    }

    @Test
    fun `provides credentials when AWS_CONTAINER_CREDENTIALS_RELATIVE_URI is set`() {
        System.setProperty(SdkSystemSetting.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI.property(), "http://localhost:${wireMockRule.port()}")
        sut.setUp(profileLoadCallback)

        assertThat(credentialChangeEvent.allValues.size).isEqualTo(1)
        assertThat(credentialChangeEvent.firstValue).satisfies {
            assertThat(it.modified).isEmpty()
            assertThat(it.removed).isEmpty()
            assertThat(it.added).hasSize(1)
            assertThat(it.added.first().credentialType).isEqualTo(CredentialType.EcsMetadata)
        }
    }

    @Test
    fun `provides credentials when AWS_CONTAINER_CREDENTIALS_FULL_URI is set`() {
        System.setProperty(SdkSystemSetting.AWS_CONTAINER_CREDENTIALS_FULL_URI.property(), "http://localhost:${wireMockRule.port()}")
        sut.setUp(profileLoadCallback)

        assertThat(credentialChangeEvent.allValues.size).isEqualTo(1)
        assertThat(credentialChangeEvent.firstValue).satisfies {
            assertThat(it.modified).isEmpty()
            assertThat(it.removed).isEmpty()
            assertThat(it.added).hasSize(1)
            assertThat(it.added.first().credentialType).isEqualTo(CredentialType.EcsMetadata)
        }
    }

    @Test
    fun `credentials can be resolved`() {
        // assume sdk handles full_uri/relative_uri properly for us
        System.setProperty(SdkSystemSetting.AWS_CONTAINER_CREDENTIALS_FULL_URI.property(), "http://localhost:${wireMockRule.port()}")
        System.setProperty(SdkSystemSetting.AWS_CONTAINER_SERVICE_ENDPOINT.property(), "http://localhost:${wireMockRule.port()}")
        wireMockRule.stubFor(
            any(urlPathEqualTo("/"))
                .willReturn(
                    aResponse().withBody(
                        // language=JSON
                        """
                            {
                                "AccessKeyId": "accessKeyId",
                                "SecretAccessKey": "secretAccessKey",
                                "Token": "sessionToken",
                                "Expiration": "${DateTimeFormatter.ISO_INSTANT.format(Instant.now().plus(Duration.ofDays(1)))}"
                            }
                        """.trimIndent()
                    )
                )
        )
        val provider = sut.createAwsCredentialProvider(mock(), mock())
        val credentials = provider.resolveCredentials() as AwsSessionCredentials

        assertThat(credentials.accessKeyId()).isEqualTo("accessKeyId")
        assertThat(credentials.secretAccessKey()).isEqualTo("secretAccessKey")
        assertThat(credentials.sessionToken()).isEqualTo("sessionToken")
    }

    @Test
    fun `does not provide credentials when container variables are not set`() {
        sut.setUp(profileLoadCallback)

        assertThat(credentialChangeEvent.allValues).isEmpty()
    }
}
