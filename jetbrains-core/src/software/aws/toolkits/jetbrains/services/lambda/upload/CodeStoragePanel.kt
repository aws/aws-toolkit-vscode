// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.IdeBorderFactory
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.s3.CreateS3BucketDialog
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources.listBucketNamesByActiveRegion
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.ui.validationInfo
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JButton
import javax.swing.JPanel

class CodeStoragePanel(private val project: Project) : JPanel(BorderLayout()) {
    lateinit var content: JPanel
    lateinit var sourceBucket: ResourceSelector<String>
    lateinit var createBucketButton: JButton

    init {
        createBucketButton.addActionListener {
            val bucketDialog = CreateS3BucketDialog(
                project = project,
                s3Client = project.awsClient(),
                parent = content
            )

            if (bucketDialog.showAndGet()) {
                bucketDialog.bucketName().let {
                    sourceBucket.reload(forceFetch = true)
                    sourceBucket.selectedItem = it
                }
            }
        }

        content.border = IdeBorderFactory.createTitledBorder(message("lambda.upload.deployment_settings"), false)
        add(content, BorderLayout.CENTER)
    }

    private fun createUIComponents() {
        sourceBucket = ResourceSelector.builder().resource(listBucketNamesByActiveRegion(project)).awsConnection(project).build()
    }

    fun validatePanel(): ValidationInfo? {
        if (sourceBucket.isLoading) {
            return sourceBucket.validationInfo(message("serverless.application.deploy.validation.s3.bucket.loading"))
        }

        if (sourceBucket.selected() == null) {
            return sourceBucket.validationInfo(message("lambda.upload_validation.source_bucket"))
        }

        return null
    }
}
