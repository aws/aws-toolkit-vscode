// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.rules.EnvironmentVariableHelper
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.credentials.profiles.Ec2MetadataConfigProvider.getEc2MedataEndpoint
import software.aws.toolkits.jetbrains.utils.isInstanceOf

class Ec2MetadataConfigProviderTest {
    @Rule
    @JvmField
    val sysProps = SystemPropertyHelper()

    @Rule
    @JvmField
    val envVars = EnvironmentVariableHelper()

    @Test
    fun `endpoint can be overridden with system property`() {
        val endpoint = aString()
        System.setProperty("aws.ec2MetadataServiceEndpoint", endpoint)

        assertThat(profile().getEc2MedataEndpoint()).isEqualTo(endpoint)
    }

    @Test
    fun `endpoint can be overridden with env var`() {
        val endpoint = aString()
        envVars["AWS_EC2_METADATA_SERVICE_ENDPOINT"] = endpoint

        assertThat(profile().getEc2MedataEndpoint()).isEqualTo(endpoint)
    }

    @Test
    fun `endpoint can be overridden with profile`() {
        val endpoint = aString()
        val profile = profile {
            put("ec2_metadata_service_endpoint", endpoint)
        }

        assertThat(profile.getEc2MedataEndpoint()).isEqualTo(endpoint)
    }

    @Test
    fun `endpoint defaults to ipv4 endpoint if nothing is specified`() {
        assertThat(profile().getEc2MedataEndpoint()).isEqualTo("http://169.254.169.254")
    }

    @Test
    fun `endpoint defaults to default endpoint if ipv6 is specified`() {
        val profile = profile {
            put("ec2_metadata_service_endpoint_mode", "ipv6")
        }

        assertThat(profile.getEc2MedataEndpoint()).isEqualTo("http://[fd00:ec2::254]")
    }

    @Test
    fun `mode is case insensitive`() {
        val profile = profile {
            put("ec2_metadata_service_endpoint_mode", "ipv6")
        }

        assertThat(profile.getEc2MedataEndpoint()).isEqualTo("http://[fd00:ec2::254]")

        val profile2 = profile {
            put("ec2_metadata_service_endpoint_mode", "iPv6")
        }

        assertThat(profile2.getEc2MedataEndpoint()).isEqualTo("http://[fd00:ec2::254]")
    }

    @Test
    fun `mode can be overridden with system property`() {
        System.setProperty("aws.ec2MetadataServiceEndpointMode", "ipv6")

        assertThat(profile().getEc2MedataEndpoint()).isEqualTo("http://[fd00:ec2::254]")
    }

    @Test
    fun `mode can be overridden with env var`() {
        envVars["AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE"] = "ipv6"

        assertThat(profile().getEc2MedataEndpoint()).isEqualTo("http://[fd00:ec2::254]")
    }

    @Test
    fun `invalid mode fails`() {
        val profile = profile {
            put("ec2_metadata_service_endpoint_mode", "badMode")
        }

        assertThatThrownBy { profile.getEc2MedataEndpoint() }.isInstanceOf<IllegalArgumentException>()
    }
}
