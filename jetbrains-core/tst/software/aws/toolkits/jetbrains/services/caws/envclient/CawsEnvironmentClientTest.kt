// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws.envclient

import com.github.tomakehurst.wiremock.client.WireMock
import com.github.tomakehurst.wiremock.core.WireMockConfiguration
import com.github.tomakehurst.wiremock.junit.WireMockRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.caws.envclient.models.GetStatusResponse

class CawsEnvironmentClientTest {
    @Rule
    @JvmField
    val wireMockRule = WireMockRule(
        WireMockConfiguration.wireMockConfig()
            .dynamicPort()
    )

    private lateinit var sut: CawsEnvironmentClient

    @Before
    fun setUp() {
        sut = CawsEnvironmentClient(wireMockRule.baseUrl())
    }

    @Test
    fun `getStatus() can safely handles unknown values`() {
        wireMockRule.stubFor(
            WireMock.any(WireMock.urlPathEqualTo("/status"))
                .willReturn(
                    WireMock.aResponse().withBody(
                        // language=JSON
                        """
                        {
                                "anUnmodeledField": "value",
                                "status": "some-unmodeled-status",
                                "location": "devfile.yaml"
                        }
                        """.trimIndent()
                    )
                )
        )

        val status = sut.getStatus()
        assertThat(status.status).isEqualTo(GetStatusResponse.Status.UNKNOWN)
        assertThat(status.location).isEqualTo("devfile.yaml")
    }

    @Test
    fun `getStatus() can deserialize IMAGES-UPDATE-AVAILABLE`() {
        wireMockRule.stubFor(
            WireMock.any(WireMock.urlPathEqualTo("/status"))
                .willReturn(
                    WireMock.aResponse().withBody(
                        // language=JSON
                        """
                        {
                                "status": "IMAGES-UPDATE-AVAILABLE",
                                "location": "devfile.yaml"
                        }
                        """.trimIndent()
                    )
                )
        )

        assertThat(sut.getStatus().status).isEqualTo(GetStatusResponse.Status.IMAGES_UPDATE_AVAILABLE)
    }
}
