// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.bucketActions

import software.amazon.awssdk.services.s3.model.S3Exception
import software.aws.toolkits.jetbrains.core.explorer.actions.ViewResourceAction
import software.aws.toolkits.jetbrains.services.s3.S3ServiceNode
import software.aws.toolkits.jetbrains.services.s3.openEditor
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class ViewBucketAction : ViewResourceAction<S3ServiceNode>(message("action.aws.toolkit.s3.open.bucket.viewer.text"), message("s3.bucket.label")) {

    override fun viewResource(resourceToView: String, selected: S3ServiceNode) {
        try {
            if (resourceToView.startsWith("S3://", ignoreCase = true)) {
                openEditor(selected.nodeProject, resourceToView.split("S3://", ignoreCase = true).last().substringBefore("/"))
            } else {
                openEditor(selected.nodeProject, resourceToView)
            }
        } catch (e: S3Exception) {
            e.notifyError(message("s3.open.viewer.bucket.failed"))
        }
    }

    override fun checkResourceNameValidity(resourceName: String?): Boolean = resourceName.equals("S3://", ignoreCase = true)
}
