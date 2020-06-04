// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.core.explorer.refreshAwsTree
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.S3Telemetry
import java.awt.Component
import javax.swing.JComponent

class CreateS3BucketDialog(
    private val project: Project,
    private val s3Client: S3Client,
    parent: Component? = null
) : DialogWrapper(project, parent, false, IdeModalityType.PROJECT) {

    val view = CreateBucketPanel()

    init {
        title = message("s3.create.bucket.title")
        setOKButtonText(message("s3.create.bucket.create"))

        init()
    }

    override fun createCenterPanel(): JComponent? = view.component

    override fun getPreferredFocusedComponent(): JComponent? = view.bucketName

    override fun doValidate(): ValidationInfo? = validateBucketName()?.let { ValidationInfo(it, view.bucketName) }

    override fun doCancelAction() {
        S3Telemetry.createBucket(project, Result.Cancelled)
        super.doCancelAction()
    }

    override fun doOKAction() {
        if (okAction.isEnabled) {
            setOKButtonText(message("s3.create.bucket.in_progress"))
            isOKActionEnabled = false

            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    createBucket()
                    ApplicationManager.getApplication().invokeLater({
                        close(OK_EXIT_CODE)
                    }, ModalityState.stateForComponent(view.component))
                    project.refreshAwsTree(S3Resources.LIST_BUCKETS)
                    S3Telemetry.createBucket(project, Result.Succeeded)
                } catch (e: Exception) {
                    setErrorText(e.message)
                    setOKButtonText(message("s3.create.bucket.create"))
                    isOKActionEnabled = true
                    S3Telemetry.createBucket(project, Result.Failed)
                }
            }
        }
    }

    fun bucketName(): String = view.bucketName.text.trim()

    @TestOnly
    fun createBucket() {
        s3Client.createBucket { request -> request.bucket(bucketName()) }
    }

    @TestOnly
    fun validateBucketName(): String? = if (bucketName().isEmpty()) message("s3.create.bucket.missing.bucket.name") else null
}
