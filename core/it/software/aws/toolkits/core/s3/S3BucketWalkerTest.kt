// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.s3

import assertk.assert
import assertk.assertions.isEmpty
import assertk.assertions.isIn
import assertk.assertions.isInstanceOf
import org.junit.BeforeClass
import org.junit.ClassRule
import org.junit.Test
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest

class S3BucketWalkerTest {

    @Test
    fun canCreateATreeOfChildren() {
        s3Client.bucket(bucketName).children().forEach {
            when {
                it.name == "top-level" -> assert(it).isInstanceOf(S3File::class)
                it.name == "first-level" && it is S3Directory ->
                    it.children().forEach {
                        when {
                            it.name == "second-level-object" -> assert(it).isInstanceOf(S3File::class)
                            it.name == "second-level" && it is S3Directory -> it.children().forEach {
                                when {
                                    it.name == "third-level" && it is S3Directory -> it.children().forEach {
                                        assert(it).isInstanceOf(S3File::class)
                                    }
                                    else -> throw AssertionError("Unexpected third-level object (${it.name}): $it")
                                }
                            }
                            else -> throw AssertionError("Unexpected second-level object (${it.name}): $it")
                        }
                    }
                else -> throw AssertionError("Unexpected first-level object (${it.name}): $it")
            }
        }
    }

    @Test
    fun canWalkATree() {
        val expected = mutableSetOf(
                bucketName,
                "top-level",
                "first-level",
                "second-level-object",
                "second-level",
                "third-level",
                "forth-level-object",
                "forth-level-object-2"
        )

        s3Client.bucket(bucketName).walkTree {
            assert(it.name).isIn(*expected.toTypedArray())
            expected.remove(it.name)
        }

        assert(expected).isEmpty()
    }

    @Test
    fun canWalkATreeWithAFilter() {
        val expected = mutableSetOf(
                bucketName,
                "top-level",
                "first-level",
                "second-level-object",
                "second-level"
        )

        s3Client.bucket(bucketName).walkTree(filter = { it.name != "third-level" }) {
            assert(it.name).isIn(*expected.toTypedArray())
            expected.remove(it.name)
        }

        assert(expected).isEmpty()
    }

    companion object {
        private val s3Client = S3Client.builder().region(Region.US_WEST_1).build()
        @ClassRule
        @JvmField
        val temporaryBucketRule = S3TemporaryBucketRule(s3Client)
        private val bucketName = temporaryBucketRule.createBucket()

        @BeforeClass
        @JvmStatic
        fun populateData() {
            putObject(bucketName, "top-level")
            putObject(bucketName, "first-level/second-level-object")
            putObject(bucketName, "first-level/second-level/third-level/forth-level-object")
            putObject(bucketName, "first-level/second-level/third-level/forth-level-object-2")
        }

        private fun putObject(bucket: String, key: String) {
            s3Client.putObject(
                    PutObjectRequest.builder().bucket(bucket).key(key).build(),
                    RequestBody.fromString("blah")
            )
        }
    }
}