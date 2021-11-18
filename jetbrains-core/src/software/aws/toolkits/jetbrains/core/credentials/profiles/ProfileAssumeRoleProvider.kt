// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.auth.StsAssumeRoleCredentialsProvider
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest
import software.amazon.awssdk.utils.SdkAutoCloseable
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.promptForMfaToken
import java.util.function.Supplier

class ProfileAssumeRoleProvider(@get:TestOnly internal val parentProvider: AwsCredentialsProvider, region: AwsRegion, profile: Profile) :
    AwsCredentialsProvider, SdkAutoCloseable {
    private val stsClient: StsClient
    private val credentialsProvider: StsAssumeRoleCredentialsProvider

    init {
        val roleArn = profile.requiredProperty(ProfileProperty.ROLE_ARN)
        val roleSessionName = profile.property(ProfileProperty.ROLE_SESSION_NAME).orElseGet { "aws-toolkit-jetbrains-${System.currentTimeMillis()}" }
        val externalId = profile.property(ProfileProperty.EXTERNAL_ID).orElse(null)
        val mfaSerial = profile.property(ProfileProperty.MFA_SERIAL).orElse(null)

        // https://docs.aws.amazon.com/sdkref/latest/guide/setting-global-duration_seconds.html
        val durationSecs = profile.property(ProfileProperty.DURATION_SECONDS).map { it.toIntOrNull() }.orElse(null) ?: 3600

        stsClient = AwsClientManager.getInstance().createUnmanagedClient(parentProvider, Region.of(region.id))

        credentialsProvider = StsAssumeRoleCredentialsProvider.builder()
            .stsClient(stsClient)
            .refreshRequest(
                Supplier {
                    createAssumeRoleRequest(
                        profile.name(),
                        mfaSerial,
                        roleArn,
                        roleSessionName,
                        externalId,
                        durationSecs
                    )
                }
            )
            .build()
    }

    private fun createAssumeRoleRequest(
        profileName: String,
        mfaSerial: String?,
        roleArn: String,
        roleSessionName: String?,
        externalId: String?,
        durationSeconds: Int
    ): AssumeRoleRequest {
        val requestBuilder = AssumeRoleRequest.builder()
            .roleArn(roleArn)
            .roleSessionName(roleSessionName)
            .externalId(externalId)
            .durationSeconds(durationSeconds)

        mfaSerial?.let { _ ->
            requestBuilder
                .serialNumber(mfaSerial)
                .tokenCode(promptForMfaToken(profileName, mfaSerial))
        }

        return requestBuilder.build()
    }

    override fun resolveCredentials(): AwsCredentials = credentialsProvider.resolveCredentials()

    override fun close() {
        credentialsProvider.close()
        (parentProvider as? SdkAutoCloseable)?.close()
        stsClient.close()
    }
}
