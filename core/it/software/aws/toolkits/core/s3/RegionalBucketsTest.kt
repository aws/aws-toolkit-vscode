// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.s3

import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.rules.S3TemporaryBucketRule

class RegionalBucketsTest {
    private val usEast2Client = S3Client.builder().region(Region.US_EAST_2).build()
    private val euWest2Client = S3Client.builder().region(Region.EU_WEST_2).build()

    @Rule
    @JvmField
    val usEast2TempBucket = S3TemporaryBucketRule(usEast2Client)

    @Rule
    @JvmField
    val euWest2TempBucket = S3TemporaryBucketRule(euWest2Client)

    @Test
    fun canGetRegionBucketWithRegionNotSameAsClient() {
        val bucket = euWest2TempBucket.createBucket()

        assertThat(usEast2Client.regionForBucket(bucket)).isEqualTo("eu-west-2")
    }

    @Test
    fun canGetRegionInSameRegionAsClient() {
        val bucket = usEast2TempBucket.createBucket()

        assertThat(usEast2Client.regionForBucket(bucket)).isEqualTo("us-east-2")
    }
}
