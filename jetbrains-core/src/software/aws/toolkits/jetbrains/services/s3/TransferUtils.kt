// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.util.io.inputStream
import com.intellij.util.io.outputStream
import com.intellij.util.io.size
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectResponse
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.amazon.awssdk.services.s3.model.PutObjectResponse
import software.amazon.awssdk.utils.IoUtils
import software.aws.toolkits.jetbrains.utils.ProgressMonitorInputStream
import software.aws.toolkits.jetbrains.utils.ProgressMonitorOutputStream
import software.aws.toolkits.resources.message
import java.io.InputStream
import java.io.OutputStream
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

/**
 * A set of utilities for uploading / downloading from S3 with progress indicators
 */

fun S3Client.upload(
    project: Project,
    source: Path,
    bucket: String,
    key: String,
    message: String = message("s3.upload.object.progress", key),
    startInBackground: Boolean = true
): CompletionStage<PutObjectResponse> = upload(project, source.inputStream(), source.size(), bucket, key, message, startInBackground)

fun S3Client.upload(
    project: Project,
    source: InputStream,
    length: Long,
    bucket: String,
    key: String,
    message: String = message("s3.upload.object.progress", key),
    startInBackground: Boolean = true
): CompletionStage<PutObjectResponse> {
    val future = CompletableFuture<PutObjectResponse>()
    val request = PutObjectRequest.builder().bucket(bucket).key(key).build()
    ProgressManager.getInstance().run(object : Task.Backgroundable(project, message, true, if (startInBackground) ALWAYS_BACKGROUND else null) {
        override fun run(indicator: ProgressIndicator) {
            indicator.isIndeterminate = false
            try {
                val result = ProgressMonitorInputStream(indicator, source, length = length).use {
                    this@upload.putObject(request, RequestBody.fromInputStream(it, length))
                }
                future.complete(result)
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }
    })
    return future
}

fun S3Client.download(
    project: Project,
    bucket: String,
    key: String,
    destination: Path,
    message: String = message("s3.download.object.progress", key),
    startInBackground: Boolean = true
): CompletionStage<GetObjectResponse> = download(project, bucket, key, destination.outputStream(), message, startInBackground)

fun S3Client.download(
    project: Project,
    bucket: String,
    key: String,
    destination: OutputStream,
    message: String = message("s3.download.object.progress", key),
    startInBackground: Boolean = true
): CompletionStage<GetObjectResponse> {
    val future = CompletableFuture<GetObjectResponse>()
    val request = GetObjectRequest.builder().bucket(bucket).key(key).build()
    ProgressManager.getInstance().run(object : Task.Backgroundable(project, message, true, if (startInBackground) ALWAYS_BACKGROUND else null) {
        override fun run(indicator: ProgressIndicator) {
            try {
                this@download.getObject(request) { response, inputStream ->
                    indicator.isIndeterminate = false
                    inputStream.use { input ->
                        ProgressMonitorOutputStream(indicator, destination, response.contentLength()).use { output ->
                            IoUtils.copy(input, output)
                        }
                    }
                    future.complete(response)
                }
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }
    })
    return future
}
