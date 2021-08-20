// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.metadataservice

import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.any
import com.github.tomakehurst.wiremock.client.WireMock.head
import com.github.tomakehurst.wiremock.client.WireMock.put
import com.github.tomakehurst.wiremock.client.WireMock.status
import com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig
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

class InstanceRoleCredentialProviderFactoryTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val systemPropertyHelper = SystemPropertyHelper()

    @Rule
    @JvmField
    val wireMockRule = WireMockRule(
        wireMockConfig()
            .dynamicPort()
    )

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private val profileLoadCallback = mock<CredentialsChangeListener>()
    private val credentialChangeEvent = argumentCaptor<CredentialsChangeEvent>()
    private val sut = InstanceRoleCredentialProviderFactory()

    @Before
    fun setUp() {
        System.setProperty(SdkSystemSetting.AWS_EC2_METADATA_SERVICE_ENDPOINT.property(), "http://localhost:${wireMockRule.port()}")

        profileLoadCallback.stub {
            on { profileLoadCallback.invoke(credentialChangeEvent.capture()) }.thenReturn(Unit)
        }

        wireMockRule.stubFor(head(urlPathEqualTo("/")).willReturn(status(200)))
        wireMockRule.stubFor(put(urlPathEqualTo("/latest/api/token")).willReturn(status(200)))
        wireMockRule.stubFor(
            any(urlPathEqualTo("/latest/meta-data/iam/security-credentials/"))
                .willReturn(
                    aResponse().withBody("aProfile")
                )
        )
        wireMockRule.stubFor(
            any(urlPathEqualTo("/latest/meta-data/iam/security-credentials/aProfile"))
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
        wireMockRule.stubFor(
            any(urlPathEqualTo("/latest/dynamic/instance-identity/document"))
                .willReturn(
                    aResponse().withBody("""{"region": "us-fake-1"}""")
                )
        )
    }

    @Test
    fun `provides credentials when ec2 metadata service is available`() {
        sut.setUp(profileLoadCallback)

        assertThat(credentialChangeEvent.allValues.size).isEqualTo(1)
        assertThat(credentialChangeEvent.firstValue).satisfies {
            assertThat(it.modified).isEmpty()
            assertThat(it.removed).isEmpty()
            assertThat(it.added).hasSize(1)
            assertThat(it.added.first().credentialType).isEqualTo(CredentialType.Ec2Metadata)
        }
    }

    @Test
    fun `credentials can be resolved`() {
        val provider = sut.createAwsCredentialProvider(mock(), mock())
        val credentials = provider.resolveCredentials() as AwsSessionCredentials

        assertThat(credentials.accessKeyId()).isEqualTo("accessKeyId")
        assertThat(credentials.secretAccessKey()).isEqualTo("secretAccessKey")
        assertThat(credentials.sessionToken()).isEqualTo("sessionToken")
    }

    @Test
    fun `does not provide credentials when ec2 metadata service property is empty`() {
        System.setProperty(SdkSystemSetting.AWS_EC2_METADATA_SERVICE_ENDPOINT.property(), "")
        sut.setUp(profileLoadCallback)

        assertThat(credentialChangeEvent.allValues).isEmpty()
    }

    @Test
    fun `does not provide credentials when ec2 metadata service is unreachable`() {
        System.setProperty(SdkSystemSetting.AWS_EC2_METADATA_SERVICE_ENDPOINT.property(), "http://localhost:0")
        sut.setUp(profileLoadCallback)

        assertThat(credentialChangeEvent.allValues).isEmpty()
    }

    @Test
    fun `does not provide credentials when system property disables sdk resolver`() {
        System.setProperty(SdkSystemSetting.AWS_EC2_METADATA_DISABLED.property(), "true")
        sut.setUp(profileLoadCallback)

        assertThat(credentialChangeEvent.allValues).isEmpty()
    }
}
