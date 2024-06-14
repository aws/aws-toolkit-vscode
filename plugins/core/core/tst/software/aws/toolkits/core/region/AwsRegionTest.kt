// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.region

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.junit.experimental.runners.Enclosed
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import software.aws.toolkits.core.utils.test.aString
import kotlin.random.Random

@RunWith(Enclosed::class)
class AwsRegionTest {

    @RunWith(Parameterized::class)
    class NameAndCategorizationTest(private val region: AwsRegion, private val expectedCategory: String, private val expectedDisplayName: String) {
        @Test
        fun `display name should be correct`() {
            assertThat(region.displayName).isEqualTo(expectedDisplayName)
        }

        @Test
        fun `category should match`() {
            assertThat(region.category).isEqualTo(expectedCategory)
        }

        companion object {
            @JvmStatic
            @Parameterized.Parameters(name = "{2}")
            fun data(): Collection<Array<Any>> = listOf(
                arrayOf(AwsRegion("ap-northeast-1", "Asia Pacific (Tokyo)", "aws"), "Asia Pacific", "Tokyo (ap-northeast-1)"),
                arrayOf(AwsRegion("ca-central-1", "Canada (Central)", "aws"), "North America", "Canada Central (ca-central-1)"),
                arrayOf(AwsRegion("eu-central-1", "EU (Frankfurt)", "aws"), "Europe", "Frankfurt (eu-central-1)"),
                arrayOf(AwsRegion("eu-south-1", "Europe (Milan)", "aws"), "Europe", "Milan (eu-south-1)"),
                arrayOf(AwsRegion("sa-east-1", "South America (Sao Paulo)", "aws"), "South America", "Sao Paulo (sa-east-1)"),
                arrayOf(AwsRegion("us-east-1", "US East (N. Virginia)", "aws"), "North America", "N. Virginia (us-east-1)"),
                arrayOf(AwsRegion("us-west-1", "US West (N. California)", "aws"), "North America", "N. California (us-west-1)"),
                arrayOf(AwsRegion("cn-north-1", "China (Beijing)", "aws"), "China", "Beijing (cn-north-1)"),
                arrayOf(AwsRegion("us-gov-west-1", "AWS GovCloud (US)", "aws"), "North America", "AWS GovCloud US (us-gov-west-1)"),
                arrayOf(AwsRegion("me-south-1", "Middle East (Bahrain)", "aws"), "Middle East", "Bahrain (me-south-1)"),
                arrayOf(AwsRegion("af-south-1", "Africa (Cape Town)", "aws"), "Africa", "Cape Town (af-south-1)")
            )
        }
    }

    class ExtensionFunctionTests {

        private val region = anAwsRegion()

        @Test
        fun `mergeWithExistingEnvironmentVariables puts basic settings in the map`() {
            val env = mutableMapOf<String, String>()

            region.mergeWithExistingEnvironmentVariables(env)

            assertThat(env).hasSize(2)
                .containsEntry("AWS_REGION", region.id)
                .containsEntry("AWS_DEFAULT_REGION", region.id)
        }

        @Test
        fun `mergeWithExistingEnvironmentVariables does not replace existing AWS_REGION`() {
            val existing = aString()
            val env = mutableMapOf(
                "AWS_REGION" to existing
            )

            region.mergeWithExistingEnvironmentVariables(env)

            assertThat(env).hasSize(1).containsEntry("AWS_REGION", existing)
        }

        @Test
        fun `mergeWithExistingEnvironmentVariables does not replace existing AWS_DEFAULT_REGION`() {
            val existing = aString()
            val env = mutableMapOf(
                "AWS_DEFAULT_REGION" to existing
            )

            region.mergeWithExistingEnvironmentVariables(env)

            assertThat(env).hasSize(1).containsEntry("AWS_DEFAULT_REGION", existing)
        }

        @Test
        fun `mergeWithExistingEnvironmentVariables can force replace existing`() {
            val existing = aString()
            val env = mutableMapOf(
                "AWS_REGION" to existing,
                "AWS_DEFAULT_REGION" to existing
            )

            region.mergeWithExistingEnvironmentVariables(env, replace = true)

            assertThat(env).hasSize(2)
                .containsEntry("AWS_REGION", region.id)
                .containsEntry("AWS_DEFAULT_REGION", region.id)
        }
    }
}

fun anAwsRegion(id: String = aRegionId(), name: String = aString(), partitionId: String = aString()) = AwsRegion(id, name, partitionId)

fun aRegionId(): String {
    val prefix = arrayOf("af", "us", "ca", "eu", "ap", "me", "cn").random()
    val compass = arrayOf("north", "south", "east", "west", "central").random()
    val count = Random.nextInt(1, 100)
    return "$prefix-$compass-$count"
}
