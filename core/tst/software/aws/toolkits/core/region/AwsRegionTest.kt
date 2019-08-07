// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.region

import org.hamcrest.CoreMatchers.equalTo
import org.hamcrest.MatcherAssert.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class AwsRegionTest(private val region: AwsRegion, private val expectedCategory: String, private val expectedDisplayName: String) {

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{2}")
        fun data(): Collection<Array<Any>> = listOf(
            arrayOf(AwsRegion("ap-northeast-1", "Asia Pacific (Tokyo)"), "Asia Pacific", "Tokyo (ap-northeast-1)"),
            arrayOf(AwsRegion("ca-central-1", "Canada (Central)"), "North America", "Canada Central (ca-central-1)"),
            arrayOf(AwsRegion("eu-central-1", "EU (Frankfurt)"), "Europe", "Frankfurt (eu-central-1)"),
            arrayOf(AwsRegion("sa-east-1", "South America (Sao Paulo)"), "South America", "Sao Paulo (sa-east-1)"),
            arrayOf(AwsRegion("us-east-1", "US East (N. Virginia)"), "North America", "N. Virginia (us-east-1)"),
            arrayOf(AwsRegion("us-west-1", "US West (N. California)"), "North America", "N. California (us-west-1)"),
            arrayOf(AwsRegion("cn-north-1", "China (Beijing)"), "China", "Beijing (cn-north-1)"),
            arrayOf(AwsRegion("us-gov-west-1", "AWS GovCloud (US)"), "North America", "AWS GovCloud US (us-gov-west-1)"),
            arrayOf(AwsRegion("me-south-1", "Middle East (Bahrain)"), "Middle East", "Bahrain (me-south-1)")
        )
    }

    @Test
    fun displayNameShouldMatch() {
        assertThat(region.displayName, equalTo(expectedDisplayName))
    }

    @Test
    fun categoryShouldMatch() {
        assertThat(region.category, equalTo(expectedCategory))
    }
}