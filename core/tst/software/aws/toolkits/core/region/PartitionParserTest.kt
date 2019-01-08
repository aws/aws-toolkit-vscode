// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.region

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.Test
import software.aws.toolkits.resources.BundledResources

class PartitionParserTest {
    @Test
    fun canLoadPartitionsFromEndpointsFile() {
        val partitions = PartitionParser.parse(BundledResources.ENDPOINTS_FILE)!!
        val awsPartition = partitions.getPartition("aws")

        val iam = awsPartition.services.getValue("iam")
        val s3 = awsPartition.services.getValue("s3")
        val lambda = awsPartition.services.getValue("lambda")

        assertThat(iam.isGlobal, equalTo(true))
        assertThat(s3.isGlobal, equalTo(false))
        assertThat(lambda.isGlobal, equalTo(false))
    }
}