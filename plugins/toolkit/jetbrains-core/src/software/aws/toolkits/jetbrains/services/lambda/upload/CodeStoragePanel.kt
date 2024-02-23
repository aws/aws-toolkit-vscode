// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.SimpleListCellRenderer
import software.amazon.awssdk.services.lambda.model.PackageType
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.map
import software.aws.toolkits.jetbrains.services.ecr.CreateEcrRepoDialog
import software.aws.toolkits.jetbrains.services.ecr.resources.EcrResources
import software.aws.toolkits.jetbrains.services.ecr.resources.Repository
import software.aws.toolkits.jetbrains.services.s3.CreateS3BucketDialog
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources.LIST_BUCKETS
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.ui.validationInfo
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import kotlin.properties.Delegates.observable

class CodeStoragePanel(private val project: Project) : JPanel(BorderLayout()) {
    lateinit var content: JPanel
        private set
    lateinit var sourceBucket: ResourceSelector<String>
        private set
    lateinit var ecrRepo: ResourceSelector<Repository>
        private set

    private lateinit var s3Label: JLabel
    private lateinit var createBucketButton: JButton
    private lateinit var ecrLabel: JLabel
    private lateinit var createEcrRepoButton: JButton

    var packagingType: PackageType by observable(PackageType.ZIP) { _, _, _ -> updateComponents() }

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

        createEcrRepoButton.addActionListener {
            val ecrDialog = CreateEcrRepoDialog(
                project = project,
                ecrClient = project.awsClient(),
                parent = content
            )

            if (ecrDialog.showAndGet()) {
                ecrRepo.reload(forceFetch = true)
                ecrRepo.selectedItem { it.repositoryName == ecrDialog.repoName }
            }
        }

        content.border = IdeBorderFactory.createTitledBorder(message("lambda.upload.deployment_settings"), false)

        updateComponents()

        add(content, BorderLayout.CENTER)
    }

    private fun createUIComponents() {
        sourceBucket = ResourceSelector.builder().resource(LIST_BUCKETS.map { it.name() }).awsConnection(project).build()
        ecrRepo = ResourceSelector.builder()
            .resource(EcrResources.LIST_REPOS)
            .customRenderer(SimpleListCellRenderer.create("") { it.repositoryName })
            .awsConnection(project)
            .build()
    }

    private fun updateComponents() {
        val isZip = packagingType == PackageType.ZIP
        s3Label.isVisible = isZip
        sourceBucket.isVisible = isZip
        createBucketButton.isVisible = isZip

        ecrLabel.isVisible = !isZip
        ecrRepo.isVisible = !isZip
        createEcrRepoButton.isVisible = !isZip
    }

    fun codeLocation() = if (packagingType == PackageType.ZIP) {
        sourceBucket.selected() as String
    } else {
        ecrRepo.selected()?.repositoryUri as String
    }

    fun validatePanel(): ValidationInfo? {
        if (packagingType == PackageType.ZIP) {
            if (sourceBucket.isLoading) {
                return sourceBucket.validationInfo(message("serverless.application.deploy.validation.s3.bucket.loading"))
            }

            if (sourceBucket.selected() == null) {
                return sourceBucket.validationInfo(message("lambda.upload_validation.source_bucket"))
            }
        } else {
            if (ecrRepo.isLoading) {
                return ecrRepo.validationInfo(message("serverless.application.deploy.validation.ecr.repo.loading"))
            }

            if (ecrRepo.selected() == null) {
                return ecrRepo.validationInfo(message("lambda.upload_validation.repo"))
            }
        }

        return null
    }
}
