// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.any
import com.github.tomakehurst.wiremock.client.WireMock.stubFor
import com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo
import com.github.tomakehurst.wiremock.core.WireMockConfiguration.wireMockConfig
import com.github.tomakehurst.wiremock.junit.WireMockRule
import com.intellij.testFramework.ApplicationRule
import com.intellij.util.net.ssl.CertificateManager
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.http.HttpExecuteRequest
import software.amazon.awssdk.http.SdkHttpFullRequest
import software.amazon.awssdk.http.SdkHttpMethod
import java.net.URI

class AwsSdkClientTest {
    @Rule
    @JvmField
    val application = ApplicationRule()

    @Rule
    @JvmField
    val wireMock = createSelfSignedServer()

    @Before
    fun setUp() {
        stubFor(any(urlPathEqualTo("/")).willReturn(aResponse().withStatus(200)))
    }

    @After
    fun tearDown() {
        CertificateManager.getInstance().customTrustManager.removeCertificate("selfsign")
    }

    @Test
    fun testCertGetsTrusted() {
        val trustManager = CertificateManager.getInstance().customTrustManager
        val initialSize = trustManager.certificates.size

        val request = mockSdkRequest("https://localhost:" + wireMock.httpsPort())

        val httpClient = AwsSdkClient.getInstance().sdkHttpClient
        val response = httpClient.prepareRequest(
            HttpExecuteRequest.builder().request(request).build()
        ).call()

        assertThat(response.httpResponse().isSuccessful).isTrue()

        assertThat(trustManager.certificates).hasSize(initialSize + 1)
        assertThat(trustManager.containsCertificate("selfsign")).isTrue()
    }

    private fun mockSdkRequest(uriString: String): SdkHttpFullRequest? {
        val uri = URI.create(uriString)
        return SdkHttpFullRequest.builder()
            .uri(uri)
            .method(SdkHttpMethod.GET)
            .build()
    }

    private fun createSelfSignedServer(): WireMockRule {
        val selfSignedJks = AwsSdkClientTest::class.java.getResource("/selfSigned.jks")
        return WireMockRule(
            wireMockConfig()
                .dynamicHttpsPort()
                .keystorePath(selfSignedJks.toString())
                .keystorePassword("changeit")
                .keystoreType("jks")
        )
    }
}
