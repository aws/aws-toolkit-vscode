// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.s3

import assertk.Assert
import assertk.assert
import assertk.assertions.contains
import assertk.assertions.isEqualTo
import assertk.assertions.isNotEmpty
import assertk.assertions.isNotNull
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.Tag
import java.io.InputStream
import java.nio.charset.StandardCharsets

class S3FileTest {

    private val client = S3Client.create()
    @Rule
    @JvmField
    val bucketHelper = S3TemporaryBucketRule(client)

    @Test
    fun canUpdateTagsAndMetadataIndependently() {
        val bucketName = bucketHelper.createBucket()
        val key = "key"
        client.putObject(PutObjectRequest.builder().bucket(bucketName).key(key).build(), RequestBody.fromString(""))

        val file = client.file(bucketName, key)

        file.updateMetadata(mapOf("hello" to "blah"))
        file.updateTags(setOf(Tag.builder().key("tag1").value("tag2").build()))

        assert(file.metadata()).contains("hello" to "blah")
        assert(file.tags()).hasTag("tag1", "tag2")
    }

    @Test
    fun canUpdateTagsAndMetadataInOneOperation() {
        val bucketName = bucketHelper.createBucket()
        val key = "key"
        client.putObject(PutObjectRequest.builder().bucket(bucketName).key(key).build(), RequestBody.fromString(""))

        val file = client.file(bucketName, key)

        file.updateMetadataAndTags(mapOf("hello" to "blah"), setOf(Tag.builder().key("tag1").value("tag2").build()))

        assert(file.metadata()).contains("hello" to "blah")
        assert(file.tags()).hasTag("tag1", "tag2")
    }

    @Test
    fun canGetDataAboutAFile() {
        val bucketName = bucketHelper.createBucket()
        val key = "key"
        client.putObject(PutObjectRequest.builder().bucket(bucketName).key(key).build(), RequestBody.fromString("12345"))

        val file = client.file(bucketName, key)

        assert(file.size).isEqualTo(5L)
        assert(file.etag).isNotEmpty()
        assert(file.lastModified).isNotNull()

        assert(file.getInputStream()).hasContents("12345")
        assert(file.getByteArray()).hasContents("12345")
    }

    fun Assert<Set<Tag>>.hasTag(key: String, value: String) {
        this.contains(Tag.builder().key(key).value(value).build())
    }

    // TODO: could probably move these to a test util module
    @JvmName("hasInputStreamContents")
    fun Assert<InputStream>.hasContents(expected: String) {
        this.actual.use { assert(it.bufferedReader(StandardCharsets.UTF_8).readText()).isEqualTo(expected) }
    }

    @JvmName("hasBytesContents")
    fun Assert<ByteArray>.hasContents(expected: String) {
        assert(String(this.actual, StandardCharsets.UTF_8)).isEqualTo(expected)
    }
}