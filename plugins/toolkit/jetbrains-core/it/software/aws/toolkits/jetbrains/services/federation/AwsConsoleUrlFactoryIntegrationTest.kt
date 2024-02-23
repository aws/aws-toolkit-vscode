// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation

import com.intellij.testFramework.TestApplicationManager
import com.intellij.util.io.HttpRequests
import org.assertj.core.api.Assertions.assertThat
import org.junit.Assume.assumeFalse
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

@RunWith(Parameterized::class)
class AwsConsoleUrlFactoryIntegrationTest(@Suppress("UNUSED_PARAMETER") regionId: String, private val region: AwsRegion) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun data(): Collection<Array<Any>> {
            // hack because parameters are evalutaed before rules https://github.com/junit-team/junit4/issues/671
            TestApplicationManager.getInstance()

            return AwsRegionProvider().allRegions().values.sortedWith(compareBy<AwsRegion> { it.partitionId }.thenBy { it.id })
                .map { arrayOf(it.id, it) }
        }
    }

    @Rule
    @JvmField
    val credRule = MockCredentialManagerRule()

    /**
     * There is currently no good way to test this in our integration CI fleet, so this test suite only runs locally
     */
    @Test
    fun `can sign-in`() {
        val profileName = when (region.partitionId) {
            // define these environment variables to test signin for the given partition
            "aws" -> System.getenv("AWS_CLASSIC_TEST_PROFILE")
            "aws-us-gov" -> System.getenv("AWS_GOV_TEST_PROFILE")
            "aws-cn" -> System.getenv("AWS_CN_TEST_PROFILE")
            else -> throw RuntimeException("Region partition is unknown for $region")
        }
        assumeFalse("Skipping console sign-in test for $region since a credentials profile was not available", profileName.isNullOrBlank())

        val credProvider = credRule.createCredentialProvider(profileName, ProfileCredentialsProvider.create(profileName).resolveCredentials())
        val credSettings = ConnectionSettings(credProvider, region)
        val signinUrl = AwsConsoleUrlFactory.getSigninUrl(credSettings, destination = "")
        val responseCode = HttpRequests.request(signinUrl)
            // don't throw because it'll print the signin token as part of the exception
            .throwStatusCodeException(false)
            .tryConnect()

        assertThat(responseCode).isGreaterThanOrEqualTo(200).isLessThan(400)
    }
}
