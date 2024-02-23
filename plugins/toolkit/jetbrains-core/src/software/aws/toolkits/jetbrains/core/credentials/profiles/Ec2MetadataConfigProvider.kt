// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import software.amazon.awssdk.core.SdkSystemSetting
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty

/**
 * Retrieves the EC2 metadata endpoint based on profile file, env var, and Java system properties
 *
 * https://github.com/aws/aws-sdk-java-v2/blob/5fb447594313ab1ab9b9c0ead0ed7cb906b06e93/core/auth/src/test/java/software/amazon/awssdk/auth/credentials/internal/Ec2MetadataConfigProviderEndpointResolutionTest.java
 */
object Ec2MetadataConfigProvider {
    /**
     * Default IPv4 endpoint for the Amazon EC2 Instance Metadata Service.
     */
    private const val EC2_METADATA_SERVICE_URL_IPV4 = "http://169.254.169.254"

    /**
     * Default IPv6 endpoint for the Amazon EC2 Instance Metadata Service.
     */
    private const val EC2_METADATA_SERVICE_URL_IPV6 = "http://[fd00:ec2::254]"

    private enum class EndpointMode {
        IPV4, IPV6;

        companion object {
            fun fromValue(s: String?): EndpointMode = s?.let { _ ->
                values().find { it.name.equals(s, ignoreCase = true) }
            } ?: throw IllegalArgumentException("Unrecognized value for endpoint mode: '$s'")
        }
    }

    fun Profile.getEc2MedataEndpoint(): String = this.getEndpointOverride() ?: when (this.getEndpointMode()) {
        EndpointMode.IPV4 -> EC2_METADATA_SERVICE_URL_IPV4
        EndpointMode.IPV6 -> EC2_METADATA_SERVICE_URL_IPV6
    }

    private fun Profile.getEndpointMode(): EndpointMode {
        val endpointMode = SdkSystemSetting.AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE.nonDefaultStringValue
        val endpointModeString = if (endpointMode.isPresent) {
            endpointMode.get()
        } else {
            configFileEndpointMode(this) ?: SdkSystemSetting.AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE.defaultValue()
        }
        return EndpointMode.fromValue(endpointModeString)
    }

    private fun Profile.getEndpointOverride(): String? {
        val endpointOverride = SdkSystemSetting.AWS_EC2_METADATA_SERVICE_ENDPOINT.nonDefaultStringValue
        return if (endpointOverride.isPresent) {
            endpointOverride.get()
        } else {
            configFileEndpointOverride(this)
        }
    }

    private fun configFileEndpointMode(profile: Profile): String? = profile.property(ProfileProperty.EC2_METADATA_SERVICE_ENDPOINT_MODE).orElse(null)

    private fun configFileEndpointOverride(profile: Profile): String? = profile.property(ProfileProperty.EC2_METADATA_SERVICE_ENDPOINT).orElse(null)
}
